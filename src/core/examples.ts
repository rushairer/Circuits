import { demo, blankProject, type Project } from '../model.js';

/** Ready-to-run educational fixtures: original assets, no MCU execution. */
export const exampleCatalog=[
 {id:'basic',title:'基础 LED 限流',description:'9V 电池、330Ω 电阻与一只 LED 的串联回路'},
 {id:'parallel',title:'双 LED 并联',description:'两只 LED 各自配有独立限流电阻，比较不同支路电流'},
 {id:'series',title:'双 LED 串联',description:'同一个限流电阻串联两只 LED，比较各自压降'},
 {id:'voltmeter',title:'9V 万用表测量',description:'将理想直流电压表的正负表笔接到电池两端'},
 {id:'gpio-d13-led',title:'Arduino D13 外接 LED 闪烁',description:'Uno D13 → 330Ω 限流电阻 → LED → GND；打开代码预览控制外接 LED'},
 {id:'dc-ammeter',title:'LED 串联电流表',description:'把 0.1Ω 虚拟电流表串入 LED 电路，读取正向电流'},
 {id:'rc-charge',title:'RC 电容充电',description:'9V 电池 + 1kΩ 电阻 + 100µF 电容，时间常数 0.1 秒'},
 {id:'rc-discharge',title:'RC 电容放电',description:'已充至 9V 的 100µF 电容经 1kΩ 电阻自然放电'},
 {id:'rc-resistor-meter',title:'RC 电阻压降测量',description:'9V RC 充电时测量 1kΩ 电阻压降，观察 9V 逐渐下降至 0V'},
 {id:'rc-ammeter',title:'RC 串联电流测量',description:'100µF 电容通过 1kΩ 电阻与 0.1Ω 电流表充电，观察电流衰减'},
 {id:'rc-contact-switch',title:'RC 有损接触开关',description:'拨动开关可设置 100Ω 闭合接触电阻；对比断路和充电时间常数'},
 {id:'rc-parallel',title:'双电容并联 RC',description:'100µF 与 200µF 电容并联，合计 300µF，由 9V / 1kΩ 充电'},
 {id:'rc-series',title:'双电容串联 RC',description:'两只 100µF 电容串联，观察同一支路的电压分配'}
] as const;
export type ExampleId=(typeof exampleCatalog)[number]['id'];

const lead=(id:string,from:string,fromPin:string,to:string,toPin:string,color='#e45454')=>({
 id,from:{componentId:from,pinId:fromPin},to:{componentId:to,pinId:toPin},color
});
export function createExample(id:string):Project|null {
 if(!exampleCatalog.some(e=>e.id===id))return null;
 if(id==='gpio-d13-led'){
   const p=blankProject();
   p.name='Arduino D13 · 外接 LED + 330Ω';
   p.parts=[
     {id:'a1',kind:'arduino',x:95,y:220,rotation:0},
     {id:'r1',kind:'resistor',x:465,y:180,rotation:0,value:330},
     {id:'l1',kind:'led',x:785,y:165,rotation:0}
   ];
   p.wires=[
     lead('w1','a1','d13','r1','a','#e45454'),
     lead('w2','r1','b','l1','anode','#e45454'),
     lead('w3','l1','cathode','a1','gnd','#354553')
   ];
   return p;
 }
 if(id==='rc-parallel'||id==='rc-series'){
   const doc=blankProject();
   doc.name=id==='rc-parallel'?'双电容并联 · 300µF 等效':'双电容串联 · 50µF 等效';
   doc.parts=[
     {id:'b1',kind:'battery',x:90,y:200,rotation:0,value:9},
     {id:'r1',kind:'resistor',x:380,y:220,rotation:0,value:1000},
     {id:'c1',kind:'capacitor',x:650,y:160,rotation:0,value:100,initialVolts:0},
     {id:'c2',kind:'capacitor',x:850,y:300,rotation:0,value:id==='rc-parallel'?200:100,initialVolts:0}
   ];
   doc.wires=[
     lead('w1','b1','positive','r1','a'),
     lead('w2','r1','b','c1','a'),
     ...(id==='rc-parallel'?[
       lead('w3','r1','b','c2','a'),
       lead('w4','c1','b','b1','negative','#354553'),
       lead('w5','c2','b','b1','negative','#354553')
     ]:[
       lead('w3','c1','b','c2','a'),
       lead('w4','c2','b','b1','negative','#354553')
     ])
   ];
   return doc;
 }
 if(id==='rc-ammeter'){
   const p=createExample('rc-charge')!;
   p.name='RC 充电 · 串联电流表';
   p.parts.push({id:'i1',kind:'ammeter',x:600,y:355,rotation:0});
   p.wires[1]=lead('w2','r1','b','i1','positive');
   p.wires.push(lead('wa','i1','negative','c1','a'));
   return p;
 }
 if(id==='rc-contact-switch'){
   const p=createExample('rc-charge')!;
   p.name='RC 充电 · 100Ω 接触开关';
   p.parts.push({id:'s1',kind:'switch',x:260,y:390,rotation:0,closed:true,contactOhms:100});
   p.wires[0]=lead('w1','b1','positive','s1','a');
   p.wires.push(lead('ws','s1','b','r1','a'));
   return p;
 }
 if(id==='dc-ammeter'){
   const p=demo();p.name='LED 串联电流表 · 0.1Ω';
   p.parts.push({id:'i1',kind:'ammeter',x:425,y:75,rotation:0});
   p.wires[0]=lead('w1','b1','positive','i1','positive');
   p.wires.push(lead('wa','i1','negative','r1','a'));
   return p;
 }
 if(id==='rc-resistor-meter'){
   const p=createExample('rc-charge')!;
   p.name='RC 充电 · 万用表测量电阻压降';
   p.parts.push({id:'m1',kind:'multimeter',x:910,y:455,rotation:0});
   p.wires.push(
     lead('wm1','m1','positive','r1','a','#e45454'),
     lead('wm2','m1','negative','r1','b','#354553')
   );
   return p;
 }
 if(id==='rc-charge'){
   const p=blankProject();p.name='RC 充电 · 9V / 1kΩ / 100µF';
   p.parts=[
     {id:'b1',kind:'battery',x:100,y:190,rotation:0,value:9},
     {id:'r1',kind:'resistor',x:420,y:225,rotation:0,value:1000},
     {id:'c1',kind:'capacitor',x:750,y:200,rotation:0,value:100,initialVolts:0}
   ];
   p.wires=[
     lead('w1','b1','positive','r1','a'),
     lead('w2','r1','b','c1','a'),
     lead('w3','c1','b','b1','negative','#354553')
   ];
   return p;
 }
 if(id==='rc-discharge'){
   const p=blankProject();p.name='RC 放电 · 初始 9V / 1kΩ / 100µF';
   p.parts=[
     {id:'r1',kind:'resistor',x:350,y:230,rotation:0,value:1000},
     {id:'c1',kind:'capacitor',x:690,y:205,rotation:0,value:100,initialVolts:9}
   ];
   p.wires=[
     lead('w1','r1','a','c1','a'),
     lead('w2','r1','b','c1','b','#354553')
   ];
   return p;
 }
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
