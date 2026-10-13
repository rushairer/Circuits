import {test,expect,type Page} from '@playwright/test';

const wireColor='#3b86d1';
const saved=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
async function world(page:Page,x:number,y:number){
 return page.evaluate(({x,y})=>{
  const board=document.querySelector<SVGSVGElement>('#board')!;
  const scene=document.querySelector<SVGGElement>('#scene')!;
  const point=board.createSVGPoint();point.x=x;point.y=y;
  const screen=point.matrixTransform(scene.getScreenCTM()!);
  return {x:screen.x,y:screen.y};
 },{x,y});
}
async function shiftClick(page:Page,position:{x:number;y:number}){
 await page.keyboard.down('Shift');
 try{await page.mouse.click(position.x,position.y);}
 finally{await page.keyboard.up('Shift');}
}
async function boot(page:Page){
 await page.goto('/');
 const p=await saved(page);
 p.wires=[
  {id:'w1',from:{componentId:'b1',pinId:'positive'},to:{componentId:'l1',pinId:'anode'},
   bends:[{x:280,y:320},{x:610,y:320}],color:'#35b65d'},
  {id:'w2',from:{componentId:'a1',pinId:'d13'},to:{componentId:'r1',pinId:'a'},
   bends:[{x:370,y:390},{x:370,y:270}],color:'#de4747'}
 ];
 await page.locator('#file').setInputFiles({name:'wire-batch.json',mimeType:'application/json',
  buffer:Buffer.from(JSON.stringify(p))});
 await expect(page.locator('.wire')).toHaveCount(2);
 return await saved(page);
}
async function selectTwo(page:Page){
 const a=await world(page,485,320),b=await world(page,370,290);
 await page.mouse.click(a.x,a.y);
 await expect(page.locator('.endpoint-handle[data-wire="w1"]')).toHaveCount(2);
 await shiftClick(page,b);
 await expect(page.locator('.inspector')).toContainText('已选中 2 根导线');
 await expect(page.locator('.wire[data-wire="w1"]')).toHaveAttribute('stroke-width','8');
 await expect(page.locator('.wire[data-wire="w2"]')).toHaveAttribute('stroke-width','8');
}
test('Shift-click selects multiple real wire strokes and the palette recolors them in one undo',async({page})=>{
 const before=await boot(page);
 await selectTwo(page);
 await expect(page.locator('#wire-palette')).toBeVisible();
 await page.locator('#wire-palette').selectOption(wireColor);
 const after=await saved(page);
 expect(after.wires.map((w:{color:string})=>w.color)).toEqual([wireColor,wireColor]);
 for(let i=0;i<before.wires.length;i++){
  const a=after.wires[i],b=before.wires[i];
  expect(a.id).toBe(b.id);
  expect(a.from).toEqual(b.from);
  expect(a.to).toEqual(b.to);
  expect(a.bends).toEqual(b.bends);
 }
 await page.locator('[data-action="undo"]').click();
 expect((await saved(page)).wires).toEqual(before.wires);
 await page.locator('[data-action="redo"]').click();
 expect((await saved(page)).wires.map((w:{color:string})=>w.color)).toEqual([wireColor,wireColor]);
});
test('batch wire deletion is atomic, undo restores every wire and its terminal identity',async({page})=>{
 const before=await boot(page);
 await selectTwo(page);
 await page.locator('.inspector [data-action="delete"]').click();
 await expect(page.locator('.wire')).toHaveCount(0);
 expect((await saved(page)).wires).toEqual([]);
 await page.locator('[data-action="undo"]').click();
 expect((await saved(page)).wires).toEqual(before.wires);
});
test('Shift-click toggles an already selected wire off instead of turning into a segment drag',async({page})=>{
 await boot(page);
 await selectTwo(page);
 const a=await world(page,485,320);
 await shiftClick(page,a);
 await expect(page.locator('.inspector')).toContainText('导线属性');
 await expect(page.locator('.endpoint-handle[data-wire="w2"]')).toHaveCount(2);
 await expect(page.locator('.endpoint-handle[data-wire="w1"]')).toHaveCount(0);
 await page.keyboard.press('2');
 const after=await saved(page);
 expect(after.wires[0].color).toBe('#35b65d');
 expect(after.wires[1].color).toBe('#de4747');
});
test('choosing a component after batch wires clears the wire batch without hidden color updates',async({page})=>{
 const before=await boot(page);
 await selectTwo(page);
 await page.locator('.item[data-part="r1"]').click();
 await expect(page.locator('.inspector')).toContainText('属性');
 await page.locator('#wire-palette').selectOption(wireColor);
 expect((await saved(page)).wires).toEqual(before.wires);
});
