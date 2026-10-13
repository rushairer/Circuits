import {test,expect,type Page} from '@playwright/test';

const pin=(part:string,name:string)=>'.item[data-part="'+part+'"] .pin[data-pin="'+name+'"]';
const saved=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
async function at(page:Page,selector:string){
 const b=await page.locator(selector).boundingBox();
 expect(b,selector+' should be rendered').not.toBeNull();
 return {x:b!.x+b!.width/2,y:b!.y+b!.height/2};
}
async function world(page:Page,x:number,y:number){
 return page.evaluate(({x,y})=>{
   const svg=document.querySelector<SVGSVGElement>('#board')!;
   const scene=document.querySelector<SVGGElement>('#scene')!;
   const pt=svg.createSVGPoint();pt.x=x;pt.y=y;
   const screen=pt.matrixTransform(scene.getScreenCTM()!);
   return {x:screen.x,y:screen.y};
 },{x,y});
}
async function boot(page:Page){
 await page.goto('/');
 const p=await saved(page);p.wires=[];
 await page.locator('#file').setInputFiles({
   name:'manual-routing.json',mimeType:'application/json',
   buffer:Buffer.from(JSON.stringify(p))
 });
 await expect(page.locator('.wire')).toHaveCount(0);
 return await saved(page);
}
test('dragging from a real pin to blank canvas leaves a route for manual bends and final connection',async({page})=>{
 const before=await boot(page);
 const start=await at(page,pin('b1','positive'));
 const release=await world(page,340,126);
 await page.mouse.move(start.x,start.y);
 await page.mouse.down();
 await page.mouse.move(release.x,release.y,{steps:8});
 await page.mouse.up();
 await expect(page.locator('#wire-preview-path')).toHaveCount(1);
 await expect(page.locator('[data-action="cancel-wire"]')).toBeVisible();
 expect((await saved(page)).wires).toEqual(before.wires);
 const elbow=await world(page,427,190); // Avoid the 425 half-grid tie across browser coordinate transforms.
 await page.mouse.click(elbow.x,elbow.y);
 await expect(page.locator('.wire-preview-bend')).toHaveCount(1);
 expect((await saved(page)).wires).toHaveLength(0);
 await page.locator(pin('r1','a')).click();
 await expect(page.locator('.wire')).toHaveCount(1);
 await expect(page.locator('#wire-preview')).toHaveCount(0);
 const wire=(await saved(page)).wires[0];
 expect(wire.from).toEqual({componentId:'b1',pinId:'positive'});
 expect(wire.to).toEqual({componentId:'r1',pinId:'a'});
 expect(wire.bends).toEqual([{x:430,y:190}]);
 await page.locator('[data-action="undo"]').click();
 expect((await saved(page)).wires).toEqual(before.wires);
 await page.locator('[data-action="redo"]').click();
 expect((await saved(page)).wires).toHaveLength(1);
});

test('cancelling a pending route clears only transient state, with no accidental persisted wire',async({page})=>{
 const before=await boot(page);
 const start=await at(page,pin('b1','positive'));
 const blank=await world(page,340,126);
 await page.mouse.move(start.x,start.y);
 await page.mouse.down();
 await page.mouse.move(blank.x,blank.y,{steps:9});
 await page.mouse.up();
 await expect(page.locator('#wire-preview')).toHaveCount(1);
 await page.keyboard.press('Escape');
 await expect(page.locator('#wire-preview')).toHaveCount(0);
 expect((await saved(page)).wires).toEqual(before.wires);
 await page.locator(pin('r1','a')).click();
 await expect(page.locator('#wire-preview')).toHaveCount(1);
 await page.keyboard.press('Escape');
 expect((await saved(page)).wires).toEqual(before.wires);
});

test('dropping the active wire over the toolbar still cancels instead of connecting through the UI',async({page})=>{
 const before=await boot(page),start=await at(page,pin('b1','positive'));
 const toolbar=await at(page,'.topbar [data-action="code"]');
 await page.mouse.move(start.x,start.y);
 await page.mouse.down();
 await page.mouse.move(toolbar.x,toolbar.y,{steps:10});
 await page.mouse.up();
 expect((await saved(page)).wires).toEqual(before.wires);
 await expect(page.locator('#wire-preview')).toHaveCount(0);
});

test('Command/Ctrl plus and minus zoom around canvas center without mutating the circuit',async({page})=>{
 const before=await boot(page);
 const transform=()=>page.locator('#scene').getAttribute('transform');
 const original=await transform();
 await page.locator('.canvas').click({position:{x:100,y:85}});
 await page.keyboard.press('ControlOrMeta+Equal');
 const enlarged=await transform();
 expect(enlarged).not.toEqual(original);
 expect(enlarged).toContain('scale(1.15)');
 await page.keyboard.press('ControlOrMeta+Minus');
 const reduced=await transform();
 expect(reduced).not.toEqual(enlarged);
 await page.locator('#name').focus();
 await page.keyboard.press('ControlOrMeta+Equal');
 expect(await transform()).toEqual(reduced);
 expect((await saved(page)).wires).toEqual(before.wires);
});

test('keyboard zoom keeps the in-progress click-route active and Escape discards it',async({page})=>{
 const before=await boot(page);
 await page.locator(pin('b1','positive')).click();
 await expect(page.locator('#wire-preview-path')).toHaveCount(1);
 await page.keyboard.press('ControlOrMeta+Equal');
 await expect(page.locator('#wire-preview-path')).toHaveCount(1);
 await page.keyboard.press('Escape');
 await expect(page.locator('#wire-preview')).toHaveCount(0);
 expect((await saved(page)).wires).toEqual(before.wires);
});
