import type { SchematicComponent, SchematicDiagram, SchematicNet, SchematicResult } from '../core/schematic.js';
import { routeSchematic } from '../core/schematic-routing.js';

const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]!));

const palette=['#12877e','#437cb7','#b77745','#8d6ab2','#5c8b42','#b05f85','#568c9e','#a88638'];
const colorFor=(id:string)=>{
 const number=Number(id.slice(1));
 return palette[(Math.max(1,Number.isFinite(number)?number:1)-1)%palette.length];
};

function schematicSymbol(component:SchematicComponent):string {
 // Small original vector symbols. Generic multi-pin modules are explicitly
 // schematic blocks; no claim of manufacturer-accurate schematic artwork.
 const x=component.x+56,y=component.y+55;
 const stroke='stroke="#314c5a" stroke-width="2.4" fill="none" stroke-linecap="round"';
 switch(component.kind){
  case 'resistor':return '<g '+stroke+'><path d="M'+(x-30)+' '+y+'h12l6 -8 9 16 9 -16 9 16 9 -8h12"/></g>';
  case 'capacitor':return '<g '+stroke+'><path d="M'+(x-26)+' '+y+'h19m0 -15v30m12 -30v30m0 -15h21"/></g>';
  case 'battery':return '<g '+stroke+'><path d="M'+(x-30)+' '+y+'h15m0 -17v34m9 -25v16m0 -8h36"/></g>';
  case 'led':return '<g '+stroke+'><path d="M'+(x-26)+' '+y+'h13m25 0h13M'+(x+13)+' '+(y-16)+'v32"/>'+
    '<path d="M'+(x-12)+' '+(y-16)+'l25 16 -25 16z" fill="#dbeff0"/>'+
    '<path d="M'+(x+1)+' '+(y-19)+'l12 -11m-3 0h4v4m-24 5l12 -11m-3 0h4v4"/></g>';
  case 'potentiometer':return '<g '+stroke+'><path d="M'+(x-30)+' '+y+'h10l5 -8 7 16 7 -16 7 16 5 -8h10"/>'+
    '<path d="M'+x+' '+(y-25)+'v12m-6 -6l6 6 6 -6"/></g>';
  case 'pushbutton':return '<g '+stroke+'><circle cx="'+(x-23)+'" cy="'+y+'" r="4"/><circle cx="'+(x+23)+'" cy="'+y+'" r="4"/>'+
    '<path d="M'+(x-20)+' '+(y-14)+'h40m-20 -10v10"/></g>';
  case 'servo':return '<g '+stroke+'><rect x="'+(x-26)+'" y="'+(y-21)+'" width="52" height="42" rx="3"/>'+
    '<circle cx="'+x+'" cy="'+(y-1)+'" r="11"/><path d="M'+(x-6)+' '+(y+8)+'l12 -18"/>'+
    '<text x="'+x+'" y="'+(y+35)+'" text-anchor="middle" font-size="8" fill="#314c5a" stroke="none">PWM / + / -</text></g>';
  case 'switch':return '<g '+stroke+'><circle cx="'+(x-25)+'" cy="'+y+'" r="4"/><circle cx="'+(x+25)+'" cy="'+y+'" r="4"/>'+
    '<path d="M'+(x-21)+' '+(y-2)+'L'+(x+21)+' '+(component.switchClosed?y-2:y-18)+'"/></g>';
  case 'multimeter':case 'ammeter':return '<g '+stroke+'><circle cx="'+x+'" cy="'+y+'" r="19"/>'+
    '<text x="'+x+'" y="'+(y+6)+'" text-anchor="middle" fill="#314c5a" stroke="none" font-size="19">'+(component.kind==='multimeter'?'V':'A')+'</text></g>';
  case 'buzzer':return '<g '+stroke+'><circle cx="'+x+'" cy="'+y+'" r="19"/>'+
    '<path d="M'+(x-6)+' '+(y-5)+'l12 5 -12 5z"/></g>';
  default:return '<g><rect x="'+(x-27)+'" y="'+(y-21)+'" width="54" height="42" rx="5" fill="#eaf3f5" stroke="#6b9eaa" stroke-width="1.6"/>'+
    '<text x="'+x+'" y="'+(y+5)+'" text-anchor="middle" fill="#315967" font-size="10" font-weight="700">'+
    escape(component.kind==='arduino'?'UNO':'PART')+'</text></g>';
 }
}

function svgNet(net:SchematicNet):string {
 const color=colorFor(net.id),sum=net.endpointKeys.length+net.boardContacts.length;
 return '<g class="sch-net" data-schematic-net="'+escape(net.id)+'">'+
   '<rect x="'+net.x+'" y="'+(net.y-21)+'" width="164" height="43" rx="9" fill="#fff" stroke="'+color+'" stroke-width="2"/>'+
   '<circle cx="'+(net.x+18)+'" cy="'+net.y+'" r="6" fill="'+color+'"/>'+
   '<text x="'+(net.x+35)+'" y="'+(net.y-2)+'" font-weight="750" font-size="15" fill="#294655">'+escape(net.id)+'</text>'+
   '<text x="'+(net.x+35)+'" y="'+(net.y+13)+'" font-size="10" fill="#6b8694">'+
   sum+' 端子 · '+net.boardContacts.length+' 插孔</text>'+
   '<title>'+escape(net.id+': '+[...net.endpointKeys,...net.boardContacts].join('、'))+'</title></g>';
}

function svgComponent(component:SchematicComponent):string {
 const {x,y,width,height}=component;
 const body='<rect class="sch-card" x="'+x+'" y="'+y+'" width="'+width+
   '" height="'+height+'" rx="10" fill="#fff" stroke="#cbdce2" stroke-width="1.4"/>';
 const label='<text x="'+(x+118)+'" y="'+(y+30)+'" font-size="15" font-weight="700" fill="#233f4c">'+
   escape(component.reference+' · '+component.label)+'</text>'+
   '<text x="'+(x+118)+'" y="'+(y+48)+'" font-size="11" fill="#6a8391">'+
   escape(component.id+' · '+component.specification)+'</text>';
 const contacts=component.terminals.map(t=>{
   const fill=t.netId?colorFor(t.netId):'#d1dbe0';
   return '<g class="sch-terminal" data-terminal="'+escape(t.componentId+'::'+t.pinId)+'" '+
     'data-schematic-net="'+escape(t.netId??'NC')+'">'+
     '<circle cx="'+t.x+'" cy="'+t.y+'" r="5.5" fill="'+fill+'" stroke="#fff" stroke-width="1.7"/>'+
     '<text x="'+(t.x-15)+'" y="'+(t.y+4)+'" text-anchor="end" font-size="11" fill="#4b6572">'+
     escape(t.pinId+' · '+(t.netId??'NC'))+'</text></g>';
 }).join('');
 return '<g class="sch-component" data-schematic-part="'+escape(component.id)+'">'+
   body+schematicSymbol(component)+label+contacts+'</g>';
}

const STYLE='<style>'+
 '.sch-root{font-family:Inter,Arial,"Noto Sans",sans-serif}.sch-title{font-size:19px;font-weight:750;fill:#254454}'+
 '.sch-caption{font-size:11px;fill:#738c97}.sch-col-label{font-size:13px;font-weight:700;fill:#6d8791}'+
 '.sch-link,.sch-bus{fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;opacity:.86;pointer-events:none}'+
 '.sch-crossover,.sch-junction{pointer-events:none}.sch-card:hover{stroke:#42a69f;stroke-width:2}'+
 '</style>';

/** Standalone deterministic SVG: deliberately no JS, HTML or foreignObject. */
export function schematicSvg(result:SchematicDiagram):string {
 const routing=routeSchematic(result);
 const links=routing.mode==='orthogonal'?[
   ...routing.links.map(line=>'<path class="sch-link" data-schematic-net="'+escape(line.netId)+'" '+
     'd="M'+line.x1+' '+line.y+' H'+line.x2+'" stroke="'+colorFor(line.netId)+'"/>'),
   ...routing.buses.map(bus=>'<path class="sch-bus" data-schematic-net="'+escape(bus.netId)+'" '+
     'd="M'+bus.x+' '+bus.y1+' V'+bus.y2+' M'+bus.x+' '+bus.netY+' H'+bus.netX+
     '" stroke="'+colorFor(bus.netId)+'"/>'),
   ...routing.crossings.map(cross=>'<g class="sch-crossover" data-horizontal-net="'+escape(cross.horizontalNet)+
     '" data-vertical-net="'+escape(cross.verticalNet)+'" pointer-events="none">'+
     '<circle cx="'+cross.x+'" cy="'+cross.y+'" r="10" fill="#f8fbfc"/>'+
     '<path d="M'+cross.x+' '+(cross.y-10)+'v20" fill="none" stroke="'+colorFor(cross.verticalNet)+'" stroke-width="2.4"/>'+
     '<path d="M'+(cross.x-10)+' '+cross.y+' Q'+cross.x+' '+(cross.y-13)+' '+(cross.x+10)+' '+cross.y+
     '" fill="none" stroke="'+colorFor(cross.horizontalNet)+'" stroke-width="2.4"/></g>'),
   ...routing.junctions.map(joint=>'<circle class="sch-junction" data-schematic-net="'+escape(joint.netId)+'" '+
     'cx="'+joint.x+'" cy="'+joint.y+'" r="3.1" fill="'+colorFor(joint.netId)+'"/>')
 ].join(''):'';
 const body=result.components.map(svgComponent).join('');
 const nets=result.nets.map(svgNet).join('');
 const empty=!result.components.length&&!result.nets.length?
   '<text x="55" y="155" fill="#76909a" font-size="16">电路中尚无元件或已使用的电气网络</text>':'';
 return '<svg class="schematic-svg sch-root" xmlns="http://www.w3.org/2000/svg" '+
   'width="'+result.width+'" height="'+result.height+'" viewBox="0 0 '+result.width+' '+result.height+'" '+
   'data-schematic-route-mode="'+routing.mode+'" role="img" aria-label="根据真实 Netlist 自动生成的电路连接示意图">'+
   STYLE+
   '<rect width="'+result.width+'" height="'+result.height+'" fill="#f8fbfc"/>'+
   '<text class="sch-title" x="38" y="39">'+escape(result.name)+'</text>'+
   '<text class="sch-caption" x="38" y="61">同一 N 编号表示实际电气等势网络；路径交叉不表示新连接。未连接端子标记 NC。</text>'+
   '<text class="sch-col-label" x="40" y="81">真实元件与端子</text>'+
   '<text class="sch-col-label" x="770" y="81">电气网络</text>'+
   links+body+nets+empty+'</svg>';
}

export function renderSchematicPanel(result:SchematicResult,zoom=1):string {
 const scale=Number.isFinite(zoom)?Math.max(0.5,Math.min(2,zoom)):1;
 const routeInfo=result.ok?routeSchematic(result):null;
 const inner=result.ok?
   '<div class="schematic-toolbar-stats"><span>元件 <b>'+result.components.length+'</b></span>'+
   '<span>导通网络 <b>'+result.nets.length+'</b></span>'+
   '<span>未连接端子 <b>'+result.unconnectedTerminals+'</b></span>'+
   '<span>实际导线 <b>'+result.wireCount+'</b></span>'+
   '<span>插孔接触 <b>'+result.insertionCount+'</b></span></div>'+
   '<div class="schematic-view-toolbar" role="group" aria-label="原理图缩放">'+
   '<span>只读原理图 · '+(routeInfo?.mode==='orthogonal'?'自动正交布线':'网络编号模式')+'</span>'+
   '<button data-action="schematic-zoom-out" aria-label="缩小原理图" '+(scale<=0.5?'disabled':'')+'>−</button>'+
   '<output aria-label="原理图缩放比例">'+Math.round(scale*100)+'%</output>'+
   '<button data-action="schematic-zoom-in" aria-label="放大原理图" '+(scale>=2?'disabled':'')+'>＋</button>'+
   '<button data-action="schematic-zoom-reset" aria-label="恢复原理图实际尺寸">1:1</button>'+
   '<label class="schematic-net-filter">网络 <select id="schematic-net-focus" aria-label="高亮原理图电气网络">'+
   '<option value="">全部网络</option>'+
   result.nets.map(net=>'<option value="'+escape(net.id)+'">'+escape(net.id)+' · '+
     (net.endpointKeys.length+net.boardContacts.length)+' 接点</option>').join('')+
   '</select></label></div>'+
   '<div class="schematic-scroll"><div class="schematic-sheet" style="width:'+Math.round(result.width*scale)+'px;height:'+Math.round(result.height*scale)+'px">'+schematicSvg(result)+'</div></div>'+
   '<p class="schematic-net-summary" role="status" hidden></p>'+
   (routeInfo?.reason?'<p class="schematic-warning">'+escape(routeInfo.reason)+'</p>':'')+
   (result.warnings.length?'<p class="schematic-warning">'+escape(result.warnings.join('；'))+'</p>':'')+
   '<p class="schematic-disclaimer">实心圆点表示同网络汇流；拱形跨线属于不同网络且不导通，最终连通性只由 N 编号和 Netlist 决定。面包板插孔按真实连接合并；部分复杂器件仍使用简化图形，并非原版像素级原理图。</p>':
   '<div class="schematic-unavailable" role="status"><strong>暂不能生成完整原理图</strong>'+
   '<p>'+escape(result.reason)+'</p><small>原电路与仿真均未改变；不会输出不完整的原理图。</small></div>';
 return '<div class="schematic-shade" data-action="schematic-close"></div>'+
   '<section class="schematic-dialog" role="dialog" aria-modal="true" aria-labelledby="schematic-title">'+
   '<div class="schematic-heading"><div><h2 id="schematic-title">自动原理图 · Schematic</h2>'+
   '<p>依据元件引脚、真实导线、面包板插孔和开关导通状态生成</p></div>'+
   '<button data-action="schematic-close" aria-label="关闭原理图">× 关闭</button></div>'+
   inner+
   '<div class="schematic-actions"><button data-action="schematic-close">返回电路</button>'+
   '<button data-action="schematic-export" '+(!result.ok?'disabled':'')+'>导出 SVG</button></div></section>';
}
