import { labels, parts, type Kind, type Part, type Project } from '../model.js';
import { ledAppearance } from './led-colors.js';

export interface BomRow {
 kind:Kind;
 label:string;
 specification:string;
 quantity:number;
 ids:string[];
}
export interface BomReport {
 title:string;
 rows:BomRow[];
 totalComponents:number;
 totalWires:number;
 totalAnnotations:number;
}

/** The BOM is a view over authored physical components, not a netlist solver.
 * Component instances with the same kind and user-visible specification group
 * together while retaining stable part IDs for reference.
 */
function specification(part:Part):string {
 switch(part.kind){
  case 'battery':return formatValue(part.value??9,'V');
  case 'resistor':return formatValue(part.value??220,'Ω');
  case 'capacitor':return formatValue(part.value??100,'µF');
  case 'led':return ledAppearance(part.ledColor).label;
  case 'potentiometer':return part.value!==undefined?formatValue(part.value,'Ω'):'未指定';
  default:return '标准';
 }
}
function formatValue(value:number,unit:string):string {
 return Number.isFinite(value)?String(value)+' '+unit:'未指定';
}
export function createBom(project:Project):BomReport {
 const grouped=new Map<string,BomRow>();
 for(const part of project.parts){
  const spec=specification(part);
  const key=part.kind+'\u0000'+spec;
  let row=grouped.get(key);
  if(!row){
   row={kind:part.kind,label:labels[part.kind],specification:spec,quantity:0,ids:[]};
   grouped.set(key,row);
  }
  row.quantity++;
  row.ids.push(part.id);
 }
 const priority=new Map(parts.map((kind,index)=>[kind,index]));
 const rows=[...grouped.values()].sort((a,b)=>
   (priority.get(a.kind)??999)-(priority.get(b.kind)??999)||
   a.specification.localeCompare(b.specification,'zh-CN'));
 return {
  title:project.name,rows,totalComponents:project.parts.length,
  totalWires:project.wires.length,totalAnnotations:project.notes?.length??0
 };
}

/** Quote every CSV field, with Excel formula injection protection. */
function csvField(value:string|number):string {
 const input=String(value);
 const sanitized=/^[\s\uFEFF]*[=+@-]/.test(input)?"'"+input:input;
 return '"'+sanitized.replace(/"/g,'""')+'"';
}
export function bomCSV(report:BomReport):string {
 const lines=[
  ['序号','组件','规格','数量','组件 ID'],
  ...report.rows.map((row,index)=>[
   String(index+1),row.label,row.specification,String(row.quantity),row.ids.join('、')
  ])
 ];
 return '\uFEFF'+lines.map(fields=>fields.map(csvField).join(',')).join('\r\n')+'\r\n';
}
