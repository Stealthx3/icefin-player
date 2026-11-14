"""hostmode.py: `--host` for the lab's theme tests (the user, 2026-11-13: run the polish tests on the host as the test lab).

With --host a test runs against the user's installed Icefin Player Flatpak, their profile (already signed in) and
their server, through the host harness (docs/themes/PIPELINE.md, `host.py`: one run at a time, never while the user
has Icefin open, the theme's files from this worktree, the user's theme choice put back at the end). It skips the lab
server and the sign-in. Nothing on the user's server may change: a test checks `a.host` and leaves out steps that
create, delete, favourite, mark, reorder or sign out (those stay in the lab). Input goes through the engine's actions
(a virtual pad on the user's desktop would reach every other program that reads controllers); the lab covers the
pad -> SDL -> engine path. Builds never happen on the host.
"""
import os
import sys

TOOL = os.environ.get("ICEFIN_HOST_TOOL", os.path.expanduser("~/.local/share/icefin-walk/visual/tool"))
THEMES = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "themes"))


def add_args(ap):
    ap.add_argument("--host", action="store_true", help="run on the user's installed Icefin and profile (read-only on the server)")


def start(a, out, theme="plaza"):
    """The user's Icefin with `theme` from this worktree: (page, stop). stop() puts their theme back and lets go of the lock."""
    sys.path.insert(0, TOOL)
    import host  # noqa: E402 (the harness lives with the host walk's tools)
    lock = host.Lock()
    lock.__enter__()
    try:
        h = host.Host(THEMES, a.port, os.path.join(out, "app.log"))
    except Exception:
        lock.__exit__()
        raise
    try:
        print("host:", h.use_theme(theme), flush=True)
    except Exception:
        h.close()
        lock.__exit__()
        raise

    def stop():
        try:
            h.close()
        finally:
            lock.__exit__()
    return h.page, stop
