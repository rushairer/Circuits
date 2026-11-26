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

/** A pure camera change must not replace thousands of SVG nodes. */
async function assertInPlaceZoom(page:Page,wireId:string){
 const scene=page.locator('#scene'),wire=page.locator('.wire[data-wire="'+wireId+'"]');
 const sceneNode=await scene.elementHandle(),wireNode=await wire.elementHandle();
 const priorTransform=await scene.getAttribute('transform');
 const priorPath=await wire.getAttribute('d');
 const stored=await page.evaluate(()=>localStorage.getItem('circuits-project'));
 try{
  await page.locator('button[data-action="zoom-in"]').click();
  await expect(scene).not.toHaveAttribute('transform',priorTransform!);
  await expect(wire).toHaveAttribute('d',priorPath!);
  expect(await scene.evaluate((el,previous)=>el===previous,sceneNode)).toBe(true);
  expect(await wire.evaluate((el,previous)=>el===previous,wireNode)).toBe(true);
  const scale=Number((await scene.getAttribute('transform'))!.match(/scale\(([^)]+)\)/)![1]);
  await expect(page.locator('#canvas-zoom')).toHaveText(Math.round(scale*100)+'%');
  expect(await page.evaluate(()=>localStorage.getItem('circuits-project'))).toBe(stored);
 }finally{
  await sceneNode?.dispose();await wireNode?.dispose();
 }
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
 await assertInPlaceZoom(page,'wire-0');
 await expect(wire).toHaveAttribute('d',originalPath!);
 const movedPart=page.locator('.item[data-part="p0"]');
 const unrelatedWire=page.locator('.wire[data-wire="wire-1"]');
 await movedPart.focus();
 await page.keyboard.press('Enter');
 // Selection performs a full render. Focus its replacement once before nudge.
 await movedPart.focus();
 const partNode=await movedPart.elementHandle();
 const wireNode=await wire.elementHandle();
 const unrelatedNode=await unrelatedWire.elementHandle();
 const sceneNode=await page.locator('#scene').elementHandle();
 const oldUnrelatedPath=await unrelatedWire.getAttribute('d');
 await page.keyboard.press('ArrowRight');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!).parts[0].x))
  .toBe(original.parts[0].x+10);
 await expect(wire).not.toHaveAttribute('d',originalPath!);
 await expect(movedPart).toHaveAttribute('transform','translate('+(original.parts[0].x+10)+' '+original.parts[0].y+')');
 await expect(movedPart).toBeFocused();
 await expect(page.locator('#part-coordinates')).toContainText('坐标 '+(original.parts[0].x+10)+', '+original.parts[0].y);
 await expect(unrelatedWire).toHaveAttribute('d',oldUnrelatedPath!);
 expect(await movedPart.evaluate((el,old)=>el===old,partNode)).toBe(true);
 expect(await wire.evaluate((el,old)=>el===old,wireNode)).toBe(true);
 expect(await unrelatedWire.evaluate((el,old)=>el===old,unrelatedNode)).toBe(true);
 expect(await page.locator('#scene').evaluate((el,old)=>el===old,sceneNode)).toBe(true);
 await expect(page.locator('.wire[data-wire]')).toHaveCount(2000);
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
 expect(after.wires).toEqual(original.wires);
 const undoButton=page.locator('button[data-action="undo"]');
 const redoButton=page.locator('button[data-action="redo"]');
 await undoButton.click();
 await expect(wire).toHaveAttribute('d',originalPath!);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!))).toEqual(original);
 await expect(movedPart).toHaveAttribute('aria-pressed','false');
 await expect(page.locator('.item.selected')).toHaveCount(0);
 await expect(page.locator('.quick-properties')).toHaveCount(0);
 await expect(page.locator('#component-category')).toBeVisible();
 await expect(redoButton).toBeEnabled();
 expect(await movedPart.evaluate((el,old)=>el===old,partNode)).toBe(true);
 expect(await wire.evaluate((el,old)=>el===old,wireNode)).toBe(true);
 expect(await page.locator('#scene').evaluate((el,old)=>el===old,sceneNode)).toBe(true);
 await saveProfile(page,testInfo,fixture,importRoundtripMs);
 // Keep the original one-nudge/one-undo timing sample comparable.
 await redoButton.click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!))).toEqual(after);
 await expect(wire).not.toHaveAttribute('d',originalPath!);
 await expect(movedPart).toHaveAttribute('aria-pressed','false');
 await expect(redoButton).toBeDisabled();
 expect(await movedPart.evaluate((el,old)=>el===old,partNode)).toBe(true);
 expect(await unrelatedWire.evaluate((el,old)=>el===old,unrelatedNode)).toBe(true);
 await expect(unrelatedWire).toHaveAttribute('d',oldUnrelatedPath!);
 expect(await page.locator('#scene').evaluate((el,old)=>el===old,sceneNode)).toBe(true);
 await undoButton.click();
 await expect(wire).toHaveAttribute('d',originalPath!);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!))).toEqual(original);
 await partNode?.dispose();await wireNode?.dispose();await unrelatedNode?.dispose();await sceneNode?.dispose();
 expect(errors).toEqual([]);
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
 await assertInPlaceZoom(page,'board-0-corridor');
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


test('idle keyboard, wheel and fit navigation preserve live scene nodes and saved circuit',async({page})=>{
 await page.goto('/');
 const scene=page.locator('#scene'),wire=page.locator('.wire[data-wire="w1"]');
 const original=await scene.elementHandle(),originalWire=await wire.elementHandle();
 const saved=await page.evaluate(()=>localStorage.getItem('circuits-project'));
 const before=await scene.getAttribute('transform');
 try{
  await page.locator('.item[data-part="r1"]').focus();
  await page.keyboard.press('ControlOrMeta+=');
  await expect(scene).not.toHaveAttribute('transform',before!);
  await expect(page.locator('.item[data-part="r1"]')).toBeFocused();
  const box=await page.locator('#board').boundingBox();
  expect(box).not.toBeNull();
  const zoomed=await scene.getAttribute('transform');
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);
  await page.mouse.wheel(0,-100);
  await expect(scene).not.toHaveAttribute('transform',zoomed!);
  await page.locator('[data-action="fit"]').click();
  expect(await scene.evaluate((el,previous)=>el===previous,original)).toBe(true);
  expect(await wire.evaluate((el,previous)=>el===previous,originalWire)).toBe(true);
  const scale=Number((await scene.getAttribute('transform'))!.match(/scale\(([^)]+)\)/)![1]);
  await expect(page.locator('#canvas-zoom')).toHaveText(Math.round(scale*100)+'%');
  expect(await page.evaluate(()=>localStorage.getItem('circuits-project'))).toBe(saved);
 }finally{
  await original?.dispose();await originalWire?.dispose();
 }
});


test('history with changed rotation uses full render instead of translation patch',async({page})=>{
 await page.goto('/');
 const part=page.locator('.item[data-part="r1"]');
 const initial=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
 await part.focus();
 await page.keyboard.press('Enter');
 await part.focus();
 await page.keyboard.press('r');
 const rotated=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
 expect(rotated.parts.find((p:{id:string})=>p.id==='r1').rotation)
  .not.toBe(initial.parts.find((p:{id:string})=>p.id==='r1').rotation);
 const scene=page.locator('#scene'),beforeUndo=await scene.elementHandle();
 await page.locator('button[data-action="undo"]').click();
 expect(await scene.evaluate((el,old)=>el===old,beforeUndo)).toBe(false);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!))).toEqual(initial);
 await expect(part).toHaveAttribute('aria-pressed','false');
 await beforeUndo?.dispose();
});
