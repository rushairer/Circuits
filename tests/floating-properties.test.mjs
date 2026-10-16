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


test('tablet contextual input never covers another clickable electronic component when a free zone exists',()=>{
 // 1024px viewport: the selected resistor sits between a battery and LED.
 // A name field makes the popover tall enough to cover LED at the old right slot.
 const selected={left:310,top:155,right:410,bottom:205};
 const battery={left:70,top:120,right:145,bottom:235};
 const led={left:535,top:120,right:630,bottom:240};
 const breadboard={left:350,top:340,right:675,bottom:510};
 const popup=placeQuickProperties(selected,794,610,245,224,[battery,led,breadboard]);
 const rect={left:popup.x,top:popup.y,right:popup.x+245,bottom:popup.y+224};
 const intersect=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*
   Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
 assert.equal(intersect(rect,battery),0);
 assert.equal(intersect(rect,led),0);
 assert.equal(intersect(rect,breadboard),0);
 assert.equal(intersect(rect,selected),0);
 assert.ok(popup.x>=12&&rect.right<=794-12);
 assert.ok(popup.y>=12&&rect.bottom<=610-12);
});


test('context inspector never overlays the originally selected part just to avoid a nearby obstacle',()=>{
 const anchor={left:260,top:175,right:380,bottom:245};
 const parts=[
  {left:390,top:120,right:620,bottom:425},
  {left:15,top:80,right:160,bottom:370},
  {left:200,top:400,right:660,bottom:540}
 ];
 const point=placeQuickProperties(anchor,730,605,245,250,parts);
 const rect={left:point.x,top:point.y,right:point.x+245,bottom:point.y+250};
 const collision=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*
   Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
 assert.equal(collision(rect,anchor),0);
 assert.ok(point.x>=12&&point.y>=12);
 assert.ok(rect.right<=718&&rect.bottom<=593);
});
test('busy responsive scene still produces a finite bounded fallback without expensive unbounded search',()=>{
 const obstacles=Array.from({length:300},(_,i)=>({
  left:(i%20)*31,top:Math.floor(i/20)*32,
  right:(i%20)*31+55,bottom:Math.floor(i/20)*32+60
 }));
 const spot=placeQuickProperties({left:250,top:210,right:320,bottom:275},
  620,500,245,226,obstacles);
 assert.ok(Number.isFinite(spot.x)&&Number.isFinite(spot.y));
 assert.ok(spot.x>=12&&spot.x<=363);
 assert.ok(spot.y>=12&&spot.y<=262);
});
