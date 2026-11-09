import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validProject} from '../.test-dist/model.js';
import {evaluate} from '../.test-dist/core/dc.js';
import {visibleWireVertices,visibleWirePath,AUTO_ROUTE_PART_LIMIT} from '../.test-dist/core/wire-visibility.js';
import {orthogonalRoute,wirePoints} from '../.test-dist/core/geometry.js';

const sample=()=>{
 const p=demo();
 p.parts=[
  {id:'left',kind:'resistor',x:0,y:100,rotation:0,value:220},
  {id:'obstacle',kind:'battery',x:230,y:72,rotation:0,value:9},
  {id:'right',kind:'resistor',x:470,y:100,rotation:0,value:220}
 ];
 p.wires=[{id:'w1',from:{componentId:'left',pinId:'b'},to:{componentId:'right',pinId:'a'},
  color:'#159f91',routing:'horizontal'}];
 p.insertions=[];return p;
};
const path=p=>visibleWireVertices(p.wires[0],p.parts);
const isOrthogonal=a=>a.slice(1).every((p,i)=>p.x===a[i].x||p.y===a[i].y);
const intersects=(a,b,rect)=>a.y===b.y?
 a.y>rect.top&&a.y<rect.bottom&&Math.max(Math.min(a.x,b.x),rect.left)<Math.min(Math.max(a.x,b.x),rect.right):
 a.x===b.x&&a.x>rect.left&&a.x<rect.right&&Math.max(Math.min(a.y,b.y),rect.top)<Math.min(Math.max(a.y,b.y),rect.bottom);
test('routed jumper detours visibly around blocking component and keeps terminal coordinates',()=>{
 const p=sample(),snapshot=structuredClone(p),before=evaluate(p),verts=path(p);
 assert.ok(verts.length>=4);
 assert.equal(isOrthogonal(verts),true);
 assert.deepEqual(verts[0],{x:140,y:130});
 assert.deepEqual(verts.at(-1),{x:470,y:130});
 const obstruction={left:230-13,top:72-13,right:230+92+13,bottom:72+135+13};
 for(let i=1;i<verts.length;i++)
  assert.equal(intersects(verts[i-1],verts[i],obstruction),false);
 assert.equal(visibleWirePath(p.wires[0],p.parts),'M'+verts.map(v=>v.x+' '+v.y).join(' L'));
 assert.deepEqual(evaluate(p),before);
 assert.deepEqual(p,snapshot);
 assert.equal(validProject(p),true);
});
test('natural route straightens when blocker moves; vertical preference is supported',()=>{
 const p=sample();
 const withBlock=path(p),original=structuredClone(p);
 p.parts[1].y+=430;
 const clear=path(p);
 assert.equal(isOrthogonal(clear),true);
 assert.ok(clear.length<=withBlock.length);
 assert.equal(p.wires[0].bends,undefined);
 p.wires[0].routing='vertical';
 const alternate=path(p);
 assert.equal(isOrthogonal(alternate),true);
 assert.deepEqual(alternate[0],clear[0]);
 assert.deepEqual(alternate.at(-1),clear.at(-1));
 assert.equal(original.parts[1].y,72);
});
test('manual bends and old serialized untagged wire shapes are never altered',()=>{
 const p=sample();
 const w=p.wires[0],pins=wirePoints(w,p.parts);
 w.bends=[{x:255,y:270}];
 assert.deepEqual(path(p),orthogonalRoute(wirePoints(w,p.parts),'horizontal'));
 delete w.routing;delete w.bends;
 const legacy=path(p);
 const mx=(pins[0].x+pins.at(-1).x)/2;
 assert.deepEqual(legacy,[pins[0],{x:mx,y:pins[0].y},{x:mx,y:pins.at(-1).y},pins.at(-1)]);
});
test('dense project bounds auto-router work and preserves canonical fallback',()=>{
 const p=sample(),other=p.parts.find(x=>x.id==='obstacle');
 for(let i=0;i<AUTO_ROUTE_PART_LIMIT;i++)
  p.parts.push({...other,id:'extra-'+i,x:8000+i*100,y:9000});
 assert.deepEqual(path(p),orthogonalRoute(wirePoints(p.wires[0],p.parts),'horizontal'));
 assert.equal(path({...p,wires:[{...p.wires[0],routing:undefined}]}),undefined);
});
