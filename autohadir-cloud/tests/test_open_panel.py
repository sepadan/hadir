"""Ujian unit pelancar pemilik (scripts/open-panel.py).

Data rekaan sahaja: kunci palsu, blob DPAPI palsu, asal Worker sebenar yang
awam. Tiada fail owner-key.dpapi sebenar dibaca dan tiada portal disentuh.
"""

import base64
import hashlib
import hmac
import http.client
import importlib.util
import io
import json
import os
import sys
import tempfile
import threading
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "scripts", "open-panel.py")

spec = importlib.util.spec_from_file_location("open_panel", SCRIPT)
op = importlib.util.module_from_spec(spec)
spec.loader.exec_module(op)

FAKE_KEY = "fixture-owner-key-0123456789abcdef0123456789abcdef"
ORIGIN = "https://autohadir-skpr-cloud.sekolah-3458-cm1.workers.dev"


def b64url_decode(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def write_config(tmp, data):
    path = os.path.join(tmp, "config.json")
    with open(path, "w", encoding="utf-8") as f:
        f.write(data if isinstance(data, str) else json.dumps(data))
    return path


class ConfigTests(unittest.TestCase):
    def test_default_path_is_localappdata(self):
        self.assertTrue(op.config_path().endswith(os.path.join("AutohadirCloud", "config.json")))
        self.assertTrue(op.owner_key_path().endswith(os.path.join("AutohadirCloud", "owner-key.dpapi")))

    def test_exact_origin_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(op.load_config(write_config(tmp, {"baseUrl": ORIGIN})), ORIGIN)
            self.assertEqual(op.load_config(write_config(tmp, {"baseUrl": ORIGIN + "/"})), ORIGIN)

    def test_missing_or_invalid_config_fails_clearly(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(op.LauncherError):
                op.load_config(os.path.join(tmp, "tiada.json"))
            with self.assertRaises(op.LauncherError):
                op.load_config(write_config(tmp, "{bukan json"))
            with self.assertRaises(op.LauncherError):
                op.load_config(write_config(tmp, ["x"]))

    def test_wrong_or_attacker_origin_rejected(self):
        bad = [
            "https://autohadir-skpr-cloud.seman.workers.dev",
            "http://autohadir-skpr-cloud.sekolah-3458-cm1.workers.dev",
            "https://user:pw@autohadir-skpr-cloud.sekolah-3458-cm1.workers.dev",
            "https://autohadir-skpr-cloud.sekolah-3458-cm1.workers.dev:8443",
            "https://autohadir-skpr-cloud.sekolah-3458-cm1.workers.dev/auth/exchange",
            "https://autohadir-skpr-cloud.sekolah-3458-cm1.workers.dev?x=1",
            "https://autohadir-skpr-cloud.sekolah-3458-cm1.workers.dev.evil.example",
            "javascript:alert(1)",
            "",
            None,
            42,
        ]
        with tempfile.TemporaryDirectory() as tmp:
            for value in bad:
                with self.assertRaises(op.LauncherError, msg=repr(value)):
                    op.load_config(write_config(tmp, {"baseUrl": value}))


class TicketTests(unittest.TestCase):
    def test_mint_format_and_signature(self):
        ticket = op.mint_owner_ticket(FAKE_KEY, now=1_800_000_000, nonce="fixture-nonce-0123456789")
        payload_b64, sig_b64 = ticket.split(".")
        payload = json.loads(b64url_decode(payload_b64))
        self.assertEqual(payload, {"kind": "owner-login", "nonce": "fixture-nonce-0123456789", "iat": 1_800_000_000, "exp": 1_800_000_090})
        expected = hmac.new(FAKE_KEY.encode("ascii"), payload_b64.encode("ascii"), hashlib.sha256).digest()
        self.assertTrue(hmac.compare_digest(b64url_decode(sig_b64), expected))

    def test_random_nonce_is_long(self):
        payload = json.loads(b64url_decode(op.mint_owner_ticket(FAKE_KEY).split(".")[0]))
        self.assertGreaterEqual(len(payload["nonce"]), 16)

    def test_short_key_rejected(self):
        with self.assertRaises(op.LauncherError):
            op.mint_owner_ticket("short")


class DpapiTests(unittest.TestCase):
    def test_decrypt_with_injected_unprotect(self):
        seen = []

        def fake_unprotect(blob):
            seen.append(blob)
            return FAKE_KEY.encode("ascii")

        self.assertEqual(op.decrypt_owner_key(b"\x01\x02fake-blob", unprotect=fake_unprotect), FAKE_KEY)
        self.assertEqual(seen, [b"\x01\x02fake-blob"])

    def test_decrypt_rejects_non_ascii_or_short_or_whitespace(self):
        for raw in [b"short", "kunci-é".encode("utf-8") * 10, (" " + FAKE_KEY).encode("ascii"), b'{"key":"' + FAKE_KEY.encode() + b'"}\n']:
            with self.assertRaises(op.LauncherError, msg=repr(raw[:12])):
                op.decrypt_owner_key(b"blob", unprotect=lambda _b, r=raw: r)

    def test_unprotect_errors_are_generic(self):
        def boom(_blob):
            raise OSError("detail sulit")

        with self.assertRaises(op.LauncherError) as cm:
            op.decrypt_owner_key(b"blob", unprotect=boom)
        self.assertNotIn("detail sulit", str(cm.exception))

    @unittest.skipUnless(sys.platform == "win32", "DPAPI hanya Windows")
    def test_ctypes_prototypes_are_64bit_safe(self):
        crypt32, kernel32 = op._dpapi_functions()
        import ctypes

        self.assertEqual(len(crypt32.CryptUnprotectData.argtypes), 7)
        self.assertIs(crypt32.CryptUnprotectData.restype, ctypes.wintypes.BOOL)
        self.assertEqual(kernel32.LocalFree.argtypes, [ctypes.c_void_p])
        self.assertIs(kernel32.LocalFree.restype, ctypes.c_void_p)

    @unittest.skipUnless(sys.platform == "win32", "DPAPI hanya Windows")
    def test_real_unprotect_on_garbage_bytes_fails_cleanly(self):
        with self.assertRaises(op.LauncherError):
            op.decrypt_owner_key(b"\x00" * 64)


class OneShotServerTests(unittest.TestCase):
    def setUp(self):
        self.ticket = op.mint_owner_ticket(FAKE_KEY)
        self.server = op.OneShotServer(ORIGIN, self.ticket, timeout_s=5)
        self.thread = threading.Thread(target=self.server.serve, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.close()
        self.thread.join(timeout=10)

    def request(self, path, host=None, method="GET"):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.port, timeout=5)
        conn.putrequest(method, path, skip_host=True)
        conn.putheader("Host", host or f"127.0.0.1:{self.server.port}")
        conn.endheaders()
        res = conn.getresponse()
        body = res.read()
        conn.close()
        return res, body

    def test_binds_loopback_with_random_path(self):
        self.assertEqual(self.server.host, "127.0.0.1")
        self.assertTrue(self.server.url.startswith(f"http://127.0.0.1:{self.server.port}/"))
        self.assertGreaterEqual(len(self.server.path), 20)

    def test_wrong_host_and_path_and_method_rejected(self):
        res, body = self.request(self.server.path, host="evil.example")
        self.assertEqual(res.status, 421)
        self.assertNotIn(self.ticket.encode(), body)
        res, body = self.request("/salah")
        self.assertEqual(res.status, 404)
        self.assertNotIn(self.ticket.encode(), body)
        res, body = self.request(self.server.path, method="POST")
        self.assertEqual(res.status, 405)
        self.assertFalse(self.server.served)

    def test_serves_once_with_strict_headers_then_stops(self):
        res, body = self.request(self.server.path)
        self.assertEqual(res.status, 200)
        html = body.decode("utf-8")
        self.assertIn(f'action="{ORIGIN}/auth/exchange"', html)
        self.assertIn(self.ticket, html)
        csp = res.getheader("Content-Security-Policy")
        self.assertIn(f"form-action {ORIGIN}/auth/exchange", csp)
        self.assertNotIn("unsafe-inline", csp)
        self.assertIn("script-src 'nonce-", csp)
        self.assertIn("default-src 'none'", csp)
        self.assertIn("no-store", res.getheader("Cache-Control"))
        self.assertEqual(res.getheader("Referrer-Policy"), "no-referrer")
        self.assertEqual(res.getheader("X-Frame-Options"), "DENY")
        self.assertIsNone(res.getheader("Access-Control-Allow-Origin"))
        self.thread.join(timeout=5)
        self.assertFalse(self.thread.is_alive(), "pelayan berhenti selepas satu hidangan")
        self.assertTrue(self.server.served)


class MainTests(unittest.TestCase):
    def test_main_never_prints_ticket_or_key(self):
        out = io.StringIO()
        captured = {}

        def opener(url):
            def fetch():
                conn = http.client.HTTPConnection("127.0.0.1", int(url.split(":")[2].split("/")[0]), timeout=5)
                conn.request("GET", "/" + url.split("/", 3)[3])
                captured["body"] = conn.getresponse().read().decode("utf-8")
                conn.close()

            captured["thread"] = threading.Thread(target=fetch, daemon=True)
            captured["thread"].start()
            return True

        rc = op.main(config_loader=lambda: ORIGIN, key_loader=lambda: FAKE_KEY, opener=opener, out=out, timeout_s=5)
        self.assertEqual(rc, 0)
        captured["thread"].join(timeout=5)
        printed = out.getvalue()
        self.assertNotIn(FAKE_KEY, printed)
        ticket = captured["body"].split('name="ticket" value="')[1].split('"')[0]
        self.assertNotIn(ticket, printed)
        self.assertNotIn(ticket.split(".")[1], printed)

    def test_main_config_error_exits_nonzero_without_minting(self):
        out = io.StringIO()

        def bad_config():
            raise op.LauncherError("Konfigurasi tidak sah")

        def key_loader():
            raise AssertionError("kunci tidak boleh dibaca jika konfigurasi tidak sah")

        rc = op.main(config_loader=bad_config, key_loader=key_loader, opener=lambda u: True, out=out, timeout_s=1)
        self.assertNotEqual(rc, 0)
        self.assertIn("Konfigurasi tidak sah", out.getvalue())

    def test_no_test_mint_cli_flag(self):
        with open(SCRIPT, encoding="utf-8") as f:
            source = f.read()
        self.assertNotIn("--test-mint", source)


if __name__ == "__main__":
    unittest.main(verbosity=2)
