import test from 'node:test';
import assert from 'node:assert/strict';
import {PointerSession, pointerThreshold} from '../.test-dist/core/pointer-session.js';
const p=(pointerId=1,pointerType='touch',extra={})=>({pointerId,pointerType,isPrimary:true,clientX:20,clientY:30,...extra});
for(const type of ['mouse','touch','pen'])test(`${type} owns only its own pointer and releases cleanly`,()=>{
 const s=new PointerSession();assert.equal(s.begin(p(1,type),true),'start');
 assert.equal(s.owns(2),false);assert.equal(s.finish(2),false);assert.equal(s.owns(1),true);
 assert.equal(s.finish(1),true);assert.equal(s.busy,false);
});
test('native UI inputs never start a canvas session',()=>{
 const s=new PointerSession();assert.equal(s.begin(p(),false),'ignore');assert.equal(s.busy,false);
});
test('second contact cancels and neither release order transfers ownership',()=>{
 for(const order of [[1,2],[2,1]]){
  const s=new PointerSession();s.begin(p(1),true);
  assert.equal(s.begin(p(2,'touch',{isPrimary:false}),true),'interrupt');
  assert.equal(s.owns(1),false);assert.equal(s.owns(2),false);
  assert.equal(s.finish(order[0]),false);assert.equal(s.busy,true);
  assert.equal(s.finish(order[1]),false);assert.equal(s.busy,false);
  assert.equal(s.begin(p(3),true),'start');
 }
});
test('second contact on toolbar also cancels, rather than committing a held edit',()=>{
 const s=new PointerSession();s.begin(p(1),true);
 assert.equal(s.begin(p(2),false),'interrupt');assert.equal(s.owns(1),false);
});
test('a primary pen and a primary touch are not simultaneous owners',()=>{
 const s=new PointerSession();s.begin(p(1,'pen'),true);
 assert.equal(s.begin(p(2,'touch'),true),'interrupt');assert.equal(s.owns(2),false);
});
test('nonprimary first canvas contact is blocked until lifted',()=>{
 const s=new PointerSession();assert.equal(s.begin(p(2,'touch',{isPrimary:false}),true),'ignore');
 assert.equal(s.owns(2),false);assert.equal(s.finish(2),false);
 assert.equal(s.begin(p(3),true),'start');
});
test('gesture threshold is CSS-pixel based and sticky on return to origin',()=>{
 for(const type of ['mouse','pen','touch']){
  const s=new PointerSession();s.begin(p(1,type),true);const threshold=pointerThreshold(type);
  assert.equal(s.update(p(1,type,{clientX:20+threshold})).dragged,false);
  assert.equal(s.update(p(1,type,{clientX:20+threshold+1})).dragged,true);
  assert.equal(s.update(p(1,type)).dragged,true);
 }
});
test('Escape/capture loss blocks stale ups; blur resets without needing an up',()=>{
 const s=new PointerSession();s.begin(p(),true);s.abort();assert.equal(s.finish(1),false);
 s.begin(p(2),true);s.reset();assert.equal(s.busy,false);assert.equal(s.finish(2),false);
 assert.equal(s.begin(p(3),true),'start');
});
test('duplicate down does not reset a dragged gesture',()=>{
 const s=new PointerSession();s.begin(p(),true);s.update(p(1,'touch',{clientX:100}));
 assert.equal(s.begin(p(),true),'ignore');assert.equal(s.snapshot()[0].dragged,true);assert.equal(s.owns(1),true);
});
test('unknown and invalid samples never poison a session; snapshots are isolated',()=>{
 const s=new PointerSession();assert.equal(s.begin(p(1,'touch',{clientX:NaN}),true),'ignore');
 assert.equal(s.busy,false);s.begin(p(),true);assert.equal(s.update(p(2)),null);
 assert.equal(s.update(p(1,'touch',{clientX:Infinity})),null);
 s.snapshot()[0].clientX=999;assert.equal(s.snapshot()[0].clientX,20);
});
test('extra contacts during an interruption remain blocked until all are gone',()=>{
 const s=new PointerSession();s.begin(p(1),true);s.begin(p(2),true);s.finish(1);
 assert.equal(s.begin(p(3),true),'ignore');s.finish(2);assert.equal(s.owns(3),false);
 s.finish(3);assert.equal(s.begin(p(4),true),'start');
});
