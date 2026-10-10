import test from 'node:test';
import assert from 'node:assert/strict';
import {CIRCUIT_LAYER_ORDER,composeCircuitLayers} from '../.test-dist/ui/circuit-layers.js';
test('breadboard -> wires -> sockets -> components -> editing controls -> overlays',()=>{
 assert.deepEqual(CIRCUIT_LAYER_ORDER,[
   'substrate','wires','board-sockets','components','wire-controls','overlays'
 ]);
 const marker=Object.fromEntries(CIRCUIT_LAYER_ORDER.map(layer=>[layer,'<rect id="'+layer+'"/>']));
 const html=composeCircuitLayers(marker);
 assert.equal((html.match(/data-layer=/g)||[]).length,6);
 const indexes=CIRCUIT_LAYER_ORDER.map(name=>html.indexOf('<g data-layer="'+name+'">'));
 assert.ok(indexes.every((x,i)=>x>=0&&(i===0||x>indexes[i-1])));
 assert.ok(html.indexOf('id="substrate"')<html.indexOf('id="wires"'));
 assert.ok(html.indexOf('id="wires"')<html.indexOf('id="board-sockets"'));
 assert.ok(html.indexOf('id="board-sockets"')<html.indexOf('id="components"'));
});
test('drawing layers does not encode or alter electrical topology',()=>{
 const contents=Object.fromEntries(CIRCUIT_LAYER_ORDER.map(layer=>[layer,'']));
 contents.wires='<path data-wire="w1" d="M0 0 L10 20"/>';
 contents.substrate='<rect data-part="bb1"/>';
 const output=composeCircuitLayers(contents);
 assert.ok(output.includes('data-wire="w1"'));
 assert.ok(output.includes('data-part="bb1"'));
 assert.equal((output.match(/data-wire="w1"/g)||[]).length,1);
});
