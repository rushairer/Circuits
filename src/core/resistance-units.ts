import type { Part, Project, ResistanceUnit } from '../model.js';

export const RESISTANCE_UNITS=[
 {value:'p',symbol:'pΩ',multiplier:1e-12},
 {value:'n',symbol:'nΩ',multiplier:1e-9},
 {value:'u',symbol:'µΩ',multiplier:1e-6},
 {value:'m',symbol:'mΩ',multiplier:1e-3},
 {value:'ohm',symbol:'Ω',multiplier:1},
 {value:'k',symbol:'kΩ',multiplier:1e3},
 {value:'M',symbol:'MΩ',multiplier:1e6},
 {value:'G',symbol:'GΩ',multiplier:1e9}
] as const;
export const isResistanceUnit=(unit:unknown):unit is ResistanceUnit=>
 typeof unit==='string'&&RESISTANCE_UNITS.some(item=>item.value===unit);
export const resistanceFactor=(unit:ResistanceUnit):number=>
 RESISTANCE_UNITS.find(item=>item.value===unit)!.multiplier;

/** Round only the shown mantissa, never the canonical solver ohms. */
export function resistorDisplayValue(part:Pick<Part,'value'|'resistanceUnit'>):number {
 const unit=part.resistanceUnit??'ohm';
 return Number(((part.value??220)/resistanceFactor(unit)).toPrecision(12));
}

/** Selecting a prefix scales the current mantissa, not just its text label. */
export function changeResistorValue(project:Project,id:string,nominal:number,unit:ResistanceUnit):Project|null {
 if(!isResistanceUnit(unit)||!Number.isFinite(nominal)||nominal<=0)return null;
 const ohms=nominal*resistanceFactor(unit);
 if(!Number.isFinite(ohms)||ohms<1e-12||ohms>1e12)return null;
 const index=project.parts.findIndex(part=>part.id===id&&part.kind==='resistor');
 if(index<0)return null;
 const original=project.parts[index];
 if((original.value??220)===ohms&&(original.resistanceUnit??'ohm')===unit)return project;
 const parts=project.parts.map((part,i)=>{
  if(i!==index)return part;
  if(unit==='ohm'){
   const {resistanceUnit:_discard,...rest}=part;
   return {...rest,value:ohms};
  }
  return {...part,value:ohms,resistanceUnit:unit};
 });
 return {...project,parts};
}
