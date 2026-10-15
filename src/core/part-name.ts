import type { Project } from '../model.js';

/** Optional user-facing instance name. IDs and electrical terminal identities stay stable. */
export function renamePart(project:Project,id:string,raw:string):Project|null {
 if(typeof raw!=='string'||raw.length>80||/[\u0000-\u001f\u007f]/.test(raw))return null;
 const name=raw.trim();
 const index=project.parts.findIndex(part=>part.id===id);
 if(index<0)return null;
 const current=project.parts[index];
 if((current.name??'')===name)return project;
 const parts=project.parts.map(part=>{
   if(part.id!==id)return part;
   if(!name){
     const {name:_discard,...rest}=part;
     return rest;
   }
   return {...part,name};
 });
 return {...project,parts};
}
