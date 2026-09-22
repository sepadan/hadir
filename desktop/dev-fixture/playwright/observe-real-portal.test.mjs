// Pure-function unit tests for observe-real-portal.mjs. Importing this module
// must NOT start observing (main() is guarded behind an import.meta.url check).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  adalahAlamatLoopback,
  sanitizeUrlForReport,
  adalahHostIdMe,
} from './observe-real-portal.mjs';

test('adalahAlamatLoopback: accepts loopback addresses', () => {
  assert.equal(adalahAlamatLoopback('127.0.0.1'), true);
  assert.equal(adalahAlamatLoopback('127.1.2.3'), true);
  assert.equal(adalahAlamatLoopback('::1'), true);
  assert.equal(adalahAlamatLoopback('[::1]'), true);
});

test('adalahAlamatLoopback: rejects wildcard/public/empty addresses', () => {
  assert.equal(adalahAlamatLoopback('0.0.0.0'), false);
  assert.equal(adalahAlamatLoopback('::'), false);
  assert.equal(adalahAlamatLoopback('192.168.1.5'), false);
  assert.equal(adalahAlamatLoopback('8.8.8.8'), false);
  assert.equal(adalahAlamatLoopback(''), false);
});

test('sanitizeUrlForReport: strips query and fragment from http(s)', () => {
  assert.equal(
    sanitizeUrlForReport('https://idme.moe.gov.my/login?code=SECRET&state=XYZ#frag'),
    'https://idme.moe.gov.my/login',
  );
  assert.equal(sanitizeUrlForReport('https://idme.moe.gov.my/'), 'https://idme.moe.gov.my/');
});

test('sanitizeUrlForReport: collapses non-http schemes', () => {
  assert.equal(sanitizeUrlForReport('about:blank'), 'about://…');
  assert.equal(sanitizeUrlForReport('javascript:alert(1)'), 'javascript://…');
});

test('sanitizeUrlForReport: unparseable becomes placeholder', () => {
  assert.equal(sanitizeUrlForReport(''), '(unparseable)');
});

test('adalahHostIdMe: accepts only https idme host', () => {
  assert.equal(adalahHostIdMe('https://idme.moe.gov.my/login'), true);
  assert.equal(adalahHostIdMe('https://idme.moe.gov.my/'), true);
  assert.equal(adalahHostIdMe('http://idme.moe.gov.my/login'), false);
  assert.equal(adalahHostIdMe('https://evil.example/idme.moe.gov.my'), false);
  assert.equal(adalahHostIdMe('https://sub.idme.moe.gov.my/'), false);
});
