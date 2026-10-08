import { demo, type Project } from '../model.js';

/** Ready-to-run educational fixtures: original assets, no MCU execution. */
export const exampleCatalog=[
 {id:'basic',title:'基础 LED 限流',description:'9V 电池、330Ω 电阻与一只 LED 的串联回路'},
 {id:'parallel',title:'双 LED 并联',description:'两只 LED 各自配有独立限流电阻，比较不同支路电流'},
 {id:'series',title:'双 LED 串联',description:'同一个限流电阻串联两只 LED，比较各自压降'},
 {id:'voltmeter',title:'9V 万用表测量',description:'将理想直流电压表的正负表笔接到电池两端'}
] as const;
export type ExampleId=(typeof exampleCatalog)[number]['id'];

const lead=(id:string,from:string,fromPin:string,to:string,toPin:string,color='#e45454')=>({
 id,from:{componentId:from,pinId:fromPin},to:{componentId:to,pinId:toPin},color
});
export function createExample(id:string):Project|null {
 if(!exampleCatalog.some(e=>e.id===id))return null;
 const p=demo();
 if(id==='basic')return p;
 if(id==='parallel'){
   p.name='双 LED 并联 · 独立限流';
   p.parts.push({id:'r2',kind:'resistor',x:430,y:95,rotation:0,value:470},
                {id:'l2',kind:'led',x:750,y:45,rotation:0});
   p.wires.push(lead('w4','b1','positive','r2','a'),
                lead('w5','r2','b','l2','anode'),
                lead('w6','l2','cathode','b1','negative','#354553'));
 }else if(id==='series'){
   p.name='双 LED 串联 · 压降分配';
   p.parts.push({id:'l2',kind:'led',x:915,y:170,rotation:0});
   p.wires[2]=lead('w3','l1','cathode','l2','anode');
   p.wires.push(lead('w4','l2','cathode','b1','negative','#354553'));
 }else if(id==='voltmeter'){
   p.name='数字万用表 · 测量 9V 电池';
   p.parts.push({id:'m1',kind:'multimeter',x:890,y:420,rotation:0});
   p.wires.push(lead('w4','m1','positive','b1','positive'),
                lead('w5','m1','negative','b1','negative','#354553'));
 }
 return p;
}
