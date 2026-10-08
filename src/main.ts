import './style.css';
import { demo, validProject, parts, labels, pins, size, type Project, type Kind, type Part, type Endpoint } from './model.js';
import { evaluate } from './core/simulator.js';
import { snap, pinWorld, wirePoints, wirePath, nearestSegment, type Point } from './core/geometry.js';
import { WORKSPACE_KEY, MAX_PROJECTS, migrateWorkspace, activeProject, saveCurrent, createProject, switchProject, deleteProject } from './core/storage.js';
import { blankProject } from './model.js';
import { translateComponents, removeComponents, rotateComponents, componentsWithinRect } from './core/selection.js';
import { appendConnection, reconnectEndpoint, nearestTerminal } from './core/connections.js';
import { reconcileInsertions, snapPartToBreadboard } from './core/placement.js';
const app=document.querySelector<HTMLDivElement>('#app')!;
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const savedJSON=(key:string):unknown=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
let workspace=migrateWorkspace(savedJSON(WORKSPACE_KEY),savedJSON('circuits-project'));
let project:Project=reconcileInsertions(activeProject(workspace));
let persistOK=true;
let showProjects=false;
let selection:string|null=null, wiring:Endpoint|null=null, isRunning=false, search='',showCode=false, zoom=1,panX=0,panY=0;
let selectedIds=new Set<string>();
let marquee:{start:Point;end:Point;screenX:number;screenY:number;active:boolean;additive:boolean}|null=null;
let gridEnabled=localStorage.getItem('circuits-grid')!=='off';
let bendDrag:{id:string;index:number;before:Project}|null=null;
let endpointDrag:{id:string;side:'from'|'to';preview:Point}|null=null;
let ignoredClick:{x:number;y:number;until:number}|null=null;
let connectionNotice='';
let undo:Project[]=[],redo:Project[]=[],drag:{ids:string[];x:number;y:number;before:Project}|null=null;
const copy=():Project=>structuredClone(project);
const save=()=>{
 workspace=saveCurrent(workspace,project,Date.now());
 try{
   localStorage.setItem(WORKSPACE_KEY,JSON.stringify(workspace));
   localStorage.setItem('circuits-project',JSON.stringify(project));
   persistOK=true;
 }catch(error){persistOK=false;console.warn('Circuit project could not be persisted',error)}
};
function openWorkspace(id:string){
 workspace=switchProject(workspace,id);
 project=reconcileInsertions(activeProject(workspace));
 selection=null;selectedIds.clear();marquee=null;wiring=null;drag=null;bendDrag=null;endpointDrag=null;showProjects=false;showCode=false;isRunning=false;undo=[];redo=[];
 save();render();
}
function commit(before:Project){project=reconcileInsertions(project);undo.push(before);if(undo.length>50)undo.shift();redo=[];save();render()}
function revert(stack:Project[],other:Project[]){const prev=stack.pop();if(!prev)return;other.push(copy());project=prev;selection=null;selectedIds.clear();marquee=null;save();render()}
const uid=()=>crypto.randomUUID().slice(0,8);
const pos=(e:Endpoint):[number,number]|null=>{
 const p=pinWorld(e,project.parts);return p?[p.x,p.y]:null;
};
function art(c:Part){const [w,h]=size[c.kind];
 if(c.kind==='battery')return '<rect x="8" y="10" width="76" height="119" rx="12" fill="#303b43"/><rect x="8" y="10" width="76" height="32" rx="9" fill="#eca738"/><text x="46" y="86" font-size="25" text-anchor="middle" fill="white">9V</text><text x="70" y="42" fill="white">+</text><text x="70" y="108" fill="white">−</text>';
 if(c.kind==='resistor')return '<path d="M0 30H140" stroke="#b7a17d" stroke-width="5"/><rect x="36" y="13" width="68" height="35" rx="16" fill="#d7b68c" stroke="#bc936c"/><path d="M54 13v35m12-35v35m12-35v35" stroke="#9c542e" stroke-width="6"/><text x="70" y="9" font-size="13" text-anchor="middle" fill="#667988">'+(c.value??220)+'Ω</text>';
 if(c.kind==='led')return '<path d="M0 65H110" stroke="#b6c1c7" stroke-width="5"/><path d="M34 64V42a21 21 0 0 1 42 0v22z" fill="#ee525c"/><rect x="32" y="61" width="46" height="12" rx="4" fill="#d73b4a"/><path d="M45 42a11 11 0 0 1 12-12" stroke="#fff8" fill="none" stroke-width="4"/>';
 if(c.kind==='switch')return '<path d="M0 55H30M110 55H140" stroke="#a9b2bd" stroke-width="5"/><rect x="28" y="25" width="84" height="62" rx="9" fill="#485969"/><rect x="'+(c.closed?68:37)+'" y="32" width="38" height="46" rx="7" fill="#d1dbe0"/><text x="43" y="20" font-size="12" fill="#516779">'+(c.closed?'ON':'OFF')+'</text>';
 if(c.kind==='pushbutton')return '<path d="M0 65H28M82 65H110" stroke="#a7b0b9" stroke-width="5"/><rect x="23" y="26" width="65" height="65" rx="8" fill="#59646b"/><circle cx="55" cy="57" r="22" fill="#d96153"/><circle cx="55" cy="53" r="12" fill="#ea877e"/>';
 if(c.kind==='potentiometer')return '<path d="M0 90H34M86 90H120M60 75v33" stroke="#a6b4bb" stroke-width="4"/><circle cx="60" cy="54" r="42" fill="#2d8cbb"/><circle cx="60" cy="54" r="30" fill="#4dadd2"/><path d="M60 54L82 33" stroke="white" stroke-width="5"/>';
 if(c.kind==='capacitor')return '<path d="M0 79H30M64 79H95" stroke="#b2bbc1" stroke-width="5"/><rect x="29" y="23" width="37" height="75" rx="12" fill="#278ac1"/><path d="M40 31v56" stroke="#c6ebfd" stroke-width="6"/>';
 if(c.kind==='buzzer')return '<path d="M0 90H29M81 90H110" stroke="#bac3ca" stroke-width="5"/><rect x="21" y="20" width="70" height="79" rx="12" fill="#323b46"/><circle cx="55" cy="56" r="31" fill="#151f29" stroke="#68717d" stroke-width="5"/><circle cx="55" cy="56" r="9" fill="#46515f"/>';
 if(c.kind==='multimeter')return '<rect x="8" y="4" width="129" height="152" rx="13" fill="#e1ac34" stroke="#be8427" stroke-width="3"/><rect x="25" y="23" width="95" height="48" rx="5" fill="#a7bfba"/><text x="116" y="57" font-size="22" text-anchor="end" font-family="monospace" fill="#27493e">0.00</text><circle cx="73" cy="112" r="27" fill="#323940"/><path d="M73 112v-18" stroke="white" stroke-width="4"/>';
 if(c.kind==='servo')return '<path d="M0 75H25M0 95H25M0 115H25" stroke="#bda373" stroke-width="4"/><rect x="23" y="37" width="123" height="77" rx="9" fill="#2b74aa"/><circle cx="98" cy="37" r="23" fill="#d7dde1"/><path d="M98 37V5" stroke="#f3f4f4" stroke-width="11"/>';
 if(c.kind==='arduino')return '<rect x="4" y="4" width="196" height="164" rx="12" fill="#2276aa" stroke="#125983" stroke-width="3"/><rect x="25" y="55" width="78" height="45" rx="4" fill="#263e51"/><rect x="4" y="45" width="35" height="34" rx="4" fill="#c1cfd5"/><rect x="40" y="126" width="33" height="39" rx="4" fill="#26313a"/><text x="103" y="38" fill="white" font-size="24" font-weight="bold">UNO</text><text x="90" y="122" fill="#e4f5ff" font-size="14">ARDUINO</text>'+Array.from({length:13},(_,i)=>'<rect x="'+(30+i*13)+'" y="2" width="8" height="9" fill="#243745"/>').join('');
 return '<rect x="2" y="2" width="'+(w-4)+'" height="'+(h-4)+'" rx="9" fill="#f6f7f6" stroke="#bdc9cc" stroke-width="3"/><path d="M18 35h404 M18 167h404" stroke="#e06a6a" stroke-width="2"/><path d="M18 48h404 M18 180h404" stroke="#5d9fd4" stroke-width="2"/>'+Array.from({length:22},(_,x)=>Array.from({length:10},(_,y)=>'<circle cx="'+(28+x*18)+'" cy="'+(67+y*9)+'" r="2.8" fill="#89959b"/>').join('')).join('') }
function canvas(){
 const wires=project.wires.map(w=>{
   const coords=wirePoints(w,project.parts);
   if(!coords)return '';
   const selected=selection===w.id;
   if(endpointDrag?.id===w.id){
     const index=endpointDrag.side==='from'?0:coords.length-1;
     coords[index]=endpointDrag.preview;
   }
   const d=wirePath(coords,Boolean(w.bends?.length));
   const bends=selected?(w.bends??[]).map((p,i)=>'<circle class="bend-handle" data-wire="'+w.id+'" data-bend-index="'+i+'" cx="'+p.x+'" cy="'+p.y+'" r="8" fill="#ffffff" stroke="#0f9c94" stroke-width="3"/>').join(''):'';
   return '<g><path class="wire" data-wire="'+w.id+'" d="'+d+'" stroke="'+w.color+'" stroke-width="'+(selected?8:5)+'" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'+bends+'</g>';
 }).join('');
 const readings=isRunning?evaluate(project):null;
 const insertedPins=new Set((project.insertions??[]).flatMap(x=>[x.componentId+'::'+x.pinId,x.boardId+'::'+x.holeId]));
 const shapes=project.parts.map(c=>{const [w,h]=size[c.kind],glow=c.kind==='led'&&readings?.lit?'<circle cx="54" cy="49" r="52" fill="#ff7a74" opacity=".2"/>':'';
 const board=c.kind==='breadboard';
 const pinsSvg=Object.entries(pins[c.kind]).map(([name,p])=>{
   const inserted=insertedPins.has(c.id+'::'+name);
   return '<circle class="pin" data-part="'+c.id+'" data-pin="'+name+'" cx="'+p[0]+'" cy="'+p[1]+'" r="'+(board?4.4:7)+'" fill="'+(inserted?'#19bd89':board?'#44535e':'#e6c08a')+'" stroke="'+(inserted?'#057d62':board?'#b2c4cb':'#a58142')+'" stroke-width="'+(board?1.2:2)+'"><title>'+name+(inserted?' · 已插入':'')+'</title></circle>';
 }).join('');
 return '<g class="item '+(selectedIds.has(c.id)?'selected':'')+'" data-part="'+c.id+'" transform="translate('+c.x+' '+c.y+')"><g transform="rotate('+c.rotation+' '+w/2+' '+h/2+')">'+glow+art(c)+pinsSvg+'</g></g>'}).join('');
 const marqueeMarkup=marquee?.active?'<rect class="marquee-box" x="'+Math.min(marquee.start.x,marquee.end.x)+'" y="'+Math.min(marquee.start.y,marquee.end.y)+'" width="'+Math.abs(marquee.start.x-marquee.end.x)+'" height="'+Math.abs(marquee.start.y-marquee.end.y)+'"/>':'';
 const terminalHandles=project.wires.filter(w=>w.id===selection).map(w=>{
   const coords=wirePoints(w,project.parts);
   if(!coords)return '';
   if(endpointDrag?.id===w.id)coords[endpointDrag.side==='from'?0:coords.length-1]=endpointDrag.preview;
   return [['from',coords[0]],['to',coords[coords.length-1]]].map(([side,p])=>{
     const point=p as Point;
     return '<circle class="endpoint-handle" data-wire="'+w.id+'" data-wire-end="'+side+'" cx="'+point.x+'" cy="'+point.y+'" r="10" fill="white" stroke="#0e9e95" stroke-width="3"><title>拖动重接 '+(side==='from'?'起点':'终点')+'</title></circle>';
   }).join('');
 }).join('');
 return '<svg id="board" viewBox="0 0 1100 800"><defs><pattern id="dot" width="21" height="21" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#c5cfd3"/></pattern></defs><rect width="1100" height="800" fill="#f3f5f6"/><rect width="1100" height="800" fill="url(#dot)"/><g id="scene" transform="translate('+panX+' '+panY+') scale('+zoom+')">'+wires+shapes+terminalHandles+marqueeMarkup+'</g></svg>'}
function refreshScene(){
 const original=app.querySelector('#scene');
 if(!original)return;
 const wrapper=document.createElement('div');
 wrapper.innerHTML=canvas();
 const latest=wrapper.querySelector('#scene');
 if(latest)original.innerHTML=latest.innerHTML;
}
function canvasPoint(clientX:number,clientY:number):Point|null {
 const svg=app.querySelector<SVGSVGElement>('#board'),matrix=svg?.getScreenCTM();
 if(!svg||!matrix)return null;
 const point=svg.createSVGPoint();
 point.x=clientX;point.y=clientY;
 const c=point.matrixTransform(matrix.inverse());
 return {x:(c.x-panX)/zoom,y:(c.y-panY)/zoom};
}
function addBend(wireId:string,point:Point){
 const w=project.wires.find(w=>w.id===wireId);
 if(!w|| (w.bends?.length??0)>=32)return;
 const pts=wirePoints(w,project.parts);if(!pts)return;
 const before=copy();
 const p={x:gridEnabled?snap(point.x):point.x,y:gridEnabled?snap(point.y):point.y};
 const index=nearestSegment(pts,p);
 (w.bends??=[]).splice(index,0,p);
 selection=w.id;commit(before);
}
function side(){
 if(showProjects){
   const rows=[...workspace.slots].sort((a,b)=>b.updatedAt-a.updatedAt).map(slot=>
     '<div class="project-row"><button class="project-open" data-open-project="'+slot.id+'"><strong>'+escape(slot.project.name)+'</strong><small>'+slot.project.parts.length+' 个元件 · '+slot.project.wires.length+' 根导线'+(slot.id===workspace.activeId?' · 当前':'')+'</small></button><button class="project-delete" aria-label="删除 '+escape(slot.project.name)+'" title="删除工程" data-delete-project="'+slot.id+'" '+(workspace.slots.length===1?'disabled':'')+'>×</button></div>'
   ).join('');
   return '<h2>我的电路 · '+workspace.slots.length+'/'+MAX_PROJECTS+'</h2><div class="field"><p>工程保存在当前浏览器；切换不会覆盖此前的工程。建议定期导出 JSON 备份。</p><button data-action="new">＋ 新建电路</button><button data-action="duplicate">复制当前工程</button><button data-action="projects">返回编辑器</button></div><div class="project-collection">'+rows+'</div>';
 }
 if(selectedIds.size>1&&!showCode)return '<h2>已选中 '+selectedIds.size+' 个元件</h2><div class="field"><p>拖动任意已选中元件可整体移动，所有引脚接线会自动跟随。</p><p>按住 Shift 单击添加或移除选中；在空白画布拖动可框选。</p><button data-action="rotate">分别旋转 90°</button><button data-action="delete">删除所选元件</button><button data-action="parts">取消选择</button></div>';
 const chosenWire=project.wires.find(w=>w.id===selection);
 if(chosenWire&&!showCode)return '<h2>导线属性</h2><div class="field"><p>起点：'+escape(chosenWire.from.componentId)+' / '+escape(chosenWire.from.pinId)+'</p><p>终点：'+escape(chosenWire.to.componentId)+' / '+escape(chosenWire.to.pinId)+'</p><label for="wire-color">导线颜色</label><input id="wire-color" type="color" value="'+chosenWire.color+'"/><p>折点 '+(chosenWire.bends?.length??0)+' 个。拖动空心端点到其他元件或面包板插孔即可重新接线；折点圆形手柄可拖动，双击导线添加折点。</p><button data-action="wire-add-bend">＋ 添加折点</button><button data-action="wire-reset-bends">恢复自动走线</button><p>编辑颜色和折点均不改变电气连接。</p><button data-action="delete">删除导线</button><button data-action="parts">返回元件库</button></div>';
 if(showCode)return '<h2>代码编辑器 · Arduino C++</h2><div class="field"><p>仅提供文本编辑和导出，尚未运行 MCU 程序。</p><textarea id="code" maxlength="300000">'+escape(project.code)+'</textarea><button data-action="download-code">下载 .ino</button><button data-action="code">返回元件库</button></div>';
 const c=project.parts.find(p=>p.id===selection);
 if(c)return '<h2>属性 · '+labels[c.kind]+'</h2><div class="field"><p>元件：'+labels[c.kind]+'</p>'+(c.kind==='resistor'||c.kind==='battery'?'<label>数值 ('+(c.kind==='resistor'?'Ω':'V')+')</label><input id="value" type="number" min="1" value="'+(c.value??1)+'"/>':'')+'<p>坐标 '+Math.round(c.x)+', '+Math.round(c.y)+' · 旋转 '+c.rotation+'°</p>'+(c.kind==='led'||c.kind==='resistor'?'<p>面包板接触 '+(project.insertions??[]).filter(i=>i.componentId===c.id).length+'/2：移动元件，让引脚靠近插孔即可自动吸附。</p>':'')+(c.kind==='switch'?'<button data-action="toggle-switch">'+(c.closed?'断开开关':'闭合开关')+'</button>':'')+(!['battery','resistor','led','breadboard','switch'].includes(c.kind)?'<p>该元件仅支持可视化与接线，暂未接入电气仿真。</p>':'')+'<button data-action="rotate">旋转 90°</button><button data-action="delete">删除元件</button><button data-action="parts">返回元件库</button></div>';
 return '<h2>▦ 组件库</h2><div class="search"><input id="search" placeholder="搜索组件..." value="'+escape(search)+'"/></div><div class="parts">'+parts.filter(k=>labels[k].toLowerCase().includes(search.toLowerCase())).map(kind=>'<button class="part" draggable="true" data-kind="'+kind+'"><svg viewBox="0 0 '+size[kind][0]+' '+size[kind][1]+'">'+art({kind,id:'sample',x:0,y:0,rotation:0})+'</svg>'+labels[kind]+'</button>').join('')+'</div><div class="field"><p>点击添加元件，点两个引脚接线。支持从元件库拖入。</p></div>'}
function render(){const report=evaluate(project);
 app.innerHTML='<header><span class="brand">◉ Circuits</span><button data-action="projects" class="project-switcher">我的电路 ('+workspace.slots.length+') ▾</button><input id="name" maxlength="120" value="'+escape(project.name)+'"/><span class="status">'+(persistOK?'● 本地已保存':'⚠ 本地保存失败，请导出 JSON')+'</span><button data-action="import">导入</button><button data-action="export">导出</button></header><div class="topbar"><button data-action="new">＋ 新建</button><button data-action="sample">示例电路</button><button data-action="undo" '+(!undo.length?'disabled':'')+'>↶ 撤销</button><button data-action="redo" '+(!redo.length?'disabled':'')+'>↷ 重做</button><button data-action="select-all">全选</button><button data-action="rotate">⟳ 旋转</button><button data-action="delete">删除</button><button data-action="code">〈/〉 代码</button><button data-action="grid">'+(gridEnabled?'网格吸附：开':'网格吸附：关')+'</button><button class="run '+(isRunning?'active':'')+'" data-action="run">'+(isRunning?'■ 停止仿真':'▶ 开始仿真')+'</button></div><div class="workspace"><section class="canvas">'+canvas()+'<div class="canvas-meta">2D · 电路工作台 · '+project.parts.length+' 个元件 · '+project.wires.length+' 根导线 · '+(project.insertions?.length??0)+' 处插孔接触</div><div class="bottom"><span>'+(endpointDrag?'正在重接导线：拖动端点到目标引脚':connectionNotice?escape(connectionNotice):wiring?'正在接线：点选第二个引脚':isRunning?report.reason+' · '+report.currentMilliAmps+'mA':selectedIds.size>1?'已选择 '+selectedIds.size+' 个元件 · 拖动整体移动':'设计模式 · 拖动元件或点击引脚接线')+'</span><button data-action="zoom-out">−</button>'+Math.round(zoom*100)+'%<button data-action="zoom-in">＋</button><button data-action="fit">重置</button></div></section><aside class="inspector">'+side()+'</aside></div><footer><span>独立开源实验项目 · 基础 DC LED 仿真，尚不支持 Arduino 代码执行</span><span>v0.2.0-alpha.5 · TypeScript + Vite</span></footer><input id="file" type="file" accept=".json" hidden/>'}
function add(kind:Kind,x?:number,y?:number){
 const before=copy(),a=x??300,b=y??300,id=uid();
 project.parts.push({id,kind,x:gridEnabled?snap(a):a,y:gridEnabled?snap(b):b,rotation:0,value:kind==='resistor'?220:kind==='battery'?9:undefined});
 project=snapPartToBreadboard(project,id);
 commit(before);
}
function connect(a:Endpoint){
 if(!wiring){connectionNotice='';wiring=a;return render()}
 if(wiring.componentId===a.componentId&&wiring.pinId===a.pinId){wiring=null;return render()}
 const result=appendConnection(project,{id:uid(),from:wiring,to:a,color:'#e45454'});
 wiring=null;
 if(!result){connectionNotice='不能重复接线，也不能把同一引脚连接到自己';render();return}
 const before=copy();project=result;connectionNotice='';commit(before);
}
function selectAllParts(){
 selectedIds=new Set(project.parts.map(p=>p.id));
 selection=selectedIds.size===1?[...selectedIds][0]:null;render();
}
function rotateSelectedParts(){
 if(!selectedIds.size)return;
 const before=copy();
 project=reconcileInsertions(rotateComponents(project,[...selectedIds]));
 commit(before);
}
function deleteSelection(){
 const before=copy();
 let changed=false;
 if(selectedIds.size){
   const next=removeComponents(project,[...selectedIds]);
   if(next!==project){project=reconcileInsertions(next);changed=true}
 }else if(selection){
   const wires=project.wires.filter(w=>w.id!==selection);
   if(wires.length!==project.wires.length){project={...project,wires};changed=true}
 }
 if(!changed)return;
 selectedIds.clear();selection=null;commit(before);
}
function download(text:string,name:string){const url=URL.createObjectURL(new Blob([text]));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
app.addEventListener('click',e=>{
 if(ignoredClick&&e.timeStamp<ignoredClick.until&&Math.hypot(e.clientX-ignoredClick.x,e.clientY-ignoredClick.y)<4){
   ignoredClick=null;return;
 }
 ignoredClick=null;
 const t=e.target as Element;
 const p=t.closest<SVGElement>('[data-pin]');if(p){const g=p.closest<SVGGElement>('[data-part]');if(g){selectedIds.clear();connect({componentId:g.dataset.part!,pinId:p.dataset.pin!});return}}
 const part=t.closest<SVGGElement>('[data-part]');
 if(part){
   const id=part.dataset.part!;
   if(e.shiftKey||e.ctrlKey||e.metaKey){
     selectedIds=new Set(selectedIds);
     if(selectedIds.has(id))selectedIds.delete(id);
     else selectedIds.add(id);
   }else if(!selectedIds.has(id))selectedIds=new Set([id]);
   selection=selectedIds.size===1?[...selectedIds][0]:null;
   showCode=false;showProjects=false;render();return;
 }
 const wire=t.closest<SVGElement>('[data-wire]');if(wire){const next=wire.getAttribute('data-wire');if(selection!==next||selectedIds.size){selectedIds.clear();selection=next;render()}return}
 const k=t.closest<HTMLElement>('[data-kind]');if(k){add(k.dataset.kind as Kind);return}
 const chosen=t.closest<HTMLElement>('[data-open-project]');
 if(chosen){
   const id=chosen.dataset.openProject!;
   if(id!==workspace.activeId){save();openWorkspace(id)}else{showProjects=false;render()}
   return;
 }
 const removed=t.closest<HTMLElement>('[data-delete-project]');
 if(removed){
   const id=removed.dataset.deleteProject!;
   if(workspace.slots.length>1&&window.confirm('确定删除此浏览器中的工程？删除后无法撤销，建议先导出 JSON。')){
     save();workspace=deleteProject(workspace,id);openWorkspace(workspace.activeId);
   }
   return;
 }
 const a=t.closest<HTMLElement>('[data-action]');if(!a)return;
 switch(a.dataset.action){
 case 'new':{
   if(workspace.slots.length>=MAX_PROJECTS){alert('本地最多保存 '+MAX_PROJECTS+' 个工程，请先导出并清理旧工程');break}
   save();const id='project-'+uid();
   workspace=createProject(workspace,id,blankProject(),Date.now());
   openWorkspace(id);break;
 }
 case 'duplicate':{
   if(workspace.slots.length>=MAX_PROJECTS){alert('本地工程数量已达到上限');break}
   save();const id='project-'+uid(),draft=copy();
   draft.name=(draft.name+' 副本').slice(0,120);
   workspace=createProject(workspace,id,draft,Date.now());
   openWorkspace(id);break;
 }
 case 'projects':showProjects=!showProjects;showCode=false;render();break;
 case 'sample':{const b=copy();project=demo();selection=null;selectedIds.clear();commit(b);break}
 case 'undo':revert(undo,redo);break;case 'redo':revert(redo,undo);break;
 case 'select-all':selectAllParts();break;
 case 'grid':gridEnabled=!gridEnabled;localStorage.setItem('circuits-grid',gridEnabled?'on':'off');render();break;
 case 'wire-add-bend':{
   const w=project.wires.find(w=>w.id===selection),coords=w&&wirePoints(w,project.parts);
   if(w&&coords){const a=coords[0],b=coords[coords.length-1];addBend(w.id,{x:(a.x+b.x)/2,y:(a.y+b.y)/2})}
   break;
 }
 case 'wire-reset-bends':{
   const w=project.wires.find(w=>w.id===selection);
   if(w?.bends?.length){const b=copy();delete w.bends;commit(b)}
   break;
 }
 case 'toggle-switch':{const c=project.parts.find(p=>p.id===selection);if(c?.kind==='switch'){const b=copy();c.closed=!c.closed;commit(b)}break}
 case 'rotate':rotateSelectedParts();break
 case 'delete':deleteSelection();break
 case 'code':showCode=!showCode;showProjects=false;render();break;case 'parts':selection=null;selectedIds.clear();showCode=false;showProjects=false;render();break;
 case 'run':isRunning=!isRunning;render();break;
 case 'zoom-in':zoom=Math.min(2,zoom+.1);render();break;case 'zoom-out':zoom=Math.max(.4,zoom-.1);render();break;case 'fit':zoom=1;panX=0;panY=0;render();break;
 case 'export':download(JSON.stringify(project,null,2),project.name+'.json');break;
 case 'download-code':download(project.code,'circuit.ino');break;
 case 'import':app.querySelector<HTMLInputElement>('#file')?.click();break}
});
app.addEventListener('input',e=>{const t=e.target as HTMLInputElement;if(t.id==='search'){search=t.value;render();app.querySelector<HTMLInputElement>('#search')?.focus()}if(t.id==='code'){project.code=t.value;save()}});
app.addEventListener('change',async e=>{const t=e.target as HTMLInputElement;if(t.id==='name'){project.name=t.value.trim().slice(0,120)||'未命名电路';save();render()}if(t.id==='wire-color'){const w=project.wires.find(w=>w.id===selection);if(w&&/^#[0-9a-f]{6}$/i.test(t.value)){const b=copy();w.color=t.value;commit(b)}}if(t.id==='value'){const c=project.parts.find(p=>p.id===selection);const num=Number(t.value);if(c&&Number.isFinite(num)&&num>0&&num<=1e12){const b=copy();c.value=num;commit(b)}}if(t.id==='file'&&t.files?.[0]){try{const p=JSON.parse(await t.files[0].text());if(!validProject(p))throw Error();const b=copy();project=reconcileInsertions({...p,schemaVersion:2});selection=null;selectedIds.clear();commit(b)}catch{alert('JSON 工程文件格式不正确')}}});
app.addEventListener('dragstart',e=>{const p=(e.target as Element).closest<HTMLElement>('[data-kind]');if(p)e.dataTransfer?.setData('text/circuit-kind',p.dataset.kind!)});
app.addEventListener('dragover',e=>{if((e.target as Element).closest('.canvas'))e.preventDefault()});
app.addEventListener('drop',e=>{const svg=app.querySelector<SVGSVGElement>('#board');const kind=e.dataTransfer?.getData('text/circuit-kind') as Kind;if(!svg||!parts.includes(kind)||!(e.target as Element).closest('.canvas'))return;e.preventDefault();const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const m=svg.getScreenCTM();if(!m)return;const p=pt.matrixTransform(m.inverse());add(kind,(p.x-panX)/zoom-size[kind][0]/2,(p.y-panY)/zoom-size[kind][1]/2)});
app.addEventListener('dblclick',e=>{
 const target=e.target as Element;
 if(target.closest('[data-bend-index]'))return;
 const wire=target.closest<SVGElement>('[data-wire]');
 if(!wire)return;
 const point=canvasPoint(e.clientX,e.clientY);
 if(point){e.preventDefault();addBend(wire.getAttribute('data-wire')!,point)}
});
app.addEventListener('pointerdown',e=>{
 if(e.button!==0)return;
 const svg=app.querySelector<SVGSVGElement>('#board'),target=e.target as Element;
 // Pointer gestures must start inside the SVG, never on toolbar or inspector controls.
 if(!target.closest('#board'))return;
 const terminalHandle=target.closest<SVGElement>('[data-wire-end]');
 if(terminalHandle){
   const id=terminalHandle.getAttribute('data-wire')!,side=terminalHandle.getAttribute('data-wire-end');
   if((side==='from'||side==='to')&&project.wires.some(w=>w.id===id)){
     const point=canvasPoint(e.clientX,e.clientY);
     if(point){endpointDrag={id,side,preview:point};return}
   }
 }
 const handle=target.closest<SVGElement>('[data-bend-index]');
 if(handle){
   const w=project.wires.find(x=>x.id===handle.getAttribute('data-wire')),index=Number(handle.getAttribute('data-bend-index'));
   if(w?.bends?.[index]){bendDrag={id:w.id,index,before:copy()};return}
 }
 if(!svg)return;
 const component=target.closest<SVGGElement>('[data-part]');
 if(!component){
   if(target.closest('[data-wire]'))return;
   const at=canvasPoint(e.clientX,e.clientY);
   if(at)marquee={start:at,end:at,screenX:e.clientX,screenY:e.clientY,active:false,additive:e.shiftKey};
   return;
 }
 if(target.closest('[data-pin]')||e.shiftKey||e.ctrlKey||e.metaKey)return;
 const id=component.dataset.part!;
 if(!project.parts.some(p=>p.id===id))return;
 if(!selectedIds.has(id))selectedIds=new Set([id]);
 const ids=[...selectedIds];
 selection=ids.length===1?id:null;
 drag={ids,x:e.clientX,y:e.clientY,before:copy()};
 render();
});
window.addEventListener('pointermove',e=>{
 if(endpointDrag){
   const point=canvasPoint(e.clientX,e.clientY);
   if(point){
     const hit=nearestTerminal(project,point,12);
     endpointDrag.preview=hit?.point??point;
     refreshScene();
   }
   return;
 }
 if(bendDrag){
   const w=project.wires.find(w=>w.id===bendDrag!.id),point=canvasPoint(e.clientX,e.clientY);
   if(w?.bends?.[bendDrag.index]&&point){
     w.bends[bendDrag.index]={x:gridEnabled?snap(point.x):point.x,y:gridEnabled?snap(point.y):point.y};
     refreshScene();
   }
   return;
 }
 if(marquee){
   const point=canvasPoint(e.clientX,e.clientY);
   if(point){
     marquee.end=point;
     marquee.active=marquee.active||Math.hypot(e.clientX-marquee.screenX,e.clientY-marquee.screenY)>5;
     if(marquee.active)refreshScene();
   }
   return;
 }
 if(!drag)return;
 const svg=app.querySelector<SVGSVGElement>('#board'),matrix=svg?.getScreenCTM();
 if(!matrix)return;
 const scale=Math.hypot(matrix.a,matrix.b)*zoom;
 if(scale<=0)return;
 project=translateComponents(drag.before,drag.ids,{x:(e.clientX-drag.x)/scale,y:(e.clientY-drag.y)/scale},gridEnabled?10:null);
 refreshScene();
});
window.addEventListener('pointerup',e=>{
 if(endpointDrag){
   const current=endpointDrag;endpointDrag=null;
   ignoredClick={x:e.clientX,y:e.clientY,until:e.timeStamp+200};
   const point=canvasPoint(e.clientX,e.clientY);
   const target=point&&nearestTerminal(project,point,12);
   const result=target&&reconnectEndpoint(project,current.id,current.side,target.endpoint);
   if(result&&result!==project){
     const before=copy();project=result;connectionNotice='';commit(before);
   }else{
     if(target&&!result)connectionNotice='目标引脚无效或连接已存在';
     render();
   }
   return;
 }
 if(bendDrag){
   const d=bendDrag;bendDrag=null;
   const before=d.before.wires.find(w=>w.id===d.id)?.bends?.[d.index];
   const after=project.wires.find(w=>w.id===d.id)?.bends?.[d.index];
   if(before&&after&&(before.x!==after.x||before.y!==after.y))commit(d.before);
   return;
 }
 if(marquee){
   const box=marquee;marquee=null;
   if(box.active){
     const ids=componentsWithinRect(project,box.start,box.end);
     selectedIds=box.additive?new Set([...selectedIds,...ids]):new Set(ids);
     selection=selectedIds.size===1?[...selectedIds][0]:null;
     ignoredClick={x:e.clientX,y:e.clientY,until:e.timeStamp+200};
   }else if(!box.additive){selectedIds.clear();selection=null}
   render();return;
 }
 if(!drag)return;
 const d=drag;drag=null;
 const moved=d.ids.some(id=>{
   const before=d.before.parts.find(p=>p.id===id),after=project.parts.find(p=>p.id===id);
   return before&&after&&(before.x!==after.x||before.y!==after.y);
 });
 if(moved){
   project=d.ids.length===1?snapPartToBreadboard(project,d.ids[0]):reconcileInsertions(project);
   commit(d.before);
 }else render();
});
window.addEventListener('keydown',e=>{
 const t=e.target as HTMLElement;
 if(['INPUT','TEXTAREA'].includes(t.tagName))return;
 const command=e.ctrlKey||e.metaKey;
 if(command&&e.key.toLowerCase()==='a'){
   e.preventDefault();selectAllParts();
 }else if(command&&e.key.toLowerCase()==='z'){
   e.preventDefault();revert(e.shiftKey?redo:undo,e.shiftKey?undo:redo);
 }else if(e.key==='Escape'){
   wiring=null;endpointDrag=null;bendDrag=null;drag=null;marquee=null;
   selectedIds.clear();selection=null;connectionNotice='';render();
 }else if(e.key==='Delete'||e.key==='Backspace'){
   e.preventDefault();deleteSelection();
 }
});
// Persist the first demo or migrated workspace before browser tests and user edits.
save();
render();
