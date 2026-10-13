import type { Project } from '../model.js';

/**
 * Recolor an explicit wire-ID selection without touching electrical endpoints,
 * bends, routing or component contacts. The caller owns history as ONE edit.
 */
export function recolorWires(
 project:Project,wireIds:ReadonlySet<string>,color:string
):Project {
 if(!wireIds.size||!/^#[0-9a-f]{6}$/i.test(color))return project;
 let changed=false;
 const wires=project.wires.map(w=>{
   if(!wireIds.has(w.id)||w.color.toLowerCase()===color.toLowerCase())return w;
   changed=true;
   return {...w,color};
 });
 return changed?{...project,wires}:project;
}

/** Remove selected wire identities only, never the parts or breadboard contacts. */
export function removeWires(project:Project,wireIds:ReadonlySet<string>):Project {
 if(!wireIds.size)return project;
 const wires=project.wires.filter(w=>!wireIds.has(w.id));
 return wires.length===project.wires.length?project:{...project,wires};
}
