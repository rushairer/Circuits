import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,blankProject,validProject} from '../.test-dist/model.js';
import {buildNetlist} from '../.test-dist/core/netlist.js';
import {createBom,bomCSV} from '../.test-dist/core/bom.js';
import {renderBomPanel} from '../.test-dist/ui/bom-panel.js';

test('BOM reflects the authored demo parts with values, quantities and wire count without mutating circuits',()=>{
 const project=demo(),before=structuredClone(project),netlist=buildNetlist(project);
 const bom=createBom(project);
 assert.equal(bom.title,project.name);
 assert.equal(bom.totalComponents,5);
 assert.equal(bom.totalWires,project.wires.length);
 assert.equal(bom.totalAnnotations,0);
 assert.equal(bom.rows.length,5);
 assert.ok(bom.rows.some(r=>r.kind==='battery'&&r.specification==='9 V'&&r.quantity===1));
 assert.ok(bom.rows.some(r=>r.kind==='resistor'&&r.specification==='330 Ω'&&r.ids.join()==='r1'));
 assert.ok(bom.rows.some(r=>r.kind==='led'&&r.specification==='红色'&&r.quantity===1));
 assert.deepEqual(project,before);
 const after=buildNetlist(project);
 for(const wire of project.wires){
  assert.equal(after.netOf(wire.from),netlist.netOf(wire.from));
  assert.equal(after.netOf(wire.to),netlist.netOf(wire.to));
 }
});
test('BOM groups equal component specifications but keeps distinct values and LED colors',()=>{
 const project=blankProject();
 project.parts=[
  {id:'r1',kind:'resistor',x:0,y:0,rotation:0,value:220},
  {id:'r2',kind:'resistor',x:10,y:0,rotation:0,value:220},
  {id:'r3',kind:'resistor',x:20,y:0,rotation:0,value:1000},
  {id:'l1',kind:'led',x:30,y:0,rotation:0},
  {id:'l2',kind:'led',x:40,y:0,rotation:0,ledColor:'red'},
  {id:'l3',kind:'led',x:50,y:0,rotation:0,ledColor:'green'},
  {id:'c1',kind:'capacitor',x:60,y:0,rotation:0,value:1.5}
 ];
 assert.equal(validProject(project),true);
 const bom=createBom(project);
 assert.equal(bom.totalComponents,7);
 assert.equal(bom.rows.length,5);
 const red=bom.rows.find(row=>row.kind==='led'&&row.specification==='红色');
 assert.deepEqual(red?.ids,['l1','l2']);
 assert.equal(red?.quantity,2);
 const resistors=bom.rows.filter(row=>row.kind==='resistor');
 assert.deepEqual(resistors.map(row=>row.specification).sort(),['1000 Ω','220 Ω']);
 assert.equal(bom.rows.find(row=>row.kind==='capacitor')?.specification,'1.5 µF');
 assert.equal(bom.rows.find(row=>row.kind==='led'&&row.specification==='绿色')?.quantity,1);
});
test('BOM correctly reports empty projects and annotations without treating notes or wires as components',()=>{
 const p=blankProject();
 p.notes=[{id:'n1',x:12,y:22,text:'read only'}];
 const report=createBom(p);
 assert.equal(report.rows.length,0);
 assert.equal(report.totalComponents,0);
 assert.equal(report.totalAnnotations,1);
 const markup=renderBomPanel(report);
 assert.match(markup,/当前电路没有元件/);
 assert.match(markup,/aria-modal="true"/);
 assert.match(markup,/data-action="bom-export"/);
 assert.equal(markup.includes('n1'),false);
});
test('BOM renderer escapes project names and row values, while CSV quotes and neutralizes formulas',()=>{
 const p=blankProject();
 p.name='<img src=x onerror=alert(1)> & "quoted"';
 p.parts=[{id:'r1',kind:'resistor',x:0,y:0,rotation:0,value:330}];
 const html=renderBomPanel(createBom(p));
 assert.match(html,/&lt;img/);
 assert.match(html,/&amp;/);
 assert.doesNotMatch(html,/<img|onerror=/i);
 assert.match(html,/<table class="bom-table">/);
 const csv=bomCSV({title:'unsafe',totalComponents:1,totalWires:0,totalAnnotations:0,
  rows:[{kind:'resistor',label:'"resistor",\nnew',specification:'=1+1',quantity:1,ids:['-SUM(A1)']}]});
 assert.ok(csv.startsWith('\uFEFF'));
 assert.match(csv,/'=1\+1/);
 assert.match(csv,/'-SUM\(A1\)/);
 assert.match(csv,/""resistor""/);
 assert.ok(csv.endsWith('\r\n'));
});
test('BOM row ID order and output is stable across reads with optional typed wires and note cards',()=>{
 const p=demo();
 p.wires[0].type='hookup';
 p.notes=[{id:'n1',x:10,y:30,text:'power'}];
 const first=createBom(p),second=createBom(structuredClone(p));
 assert.deepEqual(first,second);
 assert.deepEqual(bomCSV(first),bomCSV(second));
 assert.equal(first.totalAnnotations,1);
 assert.equal(first.totalWires,3);
});
