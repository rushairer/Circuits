import type { Project, Endpoint } from '../model.js';
import { validProject } from '../model.js';
import { analyzeDC, type LedMeasurement } from './dc-analysis.js';
import { buildNetlist } from './netlist.js';

/**
 * Educational snapshot of one Uno D13 source driving the modelled external
 * resistor/LED netlist. NOT an ATmega328P electrical/output-stage model.
 *
 * D13 HIGH: 5V ideal source behind 25Ω output impedance.
 * D13 LOW:  0V ideal source behind the same impedance.
 *
 * Only one Uno, no independent batteries or other active supplies. Real
 * ATmega output swing, source/sink limits, ESD diodes, capacitance and
 * time-dependent switching behaviour are explicitly out of scope.
 */
export const UNO_HIGH_VOLTS=5;
export const UNO_DRIVER_OHMS=25;
export const UNO_RECOMMENDED_MILLIAMPS=20;

export interface GpioD13Analysis {
  ok:boolean;
  high:boolean;
  reason:string;
  leds:Record<string,LedMeasurement>;
  driverMilliAmps:number|null;
  warnings:string[];
}

const unsupported=(high:boolean,reason:string):GpioD13Analysis=>
  ({ok:false,high,reason,leds:{},driverMilliAmps:null,warnings:[]});

function allocateId(existing:Set<string>,prefix:string):string {
  let name=prefix;
  for(let i=1;existing.has(name);i++)name=prefix+i;
  existing.add(name);
  return name;
}

export function analyzeGpioD13(project:Project,high:boolean):GpioD13Analysis {
  if(!validProject(project))return unsupported(high,'电路工程不符合合法模型格式');
  const unos=project.parts.filter(p=>p.kind==='arduino');
  if(unos.length!==1)return unsupported(high,'D13 外接电路分析需要且仅支持一块 Arduino Uno');
  const uno=unos[0];
  const touches=(pinId:string)=>project.wires.some(w=>
    (w.from.componentId===uno.id&&w.from.pinId===pinId)||
    (w.to.componentId===uno.id&&w.to.pinId===pinId)
  );
  if(touches('v5'))
    return unsupported(high,'Arduino 5V 引脚尚未实现电气模型，请仅连接 D13 与 GND');
  if(!touches('d13')||!touches('gnd'))
    return unsupported(high,'D13 和 GND 必须分别连接外部负载，不能推断未接线时的电流');
  if(project.parts.some(p=>p.kind==='battery'))
    return unsupported(high,'暂不支持 Arduino GPIO 与独立电池混合供电');
  const netlist=buildNetlist(project);
  if(netlist.warnings.length)return unsupported(high,netlist.warnings.join('；'));
  if(netlist.netOf({componentId:uno.id,pinId:'d13'})===
     netlist.netOf({componentId:uno.id,pinId:'gnd'}))
    return unsupported(high,'Arduino D13 与 GND 被直接短接，拒绝作为正常负载分析');
  const wired=new Set(project.wires.flatMap(w=>[w.from.componentId,w.to.componentId]));
  const supported=new Set(['arduino','resistor','led','breadboard','switch','multimeter','ammeter']);
  if(project.parts.some(p=>wired.has(p.id)&&!supported.has(p.kind)))
    return unsupported(high,'D13 分析不支持连接电容、蜂鸣器、电机或尚未建模的器件');
  const ids=new Set([...project.parts.map(p=>p.id),...project.wires.map(w=>w.id)]);
  const batteryId=allocateId(ids,'__gpio13_source');
  const outputId=allocateId(ids,'__gpio13_output');
  const sourceWireId=allocateId(ids,'__gpio13_internal_wire');

  const remap=(terminal:Endpoint):Endpoint=>{
    if(terminal.componentId!==uno.id)return {...terminal};
    if(terminal.pinId==='d13')return {componentId:outputId,pinId:'b'};
    return {componentId:batteryId,pinId:'negative'};
  };
  const source:Project={
    schemaVersion:2,
    name:project.name,
    code:project.code,
    insertions:project.insertions?.map(i=>({...i})),
    parts:[
      ...project.parts.filter(p=>p.id!==uno.id).map(p=>({...p})),
      {id:batteryId,kind:'battery',x:0,y:0,rotation:0,value:high?UNO_HIGH_VOLTS:0},
      {id:outputId,kind:'resistor',x:0,y:0,rotation:0,value:UNO_DRIVER_OHMS}
    ],
    wires:[
      ...project.wires.map(w=>({
        ...w,from:remap(w.from),to:remap(w.to),
        bends:w.bends?.map(b=>({...b}))
      })),
      {id:sourceWireId,from:{componentId:batteryId,pinId:'positive'},
       to:{componentId:outputId,pinId:'a'},color:'#dd8844'}
    ]
  };
  const solved=analyzeDC(source,{allowZeroVoltageSource:true});
  if(!solved.ok)return unsupported(high,'D13 外接电路无法求解：'+solved.reason);
  const graph=buildNetlist(source);
  const a=graph.netOf({componentId:outputId,pinId:'a'});
  const b=graph.netOf({componentId:outputId,pinId:'b'});
  const va=a?solved.netVoltages.get(a):undefined;
  const vb=b?solved.netVoltages.get(b):undefined;
  if(va===undefined||vb===undefined)
    return unsupported(high,'D13 输出节点没有可验证的电压，拒绝虚构读数');
  const current=(va-vb)/UNO_DRIVER_OHMS*1000;
  if(!Number.isFinite(current))
    return unsupported(high,'D13 输出电流计算发生数值异常');
  const warnings=[...solved.warnings];
  if(Math.abs(current)>UNO_RECOMMENDED_MILLIAMPS)
    warnings.push('D13 计算电流超过 ±20mA 教学参考范围；不模拟真实 GPIO 损坏');
  const leds:Record<string,LedMeasurement>=Object.create(null);
  for(const p of project.parts.filter(p=>p.kind==='led')){
    const value=solved.leds[p.id];
    if(value)leds[p.id]={...value};
  }
  return {
    ok:true,high,
    reason:high?'D13 HIGH · 按 5V / 25Ω 驱动负载计算':'D13 LOW · 按 0V / 25Ω 驱动负载计算',
    leds,driverMilliAmps:Number(current.toFixed(4)),warnings
  };
}
