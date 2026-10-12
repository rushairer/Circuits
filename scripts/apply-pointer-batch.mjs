// One-shot branch migration. Removed together with its workflow before merge.
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
let source=readFileSync('src/main.ts','utf8');
const bytes=Buffer.from(source);
const sha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
if(sha!=='44dd32c7382e4d1fac6b5900c3f52c87542128d2')throw Error(`Unexpected main.ts base: ${sha}`);
function replace(before,after){
 if(source.split(before).length!==2)throw Error(`Expected exactly one occurrence: ${before.slice(0,100)}`);
 source=source.replace(before,after);
}
replace("import './style.css';", "import './style.css';\nimport { bindCanvasPointers, type CanvasClick, type CanvasPointer } from './ui/pointer-input.js';");
replace("function openWorkspace(id:string){", "function openWorkspace(id:string){\n pointerInput.cancel();");
replace("function revert(stack:Project[],other:Project[]){const prev", "function revert(stack:Project[],other:Project[]){pointerInput.cancel();const prev");
replace("app.addEventListener('click',e=>{", "function handleClick(e:CanvasClick){");
replace("});\napp.addEventListener('input',e=>{", "}\napp.addEventListener('click',handleClick);\napp.addEventListener('input',e=>{");
replace("app.addEventListener('pointerdown',e=>{", "function handlePointerDown(e:CanvasPointer){\n ignoredClick=null;");
replace("});\nwindow.addEventListener('pointermove',e=>{", "}\nfunction handlePointerMove(e:CanvasPointer){");
replace("});\nwindow.addEventListener('pointerup',e=>{", "}\nfunction handlePointerUp(e:CanvasPointer){");
replace("});\nwindow.addEventListener('keydown',e=>{", "}\nwindow.addEventListener('keydown',e=>{\n if(pointerInput.busy){\n   if(e.key==='Escape'){e.preventDefault();pointerInput.cancel();}\n   return;\n }");
replace(" if(panDrag){\n   const svg", " if(panDrag){\n   if(!e.dragged)return;\n   const svg");
replace("!wireDrag.active&&Math.hypot(e.clientX-wireDrag.clientX,e.clientY-wireDrag.clientY)>5", "!wireDrag.active&&e.dragged");
replace("!gesture.active&&Math.hypot(e.clientX-gesture.screenX,e.clientY-gesture.screenY)>6", "!gesture.active&&e.dragged");
replace("marquee.active=marquee.active||Math.hypot(e.clientX-marquee.screenX,e.clientY-marquee.screenY)>5", "marquee.active=marquee.active||e.dragged");
replace("if(e.button===0&&!spaceHeld&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)<5)", "if(e.button===0&&!spaceHeld&&!e.dragged)");
replace("   if(wireDrag.active){\n     const point", "   if(wireDrag.active&&pointerTarget.closest('#board')){\n     const point");
replace(" if(!drag)return;\n const svg", " if(!drag||!e.dragged)return;\n const svg");
replace(" if(bendDrag){\n   const w=project.wires.find(w=>w.id===bendDrag!.id),point=canvasPoint(e.clientX,e.clientY);\n   if(w?.bends?.[bendDrag.index]&&point){\n     w.bends[bendDrag.index]={x:gridEnabled?snap(point.x):point.x,y:gridEnabled?snap(point.y):point.y};\n     refreshScene();\n   }\n   return;\n }", " if(bendDrag){\n   if(!e.dragged)return;\n   const point=canvasPoint(e.clientX,e.clientY);\n   const moved=point&&moveWireWaypoint(bendDrag.before,bendDrag.id,bendDrag.index,point,gridEnabled?10:null);\n   if(moved){project=moved;refreshScene();}\n   return;\n }");
replace("   const hit=explicit??(point&&nearestTerminal(project,point,wireRadius()));", "   const hit=(e.target as Element).closest('#board')?\n     (explicit??(point&&nearestTerminal(project,point,wireRadius()))):null;");
replace("   const target=direct??(point&&nearestTerminal(project,point,wireRadius()));", "   const target=(e.target as Element).closest('#board')?\n     (direct??(point&&nearestTerminal(project,point,wireRadius()))):null;");
replace("   if(wiring){\n     const point=canvasPoint(e.clientX,e.clientY);", "   if(wiring){\n     if(!(e.target as Element).closest('#board')){render();return;}\n     const point=canvasPoint(e.clientX,e.clientY);");
replace("   if(segmentDrag?.active)project=segmentDrag.before;\n   segmentDrag=null;selectedBend=null;clearWireDraft();endpointDrag=null;bendDrag=null;drag=null;marquee=null;panDrag=null;", "   cancelCanvasGesture();");
replace(" if(!(e.target as Element).closest('.canvas')||e.deltaY===0||scopeOpen)return;\n e.preventDefault();", " if(!(e.target as Element).closest('.canvas')||e.deltaY===0||scopeOpen)return;\n pointerInput.cancel();\n e.preventDefault();");
replace("if(!validProject(p))throw Error();const b=copy();project=reconcileInsertions", "if(!validProject(p))throw Error();pointerInput.cancel();const b=copy();project=reconcileInsertions");
const start=source.indexOf("window.addEventListener('pointercancel',e=>{");
const end=source.indexOf('// Persist the first demo',start);
if(start<0||end<0)throw Error('Missing lifecycle tail');
source=source.slice(0,start)+`function cancelCanvasGesture(){
 // Roll back every preview, not just whole-wire segment edits. No save/commit.
 const before=drag?.before??bendDrag?.before??segmentDrag?.before;
 if(before)project=before;
 if(panDrag){panX=panDrag.panX;panY=panDrag.panY;}
 drag=null;bendDrag=null;segmentDrag=null;endpointDrag=null;marquee=null;panDrag=null;
 selectedBend=null;spaceHeld=false;clearWireDraft();connectionNotice='';
 render();
}
const pointerInput=bindCanvasPointers(app,{
 down:handlePointerDown,move:handlePointerMove,up:handlePointerUp,tap:handleClick,
 cancel:cancelCanvasGesture
});
`+source.slice(end);
writeFileSync('src/main.ts',source);
let ci=readFileSync('.github/workflows/ci.yml','utf8');
const marker='      - name: Upload browser test report on failure';
if(ci.split(marker).length!==2)throw Error('Unexpected CI artifact marker');
ci=ci.replace(marker,`      - name: Save touch and pen interaction evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: pointer-interaction-evidence
          path: /tmp/circuits-pointer-evidence/
          if-no-files-found: ignore
          retention-days: 7
`+marker);
writeFileSync('.github/workflows/ci.yml',ci);
unlinkSync('scripts/apply-pointer-batch.mjs');
unlinkSync('.github/workflows/apply-pointer-batch.yml');
