import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validProject} from '../.test-dist/model.js';
import {evaluate} from '../.test-dist/core/dc.js';
import {paintCrossingWires,MAX_BRIDGE_SEGMENTS} from '../.test-dist/core/wire-crossings.js';
import {wirePath,wirePoints} from '../.test-dist/core/geometry.js';

const crossFixture=()=>{
 const p=demo();
 p.wires=[
  {id:'lower',from:{componentId:'b1',pinId:'positive'},
   to:{componentId:'l1',pinId:'anode'},color:'#35b65d',
   bends:[{x:290,y:315},{x:600,y:315}]},
  {id:'upper',from:{componentId:'a1',pinId:'d13'},
   to:{componentId:'r1',pinId:'a'},color:'#e45454',
   bends:[{x:370,y:380},{x:370,y:275}]}
 ];
 return p;
};
test('real interior crossover paints a hump only on the upper wire',()=>{
 const p=crossFixture(),before=structuredClone(p),readings=evaluate(p);
 const painted=paintCrossingWires(p.wires,p.parts);
 assert.equal(painted.length,2);
 assert.equal(painted[0].bridgeCount,0);
 assert.equal(painted[1].bridgeCount,1);
 assert.equal(painted[1].displayPath.includes(' Q'),true);
 assert.equal(painted[1].bridgeBackdrops.length,1);
 assert.equal(painted[1].bridgeBackdrops[0].includes(' Q'),true);
 assert.equal(painted[1].hitPath.includes(' Q'),false);
 assert.equal(painted[0].displayPath,painted[0].hitPath);
 assert.equal(painted[1].hitPath,wirePath(wirePoints(p.wires[1],p.parts),true));
 assert.deepEqual(p,before,'visual crossovers must not mutate project JSON');
 assert.deepEqual(evaluate(p),readings,'visual wire crossover must not join two nets');
 assert.equal(validProject(p),true);
});
test('painter order switches which visible jumper displays bridge without altering nets',()=>{
 const p=crossFixture();
 const last=paintCrossingWires([...p.wires].reverse(),p.parts);
 assert.equal(last[0].bridgeCount,0);
 assert.equal(last[1].bridgeCount,1);
 assert.equal(last[1].id,'lower');
 assert.equal(last[0].id,'upper');
 assert.equal(p.wires[0].id,'lower','selection order must not persist');
});
test('a free-space parallel overlap, shared pin or vertex touch gets no false bridge',()=>{
 const p=crossFixture();
 const overlap=structuredClone(p);
 overlap.wires[1].bends=[{x:290,y:315},{x:600,y:315}];
 assert.equal(paintCrossingWires(overlap.wires,overlap.parts).reduce((n,w)=>n+w.bridgeCount,0),0);
 const a=structuredClone(p);
 a.wires[1].bends=[{x:370,y:380},{x:370,y:315}];
 assert.equal(paintCrossingWires(a.wires,a.parts).reduce((n,w)=>n+w.bridgeCount,0),0);
 const same=structuredClone(p);
 same.wires[1].from={...same.wires[0].from};
 same.wires[1].to={...same.wires[0].to};
 same.wires[1].bends=[{x:290,y:315},{x:600,y:315}];
 assert.equal(paintCrossingWires(same.wires,same.parts).reduce((n,w)=>n+w.bridgeCount,0),0);
});
test('non-orthogonal legacy wire intersection remains purely visual and import-compatible',()=>{
 const p=crossFixture();
 p.wires[0].bends=[{x:305,y:260},{x:470,y:370}];
 const painted=paintCrossingWires(p.wires,p.parts);
 assert.ok(painted.some(w=>w.bridgeCount>0));
 assert.equal(p.wires[0].routing,undefined);
 assert.equal(validProject(p),true);
});
test('large or degenerate geometries never produce unbounded crossing markup',()=>{
 const p=crossFixture(),w=p.wires[0];
 const sample=Array.from({length:Math.ceil(MAX_BRIDGE_SEGMENTS/3)+1},(_,i)=>
  ({...w,id:'many-'+i}));
 const painted=paintCrossingWires(sample,p.parts);
 assert.equal(painted.length,sample.length);
 assert.ok(painted.every(w=>w.bridgeCount===0&&w.displayPath===w.hitPath));
 const empty=paintCrossingWires([],p.parts);
 assert.deepEqual(empty,[]);
 const noParts=paintCrossingWires(p.wires,[]);
 assert.ok(noParts.every(w=>w.bridgeCount===0&&!w.displayPath));
 const weird=paintCrossingWires(p.wires,p.parts,Infinity);
 assert.equal(weird[1].bridgeCount,1);
});
