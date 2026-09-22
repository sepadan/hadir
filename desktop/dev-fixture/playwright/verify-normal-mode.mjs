// External proof of the report's "normal mode has no CDP" claim.
//
// Run AFTER launching HadirDesktop.exe WITHOUT HADIR_DEV_DEBUG set (normal
// mode). This script never launches the app itself — the orchestrator does
// that — it only observes OS-level state: process command lines (never
// printed verbatim — only counts/booleans/verdicts, since a command line can
// carry PII in argv) and the dev-only port file's mtime.
//
// Usage (from desktop/dev-fixture/playwright, app already running normally):
//   node verify-normal-mode.mjs

import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

const LOCALAPPDATA = process.env.LOCALAPPDATA
  || join(os.homedir(), 'AppData', 'Local');
const PORT_FILE = process.env.HADIR_DEVTOOLS_PORT_FILE
  || join(LOCALAPPDATA, 'HadirDesktop', 'devtools-port.txt');

// The launch timestamp of THIS normal-mode run, supplied by the orchestrator
// (ISO string or epoch ms) so we can tell "port file predates this launch"
// apart from "port file was just rewritten by this launch". Optional: if
// absent, we only check for a fresh mtime within the last few seconds.
const LAUNCHED_AT = process.env.HADIR_NORMAL_LAUNCH_AT
  ? new Date(process.env.HADIR_NORMAL_LAUNCH_AT)
  : null;

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail ?? '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => resolve(out));
    child.on('error', () => resolve(out));
  });
}

async function main() {
  console.log('HADIR normal-mode CDP absence verification');

  // 1) HADIR_DEV_DEBUG must not be set in THIS environment.
  const devDebugSet = !!process.env.HADIR_DEV_DEBUG;
  record('HADIR_DEV_DEBUG is not set in this environment', !devDebugSet, devDebugSet ? 'HADIR_DEV_DEBUG is set' : '');

  // 2) Enumerate msedgewebview2.exe processes with command lines.
  const json = await run('powershell', [
    '-NoProfile', '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
  ]);

  let procs = [];
  try {
    const parsed = JSON.parse(json || '[]');
    procs = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
  } catch {
    procs = [];
  }

  const normalProfileProcs = procs.filter((p) => /HadirDesktop\\webview2-demo/i.test(String(p.CommandLine || '')));
  const normalProfileWithCdp = normalProfileProcs.filter((p) => /--remote-debugging-port/i.test(String(p.CommandLine || '')));

  // 3) None of the normal-profile processes may carry --remote-debugging-port.
  record('No msedgewebview2.exe under the normal profile has --remote-debugging-port',
    normalProfileWithCdp.length === 0,
    `normalProfileProcesses=${normalProfileProcs.length} withCdp=${normalProfileWithCdp.length}`);

  // 4) The dev-only port file is absent, or not freshly rewritten by this normal launch.
  let portFileOk = true;
  let portFileDetail = 'absent';
  if (existsSync(PORT_FILE)) {
    const mtime = statSync(PORT_FILE).mtime;
    if (LAUNCHED_AT) {
      portFileOk = mtime < LAUNCHED_AT;
      portFileDetail = `mtime=${mtime.toISOString()} launchedAt=${LAUNCHED_AT.toISOString()}`;
    } else {
      const ageMs = Date.now() - mtime.getTime();
      portFileOk = ageMs > 10000;
      portFileDetail = `mtime=${mtime.toISOString()} ageMs=${ageMs}`;
    }
  }
  record('devtools-port.txt is absent or predates this normal-mode launch', portFileOk, portFileDetail);

  console.log('\n--- summary ---');
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILED:', failed.map((f) => f.name).join('; '));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('VERIFY ERROR:', e && e.message || e);
  process.exitCode = 2;
});
