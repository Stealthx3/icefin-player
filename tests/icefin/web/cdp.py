"""cdp.py — minimal Chrome DevTools Protocol client for driving the app's Qt WebEngine (lab only).
Uses python3-websocket when installed, else a small stdlib client (the HTPC tier runs on a stock Bazzite
Python). The app is started with --remote-debugging-port=PORT."""
import base64, itertools, json, os, socket, struct, time, urllib.parse, urllib.request

try:
    import websocket  # python3-websocket
except ImportError:
    websocket = None


class MiniWS:
    """Just enough RFC 6455 for DevTools on localhost: text frames, fragmentation, ping/pong, close."""

    def __init__(self, url, timeout=30):
        u = urllib.parse.urlparse(url)
        self.s = socket.create_connection((u.hostname, u.port or 80), timeout=timeout)
        path = (u.path or "/") + (f"?{u.query}" if u.query else "")
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((f"GET {path} HTTP/1.1\r\nHost: {u.hostname}:{u.port or 80}\r\nUpgrade: websocket\r\n"
                        f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        self.buf = b""
        while b"\r\n\r\n" not in self.buf:
            self.buf += self._chunk()
        head, self.buf = self.buf.split(b"\r\n\r\n", 1)
        status = head.split(b"\r\n", 1)[0]
        if b" 101 " not in status + b" ":
            raise ConnectionError(f"websocket handshake refused: {status!r}")

    def _chunk(self):
        c = self.s.recv(65536)
        if not c:
            raise ConnectionError("websocket closed")
        return c

    def _read(self, n):
        while len(self.buf) < n:
            self.buf += self._chunk()
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def _frame(self, opcode, data):
        n, hdr = len(data), bytearray([0x80 | opcode])
        if n < 126:
            hdr.append(0x80 | n)
        elif n < 65536:
            hdr += bytes([0x80 | 126]) + struct.pack("!H", n)
        else:
            hdr += bytes([0x80 | 127]) + struct.pack("!Q", n)
        mask = os.urandom(4)
        masked = (int.from_bytes(data, "big") ^ int.from_bytes((mask * (n // 4 + 1))[:n], "big")).to_bytes(n, "big") if n else b""
        self.s.sendall(bytes(hdr) + mask + masked)

    def send(self, text):
        self._frame(0x1, text.encode())

    def recv(self):
        parts = []
        while True:
            b0, b1 = self._read(2)
            op, n = b0 & 0x0F, b1 & 0x7F
            if n == 126:
                n = struct.unpack("!H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack("!Q", self._read(8))[0]
            mask = self._read(4) if b1 & 0x80 else None
            data = self._read(n)
            if mask:
                data = bytes(c ^ mask[i % 4] for i, c in enumerate(data))
            if op == 0x8:
                raise ConnectionError("websocket closed by peer")
            if op == 0x9:
                self._frame(0xA, data)
                continue
            if op == 0xA:
                continue
            parts.append(data)
            if b0 & 0x80:
                return b"".join(parts).decode("utf-8", "replace")

    def close(self):
        self.s.close()


def connect(url, timeout=30):
    if websocket is not None:
        return websocket.create_connection(url, timeout=timeout, suppress_origin=True)
    return MiniWS(url, timeout)


class Page:
    def __init__(self, port=9222, match=None, timeout=60):
        end = time.time() + timeout
        while True:
            try:
                targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=3))
                pages = [t for t in targets if t.get("type") == "page" and (match is None or match in t.get("url", ""))]
                if pages:
                    break
            except Exception:
                pass
            if time.time() > end:
                raise TimeoutError(f"no devtools page on :{port}")
            time.sleep(1)
        self.port, self.ws, self.ids = port, connect(pages[0]["webSocketDebuggerUrl"]), itertools.count(1)

    def send(self, method, **params):
        i = next(self.ids)
        self.ws.send(json.dumps({"id": i, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == i:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})

    def eval(self, expr, await_promise=True):
        r = self.send("Runtime.evaluate", expression=expr, awaitPromise=await_promise, returnByValue=True)
        if r.get("exceptionDetails"):
            raise RuntimeError(r["exceptionDetails"].get("exception", {}).get("description", "js exception"))
        return r.get("result", {}).get("value")

    def wait_for(self, expr, timeout=60, interval=1.0):
        end = time.time() + timeout
        while time.time() < end:
            try:
                v = self.eval(expr)
                if v:
                    return v
            except Exception:
                pass
            time.sleep(interval)
        raise TimeoutError(f"timed out waiting for: {expr}")

    def switch_theme_reloading(self, theme, ready, timeout=90):
        """Switch to a theme that declares a backdrop, from a page without one: Backdrop.qml reloads the page once
        (8.4). Waits for the new page (the marker set here is gone) and for `ready` on it."""
        self.eval("window.__icefinBeforeReload = 1; true")
        self.eval("new Promise(r => window.api.theme.setActiveTheme(%s, '', r))" % json.dumps(theme))
        end = time.time() + timeout
        expr = f"typeof window.__icefinBeforeReload === 'undefined' && !!window.api && !!window.icefinTheme && !!({ready})"
        while time.time() < end:
            try:
                if self.eval(expr):
                    return True
            except (ConnectionError, OSError):
                self.reconnect(timeout=max(5, end - time.time()))
            except Exception:  # noqa: BLE001
                pass
            time.sleep(1)
        raise TimeoutError(f"no reload into {theme} with: {ready}")

    def reconnect(self, timeout=60):
        """After a navigation the page target may be replaced; reattach."""
        try:
            self.ws.close()
        except Exception:
            pass
        self.__init__(self.port, None, timeout)
