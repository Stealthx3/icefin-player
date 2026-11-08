#!/usr/bin/env python3
"""Tiny HTTP server for spike 2.7: serves one page with a strict CSP header (a hardened reverse proxy stand-in)."""
import http.server, sys
PAGE = b"<!doctype html><html><head><title>strict</title></head><body><p>strict CSP page</p></body></html>"
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'")
        self.end_headers(); self.wfile.write(PAGE)
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8099), H).serve_forever()
