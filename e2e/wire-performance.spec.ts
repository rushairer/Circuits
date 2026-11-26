import {test,expect,type Page,type TestInfo} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {wireScene} from '../tests/fixtures/wire-scenes.mjs';

// Browser-side diagnostics: a frame callback is a rendering opportunity,
// not a guarantee of display presentation. Never gate shared CI on wall time.
type InputSample={action:string;firstFrameMs:number;secondFrameMs:number};
type ProfileData={frameIntervalsMs:number[];inputs:InputSample[];longTasksMs:number[]|null};
type ProfileWindow=Window&{__circuitsProfileStop?:()=>ProfileData};
async function startProfile(page:Page){
 await page.evaluate(()=>{
  const profileWindow=window as ProfileWindow;
  const frameIntervalsMs:number[]=[],inputs:InputSample[]=[];
  let last:number|undefined,frameId=0,active=true;
  const frame=(stamp:number)=>{
   if(!active)return;
   if(last!==undefined&&frameIntervalsMs.length<10000)frameIntervalsMs.push(stamp-last);
   last=stamp;frameId=requestAnimationFrame(frame);
  };
  frameId=requestAnimationFrame(frame);
  let observer:PerformanceObserver|undefined;
  let longTasksMs:number[]|null=null;
  if(typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes?.includes('longtask')){
   try{
    const durations:number[]=[];
    observer=new PerformanceObserver(list=>{
     for(const entry of list.getEntries())if(durations.length<10000)durations.push(entry.duration);
    });
    observer.observe({entryTypes:['longtask']});
    longTasksMs=durations;
   }catch{observer?.disconnect();observer=undefined;}
  }
  const input=(event:Event)=>{
   const target=event.target;
   const action=event.type==='keydown'?
    ((event as KeyboardEvent).key==='ArrowRight'?'nudge-right':null):
    target instanceof Element?target.closest('[data-action]')?.getAttribute('data-action'):null;
   if(action!=='nudge-right'&&action!=='zoom-in'&&action!=='undo')return;
   const start=performance.now();
   requestAnimationFrame(()=>{
    const firstFrameMs=performance.now()-start;
    requestAnimationFrame(()=>{
     if(active&&inputs.length<1000)inputs.push({action,firstFrameMs,secondFrameMs:performance.now()-start});
    });
   });
  };
  document.addEventListener('keydown',input,true);
  document.addEventListener('click',input,true);
  profileWindow.__circuitsProfileStop=()=>{
   active=false;cancelAnimationFrame(frameId);
   document.removeEventListener('keydown',input,true);
   document.removeEventListener('click',input,true);
   if(observer&&longTasksMs){
    for(const entry of observer.takeRecords())if(longTasksMs.length<10000)longTasksMs.push(entry.duration);
    observer.disconnect();
   }
   delete profileWindow.__circuitsProfileStop;
   return {frameIntervalsMs,inputs,longTasksMs};
  };
 });
}
async function settleFrames(page:Page){
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))));
}
function summary(values:number[]){
 const sorted=[...values].sort((a,b)=>a-b);
 const percentile=(p:number)=>sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]:null;
 return {count:sorted.length,p50Ms:percentile(.5),p95Ms:percentile(.95),maxMs:sorted.at(-1)??null};
}
async function saveProfile(page:Page,testInfo:TestInfo,scene:{parts:unknown[];wires:unknown[]},importRoundtripMs:number){
 await settleFrames(page);
 const data=await page.evaluate(()=>(window as ProfileWindow).__circuitsProfileStop!());
 const report={
  revision:process.env.GITHUB_SHA??'local',browser:testInfo.project.name,viewport:page.viewportSize(),
  parts:scene.parts.length,wires:scene.wires.length,importRoundtripMs,
  scope:'Import includes Playwright round trips; frame intervals include idle/harness waits. Input timing starts at document event capture and ends at first/second rAF callbacks, not hardware-to-display latency. Unsupported Long Task API is null.',
  frameIntervals:summary(data.frameIntervalsMs),
  actions:Object.fromEntries(['zoom-in','nudge-right','undo'].map(action=>{
   const samples=data.inputs.filter(item=>item.action===action);
   return [action,{firstFrame:summary(samples.map(item=>item.firstFrameMs)),secondFrame:summary(samples.map(item=>item.secondFrameMs))}];
  })),
  longTasks:data.longTasksMs===null?null:summary(data.longTasksMs),
  samples:data
 };
 const path=testInfo.outputPath('browser-performance.json');
 await mkdir(dirname(path),{recursive:true});
 await writeFile(path,JSON.stringify(report,null,2)+'\n');
 await testInfo.attach('browser-performance',{path,contentType:'application/json'});
 // Evidence must exist, but no noisy host-dependent FPS threshold.
 expect(data.frameIntervalsMs.length).toBeGreaterThan(0);
 for(const action of ['zoom-in','nudge-right','undo'])expect(data.inputs.some(item=>item.action===action),action+' capture').toBe(true);
 expect(data.inputs.every(item=>Number.isFinite(item.firstFrameMs)&&item.firstFrameMs>=0&&item.secondFrameMs>=item.firstFrameMs)).toBe(true);
}

/** Interaction correctness at the import ceiling, not a wall-clock FPS gate. */
test('300 parts and 2000 wires stay editable after import, zoom, nudge and undo',async({page},testInfo)=>{
 const errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1440,height:1000});
 await page.goto('/');
 await expect(page).toHaveTitle(/Circuits/);
 const fixture=wireScene(2000);
 const importStarted=performance.now();
 await page.locator('#file').setInputFiles({name:'large-circuit.json',mimeType:'application/json',
  buffer:Buffer.from(JSON.stringify(fixture))});
 await expect(page.locator('.item[data-part]')).toHaveCount(300);
 await expect(page.locator('.wire[data-wire]')).toHaveCount(2000);
 await expect(page.locator('vite-error-overlay')).toHaveCount(0);
 const importRoundtripMs=performance.now()-importStarted;
 await startProfile(page);
 await settleFrames(page);
 const wire=page.locator('.wire[data-wire="wire-0"]');
 const originalPath=await wire.getAttribute('d');
 expect(originalPath).toBeTruthy();
 expect(originalPath).not.toContain(' Q');
 const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
 await page.locator('button[data-action="zoom-in"]').click();
 await expect(wire).toHaveAttribute('d',originalPath!);
 await page.locator('.item[data-part="p0"]').focus();
 await page.keyboard.press('Enter');
 await page.keyboard.press('ArrowRight');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!).parts[0].x))
  .toBe(original.parts[0].x+10);
 await expect(wire).not.toHaveAttribute('d',originalPath!);
 await expect(page.locator('.wire[data-wire]')).toHaveCount(2000);
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
 expect(after.wires).toEqual(original.wires);
 await page.locator('button[data-action="undo"]').click();
 await expect(wire).toHaveAttribute('d',originalPath!);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!))).toEqual(original);
 expect(errors).toEqual([]);
 await saveProfile(page,testInfo,fixture,importRoundtripMs);
});


/** Seven separated regions, each with six fixed jumpers and twelve autoroutes. */
test('126-wire regional routing remains clear through repeated keyboard edits and undo',async({page},testInfo)=>{
 const errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1440,height:1000});
 await page.goto('/');
 const parts=Array.from({length:7},(_,i)=>({
  id:'board-'+i,kind:'breadboard',x:220+(i%3)*1200,y:180+Math.floor(i/3)*1200,rotation:0
 }));
 const wires=parts.flatMap(({id})=>{
  const ep=(pinId:string)=>({componentId:id,pinId});
  const wire=(suffix:string,from:string,to:string,routing:'horizontal'|'vertical',autoAvoid=false)=>({
   id:id+'-'+suffix,from:ep(from),to:ep(to),routing,color:autoAvoid?'#e45454':'#159f91',
   ...(autoAvoid?{autoAvoid:true}:{})
  });
  return [
   ...[10,11,12].map(c=>wire('v'+c,'top-plus-'+c,'hole-c-'+c,'vertical')),
   ...['c','d','e'].map(r=>wire('h'+r,'hole-'+r+'-2','hole-'+r+'-5','horizontal')),
   wire('corridor','hole-a-4','hole-j-14','horizontal',true),
   ...Array.from({length:11},(_,i)=>{
    const c=15+i%7;
    return wire('extra-'+i,'hole-'+(i<7?'a':'b')+'-'+c,'hole-'+(i<7?'j':'i')+'-'+c,'vertical',true);
   })
  ];
 });
 const fixture={schemaVersion:2,name:'Regional routing benchmark',parts,wires,insertions:[],code:''};
 const importStarted=performance.now();
 await page.locator('#file').setInputFiles({name:'regional-benchmark.json',mimeType:'application/json',
  buffer:Buffer.from(JSON.stringify(fixture))});
 await expect(page.locator('.item[data-part]')).toHaveCount(7);
 await expect(page.locator('.wire[data-wire]')).toHaveCount(126);
 const importRoundtripMs=performance.now()-importStarted;
 const wire=page.locator('.wire[data-wire="board-0-corridor"]');
 const hit=page.locator('.wire-hit[data-wire="board-0-corridor"]');
 const initialPath=await hit.getAttribute('d');
 expect(initialPath).toBeTruthy();
 const vertices=(initialPath!.match(/-?\d+(?:\.\d+)?/g)??[]).map(Number);
 expect(vertices).toHaveLength(8);
 expect(vertices.slice(0,2)).toEqual([320,247]);
 expect(vertices.slice(-2)).toEqual([500,328]);
 const length=vertices.reduce((sum,n,i)=>i>=2?sum+Math.abs(n-vertices[i-2]):sum,0);
 expect(length).toBe(261);
 // The route's own crossing decorations depend on painter order; also check
 // the exact fixed-wire geometry via the existing dense-board regression.
 const initial=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
 await startProfile(page);
 await settleFrames(page);
 await page.locator('button[data-action="zoom-in"]').click();
 await expect(hit).toHaveAttribute('d',initialPath!);
 for(let i=0;i<5;i++){
  await page.locator('.item[data-part="board-0"]').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!).parts[0].x)).toBe(230);
  await expect(hit).not.toHaveAttribute('d',initialPath!);
  await settleFrames(page);
  await page.locator('button[data-action="undo"]').click();
  await expect(hit).toHaveAttribute('d',initialPath!);
  await settleFrames(page);
 }
 await expect(wire).toHaveAttribute('d',initialPath!);
 await expect(page.locator('.wire[data-wire]')).toHaveCount(126);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!))).toEqual(initial);
 expect(errors).toEqual([]);
 await saveProfile(page,testInfo,fixture,importRoundtripMs);
});
