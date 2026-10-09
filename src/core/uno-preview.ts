/**
 * Sandboxed, deterministic Arduino teaching preview (no AVR/C++ execution).
 * Static grammar only: D13 pinMode/digitalWrite, delay and bounded literal
 * Serial.begin/print/println. No eval, variable expressions, user I/O, timers,
 * dynamic imports, control flow, additional GPIO pins or external libraries.
 */
export interface UnoLevelEvent {offsetMs:number;high:boolean}
export interface UnoSerialEvent {offsetMs:number;text:string;newline:boolean}
export type UnoPreviewResult =
 | {ok:true;periodMs:number;initialHigh:boolean;events:readonly UnoLevelEvent[];
    d13Configured:boolean;serialBaud:number|null;
    setupSerial:readonly UnoSerialEvent[];loopSerial:readonly UnoSerialEvent[];
    statementCount:number}
 | {ok:false;reason:string};
export interface UnoPreviewFrame {elapsedMs:number;phaseMs:number;cycle:number;high:boolean}
export interface UnoSerialLine {timeMs:number;text:string}
export interface UnoSerialSnapshot {
 baudRate:number;lines:readonly UnoSerialLine[];pending:string;
 truncated:boolean;emittedEvents:number
}
type Operation={name:'pinMode'|'digitalWrite'|'delay'|'Serial.begin'|'Serial.print'|'Serial.println';args:string};
const MAX_SOURCE_BYTES=12000;
const MAX_OPERATIONS=128;
const MAX_CYCLE_MS=120000;
const MAX_DELAY_MS=60000;
const MAX_TEXT_LENGTH=120;
const MAX_EVENTS_PER_SEGMENT=48;
const MAX_EVENTS_DISPLAY=160;
const MAX_LINES_DISPLAY=40;
const MAX_LINE_CHARS=256;
const SERIAL_RATES=new Set([300,600,1200,2400,4800,9600,14400,19200,28800,38400,57600,115200]);
const fail=(reason:string):UnoPreviewResult=>({ok:false,reason});

/** Preserve quotation marks while deleting comments; // inside a string is data. */
function stripComments(source:string):string|null {
 let out='',mode:'code'|'line'|'block'|'string'='code';
 for(let i=0;i<source.length;i++){
   const ch=source[i],next=source[i+1];
   if(mode==='line'){
     if(ch==='\n'){out+='\n';mode='code';}
   }else if(mode==='block'){
     if(ch==='*'&&next==='/'){mode='code';i++;}
     else if(ch==='\n')out+='\n';
   }else if(mode==='string'){
     out+=ch;
     if(ch==='\\'&&i+1<source.length){out+=source[++i];continue;}
     if(ch==='"')mode='code';
   }else if(ch==='/'&&next==='/'){mode='line';i++;}
   else if(ch==='/'&&next==='*'){mode='block';i++;}
   else if(ch==='"'){mode='string';out+=ch;}
   else out+=ch;
 }
 if(mode==='string'||mode==='block')return null;
 return out;
}

/** Find semicolons only outside JSON-style double-quoted literal strings. */
function statements(body:string,label:string):{items:Operation[];reason:string|null} {
 const parts:string[]=[];
 let from=0,quoted=false;
 for(let i=0;i<body.length;i++){
   const ch=body[i];
   if(quoted&&ch==='\\'){i++;continue;}
   if(ch==='"'){quoted=!quoted;continue;}
   if(ch===';'&&!quoted){parts.push(body.slice(from,i).trim());from=i+1;}
 }
 if(quoted)return {items:[],reason:label+' 中包含未闭合的字符串'};
 if(body.slice(from).trim())return {items:[],reason:label+' 中有未以分号结束的语句'};
 const items:Operation[]=[];
 for(const text of parts){
   if(!text)continue;
   const match=/^(pinMode|digitalWrite|delay|Serial\.begin|Serial\.print|Serial\.println)\s*\(\s*([\s\S]*?)\s*\)$/.exec(text);
   if(!match)return {items:[],reason:label+' 包含不支持的语句：'+text.slice(0,70)};
   items.push({name:match[1] as Operation['name'],args:match[2].trim()});
   if(items.length>MAX_OPERATIONS)return {items:[],reason:'指令数量超过 '+MAX_OPERATIONS+' 条'};
 }
 return {items,reason:null};
}

function serialLiteral(value:string):string|null {
 const string=/^"(?:[^"\\\r\n]|\\["\\nrt])*"$/;
 if(string.test(value)){
   try{
     const text=JSON.parse(value) as unknown;
     return typeof text==='string'&&text.length<=MAX_TEXT_LENGTH?text:null;
   }catch{return null;}
 }
 if(/^[+-]?\d{1,6}$/.test(value)){
   const number=Number(value);
   return Math.abs(number)<=999999?String(number):null;
 }
 return null;
}
function extractBodies(text:string):Map<'setup'|'loop',string>|null {
 const bodies=new Map<'setup'|'loop',string>(),matches:[number,number][]=[];
 const declarations=/\bvoid\s+(setup|loop)\s*\(\s*\)\s*\{/g;
 let m:RegExpExecArray|null;
 while((m=declarations.exec(text))!==null){
   const name=m[1] as 'setup'|'loop';
   if(bodies.has(name))return null;
   const start=declarations.lastIndex;
   let quote=false,close=-1;
   for(let i=start;i<text.length;i++){
     const ch=text[i];
     if(quote&&ch==='\\'){i++;continue;}
     if(ch==='"'){quote=!quote;continue;}
     if(!quote&&ch==='{')return null; // arbitrary nested C++ flow is forbidden
     if(!quote&&ch==='}'){close=i;break;}
   }
   if(close===-1||quote)return null;
   bodies.set(name,text.slice(start,close));
   matches.push([m.index,close+1]);
   declarations.lastIndex=close+1;
 }
 if(!bodies.has('setup')||!bodies.has('loop'))return null;
 let previous=0,rest='';
 for(const [start,end] of matches){rest+=text.slice(previous,start);previous=end;}
 rest+=text.slice(previous);
 return rest.trim()?null:bodies;
}

export function compileUnoPreview(source:string):UnoPreviewResult {
 if(typeof source!=='string'||source.length>MAX_SOURCE_BYTES)
   return fail('代码长度超过教学预览上限（12000 字符）');
 const stripped=stripComments(source);
 if(stripped===null)return fail('注释或字符串未正确闭合');
 let clean=stripped;
 const aliases=new Map<string,number>([['LED_BUILTIN',13]]);
 let aliasError='';
 clean=clean.replace(/(?:^|\n)[ \t]*#define[ \t]+([A-Za-z_]\w*)[ \t]+(\d+)[ \t]*(?=\n|$)/g,
   (_whole,name:string,value:string)=>{
     if(aliases.has(name)||aliases.size>=16)aliasError='重复或过多的引脚常量';
     else aliases.set(name,Number(value));
     return '\n';
   });
 clean=clean.replace(/\b(?:const\s+)?int\s+([A-Za-z_]\w*)\s*=\s*(\d+)\s*;/g,
   (_whole,name:string,value:string)=>{
     if(aliases.has(name)||aliases.size>=16)aliasError='重复或过多的引脚常量';
     else aliases.set(name,Number(value));
     return ' ';
   });
 if(aliasError)return fail(aliasError);
 const bodies=extractBodies(clean);
 if(!bodies)return fail('只支持 void setup() 和 void loop() 两个不含嵌套控制流的函数');
 const setup=statements(bodies.get('setup')!,'setup');
 if(setup.reason)return fail(setup.reason);
 const loop=statements(bodies.get('loop')!,'loop');
 if(loop.reason)return fail(loop.reason);
 if(setup.items.length+loop.items.length>MAX_OPERATIONS)
   return fail('总指令数量超过 '+MAX_OPERATIONS+' 条');

 const pin13=(value:string)=>value==='13'||aliases.get(value)===13;
 const pinArgs=(args:string)=>args.split(',').map(s=>s.trim());
 const printEvents=(items:readonly Operation[],setupMode:boolean)=>{
   const entries:UnoSerialEvent[]=[];
   let count=0;
   for(const item of items){
     if(item.name==='Serial.print'||item.name==='Serial.println'){
       const value=serialLiteral(item.args);
       if(value===null)return null;
       entries.push({offsetMs:setupMode?0:count,text:value,
         newline:item.name==='Serial.println'});
       if(entries.length>MAX_EVENTS_PER_SEGMENT)return null;
     }
     if(item.name==='delay')count+=Number(item.args);
   }
   return entries;
 };
 let configured=false,initialHigh=false,serialBaud:number|null=null;
 for(const item of setup.items){
   const args=pinArgs(item.args);
   if(item.name==='pinMode'&&args.length===2&&pin13(args[0])&&args[1]==='OUTPUT')configured=true;
   else if(item.name==='digitalWrite'&&args.length===2&&pin13(args[0])&&
     (args[1]==='HIGH'||args[1]==='LOW')&&configured)initialHigh=args[1]==='HIGH';
   else if(item.name==='Serial.begin'&&/^\d{3,6}$/.test(item.args)&&
     SERIAL_RATES.has(Number(item.args))&&serialBaud===null)serialBaud=Number(item.args);
   else if((item.name==='Serial.print'||item.name==='Serial.println')&&
     serialBaud!==null&&serialLiteral(item.args)!==null){}
   else return fail('setup 仅支持 D13 的 pinMode/digitalWrite、Serial.begin 和字面量 Serial.print/println');
 }
 if(!configured&&serialBaud===null)return fail('setup 必须配置 D13 OUTPUT，或先执行 Serial.begin');
 let offset=0;
 const events:UnoLevelEvent[]=[];
 for(const item of loop.items){
   const args=pinArgs(item.args);
   if(item.name==='digitalWrite'&&args.length===2&&pin13(args[0])&&
     (args[1]==='HIGH'||args[1]==='LOW')&&configured){
     events.push({offsetMs:offset,high:args[1]==='HIGH'});
   }else if(item.name==='delay'&&args.length===1&&/^\d{1,5}$/.test(args[0])){
     const delay=Number(args[0]);
     if(delay>MAX_DELAY_MS)return fail('单次 delay 不能超过 60000ms');
     offset+=delay;
     if(offset>MAX_CYCLE_MS)return fail('一个 loop 周期不能超过 120000ms');
   }else if((item.name==='Serial.print'||item.name==='Serial.println')&&
      serialBaud!==null&&serialLiteral(item.args)!==null){}
   else return fail('loop 仅支持 D13 digitalWrite、整数 delay 和已初始化串口的字面量 print/println');
 }
 if(offset<1)return fail('loop 需要正数 delay 才能构成有界循环');
 if(events.some(e=>e.offsetMs>=offset))return fail('最后一次 digitalWrite 后应有正数 delay，以定义周期终点');
 const setupSerial=printEvents(setup.items,true),loopSerial=printEvents(loop.items,false);
 if(!setupSerial||!loopSerial)return fail('串口每段最多输出 48 次，单条字面量最多 120 字符');
 if(loopSerial.some(e=>e.offsetMs>=offset))
   return fail('串口语句之后应有正数 delay，以确定重复输出时间');
 const textSize=(events:readonly UnoSerialEvent[])=>
   events.reduce((n,e)=>n+e.text.length,0);
 if(textSize(setupSerial)>1024||textSize(loopSerial)>1024)
   return fail('每段串口预览输出内容不得超过 1024 字符');
 return {
   ok:true,periodMs:offset,initialHigh,events,
   d13Configured:configured,serialBaud,setupSerial,loopSerial,
   statementCount:setup.items.length+loop.items.length
 };
}

/** D13 logic preview samples are read-only; no clock or runtime is started. */
export function sampleUnoPreview(result:UnoPreviewResult,elapsedMs:number):UnoPreviewFrame|null {
 if(!result.ok||!Number.isFinite(elapsedMs)||elapsedMs<0||elapsedMs>3600000)return null;
 const ms=Math.floor(elapsedMs),cycle=Math.floor(ms/result.periodMs),phaseMs=ms%result.periodMs;
 let high=cycle===0?result.initialHigh:(result.events.at(-1)?.high??result.initialHigh);
 for(const event of result.events){
   if(event.offsetMs>phaseMs)break;
   high=event.high;
 }
 return {elapsedMs:ms,phaseMs,cycle,high};
}

/** A bounded tail of deterministic print operations through the chosen time. */
export function sampleUnoSerial(result:UnoPreviewResult,elapsedMs:number):UnoSerialSnapshot|null {
 const frame=sampleUnoPreview(result,elapsedMs);
 if(!result.ok||!frame||result.serialBaud===null)return null;
 type Timed={timeMs:number;text:string;newline:boolean};
 const reverse:Timed[]=[];
 const {cycle,phaseMs}=frame;
 const currentCount=result.loopSerial.filter(event=>event.offsetMs<=phaseMs).length;
 const emittedEvents=result.setupSerial.length+cycle*result.loopSerial.length+currentCount;
 if(result.loopSerial.length){
   for(let c=cycle;c>=0&&reverse.length<MAX_EVENTS_DISPLAY;c--){
     for(let i=result.loopSerial.length-1;i>=0&&reverse.length<MAX_EVENTS_DISPLAY;i--){
       const item=result.loopSerial[i];
       if(c===cycle&&item.offsetMs>phaseMs)continue;
       reverse.push({timeMs:c*result.periodMs+item.offsetMs,
         text:item.text,newline:item.newline});
     }
   }
 }
 if(reverse.length<MAX_EVENTS_DISPLAY){
   for(let i=result.setupSerial.length-1;i>=0&&reverse.length<MAX_EVENTS_DISPLAY;i--){
     const item=result.setupSerial[i];
     reverse.push({timeMs:0,text:item.text,newline:item.newline});
   }
 }
 const lines:UnoSerialLine[]=[];
 let pending='',lastTime=0,truncated=emittedEvents>reverse.length;
 for(const item of reverse.reverse()){
   const joined=pending+item.text;
   pending=joined.length>MAX_LINE_CHARS?joined.slice(-MAX_LINE_CHARS):joined;
   if(joined.length>MAX_LINE_CHARS)truncated=true;
   if(item.newline){lines.push({timeMs:item.timeMs,text:pending});pending='';}
   lastTime=item.timeMs;
 }
 if(lines.length>MAX_LINES_DISPLAY){
   truncated=true;
   lines.splice(0,lines.length-MAX_LINES_DISPLAY);
 }
 void lastTime;
 return {baudRate:result.serialBaud,lines,pending,truncated,emittedEvents};
}
