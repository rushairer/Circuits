import { demo, validProject, type Project } from '../model.js';

export const WORKSPACE_KEY = 'circuits:workspaces:v1';
export const MAX_PROJECTS = 30;
export interface SavedProject { id:string; updatedAt:number; project:Project }
export interface Workspace { schemaVersion:1; activeId:string; slots:SavedProject[] }
const idValid=(id:unknown):id is string=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(id);
const upgrade=(project:Project):Project=>({...structuredClone(project),schemaVersion:2});

/** Accept older unversioned single-project drafts as well as the new workspace format. */
export function migrateWorkspace(raw:unknown, legacy:unknown=null):Workspace {
  if(raw&&typeof raw==='object'){
    const r=raw as Partial<Workspace>;
    if(r.schemaVersion===1&&idValid(r.activeId)&&Array.isArray(r.slots)&&r.slots.length>0&&r.slots.length<=MAX_PROJECTS){
      const ids=new Set<string>();
      const okay=r.slots.every(s=>s&&idValid(s.id)&&!ids.has(s.id)&&(ids.add(s.id),true)&&Number.isSafeInteger(s.updatedAt)&&s.updatedAt>=0&&validProject(s.project));
      if(okay&&ids.has(r.activeId)){
        return {schemaVersion:1,activeId:r.activeId,slots:r.slots.map(s=>({id:s.id,updatedAt:s.updatedAt,project:upgrade(s.project)}))};
      }
    }
  }
  const project=validProject(legacy)?legacy:demo();
  return {schemaVersion:1,activeId:'default',slots:[{id:'default',updatedAt:0,project:upgrade(project)}]};
}

export function activeProject(workspace:Workspace):Project {
  const slot=workspace.slots.find(s=>s.id===workspace.activeId);
  if(!slot)throw new Error('Missing active project');
  return structuredClone(slot.project);
}

export function saveCurrent(workspace:Workspace,project:Project,now:number):Workspace {
  if(!validProject(project)||!Number.isSafeInteger(now)||now<0)throw new Error('Invalid project save');
  if(!workspace.slots.some(s=>s.id===workspace.activeId))throw new Error('Missing active slot');
  return {...workspace,slots:workspace.slots.map(s=>s.id===workspace.activeId?{...s,updatedAt:now,project:upgrade(project)}:s)};
}

export function createProject(workspace:Workspace,id:string,project:Project,now:number):Workspace {
  if(!idValid(id)||!validProject(project)||!Number.isSafeInteger(now)||now<0)throw new Error('Invalid new project');
  if(workspace.slots.length>=MAX_PROJECTS)throw new Error('Project count limit reached');
  if(workspace.slots.some(s=>s.id===id))throw new Error('Project ID already exists');
  return {...workspace,activeId:id,slots:[...workspace.slots,{id,updatedAt:now,project:upgrade(project)}]};
}

export function switchProject(workspace:Workspace,id:string):Workspace {
  if(!workspace.slots.some(s=>s.id===id))throw new Error('Project not found');
  return {...workspace,activeId:id};
}

export function deleteProject(workspace:Workspace,id:string):Workspace {
  if(workspace.slots.length===1)throw new Error('Cannot delete last project');
  if(!workspace.slots.some(s=>s.id===id))throw new Error('Project not found');
  const slots=workspace.slots.filter(s=>s.id!==id);
  return {...workspace,slots,activeId:workspace.activeId===id?slots[0].id:workspace.activeId};
}
