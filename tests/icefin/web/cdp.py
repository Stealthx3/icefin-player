"""cdp.py — minimal Chrome DevTools Protocol client for driving the app's Qt WebEngine (lab only).
Needs python3-websocket. The app is started with --remote-debugging-port=PORT."""
import itertools, json, time, urllib.request

import websocket  # python3-websocket


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
        self.port, self.ws, self.ids = port, websocket.create_connection(pages[0]["webSocketDebuggerUrl"], timeout=30, suppress_origin=True), itertools.count(1)

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

    def reconnect(self, timeout=60):
        """After a navigation the page target may be replaced; reattach."""
        try:
            self.ws.close()
        except Exception:
            pass
        self.__init__(self.port, None, timeout)
