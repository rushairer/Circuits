import type { Part, Project } from '../model.js';
import { buildNetlist } from './netlist.js';
import { resistiveBranches, AMMETER_SHUNT_OHMS, AMMETER_WARNING_MILLIAMPS } from './resistive-branches.js';

/**
 * Experimental, steady-state *educational* DC analysis.
 * NOT SPICE: ideal 1-source battery; resistors; ideal open/closed switches
 * (handled by the netlist); exponential red LED approximation at 25 C.
 * The LED curve is calibrated to ~2.0 V at 20 mA; no self-heating,
 * parasitics, device tolerances, transient effects, or safe-power guarantee.
 */
export interface LedMeasurement {
  currentMilliAmps: number;
  forwardVolts: number | null;
  lit: boolean;
  status: 'normal' | 'overcurrent' | 'off' | 'unpowered';
}
export interface MeterMeasurement {
  volts: number | null;
  status: 'measured' | 'unconnected';
}
export interface DcAnalysis {
  ok: boolean;
  reason: string;
  leds: Record<string, LedMeasurement>;
  meters: Record<string, MeterMeasurement>;
  ammeters: Record<string, { milliAmps:number|null; status:'measured'|'unconnected'|'overrange' }>;
  resistorsMilliAmps: Record<string, number>;
  netVoltages: ReadonlyMap<string, number>;
  warnings: string[];
}
interface Resistor { id: string; a: string; b: string; ohms: number }
interface Diode { id: string; a: string; b: string }
const LED_REF_AMPS = 0.020;
const LED_REF_VOLTS = 2.0;
const LED_SLOPE_VOLTS = 0.10;
const LED_IS = LED_REF_AMPS * Math.exp(-LED_REF_VOLTS / LED_SLOPE_VOLTS);
const DIODE_GMIN = 1e-8; // numerical stabilizer; not a physical reverse-current model
const MAX_NODES = 96;
const MAX_BRANCHES = 300;
const MAX_ITERATIONS = 120;
const RESIDUAL_TOLERANCE_AMPS = 1e-9;
const round = (n:number,digits=5)=>Number(n.toFixed(digits));
const blank = <T>():Record<string,T>=>Object.create(null) as Record<string,T>;

/**
 * Current anode->cathode, with a softly limited exponent. The artificial
 * clamp only ensures numerical safety, not accurate high-current estimates.
 */
function ledLaw(volts:number):{current:number; conductance:number} {
  const x = Math.max(-40, Math.min(30, volts / LED_SLOPE_VOLTS));
  const e = Math.exp(x);
  return {
    current: LED_IS * Math.expm1(x) + DIODE_GMIN * volts,
    conductance: LED_IS * e / LED_SLOPE_VOLTS + DIODE_GMIN
  };
}
function solveLinear(source:number[][],right:number[]):number[]|null {
  const n=right.length;
  const a=source.map(row=>row.slice()),b=right.slice();
  for(let col=0;col<n;col++){
    let pivot=col;
    for(let row=col+1;row<n;row++)
      if(Math.abs(a[row][col])>Math.abs(a[pivot][col]))pivot=row;
    if(!Number.isFinite(a[pivot][col])||Math.abs(a[pivot][col])<1e-13)return null;
    [a[col],a[pivot]]=[a[pivot],a[col]];
    [b[col],b[pivot]]=[b[pivot],b[col]];
    for(let row=col+1;row<n;row++){
      const factor=a[row][col]/a[col][col];
      if(factor===0)continue;
      for(let j=col;j<n;j++)a[row][j]-=factor*a[col][j];
      b[row]-=factor*b[col];
    }
  }
  const result=Array<number>(n).fill(0);
  for(let row=n-1;row>=0;row--){
    let total=b[row];
    for(let j=row+1;j<n;j++)total-=a[row][j]*result[j];
    result[row]=total/a[row][row];
    if(!Number.isFinite(result[row]))return null;
  }
  return result;
}

export function analyzeDC(project:Project,options:{allowZeroVoltageSource?:boolean}={}):DcAnalysis {
  const leds=blank<LedMeasurement>(),meters=blank<MeterMeasurement>();
  const ammeters=blank<{ milliAmps:number|null; status:'measured'|'unconnected'|'overrange' }>();
  const resistorsMilliAmps=blank<number>();
  const warnings:string[]=[];
  const netVoltages=new Map<string,number>();
  const result=(ok:boolean,reason:string):DcAnalysis=>
    ({ok,reason,leds,meters,ammeters,resistorsMilliAmps,netVoltages,warnings});
  const ledParts=project.parts.filter(p=>p.kind==='led');
  const meterParts=project.parts.filter(p=>p.kind==='multimeter');
  for(const p of ledParts)leds[p.id]={currentMilliAmps:0,forwardVolts:null,lit:false,status:'unpowered'};
  for(const p of meterParts)meters[p.id]={volts:null,status:'unconnected'};
  for(const p of project.parts.filter(p=>p.kind==='ammeter'))ammeters[p.id]={milliAmps:null,status:'unconnected'};
  for(const p of project.parts.filter(p=>p.kind==='resistor'))resistorsMilliAmps[p.id]=0;

  const batteries=project.parts.filter(p=>p.kind==='battery');
  if(batteries.length!==1)return result(false,'实验直流分析需要且仅支持一节独立电池');
  const battery=batteries[0],volts=battery.value??9;
  if(!Number.isFinite(volts)||volts<0||(volts===0&&!options.allowZeroVoltageSource)||volts>1000)
    return result(false,'电池电压无效或超出实验分析范围');
  const graph=buildNetlist(project);
  if(graph.warnings.length)return result(false,graph.warnings.join('；'));
  const pin=(part:Part,name:string)=>graph.netOf({componentId:part.id,pinId:name});
  const plus=pin(battery,'positive'),minus=pin(battery,'negative');
  if(!plus||!minus)return result(false,'电池端子无效');
  if(plus===minus)return result(false,'电池正负端短路，不能进行有效分析');

  // A voltmeter is ideal open circuit; simply attaching it never closes a loop.
  const wired=new Set(project.wires.flatMap(w=>[w.from.componentId,w.to.componentId]));
  for(const insertion of project.insertions??[])wired.add(insertion.componentId);
  const supported=new Set(['battery','resistor','led','breadboard','switch','multimeter','ammeter']);
  if(project.parts.some(p=>wired.has(p.id)&&!supported.has(p.kind)))
    return result(false,'电路连接了尚未建模的元件（例如 Arduino、蜂鸣器或电容）');

  const resistors:Resistor[]=[],diodes:Diode[]=[];
  for(const branch of resistiveBranches(project)){
    const {ohms}=branch;
    const owner=project.parts.find(p=>p.id===branch.id)!;
    const a=pin(owner,branch.fromPin),b=pin(owner,branch.toPin);
    if(!Number.isFinite(ohms)||ohms<0.1||ohms>1e9)
      return result(false,'电阻/电流表/接触电阻需介于 0.1Ω 与 1GΩ');
    if(!a||!b)return result(false,'被动元件端子无效');
    if(a!==b)resistors.push({id:branch.id,a,b,ohms});
  }
  for(const p of ledParts){
    const a=pin(p,'anode'),b=pin(p,'cathode');
    if(!a||!b)return result(false,'LED 端子无效');
    if(a===b){warnings.push('LED '+p.id+' 两端被导线直接短接');continue;}
    diodes.push({id:p.id,a,b});
  }
  if(resistors.length+diodes.length>MAX_BRANCHES)return result(false,'电路元件数量超出当前分析上限');

  // Ignore completely floating islands, but keep every branch connected to
  // either battery rail so dangling branches can resolve to zero current.
  const edges:[string,string][]=[
    ...resistors.map(r=>[r.a,r.b] as [string,string]),
    ...diodes.map(d=>[d.a,d.b] as [string,string])
  ];
  const active=new Set<string>([plus,minus]);
  let changed=true;
  while(changed){
    changed=false;
    for(const [a,b] of edges){
      if(active.has(a)&&!active.has(b)){active.add(b);changed=true;}
      if(active.has(b)&&!active.has(a)){active.add(a);changed=true;}
    }
  }
  if(active.size>MAX_NODES)return result(false,'电气节点数超过当前分析上限');
  const unknown=[...active].filter(n=>n!==plus&&n!==minus);
  const index=new Map(unknown.map((name,i)=>[name,i]));
  const getVolts=(name:string,x:readonly number[])=>name===plus?volts:name===minus?0:x[index.get(name)!];

  function residual(x:readonly number[],withJacobian:boolean){
    const f=Array<number>(unknown.length).fill(0);
    const j=withJacobian?
      Array.from({length:unknown.length},()=>Array<number>(unknown.length).fill(0)):null;
    function stamp(a:string,b:string,current:number,conductance:number){
      const ia=index.get(a),ib=index.get(b);
      if(ia!==undefined)f[ia]+=current;
      if(ib!==undefined)f[ib]-=current;
      if(j){
        if(ia!==undefined){j[ia][ia]+=conductance;if(ib!==undefined)j[ia][ib]-=conductance;}
        if(ib!==undefined){j[ib][ib]+=conductance;if(ia!==undefined)j[ib][ia]-=conductance;}
      }
    }
    for(const r of resistors){
      if(!active.has(r.a)||!active.has(r.b))continue;
      const conductance=1/r.ohms;
      stamp(r.a,r.b,(getVolts(r.a,x)-getVolts(r.b,x))*conductance,conductance);
    }
    for(const d of diodes){
      if(!active.has(d.a)||!active.has(d.b))continue;
      const law=ledLaw(getVolts(d.a,x)-getVolts(d.b,x));
      stamp(d.a,d.b,law.current,law.conductance);
    }
    return {f,j,max:f.reduce((n,v)=>Math.max(n,Math.abs(v)),0)};
  }

  // Damped Newton iteration with backtracking to avoid exponential overshoot.
  let x=Array<number>(unknown.length).fill(0);
  let converged=false;
  for(let iteration=0;iteration<MAX_ITERATIONS;iteration++){
    const {f,j,max}=residual(x,true);
    if(max<RESIDUAL_TOLERANCE_AMPS){converged=true;break;}
    const delta=solveLinear(j!,f.map(v=>-v));
    if(!delta)return result(false,'电气网络奇异，可能存在未连接的浮置节点');
    let accepted=false;
    for(let k=0;k<24;k++){
      const alpha=2**(-k),candidate=x.map((v,i)=>v+alpha*delta[i]);
      if(!candidate.every(Number.isFinite))continue;
      const candidateNorm=residual(candidate,false).max;
      if(candidateNorm < max*(1-1e-4*alpha)||candidateNorm<RESIDUAL_TOLERANCE_AMPS){
        x=candidate;accepted=true;break;
      }
    }
    if(!accepted)return result(false,'非线性直流分析未收敛，请检查电路拓扑');
  }
  if(!converged&&residual(x,false).max>=RESIDUAL_TOLERANCE_AMPS)
    return result(false,'非线性直流分析达到迭代上限');
  for(const net of active)netVoltages.set(net,getVolts(net,x));
  let overcurrent=false,anyLit=false;
  for(const d of diodes){
    if(!netVoltages.has(d.a)||!netVoltages.has(d.b))continue;
    const forward=netVoltages.get(d.a)!-netVoltages.get(d.b)!;
    const milliamps=ledLaw(forward).current*1000;
    const lit=milliamps>=0.1&&milliamps<=30;
    const over=milliamps>30;
    if(over){overcurrent=true;warnings.push('LED '+d.id+' 电流过高；数值超出器件安全模型适用范围');}
    anyLit ||=lit;
    leds[d.id]={currentMilliAmps:round(milliamps,4),forwardVolts:round(forward,4),
      lit,status:over?'overcurrent':lit?'normal':'off'};
  }
  for(const r of resistors){
    if(netVoltages.has(r.a)&&netVoltages.has(r.b)){
      resistorsMilliAmps[r.id]=round((netVoltages.get(r.a)!-netVoltages.get(r.b)!)/r.ohms*1000,4);
    }
  }
  for(const m of project.parts.filter(p=>p.kind==='ammeter')){
    // The finite shunt may itself connect an otherwise dangling terminal to
    // the powered island. That does NOT mean the user wired both leads.
    const wired=(pinId:string)=>project.wires.some(w=>
      (w.from.componentId===m.id&&w.from.pinId===pinId)||
      (w.to.componentId===m.id&&w.to.pinId===pinId)
    );
    if(!wired('positive')||!wired('negative'))continue;
    const a=pin(m,'positive'),b=pin(m,'negative');
    if(a&&b&&netVoltages.has(a)&&netVoltages.has(b)){
      const milliamps=round((netVoltages.get(a)!-netVoltages.get(b)!)/AMMETER_SHUNT_OHMS*1000,4);
      const overrange=Math.abs(milliamps)>AMMETER_WARNING_MILLIAMPS;
      ammeters[m.id]={milliAmps:milliamps,status:overrange?'overrange':'measured'};
      if(overrange)warnings.push('电流表 '+m.id+' 超出 200mA 教学量程；不模拟真实保险丝');
    }
  }
  for(const m of meterParts){
    const a=pin(m,'positive'),b=pin(m,'negative');
    if(a&&b&&netVoltages.has(a)&&netVoltages.has(b)){
      meters[m.id]={volts:round(netVoltages.get(a)!-netVoltages.get(b)!,4),status:'measured'};
    }
  }
  const summary=overcurrent?'检测到 LED 过流，请增加限流电阻':
    anyLit?'非线性直流分析完成':
    ledParts.length?'未检测到达到点亮阈值的 LED 电流':'电池与电阻网络已求解';
  return result(true,summary);
}
