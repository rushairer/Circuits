import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validProject} from '../.test-dist/model.js';
import {buildNetlist} from '../.test-dist/core/netlist.js';
import {appendConnection,reconnectEndpoint} from '../.test-dist/core/connections.js';
import {
 WIRE_TYPES,isWireType,wireTypeForDigit,effectiveWireType,
 changeWireTypes,wireConnectorMarkup
} from '../.test-dist/core/wire-types.js';

test('wire connector types and Shift+1..4 mapping match the documented menu',()=>{
 assert.deepEqual(WIRE_TYPES.map(t=>t.value),['normal','hookup','alligator','automatic']);
 for(let i=1;i<=4;i++)assert.equal(wireTypeForDigit(String(i)),WIRE_TYPES[i-1].value);
 for(const x of ['0','5','','x','10','Shift+1'])assert.equal(wireTypeForDigit(x),null);
 for(const entry of WIRE_TYPES)assert.equal(isWireType(entry.value),true);
 for(const item of [null,undefined,'ALLIGATOR',{},'clip'])assert.equal(isWireType(item),false);
});
test('legacy wires without type preserve normal route and all historical color values',()=>{
 const p=demo(),snapshot=structuredClone(p);
 assert.equal(validProject(p),true);
 for(const wire of p.wires){
   assert.equal(wire.type,undefined);
   assert.equal(effectiveWireType(wire,p.parts),'normal');
   assert.equal(wireConnectorMarkup(wire,p.parts),'');
 }
 assert.deepEqual(p,snapshot);
});
test('batch type update is immutable, does not alter routing or netlist membership',()=>{
 const p=demo(),snapshot=structuredClone(p),nets=buildNetlist(p);
 const ids=new Set(['w1','w2']);
 const changed=changeWireTypes(p,ids,'hookup');
 assert.equal(validProject(changed),true);
 assert.notStrictEqual(changed,p);
 assert.strictEqual(changed.parts,p.parts);
 assert.deepEqual(changed.wires.slice(0,2).map(w=>w.type),['hookup','hookup']);
 assert.strictEqual(changed.wires[2],p.wires[2]);
 for(let i=0;i<3;i++){
   assert.equal(changed.wires[i].id,p.wires[i].id);
   assert.deepEqual(changed.wires[i].from,p.wires[i].from);
   assert.deepEqual(changed.wires[i].to,p.wires[i].to);
   assert.deepEqual(changed.wires[i].bends,p.wires[i].bends);
   assert.equal(changed.wires[i].color,p.wires[i].color);
 }
 const after=buildNetlist(changed);
 for(const w of p.wires)assert.equal(after.netOf(w.from),nets.netOf(w.from));
 assert.deepEqual(changed.wires.filter(w=>ids.has(w.id)).map(w=>w.color),['#e45454','#e45454']);
 assert.deepEqual(p,snapshot);
});
test('explicit hookup sleeves and alligator jaws have two pointer-transparent world-space fittings',()=>{
 const p=demo(),w=p.wires[0];
 const hookup=wireConnectorMarkup({...w,type:'hookup'},p.parts);
 assert.match(hookup,/data-effective-wire-type="hookup"/);
 assert.equal((hookup.match(/class="wire-plug"/g)||[]).length,2);
 assert.match(hookup,/pointer-events="none"/);
 assert.doesNotMatch(hookup,/<script|onclick=|<foreignObject/i);
 const jaws=wireConnectorMarkup({...w,type:'alligator'},p.parts);
 assert.equal((jaws.match(/class="wire-clip-jaws"/g)||[]).length,2);
 assert.match(jaws,/translate\(\d+ \d+\) rotate\(/);
 const legacy=wireConnectorMarkup(w,p.parts);
 assert.equal(legacy,'');
});
test('automatic is bounded by actual endpoint component kinds and never infers new electrical junctions',()=>{
 const p=demo(),battery=p.wires[0],ordinary=p.wires[1];
 assert.equal(effectiveWireType({...battery,type:'automatic'},p.parts),'alligator');
 assert.equal(effectiveWireType({...ordinary,type:'automatic'},p.parts),'normal');
 assert.equal(wireConnectorMarkup({...ordinary,type:'automatic'},p.parts),'');
 assert.equal((wireConnectorMarkup({...battery,type:'automatic'},p.parts).match(/class="wire-clip-jaws"/g)||[]).length,2);
});
test('unknown styles fail import and connection creation; reconnect keeps known wire type',()=>{
 const p=demo(),first=p.wires[0];
 assert.equal(validProject({...p,wires:[{...first,type:'invalid'},...p.wires.slice(1)]}),false);
 const baseline={...p,wires:[]};
 const invalid=appendConnection(baseline,{...first,id:'invalid',type:'invalid'});
 assert.equal(invalid,null);
 const appended=appendConnection(baseline,{...first,id:'typed',type:'alligator'});
 assert.ok(appended);
 const changed=reconnectEndpoint(appended,'typed','to',{componentId:'l1',pinId:'anode'});
 assert.equal(changed.wires[0].type,'alligator');
 assert.equal(changed.wires[0].id,'typed');
 assert.deepEqual(changed.wires[0].from,first.from);
});
test('no-op and unknown batch requests keep identity, legacy wires remain untouched',()=>{
 const p=demo();
 assert.strictEqual(changeWireTypes(p,new Set(),'hookup'),p);
 assert.strictEqual(changeWireTypes(p,new Set(['missing']),'hookup'),p);
 assert.strictEqual(changeWireTypes(p,new Set(['w1']),'normal'),p);
 assert.strictEqual(changeWireTypes(p,new Set(['w1']),'not-real'),p);
});
