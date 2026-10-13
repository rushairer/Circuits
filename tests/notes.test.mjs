import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,blankProject,validProject} from '../.test-dist/model.js';
import {buildNetlist} from '../.test-dist/core/netlist.js';
import {createCircuitNote,editCircuitNote,moveCircuitNote,deleteCircuitNote,MAX_NOTES,MAX_NOTE_TEXT} from '../.test-dist/core/notes.js';
import {renderCircuitNotes,notePreviewLines} from '../.test-dist/ui/note-render.js';

test('notes are optional in schema-v2 projects and do not alter any existing nets',()=>{
 const original=demo(),snapshot=structuredClone(original);
 assert.equal(validProject(original),true);
 const baseline=buildNetlist(original);
 const doc=createCircuitNote(original,'note-1',{x:316,y:100},'电池说明');
 assert.ok(doc);assert.equal(validProject(doc),true);
 assert.equal(doc.notes.length,1);
 assert.strictEqual(doc.parts,original.parts);
 assert.strictEqual(doc.wires,original.wires);
 assert.deepEqual(original,snapshot);
 const after=buildNetlist(doc);
 assert.deepEqual(after.warnings,baseline.warnings);
 for(const wire of original.wires){
   assert.equal(after.netOf(wire.from),baseline.netOf(wire.from));
   assert.equal(after.netOf(wire.to),baseline.netOf(wire.to));
 }
});
test('creation rejects duplicate, invalid IDs, non-finite coordinates and bounded-count overflow',()=>{
 const p=blankProject();
 const first=createCircuitNote(p,'n1',{x:1.234567,y:-2.345678});
 assert.deepEqual(first.notes,[{id:'n1',x:1.2346,y:-2.3457,text:'新建注释'}]);
 assert.equal(createCircuitNote(first,'n1',{x:0,y:0}),null);
 assert.equal(createCircuitNote(first,'bad/id',{x:0,y:0}),null);
 for(const pos of [{x:Infinity,y:0},{x:100001,y:0},{x:1,y:NaN}]){
   assert.equal(createCircuitNote(first,'n2',pos),null);
 }
 let doc=p;
 for(let i=0;i<MAX_NOTES;i++)doc=createCircuitNote(doc,'n'+i,{x:i,y:i});
 assert.equal(validProject(doc),true);
 assert.equal(createCircuitNote(doc,'next',{x:0,y:0}),null);
});
test('text edit preserves stable IDs, is undo snapshot friendly and bounded',()=>{
 const p=createCircuitNote(demo(),'n1',{x:50,y:80},'old');
 const content='<img src=x onerror=alert(1)>\n" & </text>';
 const edited=editCircuitNote(p,'n1',content);
 assert.equal(edited.notes[0].text,content);
 assert.strictEqual(edited.wires,p.wires);
 assert.strictEqual(edited.parts,p.parts);
 assert.equal(validProject(edited),true);
 assert.equal(editCircuitNote(edited,'n1',content),edited);
 assert.equal(editCircuitNote(edited,'n2','unknown'),null);
 assert.equal(editCircuitNote(p,'n1','X'.repeat(MAX_NOTE_TEXT+1)),null);
 assert.equal(p.notes[0].text,'old');
});
test('note drag uses pointer-down delta and never cumulatively changes coordinates',()=>{
 const p=createCircuitNote(demo(),'n1',{x:50,y:80},'free');
 const moved=moveCircuitNote(p,'n1',{x:19.22222,y:-4.22222});
 assert.deepEqual(moved.notes[0],{id:'n1',x:69.2222,y:75.7778,text:'free'});
 assert.equal(moved.wires,p.wires);
 assert.equal(moveCircuitNote(p,'n1',{x:0,y:0}),p);
 assert.equal(moveCircuitNote(p,'n1',{x:Infinity,y:0}),null);
 assert.equal(moveCircuitNote(p,'bad',{x:0,y:0}),null);
 assert.equal(moveCircuitNote(p,'n1',{x:99999,y:0}),null);
 assert.equal(p.notes[0].x,50);
});
test('deleting a note leaves electrical data unchanged',()=>{
 const p=createCircuitNote(demo(),'n1',{x:0,y:0},'delete');
 const deleted=deleteCircuitNote(p,'n1');
 assert.deepEqual(deleted.notes,[]);
 assert.strictEqual(deleted.wires,p.wires);
 assert.strictEqual(deleted.parts,p.parts);
 assert.equal(validProject(deleted),true);
 assert.equal(deleteCircuitNote(deleted,'n1'),null);
});
test('import rejects untrusted annotation structures and allows legacy documents',()=>{
 const p=demo();
 assert.equal(validProject(p),true);
 for(const notes of [null,{},'nope',new Array(MAX_NOTES+1).fill(null)]){
   assert.equal(validProject({...p,notes}),false);
 }
 const valid=createCircuitNote(p,'alpha',{x:100,y:100},'safe');
 for(const bad of [
   {id:'a/b',x:0,y:0,text:'bad id'},
   {id:'alpha',x:1,y:1,text:'duplicate'},
   {id:'other',x:NaN,y:1,text:'nan'},
   {id:'other',x:0,y:Infinity,text:'infinite'},
   {id:'other',x:100001,y:0,text:'unbounded'},
   {id:'other',x:1,y:1,text:'X'.repeat(MAX_NOTE_TEXT+1)},
   {id:'other',x:1,y:1,text:{}}
 ]){
   assert.equal(validProject({...valid,notes:[valid.notes[0],bad]}),false);
 }
 assert.equal(validProject({...p,notes:[]}),true);
});
test('SVG notes escape HTML/SVG injection and limit preview without rewriting full text',()=>{
 const value='<script>alert("x")</script>&\nsecond line';
 const p=createCircuitNote(demo(),'note-1',{x:20,y:90},value);
 const svg=renderCircuitNotes(p.notes,'note-1');
 assert.match(svg,/id="circuit-notes"/);
 assert.match(svg,/class="circuit-note selected"/);
 assert.match(svg,/&lt;script&gt;/);
 assert.match(svg,/&amp;/);
 assert.doesNotMatch(svg,/<script|onerror=|<foreignObject|<iframe/i);
 assert.match(svg,/aria-label="注释：/);
 assert.match(svg,/transform="translate\(20 90\)"/);
 assert.equal(renderCircuitNotes([],null),'');
 const lines=notePreviewLines('A'.repeat(120));
 assert.equal(lines.length,4);
 assert.ok(lines[3].endsWith('…'));
 assert.equal(p.notes[0].text,value);
});
