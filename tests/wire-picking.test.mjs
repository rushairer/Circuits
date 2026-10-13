import test from 'node:test';
import assert from 'node:assert/strict';
import {demo, validProject} from '../.test-dist/model.js';
import {evaluate} from '../.test-dist/core/dc.js';
import {wirePickCandidates,pickWireCandidate} from '../.test-dist/core/wire-picking.js';
import {paintCrossingWires} from '../.test-dist/core/wire-crossings.js';

function scene(){
 const p=demo();
 p.wires=[
  {id:'horizontal',from:{componentId:'b1',pinId:'positive'},to:{componentId:'l1',pinId:'anode'},color:'#00aa00',
   bends:[{x:280,y:320},{x:610,y:320}]},
  {id:'vertical',from:{componentId:'a1',pinId:'d13'},to:{componentId:'r1',pinId:'a'},color:'#cc0000',
   bends:[{x:370,y:390},{x:370,y:270}]}
 ];
 return p;
}
const rank=(p,point,scale=1,radius=9)=>wirePickCandidates(p.wires,p.parts,point,scale,radius);
test('actual crossing returns both wires by stable model order, without a new net',()=>{
 const p=scene(),before=structuredClone(p),analysis=evaluate(p);
 assert.equal(validProject(p),true);
 assert.deepEqual(rank(p,{x:370,y:320}).map(x=>x.id),['horizontal','vertical']);
 assert.equal(paintCrossingWires(p.wires,p.parts)[1].bridgeCount,1);
 assert.deepEqual(rank(p,{x:370,y:320}),rank(p,{x:370,y:320}));
 assert.deepEqual(p,before);
 assert.deepEqual(evaluate(p),analysis);
});
test('distance overrides SVG order and near non-crossing wires select nearest',()=>{
 const p=scene();
 assert.equal(rank(p,{x:365,y:318})[0].id,'horizontal');
 assert.equal(rank(p,{x:372,y:324})[0].id,'vertical');
 assert.equal(rank(p,{x:370,y:320},4).length,2);
 assert.equal(rank(p,{x:370,y:335},4).map(x=>x.id).includes('horizontal'),false);
 assert.equal(rank(p,{x:10000,y:10000}).length,0);
});
test('ties remain stable even if renderer brings selected wire to top',()=>{
 const p=scene(),x={x:370,y:320};
 const a=rank(p,x),b=wirePickCandidates([...p.wires].reverse(),p.parts,x,1);
 assert.deepEqual(a.map(h=>h.id),['horizontal','vertical']);
 assert.deepEqual(b.map(h=>h.id),['vertical','horizontal']);
 // The picker is always given persistent PROJECT order, never painted order.
});
test('screen pixel tolerance is independent of zoom and rejects invalid scales',()=>{
 const p=scene();
 assert.equal(rank(p,{x:500,y:327},1,9)[0].id,'horizontal');
 assert.equal(rank(p,{x:500,y:327},2,9).length,0);
 assert.equal(rank(p,{x:500,y:327},0).length,0);
 assert.equal(rank(p,{x:NaN,y:320}).length,0);
 assert.equal(rank(p,{x:500,y:327},Infinity).length,0);
 assert.equal(rank(p,{x:500,y:327},1,-2).length,0);
});
test('model literal diagonal bends and orthogonal route segments are picked correctly',()=>{
 const p=scene();p.wires=[p.wires[0]];
 p.wires[0].bends=[{x:300,y:280},{x:400,y:380}];
 assert.equal(rank(p,{x:350,y:330})[0].id,'horizontal');
 p.wires[0].routing='horizontal';
 assert.equal(rank(p,{x:350,y:330}).length,0);
 assert.equal(rank(p,{x:400,y:330})[0].id,'horizontal');
});
test('zero-length and missing endpoint wires are safely ignored',()=>{
 const p=scene();
 p.wires[0].bends=[{x:300,y:320},{x:300,y:320}];
 assert.deepEqual(rank(p,{x:300,y:320}).map(h=>h.id),['horizontal']);
 assert.deepEqual(wirePickCandidates(p.wires,[],{x:350,y:320},1),[]);
});
test('repeat near the same ambiguous crossing cycles, including rapid repeated clicks',()=>{
 const p=scene(),list=rank(p,{x:370,y:320});
 let picked=pickWireCandidate(list,null,{x:100,y:100,at:1000});
 assert.equal(picked.id,'horizontal');
 picked=pickWireCandidate(list,picked.cycle,{x:101,y:102,at:1700});
 assert.equal(picked.id,'vertical');
 picked=pickWireCandidate(list,picked.cycle,{x:100,y:100,at:2400});
 assert.equal(picked.id,'horizontal');
 const double=pickWireCandidate(list,picked.cycle,{x:100,y:100,at:2500,detail:2});
 assert.equal(double.id,'vertical');
 const alt=pickWireCandidate(list,double.cycle,{x:100,y:100,at:2600,altKey:true,detail:2});
 assert.equal(alt.id,'horizontal');
});
test('no spurious cycling after spatial/time or candidate changes',()=>{
 const p=scene(),list=rank(p,{x:370,y:320});
 const first=pickWireCandidate(list,null,{x:0,y:0,at:1000});
 assert.equal(pickWireCandidate(list,first.cycle,{x:20,y:0,at:1600}).id,'horizontal');
 assert.equal(pickWireCandidate(list,first.cycle,{x:0,y:0,at:4000}).id,'horizontal');
 assert.equal(pickWireCandidate(list.slice(0,1),first.cycle,{x:0,y:0,at:1600}).id,'horizontal');
 assert.deepEqual(pickWireCandidate([],first.cycle,{x:0,y:0,at:1600}),{id:null,cycle:null});
});
