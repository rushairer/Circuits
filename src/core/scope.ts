import type { RcAnalysis } from './rc-transient.js';
import type { RcNetworkAnalysis } from './rc-network.js';

/** Data acquired from an *offline circuit model*, not physical instruments. */
export interface ScopeDatum {
  voltageVolts: number;
  currentMilliAmps: number | null;
}
export interface ScopeFrame {
  timeSeconds: number;
  capacitors: Record<string,ScopeDatum>;
}
export interface ScopeCapture {
  model: 'analytic' | 'backward-euler';
  capacitorIds: string[];
  frames: ScopeFrame[];
  durationSeconds: number;
  notes: string[];
}
export type ScopeInput = RcAnalysis | RcNetworkAnalysis;

const finite=(value:number)=>Number.isFinite(value)&&Math.abs(value)<1e12;
const validId=(id:string)=>/^[A-Za-z0-9_-]{1,80}$/.test(id);

/** Reject missing/NaN solver output, rather than drawing fictitious samples. */
export function createScopeCapture(analysis:ScopeInput):ScopeCapture|null {
  if(!analysis.ok)return null;
  const analytic='capacitorId' in analysis;
  const ids=analytic?[analysis.capacitorId]:analysis.capacitorIds;
  if(ids.some(id=>typeof id!=='string'||!validId(id))||ids.length<1||ids.length>6)return null;
  const capacitorIds=ids as string[];
  const rows=analytic
    ? analysis.samples.map(row=>({
      timeSeconds:row.timeSeconds,
      capacitors:{[capacitorIds[0]]:{
        voltageVolts:row.voltageVolts,currentMilliAmps:row.currentMilliAmps
      }}
    }))
    : analysis.samples.map(row=>({
      timeSeconds:row.timeSeconds,
      capacitors:row.capacitors
    }));
  if(rows.length!==101)return null;
  let previous=-1;
  for(const row of rows){
    if(!finite(row.timeSeconds)||row.timeSeconds<0||row.timeSeconds<=previous)return null;
    previous=row.timeSeconds;
    for(const id of capacitorIds){
      const data=row.capacitors[id];
      if(!data||!finite(data.voltageVolts)||
        (data.currentMilliAmps!==null&&!finite(data.currentMilliAmps)))return null;
    }
  }
  if(Math.abs(rows[0].timeSeconds)>1e-10)return null;
  const durationSeconds=rows[rows.length-1].timeSeconds;
  if(!(durationSeconds>0))return null;
  // Defensive snapshots: UI scrubbing and CSV generation never mutate solver output.
  return {
    model:analytic?'analytic':'backward-euler',
    capacitorIds:[...capacitorIds],
    durationSeconds,
    frames:rows.map(row=>({
      timeSeconds:row.timeSeconds,
      capacitors:Object.fromEntries(capacitorIds.map(id=>[
        id,{voltageVolts:row.capacitors[id].voltageVolts,
            currentMilliAmps:row.capacitors[id].currentMilliAmps}
      ]))
    })),
    notes:[...analysis.warnings]
  };
}

export function scopeFrame(
  capture:ScopeCapture, capacitorId:string, index:number
):{timeSeconds:number;voltageVolts:number;currentMilliAmps:number|null}|null {
  if(!capture.capacitorIds.includes(capacitorId)||!Number.isInteger(index)||
    index<0||index>=capture.frames.length)return null;
  const row=capture.frames[index],value=row.capacitors[capacitorId];
  return value?{timeSeconds:row.timeSeconds,...value}:null;
}

/** RFC4180-style CSV. Blank numerical cells mean *not calculated*, not zero. */
export function exportScopeCSV(capture:ScopeCapture):string {
  const ids=capture.capacitorIds;
  const header=['time_seconds',...ids.flatMap(id=>[id+'_voltage_V',id+'_current_mA'])];
  const number=(value:number|null):string=>
    value===null?'':Number.isFinite(value)?String(Number(value.toPrecision(12))):'';
  const lines=[header.join(',')];
  for(const frame of capture.frames){
    lines.push([number(frame.timeSeconds),...ids.flatMap(id=>[
      number(frame.capacitors[id].voltageVolts),
      number(frame.capacitors[id].currentMilliAmps)
    ])].join(','));
  }
  return lines.join('\r\n')+'\r\n';
}
