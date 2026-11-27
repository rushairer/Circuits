import type { SchematicComponent, SchematicDiagram, SchematicNet, SchematicResult } from '../core/schematic.js';
import { routeSchematic } from '../core/schematic-routing.js';
import { connectedSchematicSymbol } from './schematic-symbols.js';
import { schematicBranches } from '../core/schematic-branches.js';
import { branchSheetSize, renderBranchSchematic } from './schematic-branch-view.js';
import { nestedSchematic } from '../core/schematic-nested.js';
import { nestedSheetSize, renderNestedSchematic } from './schematic-nested-view.js';
import { schematicBridge } from '../core/schematic-bridge.js';
import { bridgeSheetSize, renderBridgeSchematic } from './schematic-bridge-view.js';
import { layeredSchematic } from '../core/schematic-layered.js';
import { renderLayeredSchematic } from './schematic-layered-view.js';

const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]!));

const palette=['#12877e','#437cb7','#b77745','#8d6ab2','#5c8b42','#b05f85','#568c9e','#a88638'];
const colorFor=(id:string)=>{
 const number=Number(id.slice(1));
 return palette[(Math.max(1,Number.isFinite(number)?number:1)-1)%palette.length];
};

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
 const symbol=connectedSchematicSymbol(component);
 const contacts=component.terminals.map(t=>{
   const fill=t.netId?colorFor(t.netId):'#fff';
   const lead=symbol?.leads.get(t.pinId);
   return '<g class="sch-terminal" data-terminal="'+escape(t.componentId+'::'+t.pinId)+'" '+
     'data-schematic-net="'+escape(t.netId??'NC')+'">'+
     (lead?'<path class="sch-pin-lead" d="'+lead+'" fill="none" stroke="'+(t.netId?fill:'#8599a3')+'" stroke-width="1.6"/>':'')+
     '<circle cx="'+t.x+'" cy="'+t.y+'" r="5.5" fill="'+fill+'" stroke="'+(t.netId?'#fff':'#8599a3')+'" stroke-width="1.7"/>'+
     '<text x="'+(t.x-15)+'" y="'+(t.y-5)+'" text-anchor="end" font-size="11" fill="#4b6572">'+
     escape(t.pinId+' · '+(t.netId??'NC'))+'</text></g>';
 }).join('');
 return '<g class="sch-component" data-schematic-part="'+escape(component.id)+'">'+
   body+label+contacts+(symbol?.body??'')+'</g>';
}

const STYLE='<style>'+
 '.sch-root{font-family:Inter,Arial,"Noto Sans",sans-serif}.sch-title{font-size:19px;font-weight:750;fill:#254454}'+
 '.sch-caption{font-size:11px;fill:#738c97}.sch-col-label{font-size:13px;font-weight:700;fill:#6d8791}'+
 '.sch-link,.sch-bus{fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;opacity:.86;pointer-events:none}'+
 '.sch-crossover,.sch-junction{pointer-events:none}.sch-card:hover{stroke:#42a69f;stroke-width:2}'+
 '</style>';

/** Standalone deterministic SVG: deliberately no JS, HTML or foreignObject. */
export function schematicSvg(result:SchematicDiagram):string {
 const branches=schematicBranches(result);
 if(branches)return renderBranchSchematic(result,branches,STYLE,colorFor);
 const nested=nestedSchematic(result);
 if(nested)return renderNestedSchematic(result,nested,STYLE,colorFor);
 const bridge=schematicBridge(result);
 if(bridge)return renderBridgeSchematic(result,bridge,STYLE,colorFor);
 const layered=layeredSchematic(result);
 if(layered)return renderLayeredSchematic(result,layered,STYLE,colorFor);
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

function schematicBody(result:SchematicResult,zoom=1):string {
 const scale=Number.isFinite(zoom)?Math.max(0.5,Math.min(2,zoom)):1;
 const branches=result.ok?schematicBranches(result):null;
 const nested=result.ok&&!branches?nestedSchematic(result):null;
 const bridge=result.ok&&!branches&&!nested?schematicBridge(result):null;
 const layered=result.ok&&!branches&&!nested&&!bridge?layeredSchematic(result):null;
 const routeInfo=result.ok&&!branches&&!nested&&!bridge&&!layered?routeSchematic(result):null;
 const sheet=branches?branchSheetSize(branches):nested?nestedSheetSize(nested):bridge?bridgeSheetSize:layered?layered:result.ok?result:null;
 const inner=result.ok?
   '<div class="schematic-toolbar-stats"><span>元件 <b>'+result.components.length+'</b></span>'+
   '<span>导通网络 <b>'+result.nets.length+'</b></span>'+
   '<span>未连接端子 <b>'+result.unconnectedTerminals+'</b></span>'+
   '<span>实际导线 <b>'+result.wireCount+'</b></span>'+
   '<span>插孔接触 <b>'+result.insertionCount+'</b></span></div>'+
   '<div class="schematic-view-toolbar" role="group" aria-label="原理图缩放">'+
   '<span>只读原理图 · '+(branches?'拓扑串并联布局':nested?'多级串并联布局':bridge?'桥式拓扑布局':layered?'通用分层布局':routeInfo?.mode==='orthogonal'?'自动正交布线':'网络编号模式')+'</span>'+
   '<button data-action="schematic-zoom-out" aria-label="缩小原理图" '+(scale<=0.5?'disabled':'')+'>−</button>'+
   '<output aria-label="原理图缩放比例">'+Math.round(scale*100)+'%</output>'+
   '<button data-action="schematic-zoom-in" aria-label="放大原理图" '+(scale>=2?'disabled':'')+'>＋</button>'+
   '<button data-action="schematic-zoom-reset" aria-label="恢复原理图实际尺寸">1:1</button>'+
   '<label class="schematic-net-filter">网络 <select id="schematic-net-focus" aria-label="高亮原理图电气网络">'+
   '<option value="">全部网络</option>'+
   result.nets.map(net=>'<option value="'+escape(net.id)+'">'+escape(net.id)+' · '+
     (net.endpointKeys.length+net.boardContacts.length)+' 接点</option>').join('')+
   '</select></label></div>'+
   '<div class="schematic-scroll"><div class="schematic-sheet" style="width:'+Math.round(sheet!.width*scale)+'px;height:'+Math.round(sheet!.height*scale)+'px">'+schematicSvg(result)+'</div></div>'+
   '<p class="schematic-net-summary" role="status" hidden></p>'+
   (routeInfo?.reason?'<p class="schematic-warning">'+escape(routeInfo.reason)+'</p>':'')+
   (result.warnings.length?'<p class="schematic-warning">'+escape(result.warnings.join('；'))+'</p>':'')+
   '<p class="schematic-disclaimer">实心圆点表示同网络汇流；拱形跨线属于不同网络且不导通，最终连通性只由 N 编号和 Netlist 决定。面包板插孔按真实连接合并；元件符号通过独立引脚接入网络；UNO 与伺服仍为简化模块，符合条件的单电池串并联、桥式及复杂双端器件网络采用拓扑布局，其他电路保留完整总线或网络编号布局；并非原版像素级原理图。</p>':
   '<div class="schematic-unavailable" role="status"><strong>暂不能生成完整原理图</strong>'+
   '<p>'+escape(result.reason)+'</p><small>原电路与仿真均未改变；不会输出不完整的原理图。</small></div>';
 return inner;
}

/** Legacy focus-contained viewer retained for existing sharing and browser flows. */
export function renderSchematicPanel(result:SchematicResult,zoom=1):string {
 const inner=schematicBody(result,zoom);
 return '<div class="schematic-shade" data-action="schematic-close"></div>'+
   '<section class="schematic-dialog" role="dialog" aria-modal="true" aria-labelledby="schematic-title">'+
   '<div class="schematic-heading"><div><h2 id="schematic-title">自动原理图 · Schematic</h2>'+
   '<p>依据元件引脚、真实导线、面包板插孔和开关导通状态生成</p></div>'+
   '<button data-action="schematic-close" aria-label="关闭原理图">× 关闭</button></div>'+
   inner+
   '<div class="schematic-actions"><button data-action="schematic-close">返回电路</button>'+
   '<button data-action="schematic-export" '+(!result.ok?'disabled':'')+'>导出 SVG</button></div></section>';
}

/** Primary editor-integrated read-only view; shares netlist, routes, zoom and export. */
export function renderSchematicWorkspace(result:SchematicResult,zoom=1):string {
 return '<section class="schematic-workspace read-only-workspace" aria-labelledby="inline-schematic-title">'+
   '<div class="schematic-heading"><div><h2 id="inline-schematic-title">原理图 · Schematic</h2>'+
   '<p>根据当前电路的真实引脚与连接自动生成，切换视图不会改动工程</p></div>'+
   '<button type="button" data-action="view-circuit">返回电路</button></div>'+
   schematicBody(result,zoom)+
   '<div class="schematic-actions"><button type="button" data-action="view-circuit">电路视图</button>'+
   '<button type="button" data-action="schematic-export" '+(!result.ok?'disabled':'')+'>导出 SVG</button></div></section>';
}
