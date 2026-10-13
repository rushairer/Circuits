import type { CircuitNote, Project } from '../model.js';
import type { Point } from './geometry.js';

export const MAX_NOTES=120;
export const MAX_NOTE_TEXT=500;
export const NOTE_WIDTH=188;
export const NOTE_HEIGHT=94;
const coordinate=(n:number)=>Number.isFinite(n)&&Math.abs(n)<=100000;
const rounded=(n:number)=>Math.round(n*10000)/10000;
const noteId=(id:string)=>/^[\w-]{1,80}$/.test(id);

/** Notes are annotations only; creating one must not change the electrical model. */
export function createCircuitNote(
 project:Project,id:string,at:Point,text='新建注释'
):Project|null {
 if(!noteId(id)||!coordinate(at.x)||!coordinate(at.y)||
    typeof text!=='string'||text.length>MAX_NOTE_TEXT)return null;
 const existing=project.notes??[];
 if(existing.length>=MAX_NOTES||existing.some(n=>n.id===id))return null;
 const note:CircuitNote={id,x:rounded(at.x),y:rounded(at.y),text};
 return {...project,notes:[...existing,note]};
}

export function editCircuitNote(project:Project,id:string,text:string):Project|null {
 if(typeof text!=='string'||text.length>MAX_NOTE_TEXT)return null;
 const notes=project.notes??[],current=notes.find(n=>n.id===id);
 if(!current)return null;
 if(current.text===text)return project;
 return {...project,notes:notes.map(n=>n.id===id?{...n,text}:n)};
}

/**
 * Delta is relative to the pointer-down snapshot, never accumulated from
 * previous rounded previews. Moves are independent of pins, wires and nets.
 */
export function moveCircuitNote(project:Project,id:string,delta:Point):Project|null {
 if(!Number.isFinite(delta.x)||!Number.isFinite(delta.y))return null;
 const notes=project.notes??[],current=notes.find(n=>n.id===id);
 if(!current)return null;
 const x=rounded(current.x+delta.x),y=rounded(current.y+delta.y);
 if(!coordinate(x)||!coordinate(y))return null;
 if(x===current.x&&y===current.y)return project;
 return {...project,notes:notes.map(n=>n.id===id?{...n,x,y}:n)};
}

export function deleteCircuitNote(project:Project,id:string):Project|null {
 const notes=project.notes??[];
 if(!notes.some(n=>n.id===id))return null;
 return {...project,notes:notes.filter(n=>n.id!==id)};
}
