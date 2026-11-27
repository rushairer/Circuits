import type { SchematicComponent, SchematicDiagram, SchematicTerminal } from './schematic.js';

export interface BranchStep {
 component:SchematicComponent;
 from:SchematicTerminal;
 to:SchematicTerminal;
}
export interface SchematicBranches {
 source:BranchStep;
 branches:BranchStep[][];
}

/** Recognize disjoint series paths in parallel across one real battery.
 * No implicit ground, guessed connections, omitted components or partial
 * layouts. Unsupported topologies retain the complete existing bus view.
 */
export function schematicBranches(diagram:SchematicDiagram):SchematicBranches|null {
 const components=diagram.components;
 if(components.length<2||components.length>49||diagram.unconnectedTerminals)return null;
 const sources=components.filter(c=>c.kind==='battery');
 if(sources.length!==1)return null;
 const battery=sources[0],positive=battery.terminals.find(t=>t.pinId==='positive'),
  negative=battery.terminals.find(t=>t.pinId==='negative');
 if(battery.terminals.length!==2||!positive?.netId||!negative?.netId||positive.netId===negative.netId)return null;
 const high=positive.netId,low=negative.netId;
 const known=new Set(diagram.nets.map(n=>n.id));
 if(known.size!==diagram.nets.length||!known.has(high)||!known.has(low))return null;
 const edges=new Map<string,BranchStep[]>();
 const add=(net:string,step:BranchStep)=>{
  const list=edges.get(net)??[];list.push(step);edges.set(net,list);
 };
 for(const c of components){
  if(c===battery)continue;
  if(!['resistor','led','capacitor','switch','pushbutton','buzzer','multimeter','ammeter'].includes(c.kind)||c.terminals.length!==2)return null;
  const [a,b]=c.terminals;
  if(!a.netId||!b.netId||a.netId===b.netId||!known.has(a.netId)||!known.has(b.netId))return null;
  add(a.netId,{component:c,from:a,to:b});add(b.netId,{component:c,from:b,to:a});
 }
 // Every internal net must have exactly two device terminals. Breadboard
 // contacts may be present, but a board-only or unused network is not lost.
 for(const id of known){
  const count=edges.get(id)?.length??0;
  if(id===high||id===low){if(!count||count>6)return null;}
  else if(count!==2)return null;
 }
 const starts=[...(edges.get(high)??[])].sort((a,b)=>a.component.id.localeCompare(b.component.id,'en'));
 const used=new Set<string>(),branches:BranchStep[][]=[];
 for(const start of starts){
  const branch:BranchStep[]=[];
  let step=start;
  while(true){
   if(used.has(step.component.id)||branch.length>=8)return null;
   used.add(step.component.id);branch.push(step);
   const next=step.to.netId!;
   if(next===low)break;
   if(next===high)return null;
   const candidates=(edges.get(next)??[]).filter(e=>e.component.id!==step.component.id);
   if(candidates.length!==1)return null;
   step=candidates[0];
  }
  branches.push(branch);
 }
 if(used.size!==components.length-1)return null;
 return {source:{component:battery,from:positive,to:negative},branches};
}
