import type { Project } from '../model.js';
import { buildNetlist } from './netlist.js';
export interface Reading { lit:boolean; currentMilliAmps:number; reason:string }
interface Resistor { a:string; b:string; ohms:number }
interface Source { a:string; b:string; volts:number }
function solve(matrix:number[][],values:number[]):number[]|null {
 const n=values.length;
 for(let i=0;i<n;i++){
  let best=i;for(let j=i+1;j<n;j++)if(Math.abs(matrix[j][i])>Math.abs(matrix[best][i]))best=j;
  if(!Number.isFinite(matrix[best][i])||Math.abs(matrix[best][i])<1e-11)return null;
  [matrix[i],matrix[best]]=[matrix[best],matrix[i]];[values[i],values[best]]=[values[best],values[i]];
  const div=matrix[i][i];for(let k=i;k<n;k++)matrix[i][k]/=div;values[i]/=div;
  for(let j=i+1;j<n;j++){const factor=matrix[j][i];for(let k=i;k<n;k++)matrix[j][k]-=factor*matrix[i][k];values[j]-=factor*values[i]}
 }
 const result=Array<number>(n).fill(0);
 for(let i=n-1;i>=0;i--){result[i]=values[i];for(let j=i+1;j<n;j++)result[i]-=matrix[i][j]*result[j]}
 return result.every(Number.isFinite)?result:null;
}
/** Modified nodal analysis: ideal DC voltage sources plus positive resistors. */
export function solveDC(resistors:Resistor[],sources:Source[],ground:string):{voltage:Map<string,number>;currents:number[]}|null {
 const nodes=new Set<string>([ground]);for(const r of resistors){nodes.add(r.a);nodes.add(r.b)}for(const s of sources){nodes.add(s.a);nodes.add(s.b)}
 const names=[...nodes].filter(x=>x!==ground),idx=new Map(names.map((k,i)=>[k,i]));
 const count=names.length+sources.length;if(count>160)return null;
 const a=Array.from({length:count},()=>Array<number>(count).fill(0)),rhs=Array<number>(count).fill(0);
 for(const r of resistors){if(!Number.isFinite(r.ohms)||r.ohms<=0)return null;const g=1/r.ohms,p=idx.get(r.a),n=idx.get(r.b);if(p!==undefined)a[p][p]+=g;if(n!==undefined)a[n][n]+=g;if(p!==undefined&&n!==undefined){a[p][n]-=g;a[n][p]-=g}}
 for(let i=0;i<sources.length;i++){const s=sources[i],col=names.length+i,p=idx.get(s.a),n=idx.get(s.b);if(p!==undefined){a[p][col]++;a[col][p]++}if(n!==undefined){a[n][col]--;a[col][n]--}rhs[col]=s.volts}
 const x=solve(a,rhs);return x?{voltage:new Map([[ground,0],...names.map((k,i)=>[k,x[i]] as [string,number])]),currents:x.slice(names.length)}:null;
}
/**
 * Experimental DC support: exactly one battery and LED, arbitrary resistor
 * branches. LED is approximated by fixed forward drop (not SPICE physics).
 * Other depicted components, including Arduino, are not simulated.
 */
export function evaluate(project:Project):Reading {
 const batteries=project.parts.filter(p=>p.kind==='battery'),leds=project.parts.filter(p=>p.kind==='led');
 const off=(reason:string):Reading=>({lit:false,currentMilliAmps:0,reason});
 if(!batteries.length||!leds.length)return off('需要电池、LED 和正确接线');
 if(batteries.length!==1||leds.length!==1)return off('实验性求解器仅支持一个电源与一只 LED');
 const b=batteries[0],led=leds[0],graph=buildNetlist(project);
 if(graph.warnings.length)return off(graph.warnings[0]);
 const pin=(componentId:string,pinId:string)=>graph.netOf({componentId,pinId});
 const plus=pin(b.id,'positive'),minus=pin(b.id,'negative'),anode=pin(led.id,'anode'),cathode=pin(led.id,'cathode');
 if(!plus||!minus||!anode||!cathode)return off('引脚引用无效');
 if(plus===minus)return off('检测到电源短路');
 if(anode===cathode)return off('LED 引脚短接');
 const resistors:Resistor[]=[];
 for(const part of project.parts.filter(p=>p.kind==='resistor')){
  const ohms=part.value??220;if(!(ohms>0&&Number.isFinite(ohms)))return off('电阻值无效');
  const a=pin(part.id,'a'),b=pin(part.id,'b');if(a&&b&&a!==b)resistors.push({a,b,ohms});
 }
 const reachable=new Set([plus,minus]);let previous=-1;
 while(previous!==reachable.size){previous=reachable.size;for(const r of resistors){if(reachable.has(r.a)||reachable.has(r.b)){reachable.add(r.a);reachable.add(r.b)}}}
 if(!reachable.has(anode)||!reachable.has(cathode))return off('没有形成完整的闭合回路');
 const voltage=b.value??9;if(!(voltage>0&&voltage<=1000))return off('电源电压不在实验范围');
 const forward=2;
 const result=solveDC(resistors.filter(r=>reachable.has(r.a)&&reachable.has(r.b)),[{a:plus,b:minus,volts:voltage},{a:anode,b:cathode,volts:forward}],minus);
 if(!result)return off('无法求解：可能缺少限流电阻或存在电源冲突');
 const amps=result.currents[1];if(amps<=1e-7)return off('LED 反接或电压不足');
 const current=Math.round(amps*100000)/100;
 return {lit:current>=0.1&&current<=30,currentMilliAmps:current,reason:current>30?'LED 过流':current<0.1?'电流不足':'LED 正常发光'};
}
