import type { Project } from '../model.js';
import { buildNetlist } from './netlist.js';

/**
 * Exact first-order response of one ideal capacitor in a purely resistive
 * network, with zero or one independent ideal DC source.
 *
 * This is an analytical Thevenin step response, NOT a generic SPICE,
 * switch-time-event, nonlinear or multi-capacitor transient solver.
 * Capacitor.value is in microfarads; initialVolts is at t=0 (a user input).
 */
export interface RcSample {
  timeSeconds: number;
  voltageVolts: number;
  currentMilliAmps: number;
}
export interface RcAnalysis {
  ok: boolean;
  reason: string;
  capacitorId: string | null;
  resistanceOhms: number | null;
  capacitanceMicrofarads: number | null;
  tauSeconds: number | null;
  initialVolts: number | null;
  steadyVolts: number | null;
  samples: RcSample[];
  warnings: string[];
}
interface Resistor { a: string; b: string; ohms: number }

const MIN_CAP_UF=0.001;
const MAX_CAP_UF=1_000_000;
const MAX_NODES=80;
const POINTS=101;
const MAX_TAU_SECONDS=1_000_000_000;
const MIN_TAU_SECONDS=1e-9;

function linearSolve(matrix: number[][], rhs: number[]): number[] | null {
  const n=rhs.length;
  if(!n)return [];
  const a=matrix.map(row=>row.slice()),b=rhs.slice();
  for(let col=0;col<n;col++){
    let pivot=col;
    for(let j=col+1;j<n;j++)
      if(Math.abs(a[j][col])>Math.abs(a[pivot][col]))pivot=j;
    if(!Number.isFinite(a[pivot][col])||Math.abs(a[pivot][col])<1e-15)return null;
    [a[col],a[pivot]]=[a[pivot],a[col]];
    [b[col],b[pivot]]=[b[pivot],b[col]];
    for(let row=col+1;row<n;row++){
      const factor=a[row][col]/a[col][col];
      if(factor===0)continue;
      for(let c=col;c<n;c++)a[row][c]-=factor*a[col][c];
      b[row]-=factor*b[col];
    }
  }
  const answer=Array<number>(n).fill(0);
  for(let row=n-1;row>=0;row--){
    let sum=b[row];
    for(let col=row+1;col<n;col++)sum-=a[row][col]*answer[col];
    answer[row]=sum/a[row][row];
    if(!Number.isFinite(answer[row]))return null;
  }
  return answer;
}

function resistorGroups(edges: readonly Resistor[],roots:readonly string[]):string[][] {
  const adj=new Map<string,Set<string>>();
  for(const n of roots)adj.set(n,new Set());
  for(const {a,b} of edges){
    if(!adj.has(a))adj.set(a,new Set());
    if(!adj.has(b))adj.set(b,new Set());
    if(a!==b){adj.get(a)!.add(b);adj.get(b)!.add(a);}
  }
  const groups:string[][]=[],seen=new Set<string>();
  for(const node of adj.keys()){
    if(seen.has(node))continue;
    const group:string[]=[],queue=[node];seen.add(node);
    for(let i=0;i<queue.length;i++){
      const current=queue[i];group.push(current);
      for(const near of adj.get(current)!){
        if(!seen.has(near)){seen.add(near);queue.push(near);}
      }
    }
    groups.push(group);
  }
  return groups;
}

function steadyVoltages(
  resistors:readonly Resistor[],capA:string,capB:string,
  battery:{positive:string;negative:string;volts:number}|null
):Map<string,number>|null {
  const roots=[capA,capB,...(battery?[battery.positive,battery.negative]:[])];
  const potentials=new Map<string,number>();
  for(const nodes of resistorGroups(resistors,roots)){
    if(nodes.length>MAX_NODES)return null;
    const known=new Map<string,number>();
    if(battery&&nodes.includes(battery.positive))known.set(battery.positive,battery.volts);
    if(battery&&nodes.includes(battery.negative))known.set(battery.negative,0);
    if(!known.size)known.set(nodes[0],0); // floating component: common reference only
    const unknown=nodes.filter(n=>!known.has(n));
    const index=new Map(unknown.map((name,i)=>[name,i]));
    const matrix=Array.from({length:unknown.length},()=>Array<number>(unknown.length).fill(0));
    const rhs=Array<number>(unknown.length).fill(0);
    for(const {a,b,ohms} of resistors){
      if(a===b||!nodes.includes(a)||!nodes.includes(b))continue;
      const conductance=1/ohms,ia=index.get(a),ib=index.get(b);
      if(ia!==undefined){
        matrix[ia][ia]+=conductance;
        if(ib!==undefined)matrix[ia][ib]-=conductance;
        else rhs[ia]+=conductance*known.get(b)!;
      }
      if(ib!==undefined){
        matrix[ib][ib]+=conductance;
        if(ia!==undefined)matrix[ib][ia]-=conductance;
        else rhs[ib]+=conductance*known.get(a)!;
      }
    }
    const values=linearSolve(matrix,rhs);
    if(!values)return null;
    for(const [key,value] of known)potentials.set(key,value);
    unknown.forEach((key,i)=>potentials.set(key,values[i]));
  }
  return potentials;
}

/** Test-source current method: replace the ideal battery with a short. */
function theveninResistance(
  resistors:readonly Resistor[],capA:string,capB:string,
  battery:{positive:string;negative:string}|null
):number|null {
  const normalize=(net:string)=>battery&&net===battery.positive?battery.negative:net;
  const a=normalize(capA),b=normalize(capB);
  if(a===b)return 0;
  const edges=resistors.map(r=>({...r,a:normalize(r.a),b:normalize(r.b)}))
    .filter(r=>r.a!==r.b);
  const component=resistorGroups(edges,[a,b]).find(group=>group.includes(a))!;
  if(!component.includes(b))return null; // no resistive discharge path
  if(component.length>MAX_NODES)return null;
  const indices=component.filter(x=>x!==b);
  const index=new Map(indices.map((key,i)=>[key,i]));
  const matrix=Array.from({length:indices.length},()=>Array<number>(indices.length).fill(0));
  const rhs=Array<number>(indices.length).fill(0);
  rhs[index.get(a)!]=1; // inject 1 A into terminal a and extract at b
  for(const r of edges){
    if(!component.includes(r.a)||!component.includes(r.b))continue;
    const conductance=1/r.ohms;
    const ia=index.get(r.a),ib=index.get(r.b);
    if(ia!==undefined){
      matrix[ia][ia]+=conductance;
      if(ib!==undefined)matrix[ia][ib]-=conductance;
    }
    if(ib!==undefined){
      matrix[ib][ib]+=conductance;
      if(ia!==undefined)matrix[ib][ia]-=conductance;
    }
  }
  const solved=linearSolve(matrix,rhs);
  return solved?solved[index.get(a)!]:null;
}

export function analyzeRC(project:Project):RcAnalysis {
  const warnings:string[]=[];
  const base:RcAnalysis={
    ok:false,reason:'尚未开始 RC 分析',capacitorId:null,resistanceOhms:null,
    capacitanceMicrofarads:null,tauSeconds:null,initialVolts:null,
    steadyVolts:null,samples:[],warnings
  };
  const fail=(reason:string):RcAnalysis=>({...base,reason});
  const capacitors=project.parts.filter(p=>p.kind==='capacitor');
  if(capacitors.length!==1)return fail('RC 暂态目前仅支持一只电容');
  const cap=capacitors[0],capacitance=cap.value??100,initial=cap.initialVolts??0;
  if(!Number.isFinite(capacitance)||capacitance<MIN_CAP_UF||capacitance>MAX_CAP_UF)
    return fail('电容量应介于 0.001 和 1000000 µF');
  if(!Number.isFinite(initial)||Math.abs(initial)>1000)
    return fail('电容初始电压超出允许范围');
  const batteries=project.parts.filter(p=>p.kind==='battery');
  if(batteries.length>1)return fail('单电容 RC 暂态仅支持零或一个独立直流电源');
  const b=batteries[0],volts=b?.value??9;
  if(b&&(!Number.isFinite(volts)||volts<=0||volts>1000))
    return fail('电池电压应大于 0 且不超过 1000 V');
  const wired=new Set(project.wires.flatMap(w=>[w.from.componentId,w.to.componentId]));
  for(const insertion of project.insertions??[])wired.add(insertion.componentId);
  const types=new Set(['capacitor','battery','resistor','switch','breadboard','multimeter']);
  if(project.parts.some(p=>wired.has(p.id)&&!types.has(p.kind)))
    return fail('暂态电路包含不支持的连接器件（例如 LED、Arduino 或蜂鸣器）');
  const graph=buildNetlist(project);
  if(graph.warnings.length)return fail(graph.warnings.join('；'));
  const net=(id:string,pinId:string)=>graph.netOf({componentId:id,pinId});
  const a=net(cap.id,'a'),c=net(cap.id,'b');
  if(!a||!c)return fail('电容端子无效');
  if(a===c)return fail('电容两端直接短路，不能求解正时间常数');
  const positive=b?net(b.id,'positive'):null,negative=b?net(b.id,'negative'):null;
  if(b&&(!positive||!negative||positive===negative))
    return fail('电池正负极短路或引脚无效');
  const resistors:Resistor[]=[];
  for(const r of project.parts.filter(p=>p.kind==='resistor')){
    const ohms=r.value??220,n1=net(r.id,'a'),n2=net(r.id,'b');
    if(!Number.isFinite(ohms)||ohms<=0||ohms>1e9)
      return fail('RC 电阻应大于 0 且不超过 1 GΩ');
    if(!n1||!n2)return fail('电阻引脚无效');
    if(n1!==n2)resistors.push({a:n1,b:n2,ohms});
  }
  if(resistors.length===0)return fail('需要至少一只有效电阻形成 RC 回路');
  const battery=b?{positive:positive!,negative:negative!,volts}:null;
  const resistance=theveninResistance(resistors,a,c,battery);
  if(resistance===null)return fail('未形成有限的 RC 放电路径，请检查开关和接线');
  if(!(resistance>0)||!Number.isFinite(resistance))return fail('电容两端存在理想短路，不能计算 RC 时间常数');
  const tau=resistance*capacitance*1e-6;
  if(!Number.isFinite(tau)||tau<MIN_TAU_SECONDS||tau>MAX_TAU_SECONDS)
    return fail('RC 时间常数超出实验支持范围');
  const steady=steadyVoltages(resistors,a,c,battery);
  if(!steady||!steady.has(a)||!steady.has(c))
    return fail('RC 网络浮置或数值矩阵无法求解');
  const finalVolts=steady.get(a)!-steady.get(c)!;
  if(!Number.isFinite(finalVolts))return fail('RC 稳态电压无效');
  const samples=Array.from({length:POINTS},(_,i)=>{
    const t=5*tau*i/(POINTS-1),decay=Math.exp(-t/tau);
    return {
      timeSeconds:t,
      voltageVolts:finalVolts+(initial-finalVolts)*decay,
      currentMilliAmps:(finalVolts-initial)/resistance*decay*1000
    };
  });
  if(!samples.every(s=>Number.isFinite(s.timeSeconds)&&Number.isFinite(s.voltageVolts)&&Number.isFinite(s.currentMilliAmps)))
    return fail('RC 波形出现无效数值');
  if(!b)warnings.push('无电池：按电容初始电压经电阻自然放电计算');
  warnings.push('解析一阶 RC 教学模型；不模拟开关瞬间、多电容、LED 或器件寄生效应');
  return {
    ok:true,reason:'RC 一阶暂态分析完成',capacitorId:cap.id,
    resistanceOhms:resistance,capacitanceMicrofarads:capacitance,
    tauSeconds:tau,initialVolts:initial,steadyVolts:finalVolts,
    samples,warnings
  };
}
