/**
 * Deterministic educational preview for the Arduino Uno built-in D13 LED.
 * It is NOT C++/AVR compilation or execution. No eval, Function, arbitrary
 * expressions, external I/O, interrupts, serial, timers or peripheral model.
 * Only a tiny statically parsed statement subset is interpreted.
 */
export interface UnoLevelEvent {
  offsetMs:number;
  high:boolean;
}
export type UnoPreviewResult =
  | {ok:true;periodMs:number;initialHigh:boolean;events:readonly UnoLevelEvent[];statementCount:number}
  | {ok:false;reason:string};
export interface UnoPreviewFrame {
  elapsedMs:number;
  phaseMs:number;
  cycle:number;
  high:boolean;
}
type Operation = {name:'pinMode'|'digitalWrite'|'delay';args:string[]};
const MAX_SOURCE_BYTES=12000;
const MAX_OPERATIONS=128;
const MAX_CYCLE_MS=120000;
const MAX_DELAY_MS=60000;
const fail=(reason:string):UnoPreviewResult=>({ok:false,reason});

function statements(body:string,label:string):{items:Operation[];reason:string|null} {
  const parts=body.split(';');
  const tail=parts.pop()?.trim()??'';
  if(tail)return {items:[],reason:label+' 中有未以分号结束的语句'};
  const items:Operation[]=[];
  for(const part of parts){
    const text=part.trim();
    if(!text)continue;
    const match=/^(pinMode|digitalWrite|delay)\s*\(\s*([^()]*)\s*\)$/.exec(text);
    if(!match)return {items:[],reason:label+' 包含不支持的语句：'+text.slice(0,70)};
    const args=match[2].split(',').map(s=>s.trim());
    if(args.some(s=>!s))return {items:[],reason:label+' 包含空参数'};
    items.push({name:match[1] as Operation['name'],args});
    if(items.length>MAX_OPERATIONS)
      return {items:[],reason:'指令数量超过 '+MAX_OPERATIONS+' 条'};
  }
  return {items,reason:null};
}

export function compileUnoPreview(source:string):UnoPreviewResult {
  if(typeof source!=='string'||source.length>MAX_SOURCE_BYTES)
    return fail('代码长度超过 D13 教学预览上限（12000 字符）');
  // Strip comments without executing code. Unclosed comments remain as
  // invalid syntax rather than accidentally hiding a program tail.
  let clean=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
  if(clean.includes('/*')||clean.includes('*/'))
    return fail('注释未正确闭合');

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

  const bodies=new Map<'setup'|'loop',string>();
  let functionError='';
  const rest=clean.replace(/\bvoid\s+(setup|loop)\s*\(\s*\)\s*\{([^{}]*)\}/g,
    (_whole,name:'setup'|'loop',body:string)=>{
      if(bodies.has(name))functionError='setup 或 loop 被重复声明';
      bodies.set(name,body);
      return ' ';
    });
  if(functionError)return fail(functionError);
  if(rest.trim()||!bodies.has('setup')||!bodies.has('loop'))
    return fail('只支持 void setup() 和 void loop() 两个不含嵌套控制流的函数');

  const setup=statements(bodies.get('setup')!,'setup');
  if(setup.reason)return fail(setup.reason);
  const loop=statements(bodies.get('loop')!,'loop');
  if(loop.reason)return fail(loop.reason);
  if(setup.items.length+loop.items.length>MAX_OPERATIONS)
    return fail('总指令数量超过 '+MAX_OPERATIONS+' 条');

  const pin13=(value:string)=>value==='13'||aliases.get(value)===13;
  let configured=false,initialHigh=false;
  for(const item of setup.items){
    if(item.name==='pinMode'&&item.args.length===2&&pin13(item.args[0])&&item.args[1]==='OUTPUT'){
      configured=true;
    }else if(item.name==='digitalWrite'&&item.args.length===2&&pin13(item.args[0])&&
      (item.args[1]==='HIGH'||item.args[1]==='LOW')&&configured){
      initialHigh=item.args[1]==='HIGH';
    }else return fail('setup 仅支持 D13/LED_BUILTIN 的 pinMode(..., OUTPUT) 及后续 digitalWrite');
  }
  if(!configured)return fail('setup 必须先将 D13 配置为 OUTPUT');

  let offset=0;
  const events:UnoLevelEvent[]=[];
  for(const item of loop.items){
    if(item.name==='digitalWrite'&&item.args.length===2&&pin13(item.args[0])&&
      (item.args[1]==='HIGH'||item.args[1]==='LOW')){
      events.push({offsetMs:offset,high:item.args[1]==='HIGH'});
    }else if(item.name==='delay'&&item.args.length===1&&/^\d{1,5}$/.test(item.args[0])){
      const delay=Number(item.args[0]);
      if(delay>MAX_DELAY_MS)return fail('单次 delay 不能超过 60000ms');
      offset+=delay;
      if(offset>MAX_CYCLE_MS)return fail('一个 loop 周期不能超过 120000ms');
    }else return fail('loop 仅支持 D13/LED_BUILTIN 的 digitalWrite 与整数 delay');
  }
  if(offset<1)return fail('loop 需要正数 delay 才能构成有界循环');
  if(events.some(e=>e.offsetMs>=offset))
    return fail('最后一次 digitalWrite 后应有正数 delay，以定义周期终点');
  return {
    ok:true,periodMs:offset,initialHigh,events,statementCount:setup.items.length+loop.items.length
  };
}

/** Query a deterministic level without timers, side effects or state mutation. */
export function sampleUnoPreview(result:UnoPreviewResult,elapsedMs:number):UnoPreviewFrame|null {
  if(!result.ok||!Number.isFinite(elapsedMs)||elapsedMs<0||elapsedMs>3600000)return null;
  const ms=Math.floor(elapsedMs);
  const cycle=Math.floor(ms/result.periodMs);
  const phaseMs=ms%result.periodMs;
  let high=cycle===0?result.initialHigh:(result.events.at(-1)?.high??result.initialHigh);
  for(const event of result.events){
    if(event.offsetMs>phaseMs)break;
    high=event.high;
  }
  return {elapsedMs:ms,phaseMs,cycle,high};
}
