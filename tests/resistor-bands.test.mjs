import test from 'node:test';
import assert from 'node:assert/strict';
import {demo} from '../.test-dist/model.js';
import {resistorBands} from '../.test-dist/core/resistor-bands.js';
import {resistorArtwork} from '../.test-dist/ui/resistor-artwork.js';
import {changeResistorValue} from '../.test-dist/core/resistance-units.js';

const names=value=>resistorBands(value)?.map(b=>b.name);
test('four-band resistor color changes with actual ohm value (IEC 60062)',()=>{
 assert.deepEqual(names(220),['red','red','brown','gold']);
 assert.deepEqual(names(330),['orange','orange','brown','gold']);
 assert.deepEqual(names(4700),['yellow','violet','red','gold']);
 assert.deepEqual(names(1000),['brown','black','red','gold']);
 assert.deepEqual(names(0.47),['yellow','violet','silver','gold']);
 assert.deepEqual(names(0.033),['orange','orange','pink','gold']);
});
test('five-band codes preserve 3 significant digits and refuse false physical stripes',()=>{
 assert.deepEqual(names(123),['brown','red','orange','black','brown']);
 assert.equal(resistorBands(123.456),null);
 assert.equal(resistorBands(330e-12),null);
 assert.equal(resistorBands(1e12),null);
 assert.equal(resistorBands(-1),null);
 assert.equal(resistorBands(Infinity),null);
});
test('SVG stripes follow effective value and never mutate electrical project',()=>{
 const p=demo(),snapshot=structuredClone(p);
 const before=resistorArtwork(p.parts.find(c=>c.id==='r1'));
 assert.match(before,/data-resistor-bands="4"/);
 assert.match(before,/data-band-color="orange"/);
 const changed=changeResistorValue(p,'r1',330,'k');
 const after=resistorArtwork(changed.parts.find(c=>c.id==='r1'));
 assert.match(after,/data-band-color="yellow"/);
 assert.match(after,/>330kΩ</);
 assert.equal((after.match(/class="resistor-band"/g)||[]).length,4);
 assert.deepEqual(p,snapshot);
 assert.deepEqual(changed.wires,p.wires);
 const unsupported=resistorArtwork({...p.parts.find(c=>c.id==='r1'),value:330e-12});
 assert.match(unsupported,/data-resistor-bands="0"/);
 assert.doesNotMatch(unsupported,/class="resistor-band"/);
 assert.match(unsupported,/无法用四或五色环/);
});
