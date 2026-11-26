import test from 'node:test';
import assert from 'node:assert/strict';
import {routeSchematic} from '../.test-dist/core/schematic-routing.js';
const fixture=(secondRows=[125])=>({
 components:[{terminals:[
  {componentId:'a',pinId:'a',netId:'N1',x:436,y:300},
  ...secondRows.map((y,i)=>({componentId:'b'+i,pinId:'a',netId:'N2',x:436,y}))
 ]}],
 nets:[{id:'N1',x:770,y:120,endpointKeys:['a::a'],boardContacts:['bb::a']},
  {id:'N2',x:770,y:200,endpointKeys:secondRows.map((_,i)=>'b'+i+'::a'),boardContacts:['bb::b']}]
});
test('safe preferred lanes remain stable',()=>{
 const d=fixture([145]); const r=routeSchematic(d);
 assert.equal(r.mode,'orthogonal');assert.equal(r.buses[0].netId,'N1');
 assert.ok(r.crossings.some(c=>c.y===145));
});
test('near trunk endpoint retries reverse lanes and preserves identities',()=>{
 const d=fixture(),before=structuredClone(d),r=routeSchematic(d);
 assert.equal(r.mode,'orthogonal');assert.equal(r.buses[0].netId,'N2');
 assert.ok(r.crossings.some(c=>c.y===200&&c.verticalNet==='N1'));
 assert.equal(r.links.length,2);assert.deepEqual(d,before);
});
test('both lane orders unsafe produces complete label fallback',()=>{
 const d=fixture([125,305]),before=structuredClone(d),r=routeSchematic(d);
 assert.equal(r.mode,'labels');assert.match(r.reason,/真实接点或线路端点/);
 assert.deepEqual(r.links,[]);assert.deepEqual(r.buses,[]);assert.deepEqual(r.crossings,[]);
 assert.deepEqual(d,before);
});
