import { test, expect, type Page } from '@playwright/test';

const saved=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
async function worldToClient(page:Page,x:number,y:number){
 return page.evaluate(({x,y})=>{
   const scene=document.querySelector<SVGGElement>('#scene')!;
   const svg=document.querySelector<SVGSVGElement>('#board')!;
   const p=svg.createSVGPoint();p.x=x;p.y=y;
   const at=p.matrixTransform(scene.getScreenCTM()!);
   return {x:at.x,y:at.y};
 },{x,y});
}
async function crossing(page:Page,overlap=false){
 await page.goto('/');
 const project=await saved(page);
 project.wires=[
  {id:'w1',from:{componentId:'b1',pinId:'positive'},to:{componentId:'l1',pinId:'anode'},color:'#35b65d',
   bends:[{x:290,y:315},{x:600,y:315}]},
  {id:'w2',from:{componentId:'a1',pinId:'d13'},to:{componentId:'r1',pinId:'a'},color:'#e45454',
   bends:overlap?[{x:290,y:315},{x:600,y:315}]:[{x:370,y:380},{x:370,y:275}]}
 ];
 await page.locator('#file').setInputFiles({name:'wire-pick.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 await expect(page.locator('.wire')).toHaveCount(2);
 return project;
}

for(const overlap of [false,true]){
 test((overlap?'overlapping':'crossing')+' wires cycle by true route, independent of SVG painter order',async({page})=>{
   const original=await crossing(page,overlap);
   const at=await worldToClient(page,overlap?485:370,315);
   await page.mouse.click(at.x,at.y);
   await expect(page.locator('.endpoint-handle[data-wire="w1"]')).toHaveCount(2);
   await page.mouse.click(at.x,at.y);
   await expect(page.locator('.endpoint-handle[data-wire="w2"]')).toHaveCount(2);
   await page.mouse.click(at.x,at.y);
   await expect(page.locator('.endpoint-handle[data-wire="w1"]')).toHaveCount(2);
   expect((await saved(page)).wires).toEqual(original.wires);
   await expect(page.locator('.topbar [data-action="undo"]')).not.toBeDisabled();
 });
}

test('candidate distance and previously selected conductor control actual segment drag',async({page})=>{
 await crossing(page);
 const cross=await worldToClient(page,370,315);
 await page.mouse.click(cross.x,cross.y);
 await page.mouse.click(cross.x,cross.y);
 await expect(page.locator('.endpoint-handle[data-wire="w2"]')).toHaveCount(2);
 const before=(await saved(page)).wires;
 await page.mouse.move(cross.x,cross.y);
 await page.mouse.down();
 await page.mouse.move(cross.x+37,cross.y+21,{steps:9});
 await page.mouse.up();
 const after=(await saved(page)).wires;
 expect(after[0]).toEqual(before[0]);
 expect(after[1].from).toEqual(before[1].from);
 expect(after[1].to).toEqual(before[1].to);
 expect(after[1].bends).not.toEqual(before[1].bends);
 await page.keyboard.press('ControlOrMeta+z');
 expect((await saved(page)).wires).toEqual(before);
});

test('9 CSS-pixel nearest-line selection survives zoom and blank canvas does not choose a wire',async({page})=>{
 await crossing(page);
 await page.locator('[data-action="zoom-out"]').click();
 const near=await worldToClient(page,485,315);
 await page.mouse.click(near.x,near.y+6);
 await expect(page.locator('.endpoint-handle[data-wire="w1"]')).toHaveCount(2);
 const empty=await worldToClient(page,485,350);
 await page.mouse.click(empty.x,empty.y);
 await expect(page.locator('.endpoint-handle')).toHaveCount(0);
});
