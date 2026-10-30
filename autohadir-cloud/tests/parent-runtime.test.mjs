import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('launcher skips Windows Store Python filesystem virtualization',()=>{
 const script=fileURLToPath(new URL('../scripts/open-panel.py',import.meta.url));
 const code=`import importlib.util\ns=importlib.util.spec_from_file_location('op',${JSON.stringify(script)})\nm=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nassert m.is_windows_store_python('C:/Users/example/AppData/Local/Microsoft/WindowsApps/PythonSoftwareFoundation.Python.3.12/python.exe')\nassert not m.is_windows_store_python('C:/Python312/python.exe')\nassert not m.is_windows_store_python('C:/tools/python-3.14/python.exe')\n`;
 execFileSync('python3',['-c',code],{stdio:'pipe'});
 const cmd=readFileSync(new URL('../Buka-Panel.cmd',import.meta.url),'utf8');
 assert.ok(cmd.includes('--check-runtime'));
 assert.ok(!cmd.includes('PYEXE=py -3.12'));
});
