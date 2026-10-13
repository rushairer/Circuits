import test from 'node:test';
import assert from 'node:assert/strict';
import {snapWireWaypoint} from '../.test-dist/core/waypoint-snap.js';

const pin={id:'pin',kind:'terminal',point:{x:100,y:100}};
const corner={id:'corner',kind:'bend',point:{x:200,y:210}};
const option=(more={})=>({pixelsPerWorldUnit:1,guides:[pin,corner],gridPitch:10,...more});
test('terminal snaps in 2D and holds until wider release radius',()=>{
 let r=snapWireWaypoint({x:103,y:103},null,option());
 assert.deepEqual(r.point,{x:100,y:100});
 assert.equal(r.memory.terminal.id,'pin');
 r=snapWireWaypoint({x:110,y:100},r.memory,option());
 assert.deepEqual(r.point,{x:100,y:100});
 r=snapWireWaypoint({x:112.5,y:100},r.memory,option({gridPitch:null}));
 assert.equal(r.point.x,112.5);assert.equal(r.memory.terminal,undefined);
});
test('a nearby terminal outranks grid and alignment can snap one axis',()=>{
 const guide={id:'pin-x',kind:'terminal',point:{x:101,y:105}};
 let r=snapWireWaypoint({x:103,y:103},null,option({guides:[guide],gridPitch:10}));
 assert.deepEqual(r.point,{x:101,y:105});
 r=snapWireWaypoint({x:103,y:350},null,option({guides:[guide],gridPitch:null}));
 assert.equal(r.point.x,101);assert.equal(r.point.y,350);
 assert.equal(r.memory.x.kind,'alignment');
});
test('axis alignment retains selected guide until release, then switches to nearest',()=>{
 const guides=[{id:'left',kind:'bend',point:{x:80,y:40}},{id:'right',kind:'bend',point:{x:95,y:45}}];
 let r=snapWireWaypoint({x:81,y:200},null,option({guides,gridPitch:null}));
 assert.equal(r.point.x,80);
 r=snapWireWaypoint({x:90,y:200},r.memory,option({guides,gridPitch:null}));
 assert.equal(r.point.x,80);
 r=snapWireWaypoint({x:93,y:200},r.memory,option({guides,gridPitch:null}));
 assert.equal(r.point.x,95);
});
test('grid snap and hysteresis scale with screen pixels and cell pitch',()=>{
 let r=snapWireWaypoint({x:11.9,y:21.8},null,option({guides:[]}));
 assert.deepEqual(r.point,{x:10,y:20});
 r=snapWireWaypoint({x:14.5,y:24.5},r.memory,option({guides:[]}));
 assert.deepEqual(r.point,{x:10,y:20});
 r=snapWireWaypoint({x:15.2,y:25.3},r.memory,option({guides:[]}));
 assert.deepEqual(r.point,{x:15.2,y:25.3});
 const low=snapWireWaypoint({x:13,y:27},null,option({guides:[],pixelsPerWorldUnit:.4}));
 assert.deepEqual(low.point,{x:10,y:30});
});
test('invalid zoom, unbounded input, disabled grid or deleted guides fail safely',()=>{
 const raw={x:42,y:91};
 assert.deepEqual(snapWireWaypoint(raw,null,option({pixelsPerWorldUnit:0})).point,raw);
 assert.deepEqual(snapWireWaypoint({x:Infinity,y:3},null,option()).memory,{});
 assert.deepEqual(snapWireWaypoint(raw,null,option({guides:[],gridPitch:null})).point,raw);
 const previous=snapWireWaypoint({x:103,y:103},null,option());
 const gone=snapWireWaypoint({x:108,y:109},previous.memory,option({guides:[],gridPitch:null}));
 assert.deepEqual(gone.point,{x:108,y:109});
});
