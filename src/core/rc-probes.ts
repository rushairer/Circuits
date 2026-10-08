import type { Project } from '../model.js';
import { buildNetlist } from './netlist.js';
import type { ScopeCapture } from './scope.js';

export interface RcVoltageReading {
  status:'measured'|'unconnected'|'unsupported';
  volts:number|null;
  reason:string;
}

/**
 * High-impedance virtual voltmeter. A path of *capacitors and ideal wires*
 * uniquely establishes a signed voltage difference. We deliberately do not
 * infer resistor-node potentials from geometric overlap or invent readings
 * across an unknown branch.
 */
export function readRcVoltageProbe(
  project:Project,capture:ScopeCapture,meterId:string,index:number
):RcVoltageReading {
  const unavailable=(status:'unconnected'|'unsupported',reason:string):RcVoltageReading=>
    ({status,volts:null,reason});
  const meter=project.parts.find(p=>p.id===meterId&&p.kind==='multimeter');
  if(!meter)return unavailable('unconnected','找不到所选万用表');
  if(!Number.isInteger(index)||index<0||index>=capture.frames.length)
    return unavailable('unsupported','采样时刻无效');
  const graph=buildNetlist(project);
  if(graph.warnings.length)return unavailable('unsupported','存在无效的接线端点');
  const get=(part:string,pinId:string)=>graph.netOf({componentId:part,pinId});
  const positive=get(meterId,'positive'),negative=get(meterId,'negative');
  if(!positive||!negative)return unavailable('unconnected','表笔引脚无效');
  const connected=new Set<string>();
  const links=new Map<string,{to:string;delta:number}[]>();
  function attach(a:string,b:string,voltage:number){
    connected.add(a);connected.add(b);
    if(!links.has(a))links.set(a,[]);
    if(!links.has(b))links.set(b,[]);
    links.get(a)!.push({to:b,delta:-voltage});
    links.get(b)!.push({to:a,delta:voltage});
  }
  for(const id of capture.capacitorIds){
    const cap=project.parts.find(p=>p.id===id&&p.kind==='capacitor');
    if(!cap)return unavailable('unsupported','波形与当前电容工程不匹配');
    const a=get(cap.id,'a'),b=get(cap.id,'b');
    const sample=capture.frames[index].capacitors[id];
    if(!a||!b||!sample)return unavailable('unsupported','缺少电容节点波形');
    attach(a,b,sample.voltageVolts);
  }
  if(!connected.has(positive)||!connected.has(negative))
    return unavailable('unconnected','表笔未接到参与暂态分析的电容网络');
  if(positive===negative)return {status:'measured',volts:0,reason:'同一电气节点'};
  const volts=new Map<string,number>([[positive,0]]),queue=[positive];
  for(let i=0;i<queue.length;i++){
    const from=queue[i];
    for(const edge of links.get(from)??[]){
      const expected=volts.get(from)!+edge.delta,known=volts.get(edge.to);
      if(known===undefined){
        volts.set(edge.to,expected);queue.push(edge.to);
      }else if(Math.abs(known-expected)>1e-4){
        return unavailable('unsupported','电容路径电压约束不一致');
      }
    }
  }
  if(!volts.has(negative))
    return unavailable('unsupported','尚不能计算跨电阻或不相连电容支路的表笔电压');
  const value=-volts.get(negative)!;
  if(!Number.isFinite(value))
    return unavailable('unsupported','计算出无效电压');
  return {status:'measured',volts:value,reason:'理想高阻输入，按电容网络计算'};
}
