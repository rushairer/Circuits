import {
 pins, parts as PART_KINDS, labels, type Endpoint, type Kind, type Project
} from '../model.js';
import { buildNetlist, terminalKey } from './netlist.js';
import { createBom } from './bom.js';

export const SCHEMATIC_MAX_COMPONENTS=80;
export const SCHEMATIC_MAX_BREADBOARDS=24;
export const SCHEMATIC_MAX_TERMINALS=350;
export const SCHEMATIC_MAX_CONNECTED_NETS=160;

export interface SchematicTerminal {
 componentId:string;
 pinId:string;
 netId:string|null;
 x:number;
 y:number;
}
export interface SchematicComponent {
 id:string;
 kind:Kind;
 label:string;
 reference:string;
 specification:string;
 switchClosed?:boolean;
 switchContactOhms?:number;
 x:number;
 y:number;
 width:number;
 height:number;
 terminals:SchematicTerminal[];
}
export interface SchematicNet {
 id:string;
 endpointKeys:string[];
 boardContacts:string[];
 x:number;
 y:number;
}
export interface SchematicDiagram {
 ok:true;
 name:string;
 width:number;
 height:number;
 components:SchematicComponent[];
 nets:SchematicNet[];
 unconnectedTerminals:number;
 wireCount:number;
 insertionCount:number;
 warnings:string[];
}
export interface SchematicUnavailable {
 ok:false;
 reason:string;
 components:number;
 wires:number;
}
export type SchematicResult=SchematicDiagram|SchematicUnavailable;

const COMPONENT_X=38;
const COMPONENT_WIDTH=405;
const NET_X=770;
const BUS_START=490;
const BUS_STEP=28;
const NET_Y=118;
const NET_ROW=56;
const PIN_ROW=23;
const CARD_TOP=93;
const PINS_START=62;
const MAX_BOARD_CONTACTS=350;

const order=new Map(PART_KINDS.map((kind,i)=>[kind,i]));
const referencePrefix:Record<Kind,string>={
 battery:'BT',resistor:'R',led:'D',breadboard:'BB',arduino:'U',
 switch:'S',pushbutton:'SW',potentiometer:'RV',capacitor:'C',
 buzzer:'BZ',multimeter:'VM',ammeter:'AM',servo:'M'
};
const endpointString=(e:Endpoint)=>terminalKey(e);

/** Generated presentation of Netlist equivalence classes, not a new solver.
 * Board internals, explicit insertions, ideal switches and wires all use the
 * same netOf() as simulation. Canvas positions, bends and crossings do not.
 */
export function createSchematic(project:Project):SchematicResult {
 const devices=project.parts.filter(p=>p.kind!=='breadboard');
 const fail=(reason:string):SchematicUnavailable=>({
   ok:false,reason,components:devices.length,wires:project.wires.length
 });
 if(devices.length>SCHEMATIC_MAX_COMPONENTS)
   return fail('元件数量超过当前只读原理图上限（'+SCHEMATIC_MAX_COMPONENTS+'）；电路数据未改变。');
 const boardIds=new Set(project.parts.filter(p=>p.kind==='breadboard').map(p=>p.id));
 // Each breadboard owns hundreds of internal sockets in the shared Netlist.
 // Reject pathological imported scenes before allocating their UnionFind sets.
 if(boardIds.size>SCHEMATIC_MAX_BREADBOARDS)
   return fail('面包板数量超过当前只读原理图上限（'+SCHEMATIC_MAX_BREADBOARDS+'）。');
 const referencedBoard=new Map<string,Endpoint>();
 const addBoard=(endpoint:Endpoint)=>{
   if(boardIds.has(endpoint.componentId))
     referencedBoard.set(endpointString(endpoint),endpoint);
 };
 for(const wire of project.wires){addBoard(wire.from);addBoard(wire.to);}
 for(const insertion of project.insertions??[])
   addBoard({componentId:insertion.boardId,pinId:insertion.holeId});
 if(referencedBoard.size>MAX_BOARD_CONTACTS)
   return fail('面包板实际使用插孔超过当前原理图显示上限，避免生成不完整的电气示意。');

 const netlist=buildNetlist(project);
 const groups=new Map<string,{devices:Endpoint[];board:Endpoint[]}>();
 const addMember=(endpoint:Endpoint,isBoard:boolean)=>{
   const root=netlist.netOf(endpoint);
   if(root===null)return;
   let group=groups.get(root);
   if(!group){group={devices:[],board:[]};groups.set(root,group);}
   (isBoard?group.board:group.devices).push(endpoint);
 };
 const sortedDevices=[...devices].sort((a,b)=>
   (order.get(a.kind)??999)-(order.get(b.kind)??999)||a.id.localeCompare(b.id,'en'));
 for(const device of sortedDevices)
   for(const pinId of Object.keys(pins[device.kind]))
     addMember({componentId:device.id,pinId},false);
 for(const endpoint of [...referencedBoard.values()].sort((a,b)=>
   endpointString(a).localeCompare(endpointString(b),'en')))addMember(endpoint,true);

 const groupKeys=[...groups.values()].filter(group=>
   group.devices.length+group.board.length>=2
 ).map(group=>({
   group,
   names:[...group.devices,...group.board].map(endpointString).sort((a,b)=>a.localeCompare(b,'en'))
 })).sort((a,b)=>a.names[0].localeCompare(b.names[0],'en'));
 if(groupKeys.length>SCHEMATIC_MAX_CONNECTED_NETS)
   return fail('导通网络数量超过当前原理图上限（'+SCHEMATIC_MAX_CONNECTED_NETS+'），未生成易误导的截断图。');
 let totalTerminals=0;
 for(const device of sortedDevices)totalTerminals+=Object.keys(pins[device.kind]).length;
 if(totalTerminals>SCHEMATIC_MAX_TERMINALS)
   return fail('非面包板器件端子超过当前原理图上限（'+SCHEMATIC_MAX_TERMINALS+'）。');

 const netIdByKey=new Map<string,string>();
 const nets:SchematicNet[]=groupKeys.map(({group,names},index)=>{
   const id='N'+(index+1);
   for(const name of names)netIdByKey.set(name,id);
   return {
     id,endpointKeys:group.devices.map(endpointString).sort((a,b)=>a.localeCompare(b,'en')),
     boardContacts:group.board.map(endpointString).sort((a,b)=>a.localeCompare(b,'en')),
     x:NET_X,y:NET_Y+index*NET_ROW
   };
 });
 const references=new Map<Kind,number>();
 const specification=new Map<string,string>();
 for(const row of createBom(project).rows)for(const id of row.ids)
   specification.set(id,row.specification);
 let nextY=CARD_TOP;
 const components:SchematicComponent[]=sortedDevices.map(device=>{
   const entries=Object.keys(pins[device.kind]);
   const height=Math.max(92,PINS_START+entries.length*PIN_ROW+12);
   const x=COMPONENT_X,y=nextY;
   nextY+=height+18;
   const index=(references.get(device.kind)??0)+1;
   references.set(device.kind,index);
   return {
     id:device.id,kind:device.kind,label:labels[device.kind],
     reference:referencePrefix[device.kind]+index,
     specification:device.kind==='switch'?
       (device.closed?'闭合':'断开')+
       (device.closed&&device.contactOhms?' · '+device.contactOhms+' Ω':''):
       (specification.get(device.id)??'标准'),
     ...(device.kind==='switch'?{
       switchClosed:Boolean(device.closed),switchContactOhms:device.contactOhms??0
     }:{}),
     x,y,width:COMPONENT_WIDTH,height,
     terminals:entries.map((pinId,index)=>({
       componentId:device.id,pinId,
       netId:netIdByKey.get(endpointString({componentId:device.id,pinId}))??null,
       x:x+COMPONENT_WIDTH-7,y:y+PINS_START+index*PIN_ROW
     }))
   };
 });
 // Place net names near the median vertical position of their actual pins.
 // The identifiers themselves remain sorted by terminal identity, not geometry.
 const members=new Map<string,number[]>();
 for(const c of components)for(const terminal of c.terminals)if(terminal.netId){
   const ys=members.get(terminal.netId)??[];
   ys.push(terminal.y);members.set(terminal.netId,ys);
 }
 const middle=(net:SchematicNet)=>{
   const ys=[...(members.get(net.id)??[])].sort((a,b)=>a-b);
   return ys.length?ys[Math.floor((ys.length-1)/2)]:NET_Y+Number(net.id.slice(1))*NET_ROW;
 };
 const ordered=[...nets].sort((a,b)=>middle(a)-middle(b)||a.id.localeCompare(b.id,'en'));
 let previousY=NET_Y-NET_ROW;
 const occupied=components.flatMap(c=>c.terminals.filter(t=>t.netId).map(t=>({netId:t.netId,y:t.y})));
 for(const net of ordered){
   let target=Math.max(NET_Y,Math.round(middle(net)),previousY+NET_ROW);
   // Avoid a net's horizontal name-lead overlapping a different net's pin.
   for(let attempts=0;attempts<32&&occupied.some(t=>t.netId!==net.id&&Math.abs(t.y-target)<10);attempts++)target+=12;
   net.y=target;previousY=target;
 }
 const netX=Math.max(NET_X,BUS_START+Math.max(0,nets.length-1)*BUS_STEP+95);
 for(const net of nets)net.x=netX;
 const height=Math.max(340,nextY+28,...nets.map(n=>n.y+65));
 return {
   ok:true,name:project.name,width:Math.max(990,netX+220),height,components,nets,
   unconnectedTerminals:components.flatMap(c=>c.terminals).filter(t=>t.netId===null).length,
   wireCount:project.wires.length,insertionCount:project.insertions?.length??0,
   warnings:netlist.warnings
 };
}
