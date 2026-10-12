import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
test.use({hasTouch:true});
type XY={x:number;y:number};
const saved=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
async function center(page:Page,selector:string):Promise<XY>{
 const b=await page.locator(selector).boundingBox();expect(b).not.toBeNull();
 return {x:b!.x+b!.width/2,y:b!.y+b!.height/2};
}
async function world(page:Page,x:number,y:number):Promise<XY>{
 return page.evaluate(({x,y})=>{
  const svg=document.querySelector<SVGSVGElement>('#board')!,p=svg.createSVGPoint();p.x=x;p.y=y;
  const c=p.matrixTransform(document.querySelector<SVGGElement>('#scene')!.getScreenCTM()!);
  return {x:c.x,y:c.y};
 },{x,y});
}
async function pointer(page:Page,event:string,point:XY,type='touch',button=0){
 await page.evaluate(({event,point,type,button})=>{
  const target=event==='pointerdown'?document.elementFromPoint(point.x,point.y):document.querySelector('#app');
  target!.dispatchEvent(new PointerEvent(event,{bubbles:true,cancelable:true,pointerId:61,
   pointerType:type,isPrimary:true,clientX:point.x,clientY:point.y,button,
   buttons:/up|cancel/.test(event)?0:button===0?1:button===2?2:32}));
 },{event,point,type,button});
}
const battery='.item[data-part="b1"] .pin[data-pin="negative"]';
const resistor='.item[data-part="r1"] .pin[data-pin="b"]';

test('idle window blur preserves unfinished text and the native file input node',async({page})=>{
 await page.goto('/');
 await page.locator('#name').fill('Pending native edit');
 await page.locator('#file').evaluate(el=>el.setAttribute('data-retain-node','yes'));
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 await expect(page.locator('#name')).toHaveValue('Pending native edit');
 await expect(page.locator('#file')).toHaveAttribute('data-retain-node','yes');
});

test('an orphan release after blur cannot turn its compatibility click into a new wire',async({page})=>{
 await page.goto('/');const before=await saved(page),a=await center(page,battery),b=await center(page,resistor);
 await pointer(page,'pointerdown',a);await pointer(page,'pointermove',b);
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 const other=await center(page,'.item[data-part="l1"] .pin[data-pin="anode"]');
 await pointer(page,'pointerup',other);
 await page.evaluate(({x,y})=>document.elementFromPoint(x,y)!.dispatchEvent(
  new MouseEvent('click',{bubbles:true,cancelable:true,detail:1,clientX:x,clientY:y})),other);
 await expect(page.locator('#wire-preview')).toHaveCount(0);
 expect(await saved(page)).toEqual(before);
});

for(const end of ['pointerup','pointercancel'])test(`touch pan ${end} affects only the camera and cancels atomically`,async({page})=>{
 await page.goto('/');const before=await saved(page),camera=await page.locator('#scene').getAttribute('transform');
 const a=await world(page,970,360),b={x:a.x-56,y:a.y+28};
 await pointer(page,'pointerdown',a);await pointer(page,'pointermove',b);
 await expect(page.locator('#scene')).not.toHaveAttribute('transform',camera!);
 await pointer(page,end,b);
 if(end==='pointercancel')await expect(page.locator('#scene')).toHaveAttribute('transform',camera!);
 else await expect(page.locator('#scene')).not.toHaveAttribute('transform',camera!);
 expect(await saved(page)).toEqual(before);
 await expect(page.locator('.topbar [data-action="undo"]')).toBeDisabled();
});

for(const end of ['pointerup','pointercancel'])test(`pen endpoint retarget ${end} preserves identity and uses real breadboard holes`,async({page})=>{
 await page.goto('/');await page.locator('.wire[data-wire="w1"]').click();
 const before=await saved(page),wire=before.wires.find((w:{id:string})=>w.id==='w1');
 const a=await center(page,'.endpoint-handle[data-wire="w1"][data-wire-end="to"]');
 const b=await center(page,'.breadboard-sockets[data-part="bb1"] .pin[data-pin="hole-a-1"]');
 await pointer(page,'pointerdown',a,'pen');await pointer(page,'pointermove',b,'pen');
 expect(await saved(page)).toEqual(before);await pointer(page,end,b,'pen');
 if(end==='pointerup'){
  const changed=(await saved(page)).wires.find((w:{id:string})=>w.id==='w1');
  expect(changed).toEqual({...wire,to:{componentId:'bb1',pinId:'hole-a-1'}});
  await page.keyboard.press('ControlOrMeta+z');
 }
 expect(await saved(page)).toEqual(before);
});

test('pen barrel and eraser buttons do not start left-button edits',async({page})=>{
 await page.goto('/');const before=await saved(page),a=await center(page,battery),b=await center(page,resistor);
 for(const button of [2,5]){
  await pointer(page,'pointerdown',a,'pen',button);await pointer(page,'pointermove',b,'pen',button);await pointer(page,'pointerup',b,'pen',button);
  await expect(page.locator('#wire-preview')).toHaveCount(0);
 }
 expect(await saved(page)).toEqual(before);
});

test('native tablet touch routing adds one waypoint without duplicate compatibility clicks',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',message=>{if(message.type()==='error'&&!message.location().url.includes('favicon.ico'))errors.push(message.text());});
 await page.setViewportSize({width:1024,height:768});await page.goto('/');
 await expect(page).toHaveTitle(/Circuits/);await expect(page.locator('vite-error-overlay')).toHaveCount(0);
 const before=await saved(page),a=await center(page,battery),bend=await world(page,352,363),b=await center(page,resistor);
 await page.touchscreen.tap(a.x,a.y);await page.touchscreen.tap(bend.x,bend.y);await page.touchscreen.tap(b.x,b.y);
 const after=await saved(page);expect(after.wires).toHaveLength(before.wires.length+1);
 expect(after.wires.at(-1).bends).toEqual([{x:350,y:360}]);
 expect(after.wires.at(-1).from).toEqual({componentId:'b1',pinId:'negative'});
 expect(after.wires.at(-1).to).toEqual({componentId:'r1',pinId:'b'});
 await mkdir('/tmp/circuits-pointer-evidence',{recursive:true});
 await page.screenshot({path:`/tmp/circuits-pointer-evidence/${info.project.name}-tablet-touch.png`});
 await page.keyboard.press('ControlOrMeta+z');expect(await saved(page)).toEqual(before);
 expect(errors).toEqual([]);
});

test('touch waypoint drag commits a single route-only edit',async({page})=>{
 await page.goto('/');await page.locator('.wire[data-wire="w1"]').click();await page.locator('[data-action="wire-add-bend"]').click();
 const before=await saved(page),a=await center(page,'.bend-handle[data-wire="w1"]'),b={x:a.x+54,y:a.y+31};
 await pointer(page,'pointerdown',a);await pointer(page,'pointermove',b);await pointer(page,'pointerup',b);
 const after=await saved(page),w=after.wires.find((w:{id:string})=>w.id==='w1'),old=before.wires.find((w:{id:string})=>w.id==='w1');
 expect(w.bends).not.toEqual(old.bends);expect({...w,bends:old.bends}).toEqual(old);
 expect(after.parts).toEqual(before.parts);await page.keyboard.press('ControlOrMeta+z');expect(await saved(page)).toEqual(before);
});
