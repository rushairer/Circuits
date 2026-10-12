import test from 'node:test';
import assert from 'node:assert/strict';
import {PointerSession} from '../.test-dist/core/pointer-session.js';

test('native-style inherited event attributes survive the contact snapshot',()=>{
 const values={pointerId:71,pointerType:'touch',isPrimary:true,clientX:20,clientY:30};
 const event=Object.create(Object.defineProperties({},Object.fromEntries(
   Object.entries(values).map(([key,value])=>[key,{get:()=>value}]))));
 assert.deepEqual({...event},{});
 const session=new PointerSession();
 assert.equal(session.begin(event,true),'start');
 assert.deepEqual(session.snapshot()[0],{...values,startX:20,startY:30,dragged:false});
 assert.equal(session.update({...values,clientX:25,clientY:32}).dragged,false);
 assert.equal(session.update({...values,clientX:29}).dragged,true);
 assert.equal(session.finish(71),true);
});
