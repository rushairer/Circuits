import type { LedColor, Project } from '../model.js';

/** Tinkercad's six LED lens colors as documented by classroom screenshots.
 * Visual colors only: the experimental diode models are unchanged.
 */
export const LED_COLORS=[
 {value:'red',label:'红色',shell:'#ee525c',foot:'#d73b4a',glow:'#ff7a74'},
 {value:'green',label:'绿色',shell:'#43bd78',foot:'#1d9954',glow:'#65ed9e'},
 {value:'yellow',label:'黄色',shell:'#f3d64a',foot:'#cca829',glow:'#fff28c'},
 {value:'orange',label:'橙色',shell:'#f5a44f',foot:'#cf742d',glow:'#ffbc70'},
 {value:'blue',label:'蓝色',shell:'#549ee7',foot:'#2e70bc',glow:'#83c0ff'},
 {value:'white',label:'白色',shell:'#f0f4ef',foot:'#bdcad1',glow:'#e8f6ff'}
] as const;
export const isLedColor=(color:unknown):color is LedColor=>
 color==='red'||color==='green'||color==='yellow'||color==='orange'||color==='blue'||color==='white';
export function ledAppearance(color:LedColor|undefined){
 return LED_COLORS.find(c=>c.value===(color??'red'))??LED_COLORS[0];
}
/** No terminal, placement, circuit geometry or simulation model mutations. */
export function changeLedColor(project:Project,partId:string,color:LedColor):Project|null {
 if(!isLedColor(color))return null;
 const component=project.parts.find(p=>p.id===partId);
 if(!component||component.kind!=='led')return null;
 if((component.ledColor??'red')===color)return project;
 return {...project,parts:project.parts.map(p=>p.id===partId?{...p,ledColor:color}:p)};
}
