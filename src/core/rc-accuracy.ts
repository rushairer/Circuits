import type { Project } from '../model.js';
import { analyzeRCNetwork } from './rc-network.js';

/**
 * Self-consistency check by halving the implicit-Euler integration step.
 * Differences are a convergence indicator, NOT an error bound or SPICE
 * validation. Also flags sampling windows that hide an entire fast transient.
 */
export interface RcConvergenceReport {
  ok:boolean;
  reason:string;
  maxDeltaVolts:number|null;
  maxRelativePercent:number|null;
  underResolved:boolean;
  stable:boolean;
  samplesCompared:number;
}
export function assessRcConvergence(
  project:Project,options:{durationSeconds?:number}={}
):RcConvergenceReport {
  const fail=(reason:string):RcConvergenceReport=>({
    ok:false,reason,maxDeltaVolts:null,maxRelativePercent:null,
    underResolved:false,stable:false,samplesCompared:0
  });
  const duration=options.durationSeconds??0.5;
  const base=analyzeRCNetwork(project,{durationSeconds:duration,substepsPerInterval:10});
  if(!base.ok)return fail('基础步长：'+base.reason);
  const fine=analyzeRCNetwork(project,{durationSeconds:duration,substepsPerInterval:20});
  if(!fine.ok)return fail('细化步长：'+fine.reason);
  if(base.samples.length!==101||fine.samples.length!==101||
    base.capacitorIds.join(',')!==fine.capacitorIds.join(','))
    return fail('两次积分采样网格不一致');
  let largest=0,scale=0,underResolved=false;
  const tolerance=1e-9;
  for(const id of base.capacitorIds){
    const first=base.samples[0].capacitors[id].voltageVolts;
    const values=base.samples.map(s=>s.capacitors[id].voltageVolts);
    const swing=Math.max(...values.map(v=>Math.abs(v-first)));
    scale=Math.max(scale,Math.abs(first),...values.map(v=>Math.abs(v)));
    if(swing>1e-5&&Math.abs(values[1]-first)>0.7*swing)
      underResolved=true;
    for(let i=0;i<101;i++){
      const a=base.samples[i].capacitors[id].voltageVolts;
      const b=fine.samples[i].capacitors[id].voltageVolts;
      if(Math.abs(base.samples[i].timeSeconds-fine.samples[i].timeSeconds)>tolerance||
         !Number.isFinite(a)||!Number.isFinite(b))
        return fail('积分输出时间或电压异常');
      largest=Math.max(largest,Math.abs(a-b));
    }
  }
  const percent=largest/Math.max(0.1,scale)*100;
  const stable=percent<=1&&!underResolved;
  return {
    ok:true,
    reason:underResolved?'首个采样区间已覆盖大部分暂态变化；请缩短时间窗口':
      percent>1?'步长细化结果差异较大；请缩短时间窗口或降低网络刚性':
      '两种内部步长给出了相近结果（并非真实误差上界）',
    maxDeltaVolts:largest,maxRelativePercent:percent,underResolved,stable,
    samplesCompared:101*base.capacitorIds.length
  };
}
