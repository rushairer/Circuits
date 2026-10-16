import test from 'node:test';
import assert from 'node:assert/strict';
import {demo} from '../.test-dist/model.js';
import {changeResistorValue} from '../.test-dist/core/resistance-units.js';
import {resistorValueFields} from '../.test-dist/ui/resistor-value-fields.js';
import {renderQuickProperties} from '../.test-dist/ui/floating-properties.js';

test('shared resistor fields provide distinct canonical and contextual selectors',()=>{
 const p=changeResistorValue(demo(),'r1',4.7,'k').parts.find(x=>x.id==='r1');
 const side=resistorValueFields(p),quick=resistorValueFields(p,true),popup=renderQuickProperties(p);
 assert.match(side,/id="value"/);
 assert.match(side,/id="value-unit"/);
 assert.match(side,/value="4.7"/);
 assert.match(side,/value="k" selected/);
 assert.match(quick,/data-quick-field="value"/);
 assert.match(quick,/data-quick-field="value-unit"/);
 assert.doesNotMatch(quick,/id="value"|id="value-unit"/);
 assert.match(popup,/data-quick-field="value-unit"/);
});
