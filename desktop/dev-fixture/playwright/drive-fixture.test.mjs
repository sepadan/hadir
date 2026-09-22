// Pure-function unit tests for drive-fixture.mjs. Importing this module must
// NOT start driving the app (main() is guarded behind an import.meta.url
// check) — these tests only exercise the exported pure helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  adalahAlamatLoopback,
  semakAlamatLoopback,
  adalahAsalFixtureDev,
  semakFingerprintWebView2,
} from './drive-fixture.mjs';

test('adalahAlamatLoopback: accepts loopback addresses', () => {
  assert.equal(adalahAlamatLoopback('127.0.0.1'), true);
  assert.equal(adalahAlamatLoopback('127.1.2.3'), true);
  assert.equal(adalahAlamatLoopback('::1'), true);
});

test('adalahAlamatLoopback: rejects wildcard/public/empty addresses', () => {
  assert.equal(adalahAlamatLoopback('0.0.0.0'), false);
  assert.equal(adalahAlamatLoopback('::'), false);
  assert.equal(adalahAlamatLoopback('192.168.1.5'), false);
  assert.equal(adalahAlamatLoopback('10.0.0.1'), false);
  assert.equal(adalahAlamatLoopback('8.8.8.8'), false);
  assert.equal(adalahAlamatLoopback(''), false);
});

const PORT = 54321;
const LISTENING_ROW = (addr) => `  TCP    ${addr}    0.0.0.0:0    LISTENING       1234`;
const OTHER_PORT_ROW = `  TCP    127.0.0.1:9999    0.0.0.0:0    LISTENING       5678`;

test('semakAlamatLoopback: accepts a loopback LISTENING row for the port', () => {
  const text = LISTENING_ROW(`127.0.0.1:${PORT}`);
  const hasil = semakAlamatLoopback(text, PORT);
  assert.equal(hasil.ok, true);
  assert.equal(hasil.alamat, '127.0.0.1');
});

test('semakAlamatLoopback: rejects a wildcard 0.0.0.0 LISTENING row', () => {
  const text = LISTENING_ROW(`0.0.0.0:${PORT}`);
  const hasil = semakAlamatLoopback(text, PORT);
  assert.equal(hasil.ok, false);
});

test('semakAlamatLoopback: rejects a public-address LISTENING row', () => {
  const text = LISTENING_ROW(`192.168.1.5:${PORT}`);
  const hasil = semakAlamatLoopback(text, PORT);
  assert.equal(hasil.ok, false);
});

test('semakAlamatLoopback: rejects an IPv6 wildcard [::] LISTENING row', () => {
  const text = LISTENING_ROW(`[::]:${PORT}`);
  const hasil = semakAlamatLoopback(text, PORT);
  assert.equal(hasil.ok, false);
});

test('semakAlamatLoopback: not ok when no row matches the port', () => {
  const hasil = semakAlamatLoopback(OTHER_PORT_ROW, PORT);
  assert.equal(hasil.ok, false);
});

test('adalahAsalFixtureDev: accepts /dev on the matching loopback port', () => {
  assert.equal(adalahAsalFixtureDev(`http://127.0.0.1:${PORT}/dev`, PORT), true);
});

test('adalahAsalFixtureDev: accepts /dev/kelas/2 on the matching loopback port', () => {
  assert.equal(adalahAsalFixtureDev(`http://127.0.0.1:${PORT}/dev/kelas/2`, PORT), true);
});

test('adalahAsalFixtureDev: rejects the normal fixture root', () => {
  assert.equal(adalahAsalFixtureDev(`http://127.0.0.1:${PORT}/`, PORT), false);
});

test('adalahAsalFixtureDev: rejects a different port (e.g. engine settings 8747)', () => {
  assert.equal(adalahAsalFixtureDev(`http://127.0.0.1:8747/`, PORT), false);
});

test('adalahAsalFixtureDev: rejects https', () => {
  assert.equal(adalahAsalFixtureDev(`https://127.0.0.1:${PORT}/dev`, PORT), false);
});

test('adalahAsalFixtureDev: rejects about:blank', () => {
  assert.equal(adalahAsalFixtureDev('about:blank', PORT), false);
});

const GOOD_VERSION = { Browser: 'Edge/WebView2' };
const GOOD_IMAGE = 'msedgewebview2.exe';
const GOOD_CMDLINE = `"msedgewebview2.exe" --remote-debugging-port=${PORT} --user-data-dir="C:\\Users\\x\\AppData\\Local\\HadirDesktop\\webview2-dev-${PORT}"`;

test('semakFingerprintWebView2: accepts a correct triple', () => {
  assert.equal(semakFingerprintWebView2(GOOD_VERSION, PORT, GOOD_IMAGE, GOOD_CMDLINE), true);
});

test('semakFingerprintWebView2: rejects empty Browser', () => {
  assert.equal(semakFingerprintWebView2({ Browser: '' }, PORT, GOOD_IMAGE, GOOD_CMDLINE), false);
  assert.equal(semakFingerprintWebView2({}, PORT, GOOD_IMAGE, GOOD_CMDLINE), false);
  assert.equal(semakFingerprintWebView2(null, PORT, GOOD_IMAGE, GOOD_CMDLINE), false);
});

test('semakFingerprintWebView2: rejects a non-msedgewebview2 image', () => {
  assert.equal(semakFingerprintWebView2(GOOD_VERSION, PORT, 'chrome.exe', GOOD_CMDLINE), false);
  assert.equal(semakFingerprintWebView2(GOOD_VERSION, PORT, 'msedge.exe', GOOD_CMDLINE), false);
});

test('semakFingerprintWebView2: rejects a cmdline missing the isolated dev profile', () => {
  const cmd = `"msedgewebview2.exe" --remote-debugging-port=${PORT} --user-data-dir="C:\\Users\\x\\AppData\\Local\\HadirDesktop\\webview2-demo"`;
  assert.equal(semakFingerprintWebView2(GOOD_VERSION, PORT, GOOD_IMAGE, cmd), false);
});

test('semakFingerprintWebView2: rejects a cmdline missing the remote-debugging-port flag', () => {
  const cmd = `"msedgewebview2.exe" --user-data-dir="C:\\Users\\x\\AppData\\Local\\HadirDesktop\\webview2-dev-${PORT}"`;
  assert.equal(semakFingerprintWebView2(GOOD_VERSION, PORT, GOOD_IMAGE, cmd), false);
});

test('semakFingerprintWebView2: rejects a cmdline whose port does not match ours', () => {
  const cmd = `"msedgewebview2.exe" --remote-debugging-port=9999 --user-data-dir="C:\\Users\\x\\AppData\\Local\\HadirDesktop\\webview2-dev-${PORT}"`;
  assert.equal(semakFingerprintWebView2(GOOD_VERSION, PORT, GOOD_IMAGE, cmd), false);
});
