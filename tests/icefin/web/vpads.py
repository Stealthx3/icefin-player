#!/usr/bin/env python3
"""vpads.py — virtual controllers for the lab (PLAN 7.6, docs/dev/HARDWARE-SIMULATION.md option C).

Each pad appears to the system as the real one does, so SDL and Icefin take the same path they take with the pad:
  xbox       Xbox Series X|S pad (045e:0b12), uinput shaped like the xpad driver's device
  8bitdo     8BitDo Pro 2 in X-input mode (2dc8:3106), uinput shaped like xpad's device for it
  steam      Steam Virtual Gamepad (28de:11ff), uinput, as Steam itself makes it
  dualsense  DualSense (054c:0ce6) over uhid: the kernel's hid-playstation binds and SDL's HIDAPI driver can open its
             hidraw; the pad answers the feature reports both read (pairing, calibration, firmware)
  switchpro  Switch Pro Controller (057e:2009) over uhid: hid-nintendo binds after the USB handshake; the pad answers
             its subcommands (device info, SPI calibration reads, report mode, IMU, rumble, lights) and sends 0x30
             reports, as the real pad does
Standard button names: south east west north l1 r1 l2 r2 back start guide l3 r3; d-pad: up down left right;
sticks: lx ly rx ry in -1..1.
Needs /dev/uinput (and /dev/uhid for the HID pads) writable: scripts/lab/70-icefin-lab-pads.rules.
Usage: python3 vpads.py KIND [--seconds 30]   (plugs the pad in and holds it, for a look at what the system makes of it)
"""
import os, select, struct, threading, time

try:
    from evdev import UInput, AbsInfo, ecodes as e
except ImportError:  # a host without python3-evdev: the HID pads still work
    UInput = AbsInfo = e = None

KINDS = ("xbox", "8bitdo", "steam", "dualsense", "switchpro")
# What Icefin should call each pad (GamepadNames familyFor; the Steam pad's own family comes from Steam's ignore list).
FAMILY = {"xbox": "xbox", "8bitdo": "xbox", "steam": "xbox", "dualsense": "playstation", "switchpro": "nintendo"}


# ---------------------------------------------------------------- uinput pads (xpad-style evdev devices)
class UinputPad:
    # xpad's codes: the X button (west) is BTN_X and Y (north) is BTN_Y. In input-event-codes.h BTN_X is the same code
    # as BTN_NORTH and BTN_Y as BTN_WEST, so the position names would swap X and Y here.
    KEYS = {"south": "BTN_A", "east": "BTN_B", "west": "BTN_X", "north": "BTN_Y", "l1": "BTN_TL",
            "r1": "BTN_TR", "back": "BTN_SELECT", "start": "BTN_START", "guide": "BTN_MODE", "l3": "BTN_THUMBL",
            "r3": "BTN_THUMBR"}

    def __init__(self, name, vendor, product, version, trigger_max=1023):
        if UInput is None:
            raise RuntimeError("python3-evdev is needed for uinput pads")
        st = AbsInfo(0, -32768, 32767, 16, 128, 0)
        caps = {e.EV_KEY: [getattr(e, k) for k in self.KEYS.values()],
                e.EV_ABS: [(a, st) for a in (e.ABS_X, e.ABS_Y, e.ABS_RX, e.ABS_RY)]
                          + [(a, AbsInfo(0, 0, trigger_max, 0, 0, 0)) for a in (e.ABS_Z, e.ABS_RZ)]
                          + [(a, AbsInfo(0, -1, 1, 0, 0, 0)) for a in (e.ABS_HAT0X, e.ABS_HAT0Y)]}
        self.name, self.trigger_max = name, trigger_max
        self.ui = UInput(caps, name=name, vendor=vendor, product=product, version=version, bustype=e.BUS_USB)

    def _abs(self, code, v):
        self.ui.write(e.EV_ABS, code, v)
        self.ui.syn()

    def button(self, b, down):
        if b in ("l2", "r2"):
            self._abs(e.ABS_Z if b == "l2" else e.ABS_RZ, self.trigger_max if down else 0)
            return
        self.ui.write(e.EV_KEY, getattr(e, self.KEYS[b]), 1 if down else 0)
        self.ui.syn()

    def dpad(self, d, down):
        axis = e.ABS_HAT0Y if d in ("up", "down") else e.ABS_HAT0X
        self._abs(axis, 0 if not down else (-1 if d in ("up", "left") else 1))

    def stick(self, axis, v):
        self._abs({"lx": e.ABS_X, "ly": e.ABS_Y, "rx": e.ABS_RX, "ry": e.ABS_RY}[axis], int(max(-1, min(1, v)) * 32767))

    def close(self):
        self.ui.close()


# ---------------------------------------------------------------- uhid (linux/uhid.h)
UHID_DESTROY, UHID_START, UHID_STOP, UHID_OPEN, UHID_CLOSE, UHID_OUTPUT = 1, 2, 3, 4, 5, 6
UHID_GET_REPORT, UHID_GET_REPORT_REPLY, UHID_CREATE2, UHID_INPUT2, UHID_SET_REPORT, UHID_SET_REPORT_REPLY = 9, 10, 11, 12, 13, 14
UHID_FEATURE_REPORT, UHID_OUTPUT_REPORT, UHID_INPUT_REPORT = 0, 1, 2
EV_SIZE = 4 + 4372  # struct uhid_event, packed: the type and its largest member (create2)


class UhidPad:
    """A HID device in the kernel, fed and answered from user space. Subclasses: get_report, output, tick."""
    period = 0.1  # seconds between tick() calls while nothing else happens

    def __init__(self, name, vendor, product, version, rdesc, uniq=""):
        self.name = name
        self.fd = os.open("/dev/uhid", os.O_RDWR | os.O_CLOEXEC)
        self.lock = threading.Lock()
        self.opened = False
        body = struct.pack("<128s64s64sHHIIII", name.encode(), b"vpads", uniq.encode(), len(rdesc), 0x03, vendor, product,
                           version, 0) + rdesc
        self._write(UHID_CREATE2, body)
        self.running = True
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def _write(self, t, body):
        with self.lock:
            os.write(self.fd, (struct.pack("<I", t) + body).ljust(EV_SIZE, b"\0"))

    def send(self, data):
        self._write(UHID_INPUT2, struct.pack("<H", len(data)) + bytes(data))

    def _loop(self):
        last = 0.0
        while self.running:
            now = time.monotonic()
            if now - last >= self.period:
                last = now
                try:
                    self.tick()
                except OSError:
                    pass
            r, _, _ = select.select([self.fd], [], [], max(0.0, self.period - (time.monotonic() - last)))
            if not r:
                continue
            try:
                ev = os.read(self.fd, EV_SIZE)
            except OSError:
                return
            t = struct.unpack_from("<I", ev)[0]
            if t == UHID_GET_REPORT:
                rid, rnum, rtype = struct.unpack_from("<IBB", ev, 4)
                data = self.get_report(rnum, rtype)
                self._write(UHID_GET_REPORT_REPLY, struct.pack("<IHH", rid, 5, 0) if data is None
                            else struct.pack("<IHH", rid, 0, len(data)) + bytes(data))
            elif t == UHID_SET_REPORT:
                rid = struct.unpack_from("<I", ev, 4)[0]
                self._write(UHID_SET_REPORT_REPLY, struct.pack("<IH", rid, 0))
            elif t == UHID_OUTPUT:
                size = struct.unpack_from("<H", ev, 4 + 4096)[0]
                self.output(bytes(ev[4:4 + size]))
            elif t == UHID_OPEN:
                self.opened = True
            elif t == UHID_CLOSE:
                self.opened = False

    def get_report(self, rnum, rtype):
        return None

    def output(self, data):
        pass

    def tick(self):
        pass

    def close(self):
        self.running = False
        self.thread.join(1)
        try:
            self._write(UHID_DESTROY, b"")
        finally:
            os.close(self.fd)


# ---------------------------------------------------------------- DualSense (hid-playstation, SDL's HIDAPI PS5 driver)
def _rdesc_vendor_reports(inputs, outputs, features):
    """A game pad collection whose reports carry vendor bytes of the real sizes (the drivers read the bytes, not the
    fields): [(report id, payload bytes)] per kind."""
    d = bytes([0x05, 0x01, 0x09, 0x05, 0xA1, 0x01, 0x06, 0x00, 0xFF, 0x15, 0x00, 0x26, 0xFF, 0x00, 0x75, 0x08])
    u = 0x20
    for kind, main in ((inputs, 0x81), (outputs, 0x91), (features, 0xB1)):
        for rid, n in kind:
            d += bytes([0x85, rid, 0x09, u, 0x96, n & 0xFF, n >> 8, main, 0x02])
            u += 1
    return d + bytes([0xC0])


class DualSense(UhidPad):
    period = 0.05
    BTN = {"west": (8, 0x10), "south": (8, 0x20), "east": (8, 0x40), "north": (8, 0x80), "l1": (9, 0x01), "r1": (9, 0x02),
           "l2": (9, 0x04), "r2": (9, 0x08), "back": (9, 0x10), "start": (9, 0x20), "l3": (9, 0x40), "r3": (9, 0x80),
           "guide": (10, 0x01)}
    HAT = {(): 8, ("up",): 0, ("right",): 2, ("down",): 4, ("left",): 6}

    def __init__(self):
        rdesc = _rdesc_vendor_reports([(0x01, 63)], [(0x02, 47)], [(0x05, 40), (0x09, 19), (0x20, 63)])
        self.state = bytearray(64)
        self.state[0] = 0x01
        self.state[1:5] = bytes([0x80] * 4)       # sticks centred
        self.state[8] = 0x08                       # d-pad released
        self.state[33] = self.state[37] = 0x80     # no fingers on the touchpad
        self.state[53] = 0x0A                      # battery: discharging, full
        self.dirs, self.seq = set(), 0
        super().__init__("Sony Interactive Entertainment DualSense Wireless Controller", 0x054C, 0x0CE6, 0x0100, rdesc)

    def get_report(self, rnum, rtype):
        if rnum == 0x09:   # pairing info: the MAC address, least significant byte first
            return bytes([0x09, 0x56, 0x34, 0x12, 0xEF, 0xCD, 0xAB]) + bytes(13)
        if rnum == 0x05:   # IMU calibration (biases, +/- ranges, gyro speed, accelerometer ranges), little-endian int16
            vals = [0, 0, 0, 8800, -8800, 8800, -8800, 8800, -8800, 540, 540, 8192, -8192, 8192, -8192, 8192, -8192]
            return (bytes([0x05]) + struct.pack("<17h", *vals)).ljust(41, b"\0")
        if rnum == 0x20:   # firmware info: build date and time, hardware and firmware versions, update version
            b = bytearray(64)
            b[0] = 0x20
            b[1:12], b[12:20] = b"Jun 10 2025", b"10:00:00"
            struct.pack_into("<II", b, 24, 0x00000411, 0x01000027)
            struct.pack_into("<H", b, 44, 0x0630)
            return bytes(b)
        return None

    def _push(self):
        self.seq = (self.seq + 1) & 0xFF
        self.state[7] = self.seq
        self.send(self.state)

    def tick(self):
        if self.opened:
            self._push()

    def button(self, b, down):
        i, bit = self.BTN[b]
        self.state[i] = (self.state[i] | bit) if down else (self.state[i] & ~bit)
        if b in ("l2", "r2"):
            self.state[5 if b == "l2" else 6] = 0xFF if down else 0
        self._push()

    def dpad(self, d, down):
        (self.dirs.add if down else self.dirs.discard)(d)
        self.state[8] = (self.state[8] & 0xF0) | self.HAT.get(tuple(sorted(self.dirs)), 8)
        self._push()

    def stick(self, axis, v):
        self.state[{"lx": 1, "ly": 2, "rx": 3, "ry": 4}[axis]] = int(round(128 + max(-1, min(1, v)) * 127)) & 0xFF
        self._push()


# ---------------------------------------------------------------- Switch Pro Controller (hid-nintendo, SDL's HIDAPI Switch driver)
class SwitchPro(UhidPad):
    period = 0.015  # the real pad sends a 0x30 report about every 15 ms once in that mode
    # 0x30 report: [3] right byte (Y X B A SR SL R ZR), [4] shared (- + RS LS Home Capture), [5] left (down up right left SR SL L ZL)
    BTN = {"west": (3, 0x01), "north": (3, 0x02), "south": (3, 0x04), "east": (3, 0x08), "r1": (3, 0x40), "r2": (3, 0x80),
           "back": (4, 0x01), "start": (4, 0x02), "r3": (4, 0x04), "l3": (4, 0x08), "guide": (4, 0x10),
           "l1": (5, 0x40), "l2": (5, 0x80)}
    # Nintendo's labels: A is the east button and B the south one; SDL reports positions (south, east, ...).
    DIR = {"down": (5, 0x01), "up": (5, 0x02), "right": (5, 0x04), "left": (5, 0x08)}
    MAC = bytes([0x98, 0xB6, 0xE9, 0x12, 0x34, 0x56])

    def __init__(self):
        rdesc = _rdesc_vendor_reports([(0x30, 63), (0x21, 63), (0x81, 63)], [(0x01, 48), (0x10, 48), (0x80, 63)], [])
        self.buttons = bytearray(3)
        self.lx = self.ly = self.rx = self.ry = 2048
        self.timer, self.mode30 = 0, False
        super().__init__("Nintendo Co., Ltd. Pro Controller", 0x057E, 0x2009, 0x0200, rdesc,
                         uniq=":".join(f"{x:02x}" for x in self.MAC))

    @staticmethod
    def _stick(x, y):
        return bytes([x & 0xFF, ((x >> 8) & 0x0F) | ((y & 0x0F) << 4), (y >> 4) & 0xFF])

    def _base(self, rid):
        self.timer = (self.timer + 1) & 0xFF
        return bytearray([rid, self.timer, 0x81]) + self.buttons + self._stick(self.lx, self.ly) + self._stick(self.rx, self.ry) + bytes([0x00])

    def _reply(self, ack, sub, data=b""):
        self.send((bytes(self._base(0x21)) + bytes([ack, sub]) + data).ljust(64, b"\0"))

    @staticmethod
    def _spi(addr, size):
        """The flash a real pad holds where the drivers read: factory stick calibration (centre 2048, 1500 each way),
        stick parameters, no user calibration, factory IMU calibration."""
        flash = {}

        def put(a, bs):
            for i, x in enumerate(bs):
                flash[a + i] = x
        pack = SwitchPro._stick
        put(0x603D, pack(1500, 1500) + pack(2048, 2048) + pack(1500, 1500))   # left: above centre, centre, below
        put(0x6046, pack(2048, 2048) + pack(1500, 1500) + pack(1500, 1500))   # right: centre, below, above
        put(0x6086, bytes([0x0F, 0x30, 0x61, 0x96, 0x30, 0xF3, 0xD4, 0x14, 0x54, 0x41, 0x15, 0x54, 0xC7, 0x79, 0x9C, 0x33, 0x36, 0x63]))
        put(0x6098, bytes([0x0F, 0x30, 0x61, 0x96, 0x30, 0xF3, 0xD4, 0x14, 0x54, 0x41, 0x15, 0x54, 0xC7, 0x79, 0x9C, 0x33, 0x36, 0x63]))
        put(0x6020, struct.pack("<12h", 0, 0, 0, 16384, 16384, 16384, 0, 0, 0, 13371, 13371, 13371))
        put(0x6050, bytes([0x32, 0x32, 0x32, 0xFF, 0xFF, 0xFF]))  # body and button colours
        put(0x8010, bytes([0xFF] * 0x30))                            # no user calibration
        return bytes(flash.get(addr + i, 0xFF) for i in range(size))

    def output(self, data):
        if not data:
            return
        if data[0] == 0x80 and len(data) > 1:     # USB commands: status, handshake, baud rate, no timeout
            cmd = data[1]
            if cmd == 0x01:
                self.send((bytes([0x81, 0x01, 0x00, 0x03]) + self.MAC[::-1]).ljust(64, b"\0"))
            elif cmd in (0x02, 0x03):
                self.send(bytes([0x81, cmd]).ljust(64, b"\0"))
            elif cmd == 0x04:
                self.mode30 = True
                self.send(bytes([0x81, cmd]).ljust(64, b"\0"))
            return
        if data[0] == 0x01 and len(data) > 10:    # rumble and a subcommand
            sub, arg = data[10], data[11:]
            if sub == 0x02:                       # device info: firmware 3.89, Pro Controller, MAC, colours in SPI
                self._reply(0x82, sub, bytes([0x03, 0x89, 0x03, 0x02]) + self.MAC + bytes([0x01, 0x01]))
            elif sub == 0x10 and len(arg) >= 5:   # SPI flash read
                addr, size = struct.unpack_from("<IB", arg)
                self._reply(0x90, sub, struct.pack("<IB", addr, size) + self._spi(addr, size))
            elif sub == 0x03:                     # input report mode (0x30: full reports)
                self.mode30 = arg[:1] == b"\x30" or self.mode30
                self._reply(0x80, sub)
            elif sub == 0x01:                     # Bluetooth pairing: not over USB
                self._reply(0x81, sub, bytes([0x03]))
            else:                                 # IMU, rumble, player lights, home light, shipment, ...
                self._reply(0x80, sub)
        # 0x10 (rumble only) needs no answer

    def tick(self):
        if self.opened and self.mode30:
            self.send((bytes(self._base(0x30)) + bytes(36)).ljust(64, b"\0"))

    def button(self, b, down):
        i, bit = self.BTN[b]
        self.buttons[i - 3] = (self.buttons[i - 3] | bit) if down else (self.buttons[i - 3] & ~bit)
        self.tick()

    def dpad(self, d, down):
        i, bit = self.DIR[d]
        self.buttons[i - 3] = (self.buttons[i - 3] | bit) if down else (self.buttons[i - 3] & ~bit)
        self.tick()

    def stick(self, axis, v):
        val = int(round(2048 + max(-1, min(1, v)) * 1500))
        if axis in ("ly", "ry"):
            val = 4096 - val  # the pad's Y axis points up
        setattr(self, axis, max(0, min(4095, val)))
        self.tick()


def make(kind):
    if kind == "xbox":
        return UinputPad("Microsoft Xbox Series S|X Controller", 0x045E, 0x0B12, 0x0509)
    if kind == "8bitdo":
        return UinputPad("8BitDo Pro 2 Wired Controller", 0x2DC8, 0x3106, 0x0114)
    if kind == "steam":
        return UinputPad("Steam Virtual Gamepad", 0x28DE, 0x11FF, 0x0001, trigger_max=255)
    if kind == "dualsense":
        return DualSense()
    if kind == "switchpro":
        return SwitchPro()
    raise ValueError(kind)


def press(pad, b, hold=0.12):
    """One press of a standard button or a d-pad direction."""
    if b in ("up", "down", "left", "right"):
        pad.dpad(b, True)
        time.sleep(hold)
        pad.dpad(b, False)
    else:
        pad.button(b, True)
        time.sleep(hold)
        pad.button(b, False)


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("kind", choices=KINDS)
    ap.add_argument("--seconds", type=float, default=30)
    a = ap.parse_args()
    p = make(a.kind)
    print(f"vpads: {p.name} plugged in for {a.seconds:.0f} s", flush=True)
    try:
        time.sleep(a.seconds)
    finally:
        p.close()
