#!/usr/bin/env python3
"""Spike 2.7: a virtual Xbox-360-style pad via uinput (python3-evdev) that presses A every 0.5 s for N seconds.
Run with sudo in a lab guest: sudo python3 virtual_pad.py 30"""
import sys, time
from evdev import UInput, ecodes as e, AbsInfo
caps = {e.EV_KEY: [e.BTN_SOUTH, e.BTN_EAST, e.BTN_NORTH, e.BTN_WEST, e.BTN_TL, e.BTN_TR, e.BTN_SELECT, e.BTN_START, e.BTN_MODE, e.BTN_THUMBL, e.BTN_THUMBR],
        e.EV_ABS: [(a, AbsInfo(0, -32768, 32767, 16, 128, 0)) for a in (e.ABS_X, e.ABS_Y, e.ABS_RX, e.ABS_RY)]
                  + [(a, AbsInfo(0, 0, 255, 0, 0, 0)) for a in (e.ABS_Z, e.ABS_RZ)]
                  + [(a, AbsInfo(0, -1, 1, 0, 0, 0)) for a in (e.ABS_HAT0X, e.ABS_HAT0Y)]}
ui = UInput(caps, name="Microsoft X-Box 360 pad", vendor=0x045e, product=0x028e, version=0x110, bustype=e.BUS_USB)
end = time.time() + float(sys.argv[1] if len(sys.argv) > 1 else 30)
while time.time() < end:
    for v in (1, 0):
        ui.write(e.EV_KEY, e.BTN_SOUTH, v); ui.syn(); time.sleep(0.25)
ui.close()
