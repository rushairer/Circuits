import type { Project } from '../model.js';
export interface Reading { lit:boolean; currentMilliAmps:number; reason:string }
export function evaluate(project:Project):Reading {
 const battery=project.parts.find(p=>p.kind==='battery'), resistor=project.parts.find(p=>p.kind==='resistor'), led=project.parts.find(p=>p.kind==='led');
 if(!battery||!resistor||!led)return {lit:false,currentMilliAmps:0,reason:'需要电池、电阻和 LED'};
 const connected=(a:string,ap:string,b:string,bp:string)=>project.wires.some(w=>
 (w.from.componentId===a&&w.from.pinId===ap&&w.to.componentId===b&&w.to.pinId===bp)||
 (w.from.componentId===b&&w.from.pinId===bp&&w.to.componentId===a&&w.to.pinId===ap));
 if(!connected(battery.id,'positive',resistor.id,'a')||!connected(resistor.id,'b',led.id,'anode')||!connected(led.id,'cathode',battery.id,'negative'))
 return {lit:false,currentMilliAmps:0,reason:'没有形成完整的正向串联回路'};
 const ohms=resistor.value??220;
 if(ohms<=0)return {lit:false,currentMilliAmps:0,reason:'无有效限流电阻'};
 const ma=Math.max(0,((battery.value??9)-2)/ohms*1000);
 return {lit:ma>=.1&&ma<=30,currentMilliAmps:Math.round(ma*100)/100,reason:ma>30?'LED 过流':ma<.1?'电流不足':'LED 正常发光'};
}
