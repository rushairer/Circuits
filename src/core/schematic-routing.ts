import type { SchematicDiagram, SchematicTerminal } from './schematic.js';

/**
 * Presentation-only orthogonal routing. Connections are inherited exclusively
 * from SchematicTerminal.netId; SVG intersections never join nets.
 */
export interface SchematicLink {netId:string;x1:number;y:number;x2:number}
export interface SchematicBus {netId:string;x:number;y1:number;y2:number;netX:number;netY:number}
export interface SchematicJunction {netId:string;x:number;y:number}
export interface SchematicCrossing {x:number;y:number;horizontalNet:string;verticalNet:string}
export interface SchematicRoutes {
 mode:'orthogonal'|'labels';
 links:SchematicLink[];
 buses:SchematicBus[];
 junctions:SchematicJunction[];
 crossings:SchematicCrossing[];
 reason:string|null;
}
export const SCHEMATIC_LANE_START=490;
export const SCHEMATIC_LANE_STEP=14;
export const SCHEMATIC_MAX_SEGMENTS=740;
export const SCHEMATIC_MAX_CROSSINGS=240;
const BRIDGE_CLEARANCE=10;
const empty=(reason:string):SchematicRoutes=>({
 mode:'labels',links:[],buses:[],junctions:[],crossings:[],reason
});
interface Horizontal {netId:string;y:number;x1:number;x2:number}
interface Vertical {netId:string;x:number;y1:number;y2:number}

export function routeSchematic(diagram:SchematicDiagram):SchematicRoutes {
 const nets=[...diagram.nets].sort((a,b)=>a.y-b.y||a.id.localeCompare(b.id,'en'));
 const pins=new Map<string,SchematicTerminal[]>();
 for(const component of diagram.components)
  for(const terminal of component.terminals)
   if(terminal.netId){
    const group=pins.get(terminal.netId)??[];
    group.push(terminal);
    pins.set(terminal.netId,group);
   }
 const links:SchematicLink[]=[],buses:SchematicBus[]=[],junctions:SchematicJunction[]=[];
 const horizontals:Horizontal[]=[],verticals:Vertical[]=[];
 for(let i=0;i<nets.length;i++){
  const net=nets[i],terminals=pins.get(net.id)??[];
  // Nets made solely of used breadboard contacts have no external symbol pins.
  // Keep their label, but do not invent an electrical device or a line.
  if(!terminals.length)continue;
  const lane=SCHEMATIC_LANE_START+i*SCHEMATIC_LANE_STEP;
  if(lane>=net.x-28)return empty('网络数量较多，显示准确的端子网络编号，不绘制拥挤的连接线。');
  let low=net.y,high=net.y;
  for(const terminal of terminals){
   low=Math.min(low,terminal.y);
   high=Math.max(high,terminal.y);
   links.push({netId:net.id,x1:terminal.x,y:terminal.y,x2:lane});
   horizontals.push({netId:net.id,y:terminal.y,x1:terminal.x,x2:lane});
   junctions.push({netId:net.id,x:lane,y:terminal.y});
  }
  buses.push({netId:net.id,x:lane,y1:low,y2:high,netX:net.x,netY:net.y});
  verticals.push({netId:net.id,x:lane,y1:low,y2:high});
  horizontals.push({netId:net.id,y:net.y,x1:lane,x2:net.x});
  junctions.push({netId:net.id,x:lane,y:net.y});
 }
 if(horizontals.length+verticals.length>SCHEMATIC_MAX_SEGMENTS)
  return empty('正交线段超过安全布局预算，仅显示完整的网络编号与端子关系。');
 const crossings:SchematicCrossing[]=[];
 const seen=new Set<string>();
 for(const horizontal of horizontals)
  for(const vertical of verticals){
   if(horizontal.netId===vertical.netId)continue;
   if(vertical.x<=horizontal.x1+BRIDGE_CLEARANCE||
      vertical.x>=horizontal.x2-BRIDGE_CLEARANCE||
      horizontal.y<=vertical.y1+BRIDGE_CLEARANCE||
      horizontal.y>=vertical.y2-BRIDGE_CLEARANCE)continue;
   const key=vertical.x+':'+horizontal.y;
   if(seen.has(key))continue;
   seen.add(key);
   crossings.push({x:vertical.x,y:horizontal.y,
     horizontalNet:horizontal.netId,verticalNet:vertical.netId});
   if(crossings.length>SCHEMATIC_MAX_CROSSINGS)
    return empty('不同电气网络交叉太密集，仅显示完整的网络编号，避免视觉误判。');
  }
 return {mode:'orthogonal',links,buses,junctions,crossings,reason:null};
}
