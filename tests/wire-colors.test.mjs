import test from 'node:test';
import assert from 'node:assert/strict';
import {WIRE_COLOR_PRESETS,DEFAULT_WIRE_COLOR,wireColorForDigit,wireColorOptions} from '../.test-dist/core/wire-colors.js';
test('default wiring matches standard green with a bounded fixed palette',()=>{
 assert.equal(DEFAULT_WIRE_COLOR,WIRE_COLOR_PRESETS[4].value);
 assert.equal(WIRE_COLOR_PRESETS.length,12);
 assert.equal(new Set(WIRE_COLOR_PRESETS.map(v=>v.value)).size,12);
 for(const p of WIRE_COLOR_PRESETS)assert.match(p.value,/^#[0-9a-f]{6}$/);
});
test('number keys address 0 through 9 without touching digits elsewhere',()=>{
 for(let i=0;i<10;i++)assert.equal(wireColorForDigit(String(i)),WIRE_COLOR_PRESETS[i].value);
 for(const key of ['-1','10','R','a','','1x'])assert.equal(wireColorForDigit(key),null);
});
test('color selection does not interpolate untrusted wire color into HTML',()=>{
 assert.equal(wireColorOptions('#35b65d').includes('value="#35b65d" selected'),true);
 assert.equal(wireColorOptions('#aabbcc').includes('自定义'),true);
 assert.equal(wireColorOptions('<script>').includes('<script>'),false);
});
