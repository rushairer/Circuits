import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pins,size} from '../.test-dist/model.js';
import {createPinResolver,pinWorld,wirePath,wirePoints} from '../.test-dist/core/geometry.js';
import {paintCrossingWires,MAX_BRIDGES_PER_WIRE} from '../.test-dist/core/wire-crossings.js';
import {wireScene,wireReferenceCases} from './fixtures/wire-scenes.mjs';
const reference=JSON.parse(readFileSync(new URL('./fixtures/wire-paint-alpha10.json',import.meta.url),'utf8'));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const freeze=value=>{
 if(value&&typeof value==='object'){
  Object.freeze(value);for(const nested of Object.values(value))freeze(nested);
 }
 return value;
};

test('snapshot resolver matches every real terminal at arbitrary rotations',()=>{
 for(const rotation of [-450,-33,0,37,90,180,270,360]){
  const parts=Object.keys(size).map((kind,i)=>({id:'part-'+i,kind,x:i*123-300,y:i*77-220,rotation}));
  const resolve=createPinResolver(parts);
  for(const part of parts)for(const pinId of Object.keys(pins[part.kind])){
   const endpoint={componentId:part.id,pinId};
   assert.deepEqual(resolve(endpoint),pinWorld(endpoint,parts));
  }
 }
});
test('resolver snapshots geometry, isolates returned points and refreshes on a new render',()=>{
 const parts=[{id:'r',kind:'resistor',x:20,y:40,rotation:0}];
 const endpoint={componentId:'r',pinId:'a'},resolve=createPinResolver(parts);
 const original=pinWorld(endpoint,parts),first=resolve(endpoint);
 first.x=9999;
 assert.deepEqual(resolve(endpoint),original);
 // Mutation BEFORE an uncached pin lookup must not leak into the snapshot.
 const previousB=pinWorld({componentId:'r',pinId:'b'},parts);
 parts[0].x=250;parts[0].rotation=37;
 assert.deepEqual(resolve({componentId:'r',pinId:'b'}),previousB);
 assert.deepEqual(resolve(endpoint),original);
 assert.deepEqual(createPinResolver(parts)(endpoint),pinWorld(endpoint,parts));
 assert.notDeepEqual(createPinResolver(parts)(endpoint),original);
});
test('resolver preserves missing-pin and first-duplicate-ID behavior',()=>{
 const parts=[{id:'r',kind:'resistor',x:0,y:0,rotation:0},{id:'r',kind:'led',x:100,y:100,rotation:0}];
 const resolve=createPinResolver(parts);
 assert.deepEqual(resolve({componentId:'r',pinId:'a'}),pinWorld({componentId:'r',pinId:'a'},parts));
 assert.equal(resolve({componentId:'missing',pinId:'a'}),null);
 assert.equal(resolve({componentId:'r',pinId:'missing'}),null);
 assert.equal(resolve({componentId:'r',pinId:'missing'}),null);
});
test('large wire rendering does not scan the part list once per endpoint',()=>{
 const p=wireScene(2000);
 let idReads=0;
 const parts=p.parts.map(part=>new Proxy(part,{get(target,key,receiver){
  if(key==='id')idReads++;return Reflect.get(target,key,receiver);
 }}));
 assert.equal(paintCrossingWires(p.wires,parts).length,2000);
 assert.ok(idReads<=parts.length*4,'part lookup must be linear in part count, not wire count');
});
test('empty scene does not allocate a pin snapshot',()=>{
 const parts=new Proxy([],{get(){throw new Error('empty wire list must not inspect parts');}});
 assert.deepEqual(paintCrossingWires([],parts),[]);
});
for(const item of wireReferenceCases)test('alpha.10 painting remains identical: '+item.name,()=>{
 const p=wireScene(item.count,item.options);
 if(item.reverse)p.wires.reverse();
 freeze(p);
 const result=paintCrossingWires(p.wires,p.parts,item.radius??6,item.preview??null);
 assert.equal(digest(result),reference.cases[item.name]);
 assert.ok(result.every(w=>w.bridgeCount<=MAX_BRIDGES_PER_WIRE));
});
test('hit paths retain original legacy/routed geometry above the visual budget',()=>{
 for(const routed of [false,true]){
  const p=freeze(wireScene(2000,{routed,bends:32}));
  const result=paintCrossingWires(p.wires,p.parts);
  assert.equal(result.length,2000);
  for(let i=0;i<result.length;i++){
   const w=p.wires[i];
   assert.equal(result[i].hitPath,wirePath(wirePoints(w,p.parts),true,w.routing));
   assert.equal(result[i].displayPath,result[i].hitPath);
   assert.equal(result[i].bridgeCount,0);
  }
 }
});
test('endpoint previews, moved parts and changed painter order cannot reuse stale geometry',()=>{
 const p=wireScene(120),saved=structuredClone(p);
 const before=paintCrossingWires(p.wires,p.parts);
 const preview=paintCrossingWires(p.wires,p.parts,6,{id:'wire-0',side:'to',point:{x:4000,y:5000}});
 assert.notEqual(preview[0].hitPath,before[0].hitPath);
 assert.deepEqual(p,saved);
 assert.deepEqual(paintCrossingWires(p.wires,p.parts),before);
 p.parts[0].x+=40;p.parts[0].rotation=90;
 const moved=paintCrossingWires(p.wires,p.parts);
 assert.notEqual(moved[0].hitPath,before[0].hitPath);
 assert.equal(moved[0].hitPath,wirePath(wirePoints(p.wires[0],p.parts),true));
 assert.equal(paintCrossingWires([...p.wires].reverse(),p.parts)[0].id,p.wires.at(-1).id);
});
test('invalid endpoint references still produce empty paths rather than invented geometry',()=>{
 const p=wireScene(4);
 p.wires[0].from.componentId='missing';p.wires[1].to.pinId='missing';
 const painted=paintCrossingWires(p.wires,p.parts);
 for(const i of [0,1])assert.deepEqual(painted[i],{id:p.wires[i].id,hitPath:'',displayPath:'',bridgeBackdrops:[],bridgeCount:0});
});
