import { pins, type Endpoint, type Project } from '../model.js';
export interface Netlist { netOf(endpoint:Endpoint):string|null; warnings:string[] }
class UnionFind {
  private parents=new Map<string,string>();
  add(key:string){if(!this.parents.has(key))this.parents.set(key,key)}
  has(key:string){return this.parents.has(key)}
  find(key:string):string {const p=this.parents.get(key);if(p===undefined)throw Error('Invalid terminal');if(p===key)return key;const root=this.find(p);this.parents.set(key,root);return root}
  union(a:string,b:string){const ra=this.find(a),rb=this.find(b);if(ra!==rb)this.parents.set(rb,ra)}
}
export const terminalKey=(endpoint:Endpoint)=>`${endpoint.componentId}::${endpoint.pinId}`;
function groupForBreadboard(pinId:string):string|null {
  if(pinId==='plus')return 'rail:top-plus:0';
  if(pinId==='minus')return 'rail:bottom-minus:0';
  const rail=/^(top-plus|top-minus|bottom-plus|bottom-minus)-(\d+)$/.exec(pinId);
  if(rail)return `rail:${rail[1]}:${Number(rail[2])<11?0:1}`;
  const hole=/^hole-([a-j])-(\d+)$/.exec(pinId);
  if(hole)return `strip:${hole[1]<='e'?'upper':'lower'}:${hole[2]}`;
  return null;
}
/** Only wires and known breadboard internal contacts are electrically joined. */
export function buildNetlist(doc:Project):Netlist {
  const uf=new UnionFind();
  for(const c of doc.parts){
    const first=new Map<string,string>();
    for(const pinId of Object.keys(pins[c.kind])){
      const key=terminalKey({componentId:c.id,pinId});uf.add(key);
      const group=c.kind==='breadboard'?groupForBreadboard(pinId):null;
      if(group){const x=first.get(group);if(x)uf.union(key,x);else first.set(group,key)}
    }
    if(c.kind==='switch'&&c.closed)uf.union(terminalKey({componentId:c.id,pinId:'a'}),terminalKey({componentId:c.id,pinId:'b'}));
    /* pins are deliberately stable across toggles */
  }
  const warnings:string[]=[];
  for(const w of doc.wires){const a=terminalKey(w.from),b=terminalKey(w.to);if(uf.has(a)&&uf.has(b))uf.union(a,b);else warnings.push(`导线 ${w.id} 存在无效端点`)}
  return {netOf(e){const key=terminalKey(e);return uf.has(key)?uf.find(key):null},warnings};
}
