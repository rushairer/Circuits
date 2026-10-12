import {test,expect,type Page} from '@playwright/test';
test.use({hasTouch:true});
type XY={x:number;y:number};
const saved=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
async function center(page:Page,selector:string):Promise<XY>{
 const box=await page.locator(selector).boundingBox();expect(box).not.toBeNull();
 return {x:box!.x+box!.width/2,y:box!.y+box!.height/2};
}
async function send(page:Page,phase:string,at:XY,id=81){
 await page.evaluate(({phase,at,id})=>{
  const target=phase==='pointerdown'?document.elementFromPoint(at.x,at.y):document.querySelector('#app');
  target!.dispatchEvent(new PointerEvent(phase,{bubbles:true,cancelable:true,pointerId:id,
   pointerType:'touch',isPrimary:id===81,clientX:at.x,clientY:at.y,button:0,
   buttons:phase==='pointerup'||phase==='pointercancel'?0:1}));
 },{phase,at,id});
}
for(const reason of ['pointercancel','Escape','second-contact'])test(`${reason} before pin-drag threshold cannot contaminate the next component drag`,async({page})=>{
 await page.goto('/');const before=await saved(page),pin=await center(page,'.item[data-part="b1"] .pin[data-pin="negative"]');
 await send(page,'pointerdown',pin);
 if(reason==='Escape')await page.keyboard.press('Escape');
 else if(reason==='second-contact')await send(page,'pointerdown',{x:pin.x,y:pin.y+55},82);
 else await send(page,'pointercancel',pin);
 await send(page,'pointerup',pin);
 if(reason==='second-contact')await send(page,'pointerup',pin,82);
 expect(await saved(page)).toEqual(before);
 const start=await center(page,'.item[data-part="r1"]'),end={x:start.x+55,y:start.y+22};
 // Reuse the pointer ID, as real browsers are allowed to do after a contact ends.
 await send(page,'pointerdown',start);await send(page,'pointermove',end);await send(page,'pointerup',end);
 const after=await saved(page);
 expect(after.parts.find((p:{id:string})=>p.id==='r1').x).not.toBe(before.parts.find((p:{id:string})=>p.id==='r1').x);
 expect(after.wires).toEqual(before.wires);
 await page.keyboard.press('ControlOrMeta+z');expect(await saved(page)).toEqual(before);
});
