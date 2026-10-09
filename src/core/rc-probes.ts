import type { Project } from '../model.js';
import { buildNetlist } from './netlist.js';
import { resistiveBranches, AMMETER_SHUNT_OHMS, AMMETER_WARNING_MILLIAMPS } from './resistive-branches.js';
import type { ScopeCapture } from './scope.js';

export interface RcVoltageReading {
  status:'measured'|'unconnected'|'unsupported';
  volts:number|null;
  reason:string;
}

export interface RcCurrentReading {
  status:'measured'|'unconnected'|'unsupported'|'overrange';
  milliAmps:number|null;
  reason:string;
}
interface ResistorEdge {a:string;b:string;conductance:number}
interface VoltageEdge {a:string;b:string;voltage:number}
type Adjacent={to:string;difference:number};
const MAX_NODES=120;
const MAX_RESISTORS=80;
const VOLTAGE_TOLERANCE=1e-4;

function solveLinear(matrix:number[][],rhs:number[]):number[]|null {
  const n=rhs.length;
  const a=matrix.map(row=>row.slice()),b=rhs.slice();
  for(let col=0;col<n;col++){
    let pivot=col;
    for(let row=col+1;row<n;row++)
      if(Math.abs(a[row][col])>Math.abs(a[pivot][col]))pivot=row;
    if(!Number.isFinite(a[pivot][col])||Math.abs(a[pivot][col])<1e-14)return null;
    [a[col],a[pivot]]=[a[pivot],a[col]];
    [b[col],b[pivot]]=[b[pivot],b[col]];
    const divisor=a[col][col];
    for(let row=col+1;row<n;row++){
      const ratio=a[row][col]/divisor;
      for(let k=col;k<n;k++)a[row][k]-=ratio*a[col][k];
      b[row]-=ratio*b[col];
    }
  }
  const x=Array<number>(n).fill(0);
  for(let row=n-1;row>=0;row--){
    let sum=b[row];
    for(let col=row+1;col<n;col++)sum-=a[row][col]*x[col];
    x[row]=sum/a[row][row];
    if(!Number.isFinite(x[row])||Math.abs(x[row])>1e9)return null;
  }
  return x;
}

/**
 * Non-invasive virtual voltage probe reconstructed from a successful RC
 * frame. Capacitors and the independent DC source impose voltage offsets
 * within supernodes; resistor edges determine the remaining potentials
 * through Kirchhoff current balance. Geometry never defines connectivity.
 *
 * An arbitrary gauge is harmless *within one electrical island*. Probing
 * across disconnected islands is not a valid voltage measurement.
 * This is a linear teaching approximation, not a general SPICE probe.
 */
export function readRcVoltageProbe(
  project:Project,capture:ScopeCapture,meterId:string,index:number
):RcVoltageReading {
  if(!project.parts.some(p=>p.id===meterId&&p.kind==='multimeter'))
    return {status:'unconnected',volts:null,reason:'找不到所选万用表'};
  return potentialDifference(project,capture,meterId,index);
}

/**
 * A circuit-breaking virtual ammeter has a fixed, finite 0.1Ω shunt.
 * Both pins MUST be explicitly wired; the instrument is not a passive
 * observational probe that can measure current without closing a circuit.
 */
export function readRcCurrentProbe(
  project:Project,capture:ScopeCapture,meterId:string,index:number
):RcCurrentReading {
  const instrument=project.parts.find(p=>p.id===meterId&&p.kind==='ammeter');
  if(!instrument)return {status:'unconnected',milliAmps:null,reason:'找不到串联电流表'};
  const wired=(pinId:string)=>project.wires.some(w=>
    (w.from.componentId===meterId&&w.from.pinId===pinId)||
    (w.to.componentId===meterId&&w.to.pinId===pinId)
  );
  if(!wired('positive')||!wired('negative'))
    return {status:'unconnected',milliAmps:null,reason:'电流表必须串接，正负两端均需接线'};
  const v=potentialDifference(project,capture,meterId,index);
  if(v.status!=='measured'||v.volts===null)
    return {status:v.status,milliAmps:null,reason:v.reason};
  const milliAmps=v.volts/AMMETER_SHUNT_OHMS*1000;
  if(!Number.isFinite(milliAmps))
    return {status:'unsupported',milliAmps:null,reason:'电流读数超出数值支持范围'};
  const over=Math.abs(milliAmps)>AMMETER_WARNING_MILLIAMPS;
  return {
    status:over?'overrange':'measured',milliAmps,
    reason:over?'超过 200mA 教学量程；不模拟真实保险丝':'电流由 0.1Ω 串联分流电阻压降计算'
  };
}

function potentialDifference(
  project:Project,capture:ScopeCapture,meterId:string,index:number
):RcVoltageReading {
  const unavailable=(status:'unconnected'|'unsupported',reason:string):RcVoltageReading=>
    ({status,volts:null,reason});
  if(!Number.isInteger(index)||index<0||index>=capture.frames.length)
    return unavailable('unsupported','采样时刻无效');
  const graph=buildNetlist(project);
  if(graph.warnings.length)
    return unavailable('unsupported','存在无效的接线端点');
  const net=(id:string,pinId:string)=>graph.netOf({componentId:id,pinId});
  const positive=net(meterId,'positive'),negative=net(meterId,'negative');
  if(!positive||!negative)
    return unavailable('unconnected','表笔引脚无效');

  const voltageEdges:VoltageEdge[]=[];
  const activeNodes=new Set<string>();
  for(const id of capture.capacitorIds){
    const part=project.parts.find(p=>p.id===id&&p.kind==='capacitor');
    const reading=capture.frames[index].capacitors[id];
    if(!part||!reading)
      return unavailable('unsupported','波形与当前电容工程不匹配');
    const a=net(id,'a'),b=net(id,'b');
    if(!a||!b||a===b||!Number.isFinite(reading.voltageVolts))
      return unavailable('unsupported','电容节点或采样值无效');
    voltageEdges.push({a,b,voltage:reading.voltageVolts});
    activeNodes.add(a);activeNodes.add(b);
  }

  const batteryParts=project.parts.filter(p=>p.kind==='battery');
  if(batteryParts.length>1)
    return unavailable('unsupported','暂不支持多个独立电压源');
  if(batteryParts[0]){
    const battery=batteryParts[0],a=net(battery.id,'positive'),b=net(battery.id,'negative');
    const volts=battery.value??9;
    if(!a||!b||a===b||!Number.isFinite(volts)||volts<=0||volts>1000)
      return unavailable('unsupported','理想电池端子或电压无效');
    voltageEdges.push({a,b,voltage:volts});
    activeNodes.add(a);activeNodes.add(b);
  }
  const resistors:ResistorEdge[]=[];
  for(const branch of resistiveBranches(project)){
    const a=net(branch.id,branch.fromPin),b=net(branch.id,branch.toPin);
    const ohms=branch.ohms;
    if(!a||!b||!Number.isFinite(ohms)||ohms<0.1||ohms>1e9)
      return unavailable('unsupported','被动元件端子或阻值无效');
    if(a!==b)resistors.push({a,b,conductance:1/ohms});
  }
  if(resistors.length>MAX_RESISTORS)
    return unavailable('unsupported','电阻数量超出仪表支持范围');

  // Voltmeter is high-impedance; modeled series ammeter contributes a real shunt edge.
  const graphNodes=new Set<string>();
  const topology=new Map<string,Set<string>>();
  const link=(a:string,b:string)=>{
    graphNodes.add(a);graphNodes.add(b);
    if(!topology.has(a))topology.set(a,new Set());
    if(!topology.has(b))topology.set(b,new Set());
    topology.get(a)!.add(b);topology.get(b)!.add(a);
  };
  for(const edge of [...voltageEdges,...resistors])link(edge.a,edge.b);
  if(graphNodes.size>MAX_NODES)
    return unavailable('unsupported','测量网络超过节点规模上限');
  if(!graphNodes.has(positive)||!graphNodes.has(negative))
    return unavailable('unconnected','表笔未接到已求解的电阻/电容网络');
  const island=new Set<string>([positive]),queue=[positive];
  for(let i=0;i<queue.length;i++){
    for(const next of topology.get(queue[i])??[]){
      if(!island.has(next)){island.add(next);queue.push(next);}
    }
  }
  if(!island.has(negative))
    return unavailable('unsupported','表笔位于不同的浮置网络，无法确定电压差');
  if(![...activeNodes].some(n=>island.has(n)))
    return unavailable('unsupported','测量岛未连接到已建模的电源或电容');
  if(positive===negative)
    return {status:'measured',volts:0,reason:'理想导线连接的同一电气节点'};

  // Weighted voltage-source graph. Offset is V(node)-V(root).
  const constrained=new Map<string,Adjacent[]>();
  for(const node of island)constrained.set(node,[]);
  for(const edge of voltageEdges){
    if(!island.has(edge.a)||!island.has(edge.b))continue;
    constrained.get(edge.a)!.push({to:edge.b,difference:-edge.voltage});
    constrained.get(edge.b)!.push({to:edge.a,difference:edge.voltage});
  }
  const rootOf=new Map<string,string>(),offset=new Map<string,number>();
  for(const start of island){
    if(rootOf.has(start))continue;
    rootOf.set(start,start);offset.set(start,0);
    const pending=[start];
    for(let i=0;i<pending.length;i++){
      const from=pending[i],base=offset.get(from)!;
      for(const edge of constrained.get(from)!){
        const desired=base+edge.difference,current=offset.get(edge.to);
        if(current===undefined){
          rootOf.set(edge.to,start);offset.set(edge.to,desired);pending.push(edge.to);
        }else if(Math.abs(current-desired)>VOLTAGE_TOLERANCE){
          return unavailable('unsupported','已求解电容与理想电源的电压约束不一致');
        }
      }
    }
  }
  // Eliminate ideal voltage sources, then solve reduced resistor KCL.
  const reference=rootOf.get(positive)!;
  const unknownRoots=[...new Set(rootOf.values())].filter(root=>root!==reference);
  const nodeIndex=new Map(unknownRoots.map((root,i)=>[root,i]));
  const matrix=Array.from({length:unknownRoots.length},
    ()=>Array<number>(unknownRoots.length).fill(0));
  const rhs=Array<number>(unknownRoots.length).fill(0);
  for(const {a,b,conductance:g} of resistors){
    if(!island.has(a)||!island.has(b))continue;
    const ra=rootOf.get(a)!,rb=rootOf.get(b)!;
    if(ra===rb)continue;
    const ia=nodeIndex.get(ra),ib=nodeIndex.get(rb);
    const delta=offset.get(a)!-offset.get(b)!;
    if(ia!==undefined){
      matrix[ia][ia]+=g;
      rhs[ia]-=g*delta;
      if(ib!==undefined)matrix[ia][ib]-=g;
    }
    if(ib!==undefined){
      matrix[ib][ib]+=g;
      rhs[ib]+=g*delta;
      if(ia!==undefined)matrix[ib][ia]-=g;
    }
  }
  const solved=solveLinear(matrix,rhs);
  if(!solved)
    return unavailable('unsupported','电阻节点矩阵奇异或数值不稳定');
  const potential=(node:string)=>{
    const root=rootOf.get(node)!;
    return (root===reference?0:solved[nodeIndex.get(root)!])+offset.get(node)!;
  };
  const volts=potential(positive)-potential(negative);
  if(!Number.isFinite(volts)||Math.abs(volts)>1e9)
    return unavailable('unsupported','电压读数超出数值范围');
  return {
    status:'measured',volts,
    reason:'根据电容采样、电阻 KCL 和已知理想电源重建节点电位'
  };
}
