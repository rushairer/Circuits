import type { SchematicDiagram } from './schematic.js';
import type { BranchStep } from './schematic-branches.js';

export interface SchematicBridge {
 source:BranchStep;
 upperLeft:BranchStep;
 lowerLeft:BranchStep;
 upperRight:BranchStep;
 lowerRight:BranchStep;
 cross:BranchStep;
}

/** Recognize the complete four-net, five-edge Wheatstone bridge (plus
 * one battery). Four resistor arms and a resistor or meter cross-link.
 * No guessed ground, electrical edits, omitted devices or partial layouts.
 */
export function schematicBridge(diagram:SchematicDiagram):SchematicBridge|null {
 const {components,nets}=diagram;
 if(components.length!==6||nets.length!==4||diagram.unconnectedTerminals||
    new Set(components.map(c=>c.id)).size!==6||new Set(nets.map(n=>n.id)).size!==4)return null;
 const sources=components.filter(c=>c.kind==='battery');
 if(sources.length!==1)return null;
 const battery=sources[0],positive=battery.terminals.find(t=>t.pinId==='positive'),
  negative=battery.terminals.find(t=>t.pinId==='negative');
 if(battery.terminals.length!==2||!positive?.netId||!negative?.netId||positive.netId===negative.netId)return null;
 const high=positive.netId,low=negative.netId,known=new Set(nets.map(n=>n.id));
 if(!known.has(high)||!known.has(low))return null;
 const [left,right]=[...known].filter(n=>n!==high&&n!==low).sort((a,b)=>a.localeCompare(b,'en'));
 const remaining=components.filter(c=>c!==battery);
 const take=(from:string,to:string,cross=false):BranchStep|null=>{
  const matches=remaining.filter(c=>c.terminals.length===2&&
   c.terminals.some(t=>t.netId===from)&&c.terminals.some(t=>t.netId===to));
  if(matches.length!==1)return null;
  const component=matches[0];
  if(component.kind!=='resistor'&&!(cross&&(component.kind==='multimeter'||component.kind==='ammeter')))return null;
  const a=component.terminals.find(t=>t.netId===from)!,b=component.terminals.find(t=>t.netId===to)!;
  remaining.splice(remaining.indexOf(component),1);
  return {component,from:a,to:b};
 };
 const upperLeft=take(high,left),lowerLeft=take(left,low),upperRight=take(high,right),
  lowerRight=take(right,low),cross=take(left,right,true);
 if(!upperLeft||!lowerLeft||!upperRight||!lowerRight||!cross||remaining.length)return null;
 return {source:{component:battery,from:positive,to:negative},upperLeft,lowerLeft,upperRight,lowerRight,cross};
}
