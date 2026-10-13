import { test, expect, type Page } from '@playwright/test';

type XY={x:number;y:number};
const saved=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
async function clientFor(page:Page,x:number,y:number):Promise<XY>{
 return page.evaluate(({x,y})=>{
   const scene=document.querySelector<SVGGElement>('#scene')!;
   const board=document.querySelector<SVGSVGElement>('#board')!;
   const point=board.createSVGPoint();point.x=x;point.y=y;
   const screen=point.matrixTransform(scene.getScreenCTM()!);
   return {x:screen.x,y:screen.y};
 },{x,y});
}
async function startBend(page:Page){
 await page.goto('/');
 await page.locator('.wire[data-wire="w1"]').click();
 await page.locator('[data-action="wire-add-bend"]').click();
 const savedProject=await saved(page);
 const w=savedProject.wires.find((wire:{id:string})=>wire.id==='w1');
 const handle=page.locator('.bend-handle[data-wire="w1"]');
 const box=await handle.boundingBox();expect(box).not.toBeNull();
 return {savedProject,w,from:savedProject.parts.find((p:{id:string})=>p.id==='b1'),handle:{x:box!.x+box!.width/2,y:box!.y+box!.height/2}};
}

test('dragging waypoint near a physical terminal snaps with visible guides; cancel rolls back',async({page})=>{
 const {savedProject,handle}=await startBend(page);
 const world=await page.evaluate(()=>{
   const pin=document.querySelector<SVGCircleElement>('.item[data-part="b1"] .pin[data-pin="positive"]')!;
   const matrix=pin.getScreenCTM()!,x=Number(pin.getAttribute('cx')),y=Number(pin.getAttribute('cy'));
   const point=document.querySelector<SVGSVGElement>('#board')!.createSVGPoint();point.x=x;point.y=y;
   const client=point.matrixTransform(matrix);
   return {x:client.x,y:client.y};
 });
 await page.mouse.move(handle.x,handle.y);
 await page.mouse.down();
 await page.mouse.move(world.x+3,world.y+3,{steps:10});
 await expect(page.locator('#bend-snap-guides .bend-snap-guide')).toHaveCount(2);
 const during=await saved(page);
 expect(during.wires).toEqual(savedProject.wires); // Preview remains uncommitted.
 await page.keyboard.press('Escape');
 await expect(page.locator('#bend-snap-guides')).toHaveCount(0);
 expect((await saved(page)).wires).toEqual(savedProject.wires);
});

test('waypoint snapping is not an electrical junction and uses one undo for drag',async({page})=>{
 const {savedProject,handle}=await startBend(page);
 const endpoint=savedProject.parts.find((p:{id:string})=>p.id==='b1');
 const snapTo=await clientFor(page,endpoint.x+90,endpoint.y+38);
 await page.mouse.move(handle.x,handle.y);
 await page.mouse.down();
 await page.mouse.move(snapTo.x+2,snapTo.y+2,{steps:8});
 await page.mouse.up();
 const moved=await saved(page);
 const beforeWire=savedProject.wires.find((w:{id:string})=>w.id==='w1');
 const afterWire=moved.wires.find((w:{id:string})=>w.id==='w1');
 expect(afterWire.bends[0]).toEqual({x:endpoint.x+90,y:endpoint.y+38});
 expect(afterWire.from).toEqual(beforeWire.from);
 expect(afterWire.to).toEqual(beforeWire.to);
 expect(moved.wires).toHaveLength(savedProject.wires.length);
 await page.keyboard.press('ControlOrMeta+z');
 expect((await saved(page)).wires).toEqual(savedProject.wires);
});
