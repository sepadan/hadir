#!/usr/bin/env python3
"""
Autohadir Cloud — pelancar pemilik (SK Paya Redan, JBA5054).

1. Baca konfigurasi awam %LOCALAPPDATA%\\AutohadirCloud\\config.json dan
   wajibkan baseUrl ialah asal HTTPS Worker yang dibenarkan secara TEPAT.
2. Nyahsulit %LOCALAPPDATA%\\AutohadirCloud\\owner-key.dpapi (CryptProtectData
   CurrentUser; isi = kunci ASCII mentah) dalam proses ini sahaja.
3. Jana tiket satu-kali guna (HMAC-SHA256, sah 90 saat).
4. Hidangkan SATU halaman auto-POST pada 127.0.0.1 (laluan rawak, semakan
   Host) yang menghantar tiket ke <asal>/auth/exchange, kemudian berhenti.

Kunci dan tiket tidak pernah dicetak, dilog atau ditulis ke cakera.
"""

import base64
import hashlib
import hmac
import html
import json
import os
import secrets
import sys
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlsplit

ALLOWED_ORIGINS = frozenset({"https://autohadir-skpr-cloud.sekolah-3458-cm1.workers.dev"})
TICKET_TTL_S = 90
SERVE_TIMEOUT_S = 90
MIN_KEY_LEN = 32


class LauncherError(Exception):
    """Ralat yang selamat dipaparkan kepada pengguna (tiada rahsia)."""


def app_dir() -> str:
    base = os.environ.get("LOCALAPPDATA")
    if not base:
        raise LauncherError("LOCALAPPDATA tidak ditetapkan; pelancar ini untuk Windows sahaja.")
    return os.path.join(base, "AutohadirCloud")


def config_path() -> str:
    return os.path.join(app_dir(), "config.json")


def owner_key_path() -> str:
    return os.path.join(app_dir(), "owner-key.dpapi")


def validate_origin(value) -> str:
    """Pulangkan asal jika ia tepat salah satu ALLOWED_ORIGINS; jika tidak, ralat."""
    if not isinstance(value, str) or not value:
        raise LauncherError("Konfigurasi tidak sah: baseUrl tiada.")
    candidate = value[:-1] if value.endswith("/") else value
    parts = urlsplit(candidate)
    if (
        parts.scheme != "https"
        or parts.username is not None
        or parts.password is not None
        or parts.port is not None
        or parts.path not in ("",)
        or parts.query
        or parts.fragment
        or candidate not in ALLOWED_ORIGINS
    ):
        raise LauncherError("Konfigurasi tidak sah: baseUrl bukan asal Worker Autohadir yang dibenarkan.")
    return candidate


def load_config(path: str = None) -> str:
    path = path or config_path()
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        raise LauncherError(f"Konfigurasi tidak ditemui: {path}") from None
    except (OSError, ValueError):
        raise LauncherError("Konfigurasi tidak sah: config.json tidak dapat dibaca sebagai JSON.") from None
    if not isinstance(data, dict):
        raise LauncherError("Konfigurasi tidak sah: config.json mesti objek JSON.")
    return validate_origin(data.get("baseUrl"))


def _dpapi_functions():
    """Prototaip ctypes yang betul untuk 64-bit (argtypes/restype eksplisit)."""
    import ctypes
    from ctypes import wintypes

    class DATA_BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    crypt32.CryptUnprotectData.argtypes = [
        ctypes.POINTER(DATA_BLOB),  # pDataIn
        ctypes.POINTER(wintypes.LPWSTR),  # ppszDataDescr
        ctypes.POINTER(DATA_BLOB),  # pOptionalEntropy
        ctypes.c_void_p,  # pvReserved
        ctypes.c_void_p,  # pPromptStruct
        wintypes.DWORD,  # dwFlags
        ctypes.POINTER(DATA_BLOB),  # pDataOut
    ]
    crypt32.CryptUnprotectData.restype = wintypes.BOOL
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p
    crypt32.DATA_BLOB = DATA_BLOB
    return crypt32, kernel32


def _win_unprotect(blob: bytes) -> bytes:
    import ctypes

    crypt32, kernel32 = _dpapi_functions()
    DATA_BLOB = crypt32.DATA_BLOB
    in_buf = ctypes.create_string_buffer(blob, len(blob))  # kekal hidup sepanjang panggilan
    in_blob = DATA_BLOB(len(blob), ctypes.cast(in_buf, ctypes.POINTER(ctypes.c_char)))
    out_blob = DATA_BLOB()
    CRYPTPROTECT_UI_FORBIDDEN = 0x1
    ok = crypt32.CryptUnprotectData(ctypes.byref(in_blob), None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(out_blob))
    if not ok:
        raise OSError("CryptUnprotectData gagal")
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        if out_blob.pbData:
            ctypes.memset(out_blob.pbData, 0, out_blob.cbData)
            kernel32.LocalFree(ctypes.cast(out_blob.pbData, ctypes.c_void_p))


def decrypt_owner_key(blob: bytes, unprotect=None) -> str:
    """Nyahsulit blob DPAPI kepada kunci ASCII mentah. Ralat sentiasa generik."""
    unprotect = unprotect or _win_unprotect
    try:
        raw = unprotect(blob)
    except Exception:
        raise LauncherError("Gagal menyahsulit kunci pemilik (DPAPI). Pastikan anda log masuk sebagai pengguna Windows yang sama.") from None
    try:
        key = raw.decode("ascii")
    except (UnicodeDecodeError, AttributeError):
        raise LauncherError("Kunci pemilik tidak sah (bukan ASCII).") from None
    if len(key) < MIN_KEY_LEN or not all(33 <= ord(c) <= 126 for c in key) or key.startswith("{"):
        raise LauncherError("Kunci pemilik tidak sah (format).")
    return key


def load_owner_key(path: str = None) -> str:
    path = path or owner_key_path()
    try:
        with open(path, "rb") as f:
            blob = f.read()
    except FileNotFoundError:
        raise LauncherError(f"Fail kunci pemilik tidak ditemui: {path}") from None
    except OSError:
        raise LauncherError("Fail kunci pemilik tidak dapat dibaca.") from None
    return decrypt_owner_key(blob)


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def mint_owner_ticket(owner_key: str, now: int = None, nonce: str = None) -> str:
    """Tiket = b64url(JSON payload) + '.' + b64url(HMAC-SHA256(kunci ASCII, payload b64url))."""
    if not isinstance(owner_key, str) or len(owner_key) < MIN_KEY_LEN:
        raise LauncherError("Kunci pemilik tidak sah.")
    iat = int(time.time()) if now is None else int(now)
    payload = {"kind": "owner-login", "nonce": nonce or secrets.token_urlsafe(24), "iat": iat, "exp": iat + TICKET_TTL_S}
    payload_b64 = b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = hmac.new(owner_key.encode("ascii"), payload_b64.encode("ascii"), hashlib.sha256).digest()
    return f"{payload_b64}.{b64url(sig)}"


def build_launch_page(origin: str, ticket: str, script_nonce: str) -> bytes:
    action = html.escape(f"{origin}/auth/exchange", quote=True)
    page = f"""<!DOCTYPE html>
<html lang="ms"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer">
<title>Autohadir Cloud — membuka panel</title></head>
<body>
<form id="f" method="POST" action="{action}"><input type="hidden" name="ticket" value="{html.escape(ticket, quote=True)}"><noscript><button type="submit">Teruskan ke panel</button></noscript></form>
<p>Membuka panel Autohadir Cloud SK Paya Redan…</p>
<script nonce="{script_nonce}">document.getElementById('f').submit();</script>
</body></html>"""
    return page.encode("utf-8")


class OneShotServer:
    """Pelayan 127.0.0.1 yang menghidang halaman tiket SEKALI pada laluan rawak."""

    def __init__(self, origin: str, ticket: str, timeout_s: float = SERVE_TIMEOUT_S):
        self.origin = validate_origin(origin)
        self.host = "127.0.0.1"
        self.path = "/" + secrets.token_urlsafe(24)
        self.served = False
        self.closed = False
        self.deadline = time.monotonic() + timeout_s
        self._ticket = ticket
        outer = self

        class Handler(BaseHTTPRequestHandler):
            server_version = "Autohadir"
            sys_version = ""

            def log_message(self, *args):  # tiada log permintaan
                pass

            def _send(self, status, body=b"", extra=None):
                self.send_response(status)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Referrer-Policy", "no-referrer")
                self.send_header("X-Frame-Options", "DENY")
                self.send_header("X-Content-Type-Options", "nosniff")
                for k, v in (extra or {}).items():
                    self.send_header(k, v)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def _host_ok(self):
                return self.headers.get("Host") == f"{outer.host}:{outer.port}"

            def do_GET(self):
                if not self._host_ok():
                    return self._send(421)
                if self.path != outer.path or outer.served or outer._ticket is None:
                    return self._send(404)
                nonce = secrets.token_urlsafe(16)
                csp = (
                    "default-src 'none'; "
                    f"script-src 'nonce-{nonce}'; "
                    f"form-action {outer.origin}/auth/exchange; "
                    "base-uri 'none'; frame-ancestors 'none'"
                )
                body = build_launch_page(outer.origin, outer._ticket, nonce)
                outer.served = True
                outer._ticket = None
                self._send(200, body, {"Content-Security-Policy": csp})

            def do_POST(self):
                self._send(405 if self._host_ok() else 421)

            do_PUT = do_DELETE = do_PATCH = do_OPTIONS = do_HEAD = do_POST

        self.httpd = HTTPServer((self.host, 0), Handler)
        self.httpd.timeout = 0.25
        self.port = self.httpd.server_address[1]
        self.url = f"http://{self.host}:{self.port}{self.path}"

    def serve(self):
        """Gelung handle_request (tiada perlumbaan shutdown/serve_forever)."""
        try:
            while not self.served and not self.closed and time.monotonic() < self.deadline:
                self.httpd.handle_request()
        finally:
            self._ticket = None
            self.httpd.server_close()

    def close(self):
        self.closed = True


def main(argv=None, *, config_loader=load_config, key_loader=load_owner_key, opener=webbrowser.open, out=None, timeout_s=SERVE_TIMEOUT_S) -> int:
    out = out or sys.stdout
    try:
        origin = config_loader()
        key = key_loader()
        ticket = mint_owner_ticket(key)
        del key
        server = OneShotServer(origin, ticket, timeout_s=timeout_s)
        del ticket
    except LauncherError as err:
        print(f"[RALAT] {err}", file=out)
        return 1
    print("[*] Membuka panel Autohadir Cloud (SK Paya Redan)…", file=out)
    print(f"[*] Panel: {origin}", file=out)
    if not opener(server.url):
        print("[RALAT] Pelayar tidak dapat dibuka.", file=out)
        server.close()
    server.serve()
    if server.served:
        print("[*] Tiket dihantar ke pelayar. Pelancar tempatan ditutup.", file=out)
        return 0
    print("[RALAT] Tiada pelayar membuka halaman dalam 90 saat. Jalankan semula Buka-Panel.cmd.", file=out)
    return 2


def is_windows_store_python(executable=None):
    """Store Python virtualizes LOCALAPPDATA; never use it for owner key files."""
    path = str(executable or sys.executable).replace('\\', '/').lower()
    return '/windowsapps/' in path and 'pythonsoftwarefoundation' in path


if __name__ == "__main__":
    if "--check-runtime" in sys.argv:
        sys.exit(1 if is_windows_store_python() else 0)
    if is_windows_store_python():
        print("[RALAT] Guna Buka-Panel.cmd atau Python bukan Microsoft Store; storan kunci perlu laluan Windows sebenar.")
        sys.exit(1)
    sys.exit(main())
