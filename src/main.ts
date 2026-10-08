import './style.css';
import { demo, validProject, parts, labels, pins, size, type Project, type Kind, type Part, type Endpoint } from './model.js';
import { evaluate } from './core/simulator.js';
const app=document.querySelector<HTMLDivElement>('#app')!;
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let project:Project=(()=>{try{const x=JSON.parse(localStorage.getItem('circuits-project')||'null');return validProject(x)?x:demo()}catch{return demo()}})();
let selection:string|null=null, wiring:Endpoint|null=null, isRunning=false, search='',showCode=false, zoom=1,panX=0,panY=0;
let undo:Project[]=[],redo:Project[]=[],drag:{id:string,x:number,y:number,ox:number,oy:number,before:Project}|null=null;
const copy=():Project=>structuredClone(project);
const save=()=>localStorage.setItem('circuits-project',JSON.stringify(project));
function commit(before:Project){undo.push(before);if(undo.length>50)undo.shift();redo=[];save();render()}
function revert(stack:Project[],other:Project[]){const prev=stack.pop();if(!prev)return;other.push(copy());project=prev;selection=null;save();render()}
const uid=()=>crypto.randomUUID().slice(0,8);
const pos=(e:Endpoint):[number,number]|null=>{
 const c=project.parts.find(p=>p.id===e.componentId),pin=c&&pins[c.kind][e.pinId];
 if(!c||!pin)return null;
 const [w,h]=size[c.kind],angle=c.rotation*Math.PI/180,dx=pin[0]-w/2,dy=pin[1]-h/2;
 return [c.x+w/2+dx*Math.cos(angle)-dy*Math.sin(angle),
         c.y+h/2+dx*Math.sin(angle)+dy*Math.cos(angle)];
};
function art(c:Part){const [w,h]=size[c.kind];
 if(c.kind==='battery')return '<rect x="8" y="10" width="76" height="119" rx="12" fill="#303b43"/><rect x="8" y="10" width="76" height="32" rx="9" fill="#eca738"/><text x="46" y="86" font-size="25" text-anchor="middle" fill="white">9V</text><text x="70" y="42" fill="white">+</text><text x="70" y="108" fill="white">−</text>';
 if(c.kind==='resistor')return '<path d="M0 30H140" stroke="#b7a17d" stroke-width="5"/><rect x="36" y="13" width="68" height="35" rx="16" fill="#d7b68c" stroke="#bc936c"/><path d="M54 13v35m12-35v35m12-35v35" stroke="#9c542e" stroke-width="6"/><text x="70" y="9" font-size="13" text-anchor="middle" fill="#667988">'+(c.value??220)+'Ω</text>';
 if(c.kind==='led')return '<path d="M0 65H110" stroke="#b6c1c7" stroke-width="5"/><path d="M34 64V42a21 21 0 0 1 42 0v22z" fill="#ee525c"/><rect x="32" y="61" width="46" height="12" rx="4" fill="#d73b4a"/><path d="M45 42a11 11 0 0 1 12-12" stroke="#fff8" fill="none" stroke-width="4"/>';
 if(c.kind==='arduino')return '<rect x="4" y="4" width="196" height="164" rx="12" fill="#2276aa" stroke="#125983" stroke-width="3"/><rect x="25" y="55" width="78" height="45" rx="4" fill="#263e51"/><rect x="4" y="45" width="35" height="34" rx="4" fill="#c1cfd5"/><rect x="40" y="126" width="33" height="39" rx="4" fill="#26313a"/><text x="103" y="38" fill="white" font-size="24" font-weight="bold">UNO</text><text x="90" y="122" fill="#e4f5ff" font-size="14">ARDUINO</text>'+Array.from({length:13},(_,i)=>'<rect x="'+(30+i*13)+'" y="2" width="8" height="9" fill="#243745"/>').join('');
 return '<rect x="2" y="2" width="'+(w-4)+'" height="'+(h-4)+'" rx="9" fill="#f6f7f6" stroke="#bdc9cc" stroke-width="3"/><path d="M18 35h404 M18 167h404" stroke="#e06a6a" stroke-width="2"/><path d="M18 48h404 M18 180h404" stroke="#5d9fd4" stroke-width="2"/>'+Array.from({length:22},(_,x)=>Array.from({length:10},(_,y)=>'<circle cx="'+(28+x*18)+'" cy="'+(67+y*9)+'" r="2.8" fill="#89959b"/>').join('')).join('') }
function canvas(){const wires=project.wires.map(w=>{const a=pos(w.from),b=pos(w.to);return a&&b?'<path class="wire" data-wire="'+w.id+'" d="M'+a[0]+' '+a[1]+' L'+((a[0]+b[0])/2)+' '+a[1]+' L'+((a[0]+b[0])/2)+' '+b[1]+' L'+b[0]+' '+b[1]+'" stroke="'+w.color+'" stroke-width="5" fill="none"/>':''}).join('');
 const readings=isRunning?evaluate(project):null;
 const shapes=project.parts.map(c=>{const [w,h]=size[c.kind],glow=c.kind==='led'&&readings?.lit?'<circle cx="54" cy="49" r="52" fill="#ff7a74" opacity=".2"/>':'';
 const board=c.kind==='breadboard';
 const pinsSvg=Object.entries(pins[c.kind]).map(([name,p])=>'<circle class="pin" data-part="'+c.id+'" data-pin="'+name+'" cx="'+p[0]+'" cy="'+p[1]+'" r="'+(board?4.4:7)+'" fill="'+(board?'#44535e':'#e6c08a')+'" stroke="'+(board?'#b2c4cb':'#a58142')+'" stroke-width="'+(board?1.2:2)+'"><title>'+name+'</title></circle>').join('');
 return '<g class="item '+(selection===c.id?'selected':'')+'" data-part="'+c.id+'" transform="translate('+c.x+' '+c.y+')"><g transform="rotate('+c.rotation+' '+w/2+' '+h/2+')">'+glow+art(c)+pinsSvg+'</g></g>'}).join('');
 return '<svg id="board" viewBox="0 0 1100 800"><defs><pattern id="dot" width="21" height="21" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#c5cfd3"/></pattern></defs><rect width="1100" height="800" fill="#f3f5f6"/><rect width="1100" height="800" fill="url(#dot)"/><g id="scene" transform="translate('+panX+' '+panY+') scale('+zoom+')">'+wires+shapes+'</g></svg>'}
function refreshScene(){
 const original=app.querySelector('#scene');
 if(!original)return;
 const wrapper=document.createElement('div');
 wrapper.innerHTML=canvas();
 const latest=wrapper.querySelector('#scene');
 if(latest)original.innerHTML=latest.innerHTML;
}
function side(){if(showCode)return '<h2>代码编辑器 · Arduino C++</h2><div class="field"><p>仅提供文本编辑和导出，尚未运行 MCU 程序。</p><textarea id="code">'+escape(project.code)+'</textarea><button data-action="download-code">下载 .ino</button><button data-action="code">返回元件库</button></div>';
 const c=project.parts.find(p=>p.id===selection);
 if(c)return '<h2>属性 · '+labels[c.kind]+'</h2><div class="field"><p>元件：'+labels[c.kind]+'</p>'+(c.kind==='resistor'||c.kind==='battery'?'<label>数值 ('+(c.kind==='resistor'?'Ω':'V')+')</label><input id="value" type="number" min="1" value="'+(c.value??1)+'"/>':'')+'<p>坐标 '+Math.round(c.x)+', '+Math.round(c.y)+' · 旋转 '+c.rotation+'°</p><button data-action="rotate">旋转 90°</button><button data-action="delete">删除元件</button><button data-action="parts">返回元件库</button></div>';
 return '<h2>▦ 组件库</h2><div class="search"><input id="search" placeholder="搜索组件..." value="'+escape(search)+'"/></div><div class="parts">'+parts.filter(k=>labels[k].toLowerCase().includes(search.toLowerCase())).map(kind=>'<button class="part" draggable="true" data-kind="'+kind+'"><svg viewBox="0 0 '+size[kind][0]+' '+size[kind][1]+'">'+art({kind,id:'sample',x:0,y:0,rotation:0})+'</svg>'+labels[kind]+'</button>').join('')+'</div><div class="field"><p>点击添加元件，点两个引脚接线。支持从元件库拖入。</p></div>'}
function render(){const report=evaluate(project);
 app.innerHTML='<header><span class="brand">◉ Circuits</span><span style="color:#afbac1">我的工作区 ›</span><input id="name" value="'+escape(project.name)+'"/><span class="status">● 保存于此浏览器</span><button data-action="import">导入</button><button data-action="export">导出</button></header><div class="topbar"><button data-action="new">＋ 新建</button><button data-action="sample">示例电路</button><button data-action="undo" '+(!undo.length?'disabled':'')+'>↶ 撤销</button><button data-action="redo" '+(!redo.length?'disabled':'')+'>↷ 重做</button><button data-action="rotate">⟳ 旋转</button><button data-action="delete">删除</button><button data-action="code">〈/〉 代码</button><button class="run '+(isRunning?'active':'')+'" data-action="run">'+(isRunning?'■ 停止仿真':'▶ 开始仿真')+'</button></div><div class="workspace"><section class="canvas">'+canvas()+'<div class="canvas-meta">2D · 电路工作台 · '+project.parts.length+' 个元件 · '+project.wires.length+' 根导线</div><div class="bottom"><span>'+(wiring?'正在接线：点选第二个引脚':isRunning?report.reason+' · '+report.currentMilliAmps+'mA':'设计模式 · 拖动元件或点击引脚接线')+'</span><button data-action="zoom-out">−</button>'+Math.round(zoom*100)+'%<button data-action="zoom-in">＋</button><button data-action="fit">重置</button></div></section><aside class="inspector">'+side()+'</aside></div><footer><span>独立开源实验项目 · 基础 DC LED 仿真，尚不支持 Arduino 代码执行</span><span>v0.1.1 · TypeScript + Vite</span></footer><input id="file" type="file" accept=".json" hidden/>'}
function add(kind:Kind,x?:number,y?:number){const b=copy();project.parts.push({id:uid(),kind,x:x??300,y:y??300,rotation:0,value:kind==='resistor'?220:kind==='battery'?9:undefined});commit(b)}
function connect(a:Endpoint){if(!wiring){wiring=a;return render()}if(wiring.componentId===a.componentId&&wiring.pinId===a.pinId){wiring=null;return render()}const b=copy();project.wires.push({id:uid(),from:wiring,to:a,color:'#e45454'});wiring=null;commit(b)}
function download(text:string,name:string){const url=URL.createObjectURL(new Blob([text]));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
app.addEventListener('click',e=>{const t=e.target as Element;
 const p=t.closest<SVGElement>('[data-pin]');if(p){const g=p.closest<SVGGElement>('[data-part]');if(g){connect({componentId:g.dataset.part!,pinId:p.dataset.pin!});return}}
 const part=t.closest<SVGGElement>('[data-part]');if(part){selection=part.dataset.part!;render();return}
 const wire=t.closest<SVGElement>('[data-wire]');if(wire){selection=wire.getAttribute('data-wire');render();return}
 const k=t.closest<HTMLElement>('[data-kind]');if(k){add(k.dataset.kind as Kind);return}
 const a=t.closest<HTMLElement>('[data-action]');if(!a)return;
 switch(a.dataset.action){
 case 'new':{const b=copy();project={name:'未命名电路',parts:[],wires:[],code:project.code};selection=null;commit(b);break}
 case 'sample':{const b=copy();project=demo();selection=null;commit(b);break}
 case 'undo':revert(undo,redo);break;case 'redo':revert(redo,undo);break;
 case 'rotate':{const b=copy();project.parts=project.parts.map(c=>c.id===selection?{...c,rotation:(c.rotation+90)%360}:c);commit(b);break}
 case 'delete':{const b=copy();project.parts=project.parts.filter(c=>c.id!==selection);project.wires=project.wires.filter(w=>w.id!==selection&&w.from.componentId!==selection&&w.to.componentId!==selection);selection=null;commit(b);break}
 case 'code':showCode=!showCode;render();break;case 'parts':selection=null;showCode=false;render();break;
 case 'run':isRunning=!isRunning;render();break;
 case 'zoom-in':zoom=Math.min(2,zoom+.1);render();break;case 'zoom-out':zoom=Math.max(.4,zoom-.1);render();break;case 'fit':zoom=1;panX=0;panY=0;render();break;
 case 'export':download(JSON.stringify(project,null,2),project.name+'.json');break;
 case 'download-code':download(project.code,'circuit.ino');break;
 case 'import':app.querySelector<HTMLInputElement>('#file')?.click();break}
});
app.addEventListener('input',e=>{const t=e.target as HTMLInputElement;if(t.id==='search'){search=t.value;render();app.querySelector<HTMLInputElement>('#search')?.focus()}if(t.id==='code'){project.code=t.value;save()}});
app.addEventListener('change',async e=>{const t=e.target as HTMLInputElement;if(t.id==='name'){project.name=t.value.trim()||'未命名电路';save();render()}if(t.id==='value'){const c=project.parts.find(p=>p.id===selection);const num=Number(t.value);if(c&&num>0){const b=copy();c.value=num;commit(b)}}if(t.id==='file'&&t.files?.[0]){try{const p=JSON.parse(await t.files[0].text());if(!validProject(p))throw Error();const b=copy();project=p;selection=null;commit(b)}catch{alert('JSON 工程文件格式不正确')}}});
app.addEventListener('dragstart',e=>{const p=(e.target as Element).closest<HTMLElement>('[data-kind]');if(p)e.dataTransfer?.setData('text/circuit-kind',p.dataset.kind!)});
app.addEventListener('dragover',e=>{if((e.target as Element).closest('.canvas'))e.preventDefault()});
app.addEventListener('drop',e=>{const svg=app.querySelector<SVGSVGElement>('#board');const kind=e.dataTransfer?.getData('text/circuit-kind') as Kind;if(!svg||!parts.includes(kind)||!(e.target as Element).closest('.canvas'))return;e.preventDefault();const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const m=svg.getScreenCTM();if(!m)return;const p=pt.matrixTransform(m.inverse());add(kind,(p.x-panX)/zoom-size[kind][0]/2,(p.y-panY)/zoom-size[kind][1]/2)});
app.addEventListener('pointerdown',e=>{
 if(e.button!==0)return;
 const svg=app.querySelector<SVGSVGElement>('#board'),target=e.target as Element;
 const component=target.closest<SVGGElement>('[data-part]');
 if(!svg||!component||target.closest('[data-pin]'))return;
 const c=project.parts.find(p=>p.id===component.dataset.part);if(!c)return;
 drag={id:c.id,x:e.clientX,y:e.clientY,ox:c.x,oy:c.y,before:copy()};
 selection=c.id;render();
});
window.addEventListener('pointermove',e=>{
 if(!drag)return;
 const svg=app.querySelector<SVGSVGElement>('#board'),c=project.parts.find(p=>p.id===drag!.id);
 const matrix=svg?.getScreenCTM();
 if(!c||!matrix)return;
 const scale=Math.hypot(matrix.a,matrix.b)*zoom;
 if(scale<=0)return;
 c.x=Math.round((drag.ox+(e.clientX-drag.x)/scale)*2)/2;
 c.y=Math.round((drag.oy+(e.clientY-drag.y)/scale)*2)/2;
 refreshScene();
});
window.addEventListener('pointerup',()=>{if(!drag)return;const d=drag;drag=null;const c=project.parts.find(p=>p.id===d.id);if(c&&(c.x!==d.ox||c.y!==d.oy))commit(d.before)});
window.addEventListener('keydown',e=>{const t=e.target as HTMLElement;if(['INPUT','TEXTAREA'].includes(t.tagName))return;if((e.metaKey||e.ctrlKey)&&e.key==='z'){e.preventDefault();revert(e.shiftKey?redo:undo,e.shiftKey?undo:redo)}else if(e.key==='Escape'){wiring=null;selection=null;render()}else if(e.key==='Delete'){const b=copy();project.parts=project.parts.filter(c=>c.id!==selection);project.wires=project.wires.filter(w=>w.id!==selection);selection=null;commit(b)}});
render();
