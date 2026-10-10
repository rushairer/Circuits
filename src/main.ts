import './style.css';
import { DEFAULT_WIRE_COLOR, WIRE_COLOR_PRESETS, wireColorForDigit, wireColorOptions } from './core/wire-colors.js';
import { insertWireWaypoint, moveWireWaypoint, removeWireWaypoint } from './core/wire-edit.js';
import { nearestOrthogonalSegment, slideOrthogonalSegment } from './core/wire-segments.js';
import { demo, validProject, parts, labels, pins, size, type Project, type Kind, type Part, type Endpoint } from './model.js';
import { evaluate } from './core/simulator.js';
import { compileUnoPreview, sampleUnoPreview, sampleUnoSerial, type UnoPreviewResult, type UnoSerialSnapshot } from './core/uno-preview.js';
import { analyzeGpioD13, type GpioD13Analysis } from './core/gpio-d13.js';
import { analyzeDC, type DcAnalysis } from './core/dc-analysis.js';
import { analyzeRC, type RcAnalysis, type RcSample } from './core/rc-transient.js';
import { analyzeRCNetwork, type RcNetworkAnalysis } from './core/rc-network.js';
import { assessRcConvergence, type RcConvergenceReport } from './core/rc-accuracy.js';
import { createScopeCapture, exportScopeCSV, type ScopeCapture } from './core/scope.js';
import { readRcVoltageProbe, readRcCurrentProbe } from './core/rc-probes.js';
import { renderScopePanel, updateScopePanel } from './ui/scope-panel.js';
import { composeCircuitLayers } from './ui/circuit-layers.js';
import { snap, pinWorld, wirePoints, wirePath, type Point, type WireDirection } from './core/geometry.js';
import { WORKSPACE_KEY, MAX_PROJECTS, migrateWorkspace, activeProject, saveCurrent, createProject, switchProject, deleteProject } from './core/storage.js';
import { blankProject } from './model.js';
import { createExample, exampleCatalog } from './core/examples.js';
import { zoomAt, panBy, fitCircuit } from './core/viewport.js';
import { translateComponents, removeComponents, rotateComponents, componentsWithinRect } from './core/selection.js';
import { appendConnection, reconnectEndpoint, nearestTerminal, identicalConnection, type TerminalHit } from './core/connections.js';
import { reconcileInsertions, snapPartToBreadboard, suggestPalettePosition } from './core/placement.js';
const app=document.querySelector<HTMLDivElement>('#app')!;
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const savedJSON=(key:string):unknown=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
let workspace=migrateWorkspace(savedJSON(WORKSPACE_KEY),savedJSON('circuits-project'));
let project:Project=reconcileInsertions(activeProject(workspace));
let simulationMode:'classic'|'nonlinear'|'rc'='classic';
let lastAnalysis:DcAnalysis|null=null;
let lastTransient:RcAnalysis|null=null;
let lastNetwork:RcNetworkAnalysis|null=null;
let rcConvergence:RcConvergenceReport|null=null;
let rcTimeIndex=0;
let rcWindowSeconds=0.5;
let rcTraceId='';
let lastScopeCapture:ScopeCapture|null=null;
let scopeOpen=false;
let scopeCapacitorId='';
let unoPreview:UnoPreviewResult|null=null;
let unoPreviewTimeMs=0;
let lastGpio:GpioD13Analysis|null=null;
let persistOK=true;
let showProjects=false;
let showExamples=false;
let selection:string|null=null, wiring:Endpoint|null=null, isRunning=false, search='',showCode=false, zoom=1,panX=0,panY=0;
let wiringBends:Point[]=[];
let wiringDirection:WireDirection='horizontal';
let wiringDirectionLocked=false;
let wiringDirectionInferred=false;
let wiringCursor:Point|null=null;
let wiringHover:TerminalHit|null=null;
let wireDrag:{from:Endpoint;clientX:number;clientY:number;pointerId:number;active:boolean}|null=null;
let selectedIds=new Set<string>();
let marquee:{start:Point;end:Point;screenX:number;screenY:number;active:boolean;additive:boolean}|null=null;
let gridEnabled=localStorage.getItem('circuits-grid')!=='off';
let spaceHeld=false;
let panDrag:{x:number;y:number;panX:number;panY:number}|null=null;
let bendDrag:{id:string;index:number;before:Project}|null=null;
let selectedBend:{id:string;index:number}|null=null;
let segmentDrag:{id:string;start:Point;screenX:number;screenY:number;pointerId:number;
 before:Project;active:boolean;index:number;routeIndex:number|null;changed:boolean}|null=null;
let endpointDrag:{id:string;side:'from'|'to';preview:Point}|null=null;
let ignoredClick:{x:number;y:number;until:number}|null=null;
let connectionNotice='';
let activeWireColor:string=DEFAULT_WIRE_COLOR;
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
function resetUnoPreview(){unoPreview=null;unoPreviewTimeMs=0;lastGpio=null;}
/** In-progress wires are UI-only; project JSON receives only completed connections. */
function clearWireDraft(){
 wiring=null;wiringBends=[];wiringCursor=null;wiringHover=null;wireDrag=null;
 wiringDirection='horizontal';wiringDirectionLocked=false;wiringDirectionInferred=false;
}
function openWorkspace(id:string){
 workspace=switchProject(workspace,id);
 project=reconcileInsertions(activeProject(workspace));
 selection=null;selectedBend=null;segmentDrag=null;selectedIds.clear();marquee=null;panDrag=null;clearWireDraft();drag=null;bendDrag=null;endpointDrag=null;showProjects=false;showExamples=false;showCode=false;isRunning=false;scopeOpen=false;scopeCapacitorId='';rcConvergence=null;resetUnoPreview();undo=[];redo=[];
 save();render();
}
function commit(before:Project){clearWireDraft();resetUnoPreview();rcConvergence=null;project=reconcileInsertions(project);undo.push(before);if(undo.length>50)undo.shift();redo=[];save();render()}
function revert(stack:Project[],other:Project[]){const prev=stack.pop();if(!prev)return;clearWireDraft();resetUnoPreview();rcConvergence=null;other.push(copy());project=prev;selection=null;selectedBend=null;segmentDrag=null;selectedIds.clear();marquee=null;save();render()}
const uid=()=>crypto.randomUUID().slice(0,8);
const pos=(e:Endpoint):[number,number]|null=>{
 const p=pinWorld(e,project.parts);return p?[p.x,p.y]:null;
};
function rcMeterReading(id:string){
 return lastScopeCapture?readRcVoltageProbe(project,lastScopeCapture,id,rcTimeIndex):null;
}
function rcAmmeterReading(id:string){
 return lastScopeCapture?readRcCurrentProbe(project,lastScopeCapture,id,rcTimeIndex):null;
}
function currentText(reading:{status:string;milliAmps:number|null}|null):string {
 if(!reading||reading.milliAmps===null)return '----';
 return reading.status==='overrange'?'OL':reading.milliAmps.toFixed(2);
}
function updateRcAmmeterReadouts(){
 if(!lastScopeCapture)return;
 for(const part of project.parts.filter(x=>x.kind==='ammeter')){
   const sample=rcAmmeterReading(part.id);
   const element=Array.from(app.querySelectorAll<SVGTextElement>('text[data-ammeter-id]'))
     .find(node=>node.getAttribute('data-ammeter-id')===part.id);
   if(element)element.textContent=currentText(sample);
   if(selection===part.id){
     const inspector=app.querySelector<HTMLElement>('#ammeter-inspector');
     if(inspector)inspector.textContent=sample?.milliAmps!==null&&sample?
       'RC 串联电流：'+sample.milliAmps.toFixed(3)+' mA · '+sample.reason:
       'RC 串联电流：—（'+(sample?.reason??'暂不可用')+'）';
   }
 }
}
function updateRcMeterReadouts(){
 if(!lastScopeCapture)return;
 for(const part of project.parts.filter(x=>x.kind==='multimeter')){
   const value=rcMeterReading(part.id);
   const label=value?.status==='measured'&&value.volts!==null?value.volts.toFixed(2):'----';
   const el=Array.from(app.querySelectorAll<SVGTextElement>('text[data-meter-id]'))
     .find(node=>node.getAttribute('data-meter-id')===part.id);
   if(el)el.textContent=label;
   if(selection===part.id){
     const inspector=app.querySelector<HTMLElement>('#rc-meter-inspector');
     if(inspector)inspector.textContent=value?.status==='measured'&&value.volts!==null?
       'RC 采样电压：'+value.volts.toFixed(3)+' V · 理想高阻表笔':
       'RC 采样电压：—（'+(value?.reason??'不可用')+'）';
   }
 }
}
function gpioSummaryMarkup():string {
 if(!lastGpio)return '';
 if(!lastGpio.ok)return '<p class="gpio-d13-warning">'+escape(lastGpio.reason)+'</p>';
 const readings=project.parts.filter(p=>p.kind==='led').map(p=>{
   const sample=lastGpio?.leds[p.id];
   if(!sample)return '';
   const label=sample.status==='overcurrent'?'过流 · 未视为正常发光':
     sample.status==='unpowered'?'未供电':
     sample.lit?'已点亮':'熄灭';
   return '<div class="gpio-reading" data-gpio-led-status="'+escape(p.id)+'"><span>LED '+
     escape(p.id)+'</span><strong>'+sample.currentMilliAmps.toFixed(2)+
     'mA · '+label+'</strong></div>';
 }).join('');
 const current=lastGpio.driverMilliAmps===null?'—':lastGpio.driverMilliAmps.toFixed(3)+'mA';
 return '<p>'+escape(lastGpio.reason)+'</p>'+
   '<div class="gpio-reading"><span>D13 驱动电流</span><strong id="gpio-drive-current">'+current+'</strong></div>'+
   readings+(lastGpio.warnings.length?'<p class="gpio-d13-warning">'+
      escape(lastGpio.warnings.join('；'))+'</p>':'')+
   '<small>仅为 5V/25Ω 输出级教学模型，灯亮由真实引脚网络计算；并非实际 AVR 芯片或 GPIO 额定值认证。</small>';
}
function serialText(view:UnoSerialSnapshot):string {
 const lines=view.lines.map(line=>'['+line.timeMs+' ms] '+line.text);
 if(view.pending)lines.push('[…ms] '+view.pending+' ▏');
 return lines.join('\n')||'（该时刻尚无串口输出）';
}
function unoSerialMarkup():string {
 if(!unoPreview?.ok)return '';
 const reading=sampleUnoSerial(unoPreview,unoPreviewTimeMs);
 if(!reading)return '';
 return '<section id="uno-serial-monitor" class="uno-serial-monitor" aria-label="教学串口监视器">'+
   '<div class="uno-serial-header"><strong>虚拟串口监视器 · '+reading.baudRate+' baud</strong>'+
   '<button type="button" data-action="uno-serial-export">导出 TXT</button></div>'+
   '<pre id="uno-serial-lines" role="log" aria-live="off">'+escape(serialText(reading))+'</pre>'+
   '<small id="uno-serial-status">'+(reading.truncated?'较早日志已截断，仅显示最近 40 行':'按时间光标展示 setup / loop 的确定性输出')+
   '；仅识别固定字符串与整数，不连接真实串口。</small></section>';
}
function unoPreviewMarkup():string {
 if(!unoPreview)return '';
 if(!unoPreview.ok)return '<section id="uno-preview" class="uno-preview-panel" role="status">'+
   '<strong>此草图暂不支持预览</strong><p>'+escape(unoPreview.reason)+'</p>'+
   '<small>不会执行任意 Arduino C++，也不会向浏览器注入代码。</small></section>';
 const frame=sampleUnoPreview(unoPreview,unoPreviewTimeMs);
 if(!frame)return '';
 return '<section id="uno-preview" class="uno-preview-panel" role="status">'+
   '<strong>Arduino Uno · D13 / 串口受限时序预览</strong>'+
   '<div class="uno-readouts"><span>引脚状态 <b id="uno-level" data-level="'+(!unoPreview.d13Configured?'UNCONFIGURED':frame.high?'HIGH':'LOW')+'">'+(!unoPreview.d13Configured?'未配置':frame.high?'HIGH':'LOW')+'</b></span>'+
   '<span>时间 <b id="uno-preview-time">'+frame.elapsedMs+' ms</b></span>'+
   '<span>第 <b id="uno-cycle">'+(frame.cycle+1)+'</b> 轮</span></div>'+
   '<label for="uno-time">仿真时间（0–5000ms）</label>'+
   '<input type="range" id="uno-time" min="0" max="5000" step="50" value="'+unoPreviewTimeMs+'" aria-label="D13 时序预览时间光标"/>'+
   '<small>循环周期 '+unoPreview.periodMs+'ms · '+unoPreview.statementCount+
     ' 条受支持语句。外接电路按电气连接计算，非完整 AVR/GPIO 硬件仿真。</small>'+
   (unoPreview.d13Configured?'<section id="gpio-external-status" class="gpio-external-status" aria-label="D13 外接 LED 仿真">'+gpioSummaryMarkup()+'</section>':'')+
   unoSerialMarkup()+'</section>';
}
function refreshUnoPreview(){
 if(!unoPreview?.ok)return;
 const frame=sampleUnoPreview(unoPreview,unoPreviewTimeMs);
 if(!frame)return;
 lastGpio=unoPreview.d13Configured?analyzeGpioD13(project,frame.high):null;
 const label=app.querySelector<HTMLElement>('#uno-level');
 if(label){label.textContent=!unoPreview.d13Configured?'未配置':frame.high?'HIGH':'LOW';label.dataset.level=!unoPreview.d13Configured?'UNCONFIGURED':frame.high?'HIGH':'LOW';}
 const time=app.querySelector<HTMLElement>('#uno-preview-time');
 if(time)time.textContent=frame.elapsedMs+' ms';
 const cycle=app.querySelector<HTMLElement>('#uno-cycle');
 if(cycle)cycle.textContent=String(frame.cycle+1);
 app.querySelectorAll<SVGCircleElement>('[data-uno-d13-led]').forEach(el=>
   el.setAttribute('fill',frame.high?'#ffca36':'#667f8b'));
 const serial=sampleUnoSerial(unoPreview,unoPreviewTimeMs);
 if(serial){
   const output=app.querySelector<HTMLElement>('#uno-serial-lines');
   if(output)output.textContent=serialText(serial);
   const status=app.querySelector<HTMLElement>('#uno-serial-status');
   if(status)status.textContent=(serial.truncated?'较早日志已截断，仅显示最近 40 行':'按时间光标展示 setup / loop 的确定性输出')+'；仅识别固定字符串与整数，不连接真实串口。';
 }
 const ext=app.querySelector<HTMLElement>('#gpio-external-status');
 if(ext)ext.innerHTML=gpioSummaryMarkup();
 app.querySelectorAll<SVGCircleElement>('[data-gpio-glow]').forEach(el=>{
   const id=el.getAttribute('data-gpio-glow')!;
   const lit=lastGpio?.ok&&lastGpio.leds[id]?.lit;
   el.setAttribute('opacity',lit?'0.28':'0');
 });
 const inspector=app.querySelector<HTMLElement>('#gpio-led-inspector');
 const selected=selection&&lastGpio?.ok?lastGpio.leds[selection]:null;
 if(inspector&&selected)inspector.textContent=
   'D13 电流：'+selected.currentMilliAmps.toFixed(3)+'mA · '+
   (selected.status==='overcurrent'?'过流':selected.lit?'点亮':'熄灭');
}
function art(c:Part){
 const [w,h]=size[c.kind];
 const probe=lastAnalysis?.meters[c.id];
 const rcProbe=c.kind==='multimeter'?rcMeterReading(c.id):null;
 const probeText=rcProbe?(rcProbe.status==='measured'&&rcProbe.volts!==null?rcProbe.volts.toFixed(2):'----'):
   (probe?.status==='measured'&&probe.volts!==null?probe.volts.toFixed(2):'----');
 const ampReading=c.kind==='ammeter'?
   (simulationMode==='rc'?rcAmmeterReading(c.id):simulationMode==='nonlinear'?lastAnalysis?.ammeters[c.id]:null):null;
 const ampText=currentText(ampReading??null);
 if(c.kind==='battery')return '<rect x="8" y="10" width="76" height="119" rx="12" fill="#303b43"/><rect x="8" y="10" width="76" height="32" rx="9" fill="#eca738"/><text x="46" y="86" font-size="25" text-anchor="middle" fill="white">9V</text><text x="70" y="42" fill="white">+</text><text x="70" y="108" fill="white">−</text>';
 if(c.kind==='resistor')return '<path d="M0 30H140" stroke="#b7a17d" stroke-width="5"/><rect x="36" y="13" width="68" height="35" rx="16" fill="#d7b68c" stroke="#bc936c"/><path d="M54 13v35m12-35v35m12-35v35" stroke="#9c542e" stroke-width="6"/><text x="70" y="9" font-size="13" text-anchor="middle" fill="#667988">'+(c.value??220)+'Ω</text>';
 if(c.kind==='led')return '<path d="M0 65H110" stroke="#b6c1c7" stroke-width="5"/><path d="M34 64V42a21 21 0 0 1 42 0v22z" fill="#ee525c"/><rect x="32" y="61" width="46" height="12" rx="4" fill="#d73b4a"/><path d="M45 42a11 11 0 0 1 12-12" stroke="#fff8" fill="none" stroke-width="4"/>';
 if(c.kind==='switch')return '<path d="M0 55H30M110 55H140" stroke="#a9b2bd" stroke-width="5"/><rect x="28" y="25" width="84" height="62" rx="9" fill="#485969"/><rect x="'+(c.closed?68:37)+'" y="32" width="38" height="46" rx="7" fill="#d1dbe0"/><text x="43" y="20" font-size="12" fill="#516779">'+(c.closed?'ON':'OFF')+'</text>';
 if(c.kind==='pushbutton')return '<path d="M0 65H28M82 65H110" stroke="#a7b0b9" stroke-width="5"/><rect x="23" y="26" width="65" height="65" rx="8" fill="#59646b"/><circle cx="55" cy="57" r="22" fill="#d96153"/><circle cx="55" cy="53" r="12" fill="#ea877e"/>';
 if(c.kind==='potentiometer')return '<path d="M0 90H34M86 90H120M60 75v33" stroke="#a6b4bb" stroke-width="4"/><circle cx="60" cy="54" r="42" fill="#2d8cbb"/><circle cx="60" cy="54" r="30" fill="#4dadd2"/><path d="M60 54L82 33" stroke="white" stroke-width="5"/>';
 if(c.kind==='capacitor')return '<path d="M0 79H30M64 79H95" stroke="#b2bbc1" stroke-width="5"/><rect x="29" y="23" width="37" height="75" rx="12" fill="#278ac1"/><path d="M40 31v56" stroke="#c6ebfd" stroke-width="6"/><text x="47" y="111" fill="#466775" font-size="11" text-anchor="middle">'+(c.value??100)+'µF</text>';
 if(c.kind==='buzzer')return '<path d="M0 90H29M81 90H110" stroke="#bac3ca" stroke-width="5"/><rect x="21" y="20" width="70" height="79" rx="12" fill="#323b46"/><circle cx="55" cy="56" r="31" fill="#151f29" stroke="#68717d" stroke-width="5"/><circle cx="55" cy="56" r="9" fill="#46515f"/>';
 if(c.kind==='multimeter')return '<rect x="8" y="4" width="129" height="152" rx="13" fill="#e1ac34" stroke="#be8427" stroke-width="3"/><rect x="25" y="23" width="95" height="48" rx="5" fill="#a7bfba"/><text data-meter-id="'+c.id+'" x="116" y="57" font-size="22" text-anchor="end" font-family="monospace" fill="#27493e">'+probeText+'</text><circle cx="73" cy="112" r="27" fill="#323940"/><path d="M73 112v-18" stroke="white" stroke-width="4"/>';
 if(c.kind==='ammeter')return '<rect x="8" y="4" width="129" height="152" rx="13" fill="#437e92" stroke="#295c70" stroke-width="3"/>'+
   '<rect x="25" y="23" width="95" height="48" rx="5" fill="#bcd8d8"/>'+
   '<text data-ammeter-id="'+c.id+'" x="115" y="56" font-size="21" text-anchor="end" font-family="monospace" fill="#173c46">'+ampText+'</text>'+
   '<text x="115" y="86" text-anchor="end" font-size="12" fill="#f3fbfc">mA · SHUNT 0.1Ω</text>'+
   '<circle cx="73" cy="115" r="27" fill="#203f4d"/><text x="73" y="124" text-anchor="middle" font-size="26" font-weight="bold" fill="#f9f8ec">A</text>';
 if(c.kind==='servo')return '<path d="M0 75H25M0 95H25M0 115H25" stroke="#bda373" stroke-width="4"/><rect x="23" y="37" width="123" height="77" rx="9" fill="#2b74aa"/><circle cx="98" cy="37" r="23" fill="#d7dde1"/><path d="M98 37V5" stroke="#f3f4f4" stroke-width="11"/>';
 if(c.kind==='arduino')return '<rect x="4" y="4" width="196" height="164" rx="12" fill="#2276aa" stroke="#125983" stroke-width="3"/><rect x="25" y="55" width="78" height="45" rx="4" fill="#263e51"/><rect x="4" y="45" width="35" height="34" rx="4" fill="#c1cfd5"/><rect x="40" y="126" width="33" height="39" rx="4" fill="#26313a"/><text x="103" y="38" fill="white" font-size="24" font-weight="bold">UNO</text><text x="90" y="122" fill="#e4f5ff" font-size="14">ARDUINO</text>'+Array.from({length:13},(_,i)=>'<rect x="'+(30+i*13)+'" y="2" width="8" height="9" fill="#243745"/>').join('')+
   '<circle data-uno-d13-led cx="160" cy="52" r="9" fill="'+
     (c.id!=='sample'&&unoPreview?.ok&&sampleUnoPreview(unoPreview,unoPreviewTimeMs)?.high?'#ffca36':'#667f8b')+
     '" stroke="#d6ecf3" stroke-width="2"/>'+
   '<text x="160" y="75" text-anchor="middle" font-size="10" fill="#fff">D13</text>';
 return '<rect x="2" y="2" width="'+(w-4)+'" height="'+(h-4)+'" rx="9" fill="#f6f7f6" stroke="#bdc9cc" stroke-width="3"/><path d="M18 35h404 M18 167h404" stroke="#e06a6a" stroke-width="2"/><path d="M18 48h404 M18 180h404" stroke="#5d9fd4" stroke-width="2"/>'+Array.from({length:22},(_,x)=>Array.from({length:10},(_,y)=>'<circle cx="'+(28+x*18)+'" cy="'+(67+y*9)+'" r="2.8" fill="#89959b"/>').join('')).join('') }
function canvas(){
 const wireRoutes=[...project.wires].sort((a,b)=>Number(a.id===selection)-Number(b.id===selection)).map(w=>{
    const coords=wirePoints(w,project.parts);
    if(!coords)return null;
    const selected=selection===w.id;
    if(endpointDrag?.id===w.id){
      const index=endpointDrag.side==='from'?0:coords.length-1;
      coords[index]=endpointDrag.preview;
    }
    const d=wirePath(coords,Boolean(w.bends?.length),w.routing);
    return {
      hit:'<path class="wire-hit" data-wire="'+w.id+'" d="'+d+'" fill="none" stroke="transparent" stroke-width="17"/>',
      visible:'<path class="wire" data-wire="'+w.id+'" d="'+d+'" stroke="'+w.color+'" stroke-width="'+(selected?8:5)+'" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    };
  }).filter((w):w is {hit:string;visible:string}=>w!==null);
  // All oversized invisible hit targets go BELOW all visible conductors, not
  // interleaved wire-by-wire. A neighboring wire's broad hit region must not
  // intercept a click directly on another visible conductor stroke.
  const wires='<g data-wire-sublayer="hit-targets">'+wireRoutes.map(w=>w.hit).join('')+'</g>'+
    '<g data-wire-sublayer="conductors">'+wireRoutes.map(w=>w.visible).join('')+'</g>';
  const bendHandles=project.wires.filter(w=>w.id===selection).map(w=>
    (w.bends??[]).map((p,i)=>'<circle class="bend-handle" data-wire="'+w.id+'" data-bend-index="'+i+'" data-selected="'+(selectedBend?.id===w.id&&selectedBend.index===i)+'" cx="'+p.x+'" cy="'+p.y+'" r="8" fill="#ffffff" stroke="#17ad61" stroke-width="3" tabindex="0" role="button" aria-label="导线折点 '+(i+1)+'：按 Delete 删除"/>').join('')
  ).join('');
  const readings=isRunning&&simulationMode==='classic'?evaluate(project):null;
 const insertedPins=new Set((project.insertions??[]).flatMap(x=>[x.componentId+'::'+x.pinId,x.boardId+'::'+x.holeId]));
 // Breadboards are the substrate: draw them behind inserted resistors and LEDs.
 const renderPart=(c:Part,socketsOnly=false):string=>{
    const [w,h]=size[c.kind],board=c.kind==='breadboard';
    const glow=c.kind==='led'&&isRunning&&(simulationMode==='classic'?readings?.lit:lastAnalysis?.leds[c.id]?.lit)?
      '<circle cx="54" cy="49" r="52" fill="#ff7a74" opacity=".2"/>':'';
    const gpioGlow=c.kind==='led'&&unoPreview?.ok?
      '<circle data-gpio-glow="'+c.id+'" cx="54" cy="49" r="52" fill="#ff7a74" opacity="'+
      (lastGpio?.ok&&lastGpio.leds[c.id]?.lit?'0.28':'0')+'"/>':'';
    // Dense board rows are spaced 9 world units: a broad hit halo would
    // cover all conductor paths on the surface. Board art itself uses
    // nearby-terminal fallback; only the real hole centers capture above wires.
    const pinsSvg=board&&!socketsOnly?'':Object.entries(pins[c.kind])
      .filter(([name])=>!board||(name!=='plus'&&name!=='minus'))
      .map(([name,p])=>{
        const inserted=insertedPins.has(c.id+'::'+name);
        return '<circle class="pin-hit" data-part="'+c.id+'" data-pin="'+name+'" cx="'+p[0]+'" cy="'+p[1]+'" r="'+(board?5.25:13)+'" fill="transparent" pointer-events="all" aria-hidden="true"/>'+
          '<circle class="pin" data-part="'+c.id+'" data-pin="'+name+'" cx="'+p[0]+'" cy="'+p[1]+'" r="'+(board?4.4:7)+'" fill="'+(board?'transparent':inserted?'#19bd89':'#e6c08a')+'" stroke="'+(inserted?'#057d62':board?'#b2c4cb':'#a58142')+'" stroke-width="'+(board?1.2:2)+'"><title>'+name+(inserted?' · 已插入':'')+'</title></circle>';
      }).join('');
    const layerClass=socketsOnly?'breadboard-sockets':'item '+(selectedIds.has(c.id)?'selected':'');
    const accessibility=socketsOnly?'':' tabindex="0" role="button" aria-label="'+labels[c.kind]+' '+c.id+'" aria-pressed="'+selectedIds.has(c.id)+'"';
    return '<g class="'+layerClass+'" data-part="'+c.id+'"'+accessibility+
      ' transform="translate('+c.x+' '+c.y+')"><g transform="rotate('+c.rotation+' '+w/2+' '+h/2+')">'+
      (socketsOnly?'':glow+gpioGlow+art(c))+pinsSvg+'</g></g>';
  };
  const boards=project.parts.filter(c=>c.kind==='breadboard');
  const substrate=boards.map(c=>renderPart(c)).join('');
  const boardSockets=boards.map(c=>renderPart(c,true)).join('');
  const components=project.parts.filter(c=>c.kind!=='breadboard').map(c=>renderPart(c)).join('');
  const wireSource=wiring&&pinWorld(wiring,project.parts);
 const wireEnd=wiringHover?.point??wiringCursor??wireSource;
 const endLabel=wiringHover?.endpoint.pinId??'';
 const firstLeg=wireSource&&(wiringBends[0]??wireEnd);
 const firstCorner=wireSource&&firstLeg?(wiringDirection==='horizontal'?
   {x:firstLeg.x,y:wireSource.y}:{x:wireSource.x,y:firstLeg.y}):null;
 const draftWire=wireSource&&wireEnd?
   '<g id="wire-preview" aria-hidden="true" pointer-events="none">'+
   '<line id="wire-align-guide" class="wire-align-guide" x1="'+(wiringDirection==='horizontal'?wireEnd.x:0)+'" y1="'+(wiringDirection==='horizontal'?-500:wireEnd.y)+'" x2="'+(wiringDirection==='horizontal'?wireEnd.x:1100)+'" y2="'+(wiringDirection==='horizontal'?1500:wireEnd.y)+'"/>'+
   '<path id="wire-preview-path" class="wire-preview-path" stroke="'+activeWireColor+'" d="'+wirePath([wireSource,...wiringBends,wireEnd],true,wiringDirection)+'"/>'+
   '<circle class="wire-preview-source" cx="'+wireSource.x+'" cy="'+wireSource.y+'" r="9" style="stroke:'+activeWireColor+'"/>'+
   wiringBends.map(p=>'<circle class="wire-preview-bend" cx="'+p.x+'" cy="'+p.y+'" r="5"/>').join('')+
   '<circle id="wire-direction-corner" class="wire-preview-corner" cx="'+firstCorner!.x+'" cy="'+firstCorner!.y+'" r="4"/>'+
   '<rect id="wire-preview-target" class="wire-preview-target" x="'+(wireEnd.x-7)+'" y="'+(wireEnd.y-7)+'" width="14" height="14" rx="2" opacity="'+(wiringHover?'1':'0')+'" data-valid="'+(wiringHover&&validWireTarget(wiring!,wiringHover.endpoint)?'true':'false')+'"/>'+
   '<g id="wire-target-label" class="wire-target-label" transform="translate('+(wireEnd.x+12)+' '+(wireEnd.y-16)+')" opacity="'+(wiringHover?'1':'0')+'"><rect x="0" y="-15" width="'+Math.max(48,endLabel.length*8+12)+'" height="22" rx="3"/><text x="7" y="0">'+escape(endLabel)+'</text></g>'+
   '</g>':'';
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
 const hoverMarkup='<g id="pin-hover" aria-hidden="true" pointer-events="none" opacity="0"><rect x="-6" y="-6" width="12" height="12" rx="2"/>'+
    '<g transform="translate(13 -13)"><rect id="pin-hover-backdrop" x="0" y="-14" width="50" height="20" rx="2"/>'+
    '<text id="pin-hover-label" x="6" y="0"></text></g></g>';
  const layers=composeCircuitLayers({
    substrate,wires,'board-sockets':boardSockets,components,
    'wire-controls':bendHandles+terminalHandles,
    overlays:marqueeMarkup+draftWire+hoverMarkup
  });
  return '<svg id="board" viewBox="0 0 1100 800"><defs><pattern id="dot" width="21" height="21" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#c5cfd3"/></pattern></defs><rect width="1100" height="800" fill="#f3f5f6"/><rect width="1100" height="800" fill="url(#dot)"/><g id="scene" transform="translate('+panX+' '+panY+') scale('+zoom+')">'+layers+'</g></svg>';
}

  function refreshScene(){
 const original=app.querySelector('#scene');
 if(!original)return;
 const wrapper=document.createElement('div');
 wrapper.innerHTML=canvas();
 const latest=wrapper.querySelector('#scene');
 if(latest)original.innerHTML=latest.innerHTML;
}
function fitView(){
 const next=fitCircuit(project.parts,project.wires);
 zoom=next.zoom;panX=next.panX;panY=next.panY;
 render();
}
function changeZoom(factor:number){
 const view=zoomAt({zoom,panX,panY},{x:550,y:400},zoom*factor);
 zoom=view.zoom;panX=view.panX;panY=view.panY;render();
}
function canvasPoint(clientX:number,clientY:number):Point|null {
 const svg=app.querySelector<SVGSVGElement>('#board'),matrix=svg?.getScreenCTM();
 if(!svg||!matrix)return null;
 const point=svg.createSVGPoint();
 point.x=clientX;point.y=clientY;
 const c=point.matrixTransform(matrix.inverse());
 return {x:(c.x-panX)/zoom,y:(c.y-panY)/zoom};
}
/** Screen-space radius gives consistent snapping at every camera zoom. */
function wireRadius(pixels=17):number {
 const matrix=app.querySelector<SVGGElement>('#scene')?.getScreenCTM();
 const scale=matrix?Math.hypot(matrix.a,matrix.b):0;
 return scale>0?pixels/scale:pixels;
}
/** Board artwork may be clicked near a hole; choose the nearest real pin of that part. */
function pinFromPointer(target:Element,x:number,y:number):TerminalHit|null {
 const component=target.closest<SVGGElement>('.item[data-part], .breadboard-sockets[data-part]');
 const pin=target.closest<SVGElement>('[data-pin]');
 if(!component||!component.dataset.part)return null;
 const part=project.parts.find(p=>p.id===component.dataset.part);
 if(!part||(!pin&&part.kind!=='breadboard'))return null;
 const point=canvasPoint(x,y);
 if(!point)return null;
 return nearestTerminal(project,point,wireRadius(pin?17:9),undefined,part.id);
}
function validWireTarget(from:Endpoint,to:Endpoint):boolean {
 if(from.componentId===to.componentId&&from.pinId===to.pinId)return false;
 const proposed={id:'preview',from,to,color:activeWireColor};
 return !project.wires.some(w=>identicalConnection(w,proposed));
}
/** Mousemove updates the SVG guide without recreating all breadboard pins. */
/** Idle hover highlights the actual terminal, not a visual wire crossing. */
function updatePinHover(target:Element,clientX:number,clientY:number){
 const indicator=app.querySelector<SVGGElement>('#pin-hover');
 if(!indicator)return;
 const hit=pinFromPointer(target,clientX,clientY);
 if(!hit){indicator.setAttribute('opacity','0');return}
 indicator.setAttribute('opacity','1');
 indicator.setAttribute('transform','translate('+hit.point.x+' '+hit.point.y+')');
 const label=app.querySelector<SVGTextElement>('#pin-hover-label');
 const background=app.querySelector<SVGRectElement>('#pin-hover-backdrop');
 if(label)label.textContent=hit.endpoint.pinId;
 if(background)background.setAttribute('width',String(Math.max(48,hit.endpoint.pinId.length*8+12)));
}
function updateWireCursor(point:Point){
 if(!wiring)return;
 wiringCursor=point;
 wiringHover=nearestTerminal(project,point,wireRadius());
 const from=pinWorld(wiring,project.parts);
 if(!from)return;
 const previous=wiringBends.at(-1)??from;
 const dx=point.x-previous.x,dy=point.y-previous.y;
 // Choose the initial leg direction from the first decisive pointer motion.
 if(!wiringDirectionLocked&&!wiringDirectionInferred&&Math.hypot(dx,dy)>=wireRadius(18)){
   wiringDirection=Math.abs(dx)>=Math.abs(dy)?'horizontal':'vertical';
   wiringDirectionInferred=true;
   const label=app.querySelector<HTMLElement>('[data-action="wire-direction"]');
   if(label)label.textContent='↳ '+(wiringDirection==='horizontal'?'横向优先':'纵向优先')+' · 点击切换';
 }
 const end=wiringHover?.point??point;
 const path=app.querySelector<SVGPathElement>('#wire-preview-path');
 if(path)path.setAttribute('d',wirePath([from,...wiringBends,end],true,wiringDirection));
 const firstLeg=wiringBends[0]??end;
 const corner=wiringDirection==='horizontal'?{x:firstLeg.x,y:from.y}:{x:from.x,y:firstLeg.y};
 const cornerNode=app.querySelector<SVGCircleElement>('#wire-direction-corner');
 if(cornerNode){cornerNode.setAttribute('cx',String(corner.x));cornerNode.setAttribute('cy',String(corner.y));}
 const ring=app.querySelector<SVGRectElement>('#wire-preview-target');
 if(ring){
   ring.setAttribute('x',String(end.x-7));ring.setAttribute('y',String(end.y-7));
   ring.setAttribute('opacity',wiringHover?'1':'0');
   ring.setAttribute('data-valid',wiringHover&&validWireTarget(wiring,wiringHover.endpoint)?'true':'false');
   if(wiringHover){
     ring.setAttribute('data-target-part',wiringHover.endpoint.componentId);
     ring.setAttribute('data-target-pin',wiringHover.endpoint.pinId);
   }else{
     ring.removeAttribute('data-target-part');ring.removeAttribute('data-target-pin');
   }
 }
 const guide=app.querySelector<SVGLineElement>('#wire-align-guide');
 if(guide){
   const horizontal=wiringDirection==='horizontal';
   guide.setAttribute('x1',String(horizontal?end.x:0));
   guide.setAttribute('x2',String(horizontal?end.x:1100));
   guide.setAttribute('y1',String(horizontal?-500:end.y));
   guide.setAttribute('y2',String(horizontal?1500:end.y));
 }
 const label=app.querySelector<SVGGElement>('#wire-target-label');
 if(label){
   label.setAttribute('opacity',wiringHover?'1':'0');
   label.setAttribute('transform','translate('+(end.x+12)+' '+(end.y-16)+')');
   const text=label.querySelector<SVGTextElement>('text');
   const bg=label.querySelector<SVGRectElement>('rect');
   if(text)text.textContent=wiringHover?.endpoint.pinId??'';
   if(bg)bg.setAttribute('width',String(Math.max(48,(wiringHover?.endpoint.pinId.length??0)*8+12)));
 }
}
function addBend(wireId:string,point:Point){
 const w=project.wires.find(w=>w.id===wireId);
 if(!w|| (w.bends?.length??0)>=32)return;
 const before=copy();
 const inserted=insertWireWaypoint(project,wireId,point,gridEnabled?10:null);
 if(!inserted)return;
 project=inserted.project;selection=w.id;
 selectedBend={id:w.id,index:inserted.index};
 commit(before);
}
function side(){
 if(showExamples){
   const cards=exampleCatalog.map(item=>
     '<button class="example-card" data-load-example="'+item.id+'"><strong>'+escape(item.title)+'</strong><small>'+escape(item.description)+'</small></button>'
   ).join('');
   return '<h2>示例电路 · '+exampleCatalog.length+' 个</h2><div class="field"><p>从示例创建独立的新工程，不会覆盖当前电路；自动匹配非线性 DC 或 RC 暂态模式。</p><button data-action="parts">返回元件库</button></div><div class="example-list">'+cards+'</div>';
 }
 if(showProjects){
   const rows=[...workspace.slots].sort((a,b)=>b.updatedAt-a.updatedAt).map(slot=>
     '<div class="project-row"><button class="project-open" data-open-project="'+slot.id+'"><strong>'+escape(slot.project.name)+'</strong><small>'+slot.project.parts.length+' 个元件 · '+slot.project.wires.length+' 根导线'+(slot.id===workspace.activeId?' · 当前':'')+'</small></button><button class="project-delete" aria-label="删除 '+escape(slot.project.name)+'" title="删除工程" data-delete-project="'+slot.id+'" '+(workspace.slots.length===1?'disabled':'')+'>×</button></div>'
   ).join('');
   return '<h2>我的电路 · '+workspace.slots.length+'/'+MAX_PROJECTS+'</h2><div class="field"><p>工程保存在当前浏览器；切换不会覆盖此前的工程。建议定期导出 JSON 备份。</p><button data-action="new">＋ 新建电路</button><button data-action="duplicate">复制当前工程</button><button data-action="projects">返回编辑器</button></div><div class="project-collection">'+rows+'</div>';
 }
 if(selectedIds.size>1&&!showCode)return '<h2>已选中 '+selectedIds.size+' 个元件</h2><div class="field"><p>拖动任意已选中元件可整体移动，所有引脚接线会自动跟随。</p><p>按住 Shift 单击添加或移除选中；在空白画布拖动可框选。</p><button data-action="rotate">分别旋转 90°</button><button data-action="delete">删除所选元件</button><button data-action="parts">取消选择</button></div>';
 const chosenWire=project.wires.find(w=>w.id===selection);
 if(chosenWire&&!showCode)return '<h2>导线属性</h2><div class="field"><p>起点：'+escape(chosenWire.from.componentId)+' / '+escape(chosenWire.from.pinId)+'</p><p>终点：'+escape(chosenWire.to.componentId)+' / '+escape(chosenWire.to.pinId)+'</p><label for="wire-color">导线颜色</label><input id="wire-color" type="color" value="'+chosenWire.color+'"/><p>折点 '+(chosenWire.bends?.length??0)+' 个。拖横线可上下平移，拖竖线可左右平移，线段两端仍接在真实引脚上；双击导线添加折点，圆形折点手柄可拖动。</p><button data-action="wire-flip-direction" aria-label="切换已选导线的正交走线方向">↳ '+(chosenWire.routing?('走线：'+(chosenWire.routing==='horizontal'?'横向优先':'纵向优先')+' · 点击切换'):'改为直角走线 · 横向优先')+'</button><button data-action="wire-add-bend">＋ 添加折点</button><button data-action="wire-reset-bends">清除手动折点</button><p>编辑颜色和折点均不改变电气连接。</p><button data-action="delete">删除导线</button><button data-action="parts">返回元件库</button></div>';
 if(showCode)return '<h2>Arduino 代码 · 实验预览</h2><div class="field"><p>代码可继续编辑和导出。受限 D13 Blink 可按接线驱动外部 LED，串口白名单支持字面量输出及最多 16 次的静态 for 循环；不编译通用 C++ 或模拟完整 AVR。</p><textarea id="code" maxlength="300000">'+escape(project.code)+'</textarea><button data-action="uno-preview-run">▶ 解析并预览 Arduino</button><button data-action="uno-preview-stop" '+(!unoPreview?'disabled':'')+'>关闭预览</button><button data-action="download-code">下载 .ino</button>'+unoPreviewMarkup()+'<button data-action="code">返回元件库</button></div>';
 const c=project.parts.find(p=>p.id===selection);
 const ledReading=c?.kind==='led'?lastAnalysis?.leds[c.id]:null;
 const meterReading=c?.kind==='multimeter'?lastAnalysis?.meters[c.id]:null;
 const rcMeter=c?.kind==='multimeter'?rcMeterReading(c.id):null;
 const rcAmp=c?.kind==='ammeter'?rcAmmeterReading(c.id):null;
 const dcAmp=c?.kind==='ammeter'?lastAnalysis?.ammeters[c.id]:null;
 const gpioLed=c?.kind==='led'&&lastGpio?.ok?lastGpio.leds[c.id]:null;
 const rcValue=c?.kind==='capacitor'&&lastTransient?.ok&&lastTransient.capacitorId===c.id?
   lastTransient.samples[rcTimeIndex]:null;
 const networkValue=c?.kind==='capacitor'&&lastNetwork?.ok?
   lastNetwork.samples[rcTimeIndex]?.capacitors[c.id]:null;
 if(c)return '<h2>属性 · '+labels[c.kind]+'</h2><div class="field"><p>元件：'+labels[c.kind]+'</p>'+(c.kind==='resistor'||c.kind==='battery'||c.kind==='capacitor'?'<label>数值 ('+(c.kind==='resistor'?'Ω':c.kind==='capacitor'?'µF':'V')+')</label><input id="value" type="number" min="'+(c.kind==='capacitor'?'0.001':'1')+'" step="any" value="'+(c.value??(c.kind==='capacitor'?100:1))+'"/>':'')+(c.kind==='capacitor'?'<label>初始电压（V）</label><input id="rc-initial" type="number" min="-1000" max="1000" step="any" value="'+(c.initialVolts??0)+'"/><small>按 t=0 初始状态计算，不模拟电路的历史充电过程。</small>':'')+'<p>坐标 '+Math.round(c.x)+', '+Math.round(c.y)+' · 旋转 '+c.rotation+'°</p>'+(ledReading?'<p>非线性 LED：'+(ledReading.status==='overcurrent'?'过流（超出模型适用范围）':ledReading.status==='unpowered'?'未供电':ledReading.currentMilliAmps.toFixed(2)+' mA · '+ledReading.forwardVolts?.toFixed(2)+' V')+'</p>':'')+(gpioLed?'<p id="gpio-led-inspector">D13 电流：'+gpioLed.currentMilliAmps.toFixed(3)+'mA · '+(gpioLed.status==='overcurrent'?'过流':gpioLed.lit?'点亮':'熄灭')+'</p>':'')+(meterReading?'<p>DC 电压读数：'+(meterReading.status==='measured'&&meterReading.volts!==null?meterReading.volts.toFixed(2)+' V':'—（表笔未连至已求解网络）')+'</p>':'')+(rcMeter?'<p id="rc-meter-inspector">RC 采样电压：'+(rcMeter.status==='measured'&&rcMeter.volts!==null?rcMeter.volts.toFixed(3)+' V · 理想高阻表笔':'—（'+rcMeter.reason+'）')+'</p>':'')+(rcValue?'<p>RC 当前采样：'+rcValue.voltageVolts.toFixed(3)+' V · '+rcValue.currentMilliAmps.toFixed(3)+' mA</p>':'')+(networkValue?'<p id="rc-network-inspector">多电容当前采样：'+networkValue.voltageVolts.toFixed(3)+' V · '+(networkValue.currentMilliAmps===null?'未估算':networkValue.currentMilliAmps.toFixed(3)+' mA')+'</p>':'')+(c.kind==='led'||c.kind==='resistor'?'<p>面包板接触 '+(project.insertions??[]).filter(i=>i.componentId===c.id).length+'/2：移动元件，让引脚靠近插孔即可自动吸附。</p>':'')+(c.kind==='switch'?'<label for="switch-contact">闭合接触电阻（Ω）</label><input id="switch-contact" type="number" min="0" max="1000000" step="any" value="'+(c.contactOhms??0)+'"/><small>0Ω 为原来的理想闭合开关；可设置 0.1–1,000,000Ω。开路仍不导通。状态改变从 t=0 重新计算。</small><button data-action="toggle-switch">'+(c.closed?'断开开关':'闭合开关')+'</button>':'')+
   (c.kind==='ammeter'?'<p id="ammeter-inspector">'+
     (simulationMode==='rc'?(rcAmp?.milliAmps!==null&&rcAmp?
       'RC 串联电流：'+rcAmp.milliAmps.toFixed(3)+' mA · '+rcAmp.reason:
       'RC 串联电流：—（'+(rcAmp?.reason??'暂不可用')+'）'):
      simulationMode==='nonlinear'?(dcAmp?.milliAmps!==null&&dcAmp?
       '非线性 DC 串联电流：'+dcAmp.milliAmps.toFixed(3)+' mA'+(dcAmp.status==='overrange'?'（超过教学量程）':''):
       '尚未获得有效电流读数'):
       '请切换到非线性 DC 或 RC 暂态模式')+
     '</p><p>本电流表通过 0.1Ω 分流电阻串入回路，正端流向负端为正电流；超过 ±200mA 会提示超量程，不模拟保险丝损坏。不可并接替代电压表。</p>':'') +(c.kind==='capacitor'?'<p>RC 暂态支持单电容解析及 2–6 只电容线性数值积分；非线性/电感未模拟。</p>':'')+(!['battery','resistor','led','breadboard','switch','capacitor','multimeter','ammeter'].includes(c.kind)?'<p>该元件仅支持可视化与接线，暂未接入电气仿真。</p>':'')+'<button data-action="rotate">旋转 90°</button><button data-action="delete">删除元件</button><button data-action="parts">返回元件库</button></div>';
 return '<h2>▦ 组件库</h2><div class="search"><input id="search" placeholder="搜索组件..." value="'+escape(search)+'"/></div><div class="parts">'+parts.filter(k=>labels[k].toLowerCase().includes(search.toLowerCase())).map(kind=>'<button class="part" draggable="true" data-kind="'+kind+'"><svg viewBox="0 0 '+size[kind][0]+' '+size[kind][1]+'">'+art({kind,id:'sample',x:0,y:0,rotation:0})+'</svg>'+labels[kind]+'</button>').join('')+'</div><div class="field"><p>从引脚拖线到目标引脚；单击空白增加转角，拖动已有线段可垂直于该线段调整走线。默认绿色；数字键 0–9 改色，R 旋转元件。</p></div>'}
function rcBounds(samples:readonly RcSample[]){
 const values=samples.map(p=>p.voltageVolts),minimum=Math.min(...values),maximum=Math.max(...values);
 const pad=Math.max(0.25,(maximum-minimum)*0.1);
 return {low:minimum-pad,high:maximum+pad};
}
function rcScreen(sample:RcSample,index:number,bounds:{low:number;high:number}){
 return {x:38+340*index/100,y:158-125*(sample.voltageVolts-bounds.low)/(bounds.high-bounds.low)};
}
function rcPanel(analysis:RcAnalysis):string {
 if(!analysis.ok)return '<section class="rc-panel" role="status"><h3>RC 暂态 · 无法分析</h3><p class="rc-warning">'+escape(analysis.reason)+'</p><small>仅支持一个电容、理想电阻网络及零或一个电池。</small></section>';
 const samples=analysis.samples,bounds=rcBounds(samples);
 const points=samples.map((sample,index)=>{const xy=rcScreen(sample,index,bounds);return xy.x.toFixed(2)+','+xy.y.toFixed(2)}).join(' ');
 const idx=Math.max(0,Math.min(samples.length-1,rcTimeIndex)),sample=samples[idx],cursor=rcScreen(sample,idx,bounds);
 return '<section class="rc-panel" aria-label="RC 电容暂态波形"><h3>RC 暂态 · 解析波形</h3>'+
  '<p>R<sub>th</sub> '+analysis.resistanceOhms!.toFixed(2)+' Ω · C '+analysis.capacitanceMicrofarads!.toFixed(3)+' µF<br>τ '+analysis.tauSeconds!.toPrecision(4)+' s · 稳态 '+analysis.steadyVolts!.toFixed(2)+' V</p>'+
  '<svg class="rc-plot" role="img" aria-label="电容两端电压随时间变化" viewBox="0 0 420 190">'+
  '<path d="M38 24V158H378" fill="none" stroke="#8eaaaf" stroke-width="1.5"/>'+
  '<line x1="38" y1="92" x2="378" y2="92" stroke="#d5e3e5" stroke-dasharray="5 5"/>'+
  '<polyline class="rc-curve" fill="none" stroke="#008f87" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" points="'+points+'"/>'+
  '<circle id="rc-marker" cx="'+cursor.x.toFixed(2)+'" cy="'+cursor.y.toFixed(2)+'" r="5" fill="#f9a23d" stroke="#fff" stroke-width="2"/>'+
  '<text x="37" y="15" font-size="12" fill="#4c6671">'+bounds.high.toFixed(2)+' V</text>'+
  '<text x="37" y="179" font-size="12" fill="#4c6671">'+bounds.low.toFixed(2)+' V</text>'+
  '<text x="378" y="179" font-size="12" fill="#4c6671" text-anchor="end">'+(5*analysis.tauSeconds!).toPrecision(3)+' s</text></svg>'+
  '<label for="rc-time">采样时刻 · <span id="rc-time-value">'+sample.timeSeconds.toFixed(3)+'</span> s</label>'+
  '<input id="rc-time" type="range" min="0" max="100" step="1" value="'+idx+'" aria-label="选择 RC 采样时刻"/>'+
  '<div class="rc-values"><span>电容电压 <strong id="rc-voltage-value">'+sample.voltageVolts.toFixed(2)+' V</strong></span>'+
  '<span>电容电流 <strong id="rc-current-value">'+sample.currentMilliAmps.toFixed(3)+' mA</strong></span></div>'+
  '<small>波形为 0–5τ 的解析采样，不代表 MCU/示波器实时运行，也不适用于非线性器件。</small></section>';
}

function networkPoint(value:number,i:number,bounds:{low:number;high:number}){
 return {x:38+340*i/100,y:158-125*(value-bounds.low)/(bounds.high-bounds.low)};
}
function networkBounds(analysis:RcNetworkAnalysis,id:string){
 const values=analysis.samples.map(s=>s.capacitors[id].voltageVolts);
 const min=Math.min(...values),max=Math.max(...values),pad=Math.max(0.25,(max-min)*0.1);
 return {low:min-pad,high:max+pad};
}
function rcNetworkPanel(analysis:RcNetworkAnalysis):string {
 if(!analysis.ok)return '<section class="rc-panel rc-network-panel" role="status"><h3>多电容 RC · 无法求解</h3><p class="rc-warning">'+escape(analysis.reason)+'</p><small>不会显示虚构的波形。仅支持 2–6 只理想电容与线性电阻。</small></section>';
 const id=analysis.capacitorIds.includes(rcTraceId)?rcTraceId:analysis.capacitorIds[0];
 rcTraceId=id;
 const idx=Math.max(0,Math.min(100,rcTimeIndex)),data=analysis.samples;
 const bounds=networkBounds(analysis,id),point=data[idx].capacitors[id];
 const positions=data.map((row,i)=>{
   const xy=networkPoint(row.capacitors[id].voltageVolts,i,bounds);
   return xy.x.toFixed(2)+','+xy.y.toFixed(2);
 }).join(' ');
 const cursor=networkPoint(point.voltageVolts,idx,bounds);
 const selectCaps=analysis.capacitorIds.map(partId=>'<option value="'+escape(partId)+'" '+(partId===id?'selected':'')+'>电容 '+escape(partId)+'</option>').join('');
 const windows=[0.1,0.5,1,5,10].map(seconds=>'<option value="'+seconds+'" '+(seconds===rcWindowSeconds?'selected':'')+'>'+seconds+' s</option>').join('');
 const currentText=point.currentMilliAmps===null?'—':point.currentMilliAmps.toFixed(3)+' mA';
 const quality=rcConvergence?
   '<div class="rc-convergence" role="status"><strong>数值一致性：'+(rcConvergence.stable?'通过':'需关注')+'</strong>'+
     '<p>'+escape(rcConvergence.reason)+'</p>'+
     (rcConvergence.ok?'<p>粗细步长最大电压差：'+rcConvergence.maxDeltaVolts!.toFixed(4)+' V（'+rcConvergence.maxRelativePercent!.toFixed(3)+'%）</p>':'')+
     '<small>这是步长敏感性检查，不是实际仿真误差上界。</small></div>':'';
 return '<section class="rc-panel rc-network-panel" aria-label="多电容 RC 数值波形"><h3>多电容 RC · 数值近似</h3>'+
  '<div class="rc-controls"><label for="rc-trace">显示电容</label><select id="rc-trace" aria-label="选择电容电压曲线">'+selectCaps+'</select>'+
  '<label for="rc-window">仿真时间窗口</label><select id="rc-window" aria-label="选择仿真时间窗口">'+windows+'</select></div>'+
  '<svg class="rc-plot" role="img" aria-label="所选电容电压随时间变化" viewBox="0 0 420 190">'+
  '<path d="M38 24V158H378" fill="none" stroke="#8eaaaf" stroke-width="1.5"/>'+
  '<line x1="38" y1="92" x2="378" y2="92" stroke="#d5e3e5" stroke-dasharray="5 5"/>'+
  '<polyline class="rc-network-curve" fill="none" stroke="#008f87" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" points="'+positions+'"/>'+
  '<circle id="rc-network-marker" cx="'+cursor.x.toFixed(2)+'" cy="'+cursor.y.toFixed(2)+'" r="5" fill="#f9a23d" stroke="#fff" stroke-width="2"/>'+
  '<text x="37" y="15" font-size="12" fill="#4c6671">'+bounds.high.toFixed(2)+' V</text>'+
  '<text x="37" y="179" font-size="12" fill="#4c6671">'+bounds.low.toFixed(2)+' V</text>'+
  '<text x="378" y="179" font-size="12" fill="#4c6671" text-anchor="end">'+analysis.durationSeconds!.toFixed(2)+' s</text></svg>'+
  '<label for="rc-network-time">采样时刻 · <span id="rc-network-time-value">'+data[idx].timeSeconds.toFixed(3)+'</span> s</label>'+
  '<input id="rc-network-time" type="range" min="0" max="100" step="1" value="'+idx+'" aria-label="选择多电容采样时刻"/>'+
  '<div class="rc-values"><span>电容电压 <strong id="rc-network-voltage">'+point.voltageVolts.toFixed(2)+' V</strong></span>'+
  '<span>电容电流 <strong id="rc-network-current">'+currentText+'</strong></span></div>'+
  '<button type="button" class="rc-accuracy-button" data-action="rc-accuracy">检查数值一致性</button>'+quality+
  '<small>固定步长向后欧拉积分，仅作教学近似。t=0 电流不估算；并非真实示波器或 SPICE。</small></section>';
}
function render(){
 const gpioFrame=unoPreview?.ok?sampleUnoPreview(unoPreview,unoPreviewTimeMs):null;
 lastGpio=gpioFrame&&unoPreview?.ok&&unoPreview.d13Configured?analyzeGpioD13(project,gpioFrame.high):null;
 lastAnalysis=isRunning&&simulationMode==='nonlinear'?analyzeDC(project):null;
 const numberOfCapacitors=project.parts.filter(p=>p.kind==='capacitor').length;
 lastTransient=isRunning&&simulationMode==='rc'&&numberOfCapacitors<=1?analyzeRC(project):null;
 lastNetwork=isRunning&&simulationMode==='rc'&&numberOfCapacitors>1?analyzeRCNetwork(project,{durationSeconds:rcWindowSeconds}):null;
 lastScopeCapture=lastTransient?.ok?createScopeCapture(lastTransient):
   lastNetwork?.ok?createScopeCapture(lastNetwork):null;
 if(lastScopeCapture&&!lastScopeCapture.capacitorIds.includes(scopeCapacitorId)){
   scopeCapacitorId=lastScopeCapture.capacitorIds[0];
 }
 if(!lastScopeCapture)scopeOpen=false;
 const report=simulationMode==='classic'?evaluate(project):null;
 const details=lastAnalysis;
 const analysisHTML=details?'<div class="analysis-overview" role="status"><strong>实验性非线性 DC</strong><p>'+escape(details.reason)+'</p>'+
   (details.warnings.length?'<p class="analysis-warning">'+escape(details.warnings.slice(0,3).join('；'))+'</p>':'')+
   (details.ok?project.parts.filter(p=>p.kind==='led').slice(0,8).map(p=>{
     const r=details.leds[p.id];
     const value=r.status==='overcurrent'?'过流':r.status==='unpowered'?'未供电':r.currentMilliAmps.toFixed(2)+' mA';
     return '<div class="analysis-line"><span>LED '+escape(p.id)+'</span><strong>'+value+'</strong></div>';
   }).join('')+project.parts.filter(p=>p.kind==='multimeter').slice(0,6).map(p=>{
     const r=details.meters[p.id],value=r.status==='measured'&&r.volts!==null?r.volts.toFixed(2)+' V':'未连接';
     return '<div class="analysis-line"><span>电压表 '+escape(p.id)+'</span><strong>'+value+'</strong></div>';
   }).join(''):'<p>本电路未生成可信的仿真读数</p>')+
   '<small>仅作教学近似；不含 MCU、暂态、温升及器件容差。</small></div>':'';
 const chosenToolbarWire=project.wires.find(w=>w.id===selection);
 const toolbarWireColor=chosenToolbarWire?.color??activeWireColor;
 const toolbarPalette='<label class="wire-palette"><span class="wire-palette-swatch" style="background:'+toolbarWireColor+'"></span>'+
   '<span>导线颜色</span><select id="wire-palette" aria-label="导线颜色" title="选中导线后改变其颜色；数字键 0–9">'+wireColorOptions(toolbarWireColor)+'</select></label>';
 const bottomReading=isRunning?(simulationMode==='rc'?'RC 暂态 · '+(lastNetwork?.reason??lastTransient?.reason??'计算失败'):simulationMode==='nonlinear'?'实验直流 · '+(details?.reason??'计算失败'):(report?.reason??'暂不可用')+' · '+(report?.currentMilliAmps??0)+'mA'):null;
 app.innerHTML='<header><span class="brand">◉ Circuits</span><button data-action="projects" class="project-switcher">我的电路 ('+workspace.slots.length+') ▾</button><input id="name" maxlength="120" value="'+escape(project.name)+'"/><span class="status">'+(persistOK?'● 本地已保存':'⚠ 本地保存失败，请导出 JSON')+'</span><button data-action="import">导入</button><button data-action="export">导出</button></header><div class="topbar"><button data-action="new">＋ 新建</button><button data-action="sample">示例电路</button><button data-action="undo" '+(!undo.length?'disabled':'')+'>↶ 撤销</button><button data-action="redo" '+(!redo.length?'disabled':'')+'>↷ 重做</button><button data-action="select-all">全选</button><button data-action="rotate" title="R · 旋转">⟳ 旋转</button><button data-action="delete">删除</button>'+toolbarPalette+'<button data-action="code">〈/〉 代码</button><button data-action="grid">'+(gridEnabled?'网格吸附：开':'网格吸附：关')+'</button><button data-action="solver-mode" aria-label="切换仿真模型">'+(simulationMode==='classic'?'模型：固定 2V':simulationMode==='nonlinear'?'模型：非线性 DC（实验）':'模型：RC 暂态（实验）')+'</button><button data-action="scope-open" '+(!lastScopeCapture?'disabled':'')+' aria-label="打开模拟示波器">▤ 示波器</button><button class="run '+(isRunning?'active':'')+'" data-action="run">'+(isRunning?'■ 停止仿真':'▶ 开始仿真')+'</button></div><div class="workspace"><section class="canvas '+(spaceHeld?'pan-mode':'')+'">'+canvas()+analysisHTML+(!scopeOpen?(lastTransient?rcPanel(lastTransient):lastNetwork?rcNetworkPanel(lastNetwork):''):'')+(scopeOpen&&lastScopeCapture?renderScopePanel(lastScopeCapture,scopeCapacitorId,rcTimeIndex):'')+'<div class="canvas-meta">2D · 电路工作台 · '+project.parts.length+' 个元件 · '+project.wires.length+' 根导线 · '+(project.insertions?.length??0)+' 处插孔接触</div><div class="bottom"><span>'+(endpointDrag?'正在重接导线：拖动端点到目标引脚':wiring?'正在接线：'+(wiringDirection==='horizontal'?'横向优先':'纵向优先')+' · 点击方向按钮切换 · 点空白加途径点 · Esc 取消':isRunning?(bottomReading??'仿真不可用'):connectionNotice?escape(connectionNotice):selectedIds.size>1?'已选择 '+selectedIds.size+' 个元件 · 拖动整体移动':'设计模式 · 从引脚拖线到另一引脚 · Shift 多选 · 空格或中键平移画布')+'</span>'+(wiring?'<button data-action="wire-direction" aria-label="切换接线走线方向">↳ '+(wiringDirection==='horizontal'?'横向优先':'纵向优先')+' · 点击切换</button><button data-action="cancel-wire">取消接线</button>':'')+'<button data-action="zoom-out">−</button>'+Math.round(zoom*100)+'%<button data-action="zoom-in">＋</button><button data-action="fit" title="F · 缩放到全部元件">适应</button></div></section><aside class="inspector">'+side()+'</aside></div><footer><span>独立开源教学项目 · DC/RC 与受限 Arduino D13 接线预览，非 AVR 仿真</span><span>v0.4.0-alpha.9 · TypeScript + Vite</span></footer><input id="file" type="file" accept=".json" hidden/>'}
function add(kind:Kind,x?:number,y?:number){
 const before=copy(),spot=x===undefined&&y===undefined?
   suggestPalettePosition(project,kind):{x:x??300,y:y??300};
 const id=uid(),a=spot.x,b=spot.y;
 project.parts.push({id,kind,x:gridEnabled?snap(a):a,y:gridEnabled?snap(b):b,rotation:0,value:kind==='resistor'?220:kind==='battery'?9:kind==='capacitor'?100:undefined,initialVolts:kind==='capacitor'?0:undefined});
 project=snapPartToBreadboard(project,id);
 commit(before);
}
function finishConnection(from:Endpoint,to:Endpoint,bends:readonly Point[]){
 const id=uid();
 const result=appendConnection(project,{id,from,to,color:activeWireColor,routing:wiringDirection,
   ...(bends.length?{bends:bends.map(p=>({...p}))}:{})});
 clearWireDraft();
 if(!result){
   connectionNotice='不能连接同一引脚，也不能重复连接已有的引脚对';
   render();return;
 }
 const previous=copy();
 project=result;
 selectedIds.clear();selection=null; // Do not cover connected pins with endpoint retarget handles.
 connectionNotice='连线成功：'+from.componentId+'/'+from.pinId+' → '+to.componentId+'/'+to.pinId;
 commit(previous);
}
function flipDraftDirection(){
 if(!wiring)return;
 wiringDirection=wiringDirection==='horizontal'?'vertical':'horizontal';
 wiringDirectionLocked=true;wiringDirectionInferred=true;
 render();
}
function chooseWireColor(color:string){
 if(!/^#[0-9a-f]{6}$/i.test(color))return;
 activeWireColor=color;
 const selected=project.wires.find(w=>w.id===selection);
 if(selected&&selected.color.toLowerCase()!==color.toLowerCase()){
   const before=copy();selected.color=color;commit(before);
 }else render();
}
function connect(a:Endpoint){
 if(!wiring){
   clearWireDraft();connectionNotice='';
   wiring={...a};selectedIds.clear();selection=null;
   wiringCursor=pinWorld(a,project.parts);
   render();return;
 }
 const first=wiring,bends=[...wiringBends];
 if(first.componentId===a.componentId&&first.pinId===a.pinId){
   clearWireDraft();connectionNotice='已取消接线';render();return;
 }
 finishConnection(first,a,bends);
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
 if(selectedBend){
   const restored=removeWireWaypoint(project,selectedBend.id,selectedBend.index);
   if(restored){
     const previous=copy();
     project=restored;selection=selectedBend.id;selectedBend=null;
     commit(previous);return;
   }
   selectedBend=null;
 }
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
 selectedIds.clear();selection=null;selectedBend=null;commit(before);
}
function download(text:string,name:string){const url=URL.createObjectURL(new Blob([text]));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
app.addEventListener('click',e=>{
 if(ignoredClick&&e.timeStamp<ignoredClick.until&&Math.hypot(e.clientX-ignoredClick.x,e.clientY-ignoredClick.y)<4){
   ignoredClick=null;return;
 }
 ignoredClick=null;
 const t=e.target as Element;
 const pin=pinFromPointer(t,e.clientX,e.clientY);
 if(pin){connect(pin.endpoint);return}
 const part=t.closest<SVGGElement>('[data-part]');
 if(part){
   connectionNotice='';selectedBend=null;
   const id=part.dataset.part!;
   if(e.shiftKey||e.ctrlKey||e.metaKey){
     selectedIds=new Set(selectedIds);
     if(selectedIds.has(id))selectedIds.delete(id);
     else selectedIds.add(id);
   }else if(!selectedIds.has(id))selectedIds=new Set([id]);
   selection=selectedIds.size===1?[...selectedIds][0]:null;
   showCode=false;showProjects=false;render();return;
 }
 const bend=t.closest<SVGElement>('[data-bend-index]');
 if(bend){
   const id=bend.getAttribute('data-wire')!,index=Number(bend.getAttribute('data-bend-index'));
   if(project.wires.find(w=>w.id===id)?.bends?.[index]){
     selection=id;selectedIds.clear();selectedBend={id,index};render();
   }
   return;
 }
 const wire=t.closest<SVGElement>('[data-wire]');if(wire){selectedBend=null;connectionNotice='';const next=wire.getAttribute('data-wire');if(selection!==next||selectedIds.size){selectedIds.clear();selection=next;render()}return}
 const k=t.closest<HTMLElement>('[data-kind]');if(k){add(k.dataset.kind as Kind);return}
 const example=t.closest<HTMLElement>('[data-load-example]');
 if(example){
   if(workspace.slots.length>=MAX_PROJECTS){alert('本地工程已达到数量上限，请先导出并清理部分旧工程');return;}
   const exampleId=example.dataset.loadExample??'';
   const doc=createExample(exampleId);
   if(!doc)return;
   save();
   const id='example-'+uid();
   workspace=createProject(workspace,id,doc,Date.now());
   openWorkspace(id);
   simulationMode=exampleId.startsWith('rc-')?'rc':exampleId==='gpio-d13-led'||exampleId==='uno-serial'||exampleId==='uno-for-pulse'?'classic':'nonlinear';
   showCode=exampleId==='gpio-d13-led'||exampleId==='uno-serial'||exampleId==='uno-for-pulse';
   rcTimeIndex=0;rcTraceId='';rcWindowSeconds=0.5;rcConvergence=null;
   render();return;
 }
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
 case 'projects':showProjects=!showProjects;showExamples=false;showCode=false;render();break;
 case 'sample':showExamples=!showExamples;showProjects=false;showCode=false;selectedIds.clear();selection=null;render();break;
 case 'undo':revert(undo,redo);break;case 'redo':revert(redo,undo);break;
 case 'select-all':selectAllParts();break;
 case 'grid':gridEnabled=!gridEnabled;localStorage.setItem('circuits-grid',gridEnabled?'on':'off');render();break;
 case 'wire-direction':flipDraftDirection();break;
 case 'wire-flip-direction':{
   const w=project.wires.find(w=>w.id===selection);
   if(w){
     const previous=copy();
     w.routing=w.routing==='horizontal'?'vertical':'horizontal';
     commit(previous);
   }
   break;
 }
 case 'wire-add-bend':{
   const w=project.wires.find(w=>w.id===selection),coords=w&&wirePoints(w,project.parts);
   if(w&&coords){const a=coords[0],b=coords[coords.length-1];addBend(w.id,{x:(a.x+b.x)/2,y:(a.y+b.y)/2})}
   break;
 }
 case 'wire-reset-bends':{
   const w=project.wires.find(w=>w.id===selection);
   if(w?.bends?.length){const b=copy();delete w.bends;selectedBend=null;commit(b)}
   break;
 }
 case 'toggle-switch':{const c=project.parts.find(p=>p.id===selection);if(c?.kind==='switch'){const b=copy();c.closed=!c.closed;rcTimeIndex=0;commit(b)}break}
 case 'rotate':rotateSelectedParts();break
 case 'delete':deleteSelection();break
 case 'code':showCode=!showCode;showProjects=false;showExamples=false;render();break;
 case 'uno-preview-run':{
   isRunning=false;
   const boards=project.parts.filter(p=>p.kind==='arduino').length;
   unoPreview=boards===1?compileUnoPreview(project.code):
     {ok:false,reason:'当前仅支持一块 Arduino Uno 的 D13 预览；请先保留恰好一块板卡'};
   unoPreviewTimeMs=0;render();break;
 }
 case 'uno-preview-stop':resetUnoPreview();render();break;
 case 'uno-serial-export':{
   const snapshot=unoPreview?.ok?sampleUnoSerial(unoPreview,unoPreviewTimeMs):null;
   if(snapshot)download(serialText(snapshot)+'\n','circuits-serial-monitor.txt');
   break;
 }
 case 'cancel-wire':clearWireDraft();connectionNotice='已取消接线';render();break;
 case 'parts':selection=null;selectedIds.clear();showCode=false;showProjects=false;showExamples=false;render();break;
 case 'run':connectionNotice='';if(!isRunning)resetUnoPreview();isRunning=!isRunning;if(!isRunning)rcConvergence=null;render();break;
 case 'solver-mode':connectionNotice='';simulationMode=simulationMode==='classic'?'nonlinear':simulationMode==='nonlinear'?'rc':'classic';rcTimeIndex=0;rcTraceId='';scopeOpen=false;rcConvergence=null;render();break;
 case 'rc-accuracy':if(lastNetwork?.ok&&isRunning){rcConvergence=assessRcConvergence(project,{durationSeconds:rcWindowSeconds});render()}break;
 case 'scope-open':if(lastScopeCapture){scopeOpen=true;render();app.querySelector<HTMLElement>('.scope-dialog [data-action="scope-close"]')?.focus()}break;
 case 'scope-close':scopeOpen=false;render();app.querySelector<HTMLElement>('[data-action="scope-open"]')?.focus();break;
 case 'scope-export':if(lastScopeCapture&&scopeOpen)download(exportScopeCSV(lastScopeCapture),'circuits-rc-waveform.csv');break;
 case 'zoom-in':changeZoom(1.15);break;case 'zoom-out':changeZoom(1/1.15);break;case 'fit':fitView();break;
 case 'export':download(JSON.stringify(project,null,2),project.name+'.json');break;
 case 'download-code':download(project.code,'circuit.ino');break;
 case 'import':app.querySelector<HTMLInputElement>('#file')?.click();break}
});
app.addEventListener('input',e=>{
 const t=e.target as HTMLInputElement;
 if(t.id==='uno-time'&&unoPreview?.ok){
   const ms=Number(t.value);
   if(Number.isFinite(ms)){
     unoPreviewTimeMs=Math.max(0,Math.min(5000,Math.round(ms/50)*50));
     refreshUnoPreview();
   }
   return;
 }
 if(t.id==='scope-time'&&scopeOpen&&lastScopeCapture){
   rcTimeIndex=Math.max(0,Math.min(100,Math.round(Number(t.value)||0)));
   updateScopePanel(app,lastScopeCapture,scopeCapacitorId,rcTimeIndex);
   updateRcMeterReadouts();updateRcAmmeterReadouts();return;
 }
 if(t.id==='rc-network-time'&&lastNetwork?.ok){
   rcTimeIndex=Math.max(0,Math.min(100,Math.round(Number(t.value)||0)));
   const id=lastNetwork.capacitorIds.includes(rcTraceId)?rcTraceId:lastNetwork.capacitorIds[0];
   const sample=lastNetwork.samples[rcTimeIndex],item=sample.capacitors[id];
   const xy=networkPoint(item.voltageVolts,rcTimeIndex,networkBounds(lastNetwork,id));
   const marker=app.querySelector<SVGCircleElement>('#rc-network-marker');
   marker?.setAttribute('cx',xy.x.toFixed(2));marker?.setAttribute('cy',xy.y.toFixed(2));
   const write=(id:string,value:string)=>{
     const el=app.querySelector<HTMLElement>('#'+id);if(el)el.textContent=value;
   };
   const current=item.currentMilliAmps===null?'—':item.currentMilliAmps.toFixed(3)+' mA';
   write('rc-network-time-value',sample.timeSeconds.toFixed(3));
   write('rc-network-voltage',item.voltageVolts.toFixed(2)+' V');
   write('rc-network-current',current);
   updateRcMeterReadouts();updateRcAmmeterReadouts();
   if(selection&&sample.capacitors[selection]){
     const selected=sample.capacitors[selection];
     write('rc-network-inspector','多电容当前采样：'+selected.voltageVolts.toFixed(3)+' V · '+
       (selected.currentMilliAmps===null?'未估算':selected.currentMilliAmps.toFixed(3)+' mA'));
   }
   return;
 }
 if(t.id==='rc-time'&&lastTransient?.ok){
   rcTimeIndex=Math.max(0,Math.min(100,Number(t.value)||0));
   const sample=lastTransient.samples[rcTimeIndex],bounds=rcBounds(lastTransient.samples);
   const pos=rcScreen(sample,rcTimeIndex,bounds);
   const marker=app.querySelector<SVGCircleElement>('#rc-marker');
   marker?.setAttribute('cx',pos.x.toFixed(2));marker?.setAttribute('cy',pos.y.toFixed(2));
   const show=(id:string,value:string)=>{const label=app.querySelector<HTMLElement>('#'+id);if(label)label.textContent=value;};
   show('rc-time-value',sample.timeSeconds.toFixed(3));
   show('rc-voltage-value',sample.voltageVolts.toFixed(2)+' V');
   show('rc-current-value',sample.currentMilliAmps.toFixed(3)+' mA');
   updateRcMeterReadouts();updateRcAmmeterReadouts();
   return;
 }
 if(t.id==='search'){search=t.value;render();app.querySelector<HTMLInputElement>('#search')?.focus()}if(t.id==='code'){
   project.code=t.value;
   resetUnoPreview();
   app.querySelector('#uno-preview')?.remove();
   app.querySelectorAll<SVGCircleElement>('[data-gpio-glow]').forEach(el=>el.setAttribute('opacity','0'));
   const stop=app.querySelector<HTMLButtonElement>('[data-action="uno-preview-stop"]');
   if(stop)stop.disabled=true;
   app.querySelectorAll<SVGCircleElement>('[data-uno-d13-led]').forEach(el=>el.setAttribute('fill','#667f8b'));
   save();
 }});
app.addEventListener('change',async e=>{
 const t=e.target as HTMLInputElement;
 if(t.id==='scope-channel'&&scopeOpen&&lastScopeCapture){
   if(lastScopeCapture.capacitorIds.includes(t.value)){
     scopeCapacitorId=t.value;render();
     app.querySelector<HTMLSelectElement>('#scope-channel')?.focus();
   }
   return;
 }
 if(t.id==='rc-trace'&&lastNetwork?.ok){
   if(lastNetwork.capacitorIds.includes(t.value)){rcTraceId=t.value;render()}
   return;
 }
 if(t.id==='rc-window'){
   const selected=Number(t.value);
   if([0.1,0.5,1,5,10].includes(selected)){rcWindowSeconds=selected;rcTimeIndex=0;rcConvergence=null;render()}
   return;
 }
 if(t.id==='wire-palette'){if(WIRE_COLOR_PRESETS.some(x=>x.value===t.value))chooseWireColor(t.value);return;}
 if(t.id==='name'){project.name=t.value.trim().slice(0,120)||'未命名电路';save();render()}if(t.id==='wire-color'){const w=project.wires.find(w=>w.id===selection);if(w&&/^#[0-9a-f]{6}$/i.test(t.value)){chooseWireColor(t.value)}}if(t.id==='value'){const c=project.parts.find(p=>p.id===selection);const num=Number(t.value);if(c&&Number.isFinite(num)&&num>0&&num<=(c.kind==='capacitor'?1e6:1e12)&&(c.kind!=='capacitor'||num>=0.001)){const b=copy();c.value=num;if(c.kind==='capacitor')rcTimeIndex=0;commit(b)}else render()}
 if(t.id==='switch-contact'){const c=project.parts.find(p=>p.id===selection);const value=Number(t.value);if(c?.kind==='switch'&&t.value.trim()!==''&&Number.isFinite(value)&&(value===0||(value>=0.1&&value<=1e6))){const before=copy();c.contactOhms=value;rcTimeIndex=0;commit(before)}else render()}
 if(t.id==='rc-initial'){const c=project.parts.find(p=>p.id===selection);const num=Number(t.value);if(c?.kind==='capacitor'&&Number.isFinite(num)&&Math.abs(num)<=1000){const b=copy();c.initialVolts=num;rcTimeIndex=0;commit(b)}else render()}if(t.id==='file'&&t.files?.[0]){try{const p=JSON.parse(await t.files[0].text());if(!validProject(p))throw Error();const b=copy();project=reconcileInsertions({...p,schemaVersion:2});selection=null;selectedIds.clear();rcTimeIndex=0;scopeOpen=false;scopeCapacitorId='';commit(b)}catch{alert('JSON 工程文件格式不正确')}}});
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
app.addEventListener('wheel',e=>{
 if(!(e.target as Element).closest('.canvas')||e.deltaY===0||scopeOpen)return;
 e.preventDefault();
 const svg=app.querySelector<SVGSVGElement>('#board'),matrix=svg?.getScreenCTM();
 if(!svg||!matrix)return;
 const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;
 const anchor=pt.matrixTransform(matrix.inverse());
 const view=zoomAt({zoom,panX,panY},{x:anchor.x,y:anchor.y},zoom*(e.deltaY<0?1.12:1/1.12));
 zoom=view.zoom;panX=view.panX;panY=view.panY;render();
},{passive:false});
app.addEventListener('pointerdown',e=>{
 const svg=app.querySelector<SVGSVGElement>('#board'),target=e.target as Element;
 // Pointer gestures must start inside the SVG, never on toolbar or inspector controls.
 if(!target.closest('#board'))return;
 if(e.button===1||(e.button===0&&spaceHeld)){
   panDrag={x:e.clientX,y:e.clientY,panX,panY};
   e.preventDefault();return;
 }
 if(e.button!==0)return;
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
   if(w?.bends?.[index]){
   selection=w.id;selectedBend={id:w.id,index};
   bendDrag={id:w.id,index,before:copy()};return;
 }
 }
 const startPin=pinFromPointer(target,e.clientX,e.clientY);
 if(startPin){
   wireDrag={from:wiring?{...wiring}:startPin.endpoint,clientX:e.clientX,clientY:e.clientY,
     pointerId:e.pointerId,active:false};
   return;
 }
 if(!svg)return;
 const component=target.closest<SVGGElement>('[data-part]');
 if(!component){
   const segment=target.closest<SVGElement>('[data-wire]');
   if(segment&&!wiring){
     const at=canvasPoint(e.clientX,e.clientY);
     const wire=project.wires.find(w=>w.id===segment.getAttribute('data-wire'));
     if(at&&wire){
       const leg=nearestOrthogonalSegment(wire,project.parts,at);
       segmentDrag={id:wire.id,start:at,
         screenX:e.clientX,screenY:e.clientY,pointerId:e.pointerId,
         before:copy(),active:false,index:-1,routeIndex:leg?.index??null,changed:false};
     }
     return;
   }
   const at=canvasPoint(e.clientX,e.clientY);
   if(!at)return;
   if(wiring||e.shiftKey){
     marquee={start:at,end:at,screenX:e.clientX,screenY:e.clientY,active:false,additive:e.shiftKey};
   }else{
     panDrag={x:e.clientX,y:e.clientY,panX,panY};
   }
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
 const pointerTarget=e.target as Element;
 if(pointerTarget.closest?.('#board')){
   updatePinHover(pointerTarget,e.clientX,e.clientY);
   if(!segmentDrag&&!wireDrag&&!wiring&&!drag&&!panDrag){
     const stroke=pointerTarget.closest<SVGElement>('.wire,.wire-hit');
     if(stroke){
       const wire=project.wires.find(w=>w.id===stroke.getAttribute('data-wire'));
       const point=canvasPoint(e.clientX,e.clientY);
       const leg=wire&&point?nearestOrthogonalSegment(wire,project.parts,point):null;
       stroke.style.cursor=leg?.axis==='horizontal'?'ns-resize':
         leg?.axis==='vertical'?'ew-resize':'grab';
     }
   }
 }else app.querySelector('#pin-hover')?.setAttribute('opacity','0');
 if(panDrag){
   const svg=app.querySelector<SVGSVGElement>('#board'),matrix=svg?.getScreenCTM();
   if(!matrix)return;
   const scale=Math.hypot(matrix.a,matrix.b);
   if(scale<=0)return;
   const view=panBy({zoom,panX:panDrag.panX,panY:panDrag.panY},{
     x:(e.clientX-panDrag.x)/scale,y:(e.clientY-panDrag.y)/scale
   });
   panX=view.panX;panY=view.panY;
   app.querySelector<SVGGElement>('#scene')?.setAttribute('transform','translate('+panX+' '+panY+') scale('+zoom+')');
   return;
 }
 if(wireDrag&&e.pointerId===wireDrag.pointerId){
   if(!wireDrag.active&&Math.hypot(e.clientX-wireDrag.clientX,e.clientY-wireDrag.clientY)>5){
     wireDrag.active=true;
     if(!wiring){wiring={...wireDrag.from};wiringBends=[];}
     selectedIds.clear();selection=null;connectionNotice='';
     render();
   }
   if(wireDrag.active){
     const point=canvasPoint(e.clientX,e.clientY);
     if(point)updateWireCursor(point);
   }
   return;
 }
 if(segmentDrag&&e.pointerId===segmentDrag.pointerId){
   const gesture=segmentDrag,point=canvasPoint(e.clientX,e.clientY);
   if(!point)return;
   if(!gesture.active&&Math.hypot(e.clientX-gesture.screenX,e.clientY-gesture.screenY)>6){
     gesture.active=true;selection=gesture.id;selectedIds.clear();
   }
   if(gesture.active){
     if(gesture.routeIndex!==null){
       // Rebuild from pointer-down rather than accumulated rounded positions.
       const moved=slideOrthogonalSegment(gesture.before,gesture.id,gesture.routeIndex,
         {x:point.x-gesture.start.x,y:point.y-gesture.start.y},gridEnabled?10:null);
       if(moved){
         project=moved.project;gesture.index=moved.bendIndex;gesture.changed=true;
         selectedBend={id:gesture.id,index:moved.bendIndex};refreshScene();
       }else if(gesture.changed){
         project=gesture.before;gesture.changed=false;selectedBend=null;refreshScene();
       }
     }else{
       // Untagged legacy diagonal wires retain free-form waypoint editing.
       const added=insertWireWaypoint(gesture.before,gesture.id,gesture.start,gridEnabled?10:null);
       const moved=added&&moveWireWaypoint(added.project,gesture.id,added.index,point,gridEnabled?10:null);
       if(added&&moved){
         const a=added.project.wires.find(w=>w.id===gesture.id)?.bends?.[added.index];
         const b=moved.wires.find(w=>w.id===gesture.id)?.bends?.[added.index];
         if(a&&b&&(a.x!==b.x||a.y!==b.y)){
           project=moved;gesture.index=added.index;gesture.changed=true;
           selectedBend={id:gesture.id,index:added.index};refreshScene();
         }else if(gesture.changed){
           project=gesture.before;gesture.changed=false;selectedBend=null;refreshScene();
         }
       }
     }
   }
   return;
 }
 if(endpointDrag){
   const point=canvasPoint(e.clientX,e.clientY);
   if(point){
     const hit=nearestTerminal(project,point,wireRadius());
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
 if(wiring){
   // Toolbar/inspector hover must not pull an active wire outside the canvas.
   if((e.target as Element).closest?.('#board')){
     const point=canvasPoint(e.clientX,e.clientY);
     if(point)updateWireCursor(point);
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
 if(panDrag){
   const gesture=panDrag;panDrag=null;
   // A tap on empty canvas clears selection, whereas a real pan keeps it.
   if(e.button===0&&!spaceHeld&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)<5){
     selectedIds.clear();selection=null;selectedBend=null;connectionNotice='';
   }
   ignoredClick={x:e.clientX,y:e.clientY,until:e.timeStamp+200};
   render();return;
 }
 if(wireDrag&&e.pointerId===wireDrag.pointerId){
   const started=wireDrag;wireDrag=null;
   if(!started.active)return; // ordinary short click: handled by the click listener
   const from=wiring??started.from,bends=[...wiringBends];
   const point=canvasPoint(e.clientX,e.clientY);
   const explicit=e.target instanceof Element?pinFromPointer(e.target,e.clientX,e.clientY):null;
   const hit=explicit??(point&&nearestTerminal(project,point,wireRadius()));
   ignoredClick={x:e.clientX,y:e.clientY,until:e.timeStamp+250};
   if(hit)finishConnection(from,hit.endpoint,bends);
   else{clearWireDraft();connectionNotice='未连线：请在目标引脚或插孔上松开';render();}
   return;
 }
 if(segmentDrag&&e.pointerId===segmentDrag.pointerId){
   const gesture=segmentDrag;segmentDrag=null;
   if(!gesture.active)return;
   ignoredClick={x:e.clientX,y:e.clientY,until:e.timeStamp+250};
   if(gesture.changed){
     connectionNotice='已调整走线；电气引脚连接保持不变';
     commit(gesture.before);
   }else{
     project=gesture.before;selectedBend=null;render();
   }
   return;
 }
 if(endpointDrag){
   const current=endpointDrag;endpointDrag=null;
   ignoredClick={x:e.clientX,y:e.clientY,until:e.timeStamp+200};
   const point=canvasPoint(e.clientX,e.clientY);
   const direct=e.target instanceof Element?pinFromPointer(e.target,e.clientX,e.clientY):null;
   const target=direct??(point&&nearestTerminal(project,point,wireRadius()));
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
   else render();
   return;
 }
 if(marquee){
   const box=marquee;marquee=null;
   // In wire mode a blank gesture places a waypoint, never a marquee selection.
   if(wiring){
     const point=canvasPoint(e.clientX,e.clientY);
     if(point&&wiringBends.length<32){
       const bend={x:gridEnabled?snap(point.x):point.x,y:gridEnabled?snap(point.y):point.y};
       const previous=wiringBends.at(-1)??pinWorld(wiring,project.parts);
       if(!previous||previous.x!==bend.x||previous.y!==bend.y)wiringBends.push(bend);
       wiringCursor=bend;wiringHover=null;
       ignoredClick={x:e.clientX,y:e.clientY,until:e.timeStamp+250};
     }else connectionNotice='一根导线最多包含 32 个途径点';
   }else if(box.active){
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
 if(scopeOpen){
   if(e.key==='Escape'){
     e.preventDefault();scopeOpen=false;render();
     app.querySelector<HTMLElement>('[data-action="scope-open"]')?.focus();return;
   }
   if(e.key==='Tab'){
     const controls=Array.from(app.querySelectorAll<HTMLElement>('.scope-dialog button:not([disabled]),.scope-dialog select,.scope-dialog input'));
     const first=controls[0],last=controls[controls.length-1];
     if(first&&last&&e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
     else if(first&&last&&!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
   }
   return;
 }
 if(['INPUT','TEXTAREA','SELECT'].includes(t.tagName))return;
 const command=e.ctrlKey||e.metaKey;
 if(!command&&!e.altKey&&!wiring&&e.key.toLowerCase()==='f'){
   e.preventDefault();fitView();return;
 }
 // Tinkercad's R rotates components. The routing direction uses its labeled button.
 if(!command&&!e.altKey&&!wiring&&e.key.toLowerCase()==='r'&&selectedIds.size){
   e.preventDefault();rotateSelectedParts();return;
 }
 if(!command&&!e.altKey&&/^[0-9]$/.test(e.key)&&(wiring||project.wires.some(w=>w.id===selection))){
   const color=wireColorForDigit(e.key);
   if(color){e.preventDefault();chooseWireColor(color);return;}
 }
 const focusedPart=t.closest<SVGElement>('.item[data-part]');
 if(focusedPart&&(e.key==='Enter'||e.key===' ')){
   e.preventDefault();
   const id=focusedPart.getAttribute('data-part')!;
   if(e.shiftKey){
     selectedIds=new Set(selectedIds);
     if(selectedIds.has(id))selectedIds.delete(id);else selectedIds.add(id);
   }else selectedIds=new Set([id]);
   selection=selectedIds.size===1?[...selectedIds][0]:null;
   showCode=false;showProjects=false;render();return;
 }
 if(e.key===' '&&!t.closest('button')){
   e.preventDefault();spaceHeld=true;
   app.querySelector('.canvas')?.classList.add('pan-mode');
   return;
 }
 if(command&&e.key.toLowerCase()==='a'){
   e.preventDefault();selectAllParts();
 }else if(command&&e.key.toLowerCase()==='z'){
   e.preventDefault();revert(e.shiftKey?redo:undo,e.shiftKey?undo:redo);
 }else if(!command&&selectedIds.size&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
   e.preventDefault();
   const step=e.altKey?1:gridEnabled?10:5;
   const delta={x:e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,
                y:e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0};
   const updated=translateComponents(project,[...selectedIds],delta,null);
   if(updated!==project){
     const before=copy();
     project=reconcileInsertions(updated);commit(before);
   }
 }else if(e.key==='Escape'){
   if(segmentDrag?.active)project=segmentDrag.before;
   segmentDrag=null;selectedBend=null;clearWireDraft();endpointDrag=null;bendDrag=null;drag=null;marquee=null;panDrag=null;
   selectedIds.clear();selection=null;connectionNotice='';render();
 }else if(e.key==='Delete'||e.key==='Backspace'){
   e.preventDefault();deleteSelection();
 }
});
window.addEventListener('keyup',e=>{
 if(e.key===' '){spaceHeld=false;app.querySelector('.canvas')?.classList.remove('pan-mode')}
});
window.addEventListener('pointercancel',e=>{
 if(wireDrag?.pointerId===e.pointerId){clearWireDraft();connectionNotice='手势已取消';render()}
 if(segmentDrag?.pointerId===e.pointerId){project=segmentDrag.before;segmentDrag=null;selectedBend=null;render()}
});
window.addEventListener('blur',()=>{if(segmentDrag?.active)project=segmentDrag.before;segmentDrag=null;selectedBend=null;spaceHeld=false;panDrag=null;clearWireDraft();});
// Persist the first demo or migrated workspace before browser tests and user edits.
save();
render();
