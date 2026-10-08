import { scopeFrame, type ScopeCapture } from '../core/scope.js';

type Domain={low:number;high:number};
const CHART_LEFT=65,CHART_WIDTH=480;
const voltageTop=42,voltageBottom=139,currentTop=194,currentBottom=291;

function domain(values:readonly number[]):Domain {
 const min=Math.min(...values),max=Math.max(...values);
 const padding=Math.max((max-min)*.12,Math.abs(min)*.01,Math.abs(max)*.01,0.01);
 return {low:min-padding,high:max+padding};
}
function graphY(value:number,range:Domain,top:number,bottom:number):number {
 return bottom-(value-range.low)/(range.high-range.low)*(bottom-top);
}
function graphX(index:number):number {return CHART_LEFT+CHART_WIDTH*index/100}
const units=(x:number)=>Number(x.toPrecision(5)).toString();

export function renderScopePanel(capture:ScopeCapture,chosen:string,index:number):string {
 const id=capture.capacitorIds.includes(chosen)?chosen:capture.capacitorIds[0];
 const voltages=capture.frames.map(frame=>frame.capacitors[id].voltageVolts);
 const currents=capture.frames.map(frame=>frame.capacitors[id].currentMilliAmps)
   .filter((value):value is number=>value!==null);
 const volts=domain(voltages),amps=domain(currents.length?currents:[0]);
 const points=(kind:'voltageVolts'|'currentMilliAmps',range:Domain,top:number,bottom:number)=>{
   return capture.frames.flatMap((frame,i)=>{
     const reading=frame.capacitors[id][kind];
     return reading===null?[]:[graphX(i).toFixed(2)+','+graphY(reading,range,top,bottom).toFixed(2)];
   }).join(' ');
 };
 const sample=scopeFrame(capture,id,index)!;
 const currentLabel=sample.currentMilliAmps===null?'—':sample.currentMilliAmps.toFixed(3)+' mA';
 const options=capture.capacitorIds.map(capId=>'<option value="'+capId+'" '+
   (capId===id?'selected':'')+'>电容 '+capId+'</option>').join('');
 const currentDot=sample.currentMilliAmps===null?'visibility="hidden"':'';
 const currentY=sample.currentMilliAmps===null?currentBottom:
   graphY(sample.currentMilliAmps,amps,currentTop,currentBottom);
 const modelLabel=capture.model==='analytic'?'单电容解析模型':'多电容向后欧拉近似';
 return '<div class="scope-shade" data-action="scope-close" aria-hidden="true"></div>'+
 '<section class="scope-dialog" role="dialog" aria-modal="true" aria-labelledby="scope-title">'+
 '<header class="scope-heading"><div><h2 id="scope-title">模拟示波器</h2><span>'+modelLabel+' · 教学数据</span></div>'+
 '<button type="button" data-action="scope-close" aria-label="关闭模拟示波器">关闭 ×</button></header>'+
 '<div class="scope-toolbar"><label for="scope-channel">电容通道</label><select id="scope-channel" aria-label="选择测量电容">'+options+'</select>'+
 '<button type="button" data-action="scope-export">导出 CSV</button></div>'+
 '<svg class="scope-svg" role="img" aria-label="电容电压 CH1 与计算支路电流 CH2 时间波形" viewBox="0 0 610 331">'+
 '<rect x="50" y="24" width="510" height="283" rx="9" fill="#0d2630"/>'+
 [55,155,255,355,455,545].map(x=>'<line x1="'+x+'" y1="24" x2="'+x+
   '" y2="307" class="scope-grid"/>').join('')+
 [65,91,117,213,239,265].map(y=>'<line x1="50" y1="'+y+'" x2="560" y2="'+y+
   '" class="scope-grid"/>').join('')+
 '<text x="56" y="18" class="scope-axis">CH1 · 电容电压 (V)</text>'+
 '<text x="56" y="177" class="scope-axis">CH2 · 计算电流 (mA)</text>'+
 '<text x="552" y="18" text-anchor="end" class="scope-axis">0–'+units(capture.durationSeconds)+' s</text>'+
 '<text x="556" y="51" text-anchor="end" class="scope-tick">'+units(volts.high)+' V</text>'+
 '<text x="556" y="134" text-anchor="end" class="scope-tick">'+units(volts.low)+' V</text>'+
 '<text x="556" y="204" text-anchor="end" class="scope-tick">'+units(amps.high)+' mA</text>'+
 '<text x="556" y="286" text-anchor="end" class="scope-tick">'+units(amps.low)+' mA</text>'+
 '<polyline class="scope-voltage-curve" fill="none" points="'+points('voltageVolts',volts,voltageTop,voltageBottom)+'"/>'+
 '<polyline class="scope-current-curve" fill="none" points="'+points('currentMilliAmps',amps,currentTop,currentBottom)+'"/>'+
 '<line id="scope-time-cursor" x1="'+graphX(index)+'" x2="'+graphX(index)+'" y1="24" y2="307" class="scope-cursor"/>'+
 '<circle id="scope-voltage-dot" cx="'+graphX(index)+'" cy="'+
 graphY(sample.voltageVolts,volts,voltageTop,voltageBottom).toFixed(2)+'" r="5" fill="#18d5c8"/>'+
 '<circle id="scope-current-dot" cx="'+graphX(index)+'" cy="'+currentY.toFixed(2)+
 '" r="5" fill="#ffc36a" '+currentDot+'/>'+
 '<text x="55" y="321" class="scope-axis">0 s</text>'+
 '<text x="550" y="321" text-anchor="end" class="scope-axis">'+units(capture.durationSeconds)+' s</text></svg>'+
 '<div class="scope-readings"><div><span>时间</span><strong id="scope-time-value">'+
 sample.timeSeconds.toFixed(3)+' s</strong></div><div><span>CH1 电压</span><strong id="scope-voltage-value">'+
 sample.voltageVolts.toFixed(2)+' V</strong></div><div><span>CH2 电流</span><strong id="scope-current-value">'+
 currentLabel+'</strong></div></div>'+
 '<label for="scope-time">采样时刻 · 0–100</label>'+
 '<input type="range" id="scope-time" min="0" max="100" step="1" value="'+index+'" aria-label="模拟示波器时间光标"/>'+
 '<p class="scope-note">虚拟仪表读取仿真结果，不是硬件示波器。CH2 是电容支路模型电流；多电容积分在 t=0 不估算瞬时电流。CSV 空单元格代表未计算。</p></section>';
}

export function updateScopePanel(
 root:HTMLElement,capture:ScopeCapture,chosen:string,index:number
):void {
 const id=capture.capacitorIds.includes(chosen)?chosen:capture.capacitorIds[0];
 const datum=scopeFrame(capture,id,index);
 if(!datum)return;
 const volts=domain(capture.frames.map(frame=>frame.capacitors[id].voltageVolts));
 const currents=capture.frames.map(frame=>frame.capacitors[id].currentMilliAmps)
  .filter((value):value is number=>value!==null);
 const amps=domain(currents.length?currents:[0]);
 const setText=(query:string,value:string)=>{const element=root.querySelector(query);if(element)element.textContent=value};
 const x=graphX(index).toFixed(2);
 const cursor=root.querySelector<SVGLineElement>('#scope-time-cursor');
 if(cursor){cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);}
 const voltageDot=root.querySelector<SVGCircleElement>('#scope-voltage-dot');
 voltageDot?.setAttribute('cx',x);
 voltageDot?.setAttribute('cy',graphY(datum.voltageVolts,volts,voltageTop,voltageBottom).toFixed(2));
 const currentDot=root.querySelector<SVGCircleElement>('#scope-current-dot');
 currentDot?.setAttribute('cx',x);
 if(datum.currentMilliAmps===null)currentDot?.setAttribute('visibility','hidden');
 else {
   currentDot?.setAttribute('cy',graphY(datum.currentMilliAmps,amps,currentTop,currentBottom).toFixed(2));
   currentDot?.removeAttribute('visibility');
 }
 setText('#scope-time-value',datum.timeSeconds.toFixed(3)+' s');
 setText('#scope-voltage-value',datum.voltageVolts.toFixed(2)+' V');
 setText('#scope-current-value',datum.currentMilliAmps===null?'—':datum.currentMilliAmps.toFixed(3)+' mA');
}
