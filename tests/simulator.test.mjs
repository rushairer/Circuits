import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validProject} from '../.test-dist/model.js';
import {evaluate,solveDC} from '../.test-dist/core/dc.js';
import {buildNetlist} from '../.test-dist/core/netlist.js';
const wire=(id,from,fp,to,tp)=>({id,from:{componentId:from,pinId:fp},to:{componentId:to,pinId:tp},color:'#e45454'});
test('demo series LED lights at 21.21 mA',()=>{const r=evaluate(demo());assert.equal(r.lit,true);assert.equal(r.currentMilliAmps,21.21)});
test('breaking a wire turns LED off',()=>{const p=demo();p.wires.pop();assert.equal(evaluate(p).lit,false)});
test('import rejects malformed schema and nonexistent pins',()=>{const p=demo();assert.equal(validProject(p),true);p.wires[0].from.pinId='bad';assert.equal(validProject(p),false)});
test('reversing diode polarity turns LED off',()=>{const p=demo();p.wires[1].to.pinId='cathode';p.wires[2].from.pinId='anode';assert.equal(evaluate(p).lit,false)});
test('power source short is detected',()=>{const p=demo();p.wires.push(wire('short','b1','positive','b1','negative'));assert.match(evaluate(p).reason,/短路/)});
test('breadboard strips conduct within a column, not across columns',()=>{
 const nets=buildNetlist(demo());
 const net=pin=>nets.netOf({componentId:'bb1',pinId:pin});
 assert.equal(net('hole-a-1'),net('hole-e-1'));
 assert.notEqual(net('hole-e-1'),net('hole-f-1'));
 assert.notEqual(net('hole-e-1'),net('hole-e-2'));
});
test('breadboard power rails have a break at column 11',()=>{
 const net=pin=>buildNetlist(demo()).netOf({componentId:'bb1',pinId:pin});
 assert.equal(net('top-plus-0'),net('top-plus-10'));
 assert.notEqual(net('top-plus-10'),net('top-plus-11'));
 assert.notEqual(net('top-plus-0'),net('top-minus-0'));
});
test('resistors in parallel are solved by MNA instead of first path',()=>{
 const p=demo();
 p.parts.push({id:'r2',kind:'resistor',x:300,y:300,rotation:0,value:330});
 p.wires.push(wire('w4','b1','positive','r2','a'),wire('w5','r2','b','l1','anode'));
 const result=evaluate(p);
 assert.equal(result.lit,false);
 assert.ok(result.currentMilliAmps>42);
 assert.match(result.reason,/过流/);
});
test('ideal source through a resistor follows Ohm law',()=>{
 const x=solveDC([{a:'hot',b:'gnd',ohms:1000}],[{a:'hot',b:'gnd',volts:5}],'gnd');
 assert.ok(x);
 assert.ok(Math.abs(x.currents[0]+.005)<1e-10);
});
test('unsupported multiple batteries cannot be mistaken for a valid simulation',()=>{
 const p=demo();p.parts.push({id:'b2',kind:'battery',x:0,y:0,rotation:0,value:9});
 assert.equal(evaluate(p).lit,false);
});
test('rotation and movement do not change netlist electrical results',()=>{
 const p=demo();const before=evaluate(p);p.parts[1].rotation=270;p.parts[1].x=888;p.parts[1].y=-120;
 assert.deepEqual(evaluate(p),before);
});
test('breadboard power bus can bridge an LED series route',()=>{
 const p=demo();p.wires[0]=wire('w1','b1','positive','bb1','hole-a-0');
 p.wires.push(wire('w4','bb1','hole-e-0','r1','a'));
 assert.equal(evaluate(p).lit,true);
});

test('component catalogue has 12 distinct visual models with pin definitions',()=>{
 const {parts,pins}=require('../.test-dist/model.js');
 assert.equal(parts.length,12);assert.equal(new Set(parts).size,12);
 for(const kind of parts)assert.ok(Object.keys(pins[kind]).length>=2);
});
test('a switched series circuit toggles LED only when closed',()=>{
 const p=demo();p.parts.push({id:'s1',kind:'switch',x:100,y:100,rotation:0,closed:false});
 p.wires[0]=wire('w1','b1','positive','s1','a');
 p.wires.push(wire('sw','s1','b','r1','a'));
 assert.equal(evaluate(p).lit,false);
 p.parts.find(c=>c.id==='s1').closed=true;
 assert.equal(evaluate(p).lit,true);
});
