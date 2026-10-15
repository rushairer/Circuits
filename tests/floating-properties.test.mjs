import test from 'node:test';
import assert from 'node:assert/strict';
import { placeQuickProperties,renderQuickProperties,renderQuickWireProperties } from '../.test-dist/ui/floating-properties.js';

const rect=(left,top,right,bottom)=>({left,top,right,bottom});
test('floating inspector chooses an unobstructed candidate within the canvas',()=>{
 const anchor=rect(200,160,330,220);
 const occupied=rect(342,160,587,380);
 const position=placeQuickProperties(anchor,900,650,245,220,[occupied]);
 assert.ok(position.x>=12&&position.x<=900-245-12);
 assert.ok(position.y>=12&&position.y<=650-220-12);
 assert.ok(position.x!==342||position.y!==160);
});
test('floating inspector clamps on narrow screens and handles invalid measurements',()=>{
 const pos=placeQuickProperties(rect(420,330,510,395),500,360,245,220);
 assert.ok(pos.x>=12&&pos.x<=243);
 assert.ok(pos.y>=12&&pos.y<=128);
 assert.deepEqual(placeQuickProperties(rect(NaN,0,0,0),500,360,245,220),{x:12,y:12});
});
test('quick property inputs are distinct from canonical inspector IDs',()=>{
 const resistor=renderQuickProperties({id:'r1',kind:'resistor',x:0,y:0,rotation:0,value:470});
 assert.match(resistor,/data-quick-field="value"/);
 assert.match(resistor,/value="470"/);
 assert.doesNotMatch(resistor,/ id="value"/);
 assert.match(resistor,/data-action="rotate"/);
 const led=renderQuickProperties({id:'l1',kind:'led',x:0,y:0,rotation:0,ledColor:'blue'});
 assert.match(led,/data-quick-field="led-color"/);
 assert.match(led,/value="blue" selected/);
 const escaped=renderQuickProperties({id:'<bad>&"',kind:'servo',x:0,y:0,rotation:0});
 assert.match(escaped,/&lt;bad&gt;&amp;&quot;/);
 assert.doesNotMatch(escaped,/<bad>/);
});


test('wire quick controls preserve custom colors, connector type and legacy route as presentation',()=>{
 const a={id:'w1',from:{componentId:'b1',pinId:'positive'},to:{componentId:'r1',pinId:'a'},color:'#ab45cd'};
 const html=renderQuickWireProperties(a);
 assert.match(html,/data-quick-wire-for="w1"/);
 assert.match(html,/value="#ab45cd"/);
 assert.match(html,/data-quick-field="wire-type"/);
 assert.match(html,/传统兼容路径/);
 assert.match(html,/data-action="quick-wire-flip-direction"/);
 assert.doesNotMatch(html,/data-action="wire-flip-direction"/);
 const next=renderQuickWireProperties({...a,type:'alligator',routing:'vertical',bends:[{x:10,y:20}]});
 assert.match(next,/value="alligator" selected/);
 assert.match(next,/纵向优先/);
 assert.match(next,/1 个折点/);
 assert.doesNotMatch(next,/id="wire-color"|id="wire-type"/);
});
