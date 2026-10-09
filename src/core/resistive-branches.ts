import type { Project } from '../model.js';

/** Virtual ammeter is a physically modeled 0.1 Ω shunt, never an ideal short. */
export const AMMETER_SHUNT_OHMS = 0.1;
export const AMMETER_WARNING_MILLIAMPS = 200;
export type ResistiveKind = 'resistor' | 'ammeter' | 'switch';
export interface ResistiveBranch {
  id:string;
  kind:ResistiveKind;
  fromPin:'a'|'positive';
  toPin:'b'|'negative';
  ohms:number;
}
/**
 * Passive branches exposed to all circuit solvers and probe reconstruction.
 * Closed ideal switches (default, contactOhms=0) are already unioned in
 * buildNetlist; open switches are absent. A nonzero-contact switch is not
 * unioned and appears here as a proper resistive branch.
 */
export function resistiveBranches(doc:Project):ResistiveBranch[] {
  const result:ResistiveBranch[]=[];
  for(const part of doc.parts){
    if(part.kind==='resistor')result.push({
      id:part.id,kind:'resistor',fromPin:'a',toPin:'b',ohms:part.value??220
    });
    else if(part.kind==='ammeter')result.push({
      id:part.id,kind:'ammeter',fromPin:'positive',toPin:'negative',
      ohms:AMMETER_SHUNT_OHMS
    });
    else if(part.kind==='switch'&&part.closed&&(part.contactOhms??0)>0)result.push({
      id:part.id,kind:'switch',fromPin:'a',toPin:'b',
      ohms:part.contactOhms!
    });
  }
  return result;
}
