import type { Project } from '../model.js';
import { buildNetlist } from './netlist.js';

/**
 * Educational, fixed-step backward-Euler integration of LINEAR RC networks.
 * At most one ideal DC source and 2..6 capacitors; no inductors, nonlinear
 * branches, live switching, impulses, external SPICE or hardware execution.
 * Capacitor.value is in microfarads, initialVolts is V(a)-V(b) at t=0.
 */
export interface CapacitorSample {
  voltageVolts: number;
  /** Derivative estimate for a->b; undefined at t=0, never invented. */
  currentMilliAmps: number | null;
}
export interface RcNetworkSample {
  timeSeconds: number;
  capacitors: Record<string, CapacitorSample>;
}
export interface RcNetworkAnalysis {
  ok: boolean;
  reason: string;
  capacitorIds: string[];
  durationSeconds: number | null;
  samples: RcNetworkSample[];
  warnings: string[];
}
interface Edge { a:string; b:string; conductance:number }
interface Capacitor { id:string; a:string; b:string; farads:number; initial:number }
interface Constraint { a:string; b:string; difference:number }
const OUTPUT_INTERVALS=100;
const DEFAULT_SUBSTEPS=10;
const MAX_CAPACITORS=6;
const MAX_UNKNOWN_NODES=32;
const MAX_RESISTORS=80;

const empty=<T>():Record<string,T>=>Object.create(null) as Record<string,T>;

function factor(matrix:readonly number[][]):{lu:number[][];order:number[]}|null {
  const n=matrix.length,lu=matrix.map(row=>row.slice()),order=Array.from({length:n},(_,i)=>i);
  for(let col=0;col<n;col++){
    let pivot=col;
    for(let row=col+1;row<n;row++)
      if(Math.abs(lu[row][col])>Math.abs(lu[pivot][col]))pivot=row;
    if(!Number.isFinite(lu[pivot][col])||Math.abs(lu[pivot][col])<1e-15)return null;
    [lu[col],lu[pivot]]=[lu[pivot],lu[col]];
    [order[col],order[pivot]]=[order[pivot],order[col]];
    for(let row=col+1;row<n;row++){
      const mult=lu[row][col]/lu[col][col];
      lu[row][col]=mult;
      for(let j=col+1;j<n;j++)lu[row][j]-=mult*lu[col][j];
    }
  }
  return {lu,order};
}
function solve(f:{lu:number[][];order:number[]},rhs:readonly number[]):number[]|null {
  const n=rhs.length,y=Array<number>(n).fill(0),x=Array<number>(n).fill(0);
  for(let i=0;i<n;i++){
    let value=rhs[f.order[i]];
    for(let j=0;j<i;j++)value-=f.lu[i][j]*y[j];
    y[i]=value;
  }
  for(let i=n-1;i>=0;i--){
    let value=y[i];
    for(let j=i+1;j<n;j++)value-=f.lu[i][j]*x[j];
    x[i]=value/f.lu[i][i];
    if(!Number.isFinite(x[i]))return null;
  }
  return x;
}

function connectedGroups(
 nodes:ReadonlySet<string>,edges:readonly {a:string;b:string}[]
):string[][] {
  const adjacency=new Map([...nodes].map(key=>[key,new Set<string>()]));
  for(const {a,b} of edges){
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  }
  const found=new Set<string>(),groups:string[][]=[];
  for(const key of adjacency.keys()){
    if(found.has(key))continue;
    const component:string[]=[],queue=[key];found.add(key);
    for(let i=0;i<queue.length;i++){
      const node=queue[i];component.push(node);
      for(const next of adjacency.get(node)!){
        if(!found.has(next)){found.add(next);queue.push(next);}
      }
    }
    groups.push(component);
  }
  return groups;
}

/**
 * A capacitor's initial voltage is a hard t=0 constraint. Conflicting
 * parallel-capacitor voltages or capacitor voltage opposing an ideal source
 * imply a zero-time impulse that this solver does not simulate.
 */
function consistentInitialConditions(constraints:readonly Constraint[]):boolean {
  const links=new Map<string,{to:string;offset:number}[]>();
  function add(a:string,b:string,offset:number){
    if(!links.has(a))links.set(a,[]);
    links.get(a)!.push({to:b,offset});
  }
  for(const c of constraints){
    add(c.a,c.b,-c.difference);add(c.b,c.a,c.difference);
  }
  const potentials=new Map<string,number>();
  for(const start of links.keys()){
    if(potentials.has(start))continue;
    const queue=[start];potentials.set(start,0);
    for(let i=0;i<queue.length;i++){
      const key=queue[i];
      for(const link of links.get(key)!){
        const expected=potentials.get(key)!+link.offset;
        const existing=potentials.get(link.to);
        if(existing===undefined){potentials.set(link.to,expected);queue.push(link.to);}
        else if(Math.abs(existing-expected)>1e-7)return false;
      }
    }
  }
  return true;
}

export function analyzeRCNetwork(
 project:Project,options:{durationSeconds?:number;substepsPerInterval?:number}={}
):RcNetworkAnalysis {
  const result:RcNetworkAnalysis={
    ok:false,reason:'无法分析 RC 网络',capacitorIds:[],
    durationSeconds:null,samples:[],warnings:[]
  };
  const reject=(reason:string):RcNetworkAnalysis=>({...result,reason});
  const parts=project.parts.filter(p=>p.kind==='capacitor');
  if(parts.length<2||parts.length>MAX_CAPACITORS)
    return reject('多电容求解器仅支持 2–6 只理想电容；单电容请使用解析 RC');
  const duration=options.durationSeconds??0.5;
  const substeps=options.substepsPerInterval??DEFAULT_SUBSTEPS;
  if(!Number.isInteger(substeps)||substeps<2||substeps>40)
    return reject('数值积分每采样间隔需要 2–40 个内部步长');
  if(!Number.isFinite(duration)||duration<0.01||duration>30)
    return reject('数值波形窗口须介于 0.01 秒和 30 秒');
  const batteries=project.parts.filter(p=>p.kind==='battery');
  if(batteries.length>1)return reject('数值 RC 目前最多支持一个理想直流电源');
  const battery=batteries[0],voltage=battery?.value??9;
  if(battery&&(!Number.isFinite(voltage)||voltage<=0||voltage>1000))
    return reject('电池电压必须大于 0 且不超过 1000 V');
  const used=new Set(project.wires.flatMap(w=>[w.from.componentId,w.to.componentId]));
  for(const insertion of project.insertions??[])used.add(insertion.componentId);
  const supported=new Set(['battery','resistor','capacitor','switch','breadboard','multimeter']);
  if(project.parts.some(p=>used.has(p.id)&&!supported.has(p.kind)))
    return reject('数值 RC 不支持已接线的 LED、Arduino、蜂鸣器等非线性或未知器件');

  const graph=buildNetlist(project);
  if(graph.warnings.length)return reject(graph.warnings.join('；'));
  const net=(id:string,pinId:string)=>graph.netOf({componentId:id,pinId});
  const capacitors:Capacitor[]=[];
  for(const part of parts){
    const a=net(part.id,'a'),b=net(part.id,'b');
    const microfarads=part.value??100,initial=part.initialVolts??0;
    if(!a||!b)return reject('电容引脚无效');
    if(a===b)return reject('电容 '+part.id+' 两端短路，无法计算有限时间常数');
    if(!Number.isFinite(microfarads)||microfarads<0.001||microfarads>1e6)
      return reject('电容量应介于 0.001 和 1000000 µF');
    if(!Number.isFinite(initial)||Math.abs(initial)>1000)
      return reject('电容初始电压超出允许范围');
    capacitors.push({id:part.id,a,b,farads:microfarads*1e-6,initial});
  }
  const resistors:Edge[]=[];
  for(const part of project.parts.filter(p=>p.kind==='resistor')){
    const a=net(part.id,'a'),b=net(part.id,'b');
    const ohms=part.value??220;
    if(!a||!b)return reject('电阻引脚无效');
    if(!Number.isFinite(ohms)||ohms<0.1||ohms>1e9)
      return reject('数值 RC 电阻需要 0.1 Ω–1 GΩ');
    if(a!==b)resistors.push({a,b,conductance:1/ohms});
  }
  if(!resistors.length||resistors.length>MAX_RESISTORS)
    return reject('需要 1–80 只有效电阻建立有损 RC 网络');
  const plus=battery?net(battery.id,'positive'):null;
  const minus=battery?net(battery.id,'negative'):null;
  if(battery&&(!plus||!minus||plus===minus))
    return reject('理想电池正负极已短路或引脚无效');

  const constraints:Constraint[]=[
    ...capacitors.map(c=>({a:c.a,b:c.b,difference:c.initial})),
    ...(battery?[{a:plus!,b:minus!,difference:voltage}]:[])
  ];
  if(!consistentInitialConditions(constraints))
    return reject('电容初始电压与并联电容/理想电源约束冲突，存在未建模的瞬时冲击');

  const nodes=new Set<string>([...capacitors.flatMap(c=>[c.a,c.b]),
    ...resistors.flatMap(r=>[r.a,r.b]),...(battery?[plus!,minus!]:[])]);
  const groups=connectedGroups(nodes,[
    ...resistors,...capacitors,...(battery?[{a:plus!,b:minus!}]:[])
  ]);
  const fixed=new Map<string,number>();
  if(battery){fixed.set(minus!,0);fixed.set(plus!,voltage);}
  for(const group of groups){
    if(!group.some(node=>fixed.has(node)))fixed.set(group[0],0);
  }
  const unknown=[...nodes].filter(node=>!fixed.has(node));
  if(unknown.length>MAX_UNKNOWN_NODES)
    return reject('网络未知节点超过 32 个，已拒绝大规模数值求解');
  const index=new Map(unknown.map((node,i)=>[node,i]));
  const dt=duration/(OUTPUT_INTERVALS*substeps);
  const caps=capacitors.map(c=>({...c,conductance:c.farads/dt}));
  const allEdges:Edge[]=[...resistors,...caps];
  const matrix=Array.from({length:unknown.length},
    ()=>Array<number>(unknown.length).fill(0));
  const fixedRhs=Array<number>(unknown.length).fill(0);
  for(const edge of allEdges){
    const {a,b,conductance:g}=edge,ia=index.get(a),ib=index.get(b);
    if(ia!==undefined){
      matrix[ia][ia]+=g;
      if(ib!==undefined)matrix[ia][ib]-=g;
      else fixedRhs[ia]+=g*fixed.get(b)!;
    }
    if(ib!==undefined){
      matrix[ib][ib]+=g;
      if(ia!==undefined)matrix[ib][ia]-=g;
      else fixedRhs[ib]+=g*fixed.get(a)!;
    }
  }
  const lu=factor(matrix);
  if(!lu)return reject('电路矩阵奇异或数值条件恶劣，无法可靠求解');

  const capValues=capacitors.map(c=>c.initial);
  const samples:RcNetworkSample[]=[];
  function append(time:number,currents:(number|null)[]){
    const values=empty<CapacitorSample>();
    capacitors.forEach((c,i)=>{values[c.id]={
      voltageVolts:capValues[i],
      currentMilliAmps:currents[i]
    };});
    samples.push({timeSeconds:time,capacitors:values});
  }
  append(0,capacitors.map(()=>null));
  const known=(name:string,x:readonly number[])=>fixed.get(name)??x[index.get(name)!];
  for(let step=1;step<=OUTPUT_INTERVALS*substeps;step++){
    const rhs=fixedRhs.slice();
    caps.forEach((cap,i)=>{
      const currentHistory=cap.conductance*capValues[i],ia=index.get(cap.a),ib=index.get(cap.b);
      if(ia!==undefined)rhs[ia]+=currentHistory;
      if(ib!==undefined)rhs[ib]-=currentHistory;
    });
    const x=solve(lu,rhs);
    if(!x)return reject('数值线性系统求解失败');
    const currents=capacitors.map((cap,i)=>{
      const next=known(cap.a,x)-known(cap.b,x);
      const derivative=(next-capValues[i])*cap.farads/dt*1000;
      capValues[i]=next;
      return derivative;
    });
    if(capValues.some(v=>!Number.isFinite(v)||Math.abs(v)>1e7)||
       currents.some(v=>!Number.isFinite(v)||Math.abs(v)>1e9))
      return reject('数值积分出现异常增益，已停止输出');
    if(step%substeps===0)append(duration*step/(OUTPUT_INTERVALS*substeps),currents);
  }
  const warnings=[
    '向后欧拉有限步长近似；快速暂态可能因采样窗口过大而失真',
    '不支持电感、非线性元件、动态开关或多独立电源；t=0 电流未估算'
  ];
  if(!battery)warnings.push('无电池：仅按电容初始电压经电阻网络自然重新分配电荷');
  return {
    ok:true,reason:'多电容线性 RC 数值积分完成',
    capacitorIds:capacitors.map(c=>c.id),durationSeconds:duration,samples,warnings
  };
}
