import test from 'node:test';
import assert from 'node:assert/strict';
import {linearPathBounds,wireViewportBounds,outsideWireViewport} from '../.test-dist/core/wire-viewport.js';

test('linear wire bounds include every bend and exact fractional/scientific coordinates',()=>{
 assert.deepEqual(linearPathBounds('M-500 100 L3.5e+2 -2e-3 L1200 80'),
  {left:-500,right:1200,top:-0.002,bottom:100});
 for(const path of ['', 'M1 2', 'M1 2 Q3 4 5 6', 'M1 2 LNaN 4','M1 2 L1e999 4','M1 2 L3 4 Z'])
  assert.equal(linearPathBounds(path),null);
});

test('CSS viewport uses actual screen extent, camera transform and 40px guard',()=>{
 const rect={left:100,top:50,right:900,bottom:650};
 const matrix={a:2,b:0,c:0,d:2,e:200,f:150};
 const view=wireViewportBounds(rect,matrix);
 assert.deepEqual(view,{left:-70,right:370,top:-70,bottom:270});
 assert.equal(outsideWireViewport(linearPathBounds('M-500 0 L500 0'),view),false);
 assert.equal(outsideWireViewport(linearPathBounds('M400 0 L500 0'),view),true);
 assert.equal(outsideWireViewport(linearPathBounds('M370 0 L500 0'),view),false);
 assert.equal(outsideWireViewport(linearPathBounds('M400 0 L350 0 L500 0'),view),false);
 assert.equal(outsideWireViewport(null,view),false);
 assert.equal(outsideWireViewport(linearPathBounds('M400 0 L500 0'),null),false);
 assert.equal(wireViewportBounds(rect,{...matrix,b:1}),null);
 assert.equal(wireViewportBounds(rect,{...matrix,a:0}),null);
 assert.equal(wireViewportBounds({...rect,right:100},matrix),null);
 const moved=wireViewportBounds(rect,{...matrix,e:-600});
 assert.equal(outsideWireViewport(linearPathBounds('M400 0 L500 0'),moved),false);
});
