import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { SAFE_EVALUATE_SCRIPT } from '../src/evaluator.mjs';

function evaluate(text, unrelatedCheckbox=false) {
  const document={body:{innerText:text},querySelector(){return null;},
    querySelectorAll(selector){
      if(unrelatedCheckbox && selector.includes('table tr input[type="checkbox"]')) return [{}];
      return [];
    }};
  return vm.runInNewContext(SAFE_EVALUATE_SCRIPT,{document,
    location:{hostname:'moeispel.moe.gov.my',href:'https://moeispel.moe.gov.my/'}});
}
test('actual evaluator identifies a plain Forbidden page without numeric status',()=>{
  assert.equal(evaluate('Forbidden\nYou do not have permission to access this resource').isBlocked,true);
});
test('actual Malay security-block wording is detected', () => {
  assert.equal(evaluate('Sekatan atas faktor keselamatan.').isBlocked, true);
});

test('unrelated table checkbox is not attendance DOM evidence', () => {
  assert.equal(evaluate('Marketing preferences',true).moeisAttendanceSelectorCount,0);
});
