import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SchoolSession } from '../src/session.mjs';
import { makeSessionDO } from './helpers/fakes.mjs';

test('binding terminal error with RPC context still confirms missing owned session', async () => {
  const {session, browser} = makeSessionDO(SchoolSession);
  await session.startSession('control');
  browser.getSession = async () => { throw new Error('getSession: Session not found (404)'); };
  assert.equal((await session.closeSession()).status, 'closed');
});

test('trusted binding Session not found error authoritatively ends owned browser', async () => {
  const {session, browser} = makeSessionDO(SchoolSession);
  await session.startSession('control');
  browser.closeSession = async () => 'closing';
  browser.getSession = async () => { throw new Error('Session not found'); };
  assert.equal((await session.closeSession()).status, 'closed');
});

test('positive endTime confirms owned browser closed despite historical metadata', async () => {
  const {session, browser, clock, storage} = makeSessionDO(SchoolSession);
  await session.startSession('control');
  const sid = storage.data.get('session_state').sessionId;
  browser.closeSession = async () => 'closing';
  browser.getSession = async () => ({sessionId:sid, endTime:clock.now()});
  const result = await session.closeSession();
  assert.equal(result.status, 'closed');
  assert.equal((await session.getStatus()).session.hasSession, false);
});

test('detached CDP connection is NOT evidence of closed browser', async () => {
  const {session, browser, clock, storage} = makeSessionDO(SchoolSession);
  await session.startSession('control');
  const sid = storage.data.get('session_state').sessionId;
  browser.closeSession = async () => 'closing';
  browser.getSession = async () => ({sessionId:sid, connectionEndTime:clock.now()});
  assert.equal((await session.closeSession()).status, 'closing');
  assert.equal((await session.getStatus()).session.hasSession, true);
});
