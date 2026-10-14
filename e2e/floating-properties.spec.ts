import {test,expect,type Page} from '@playwright/test';
const snapshot=(page:Page)=>page.evaluate(()=>localStorage.getItem('circuits-project'));
const part=(page:Page,id:string)=>page.evaluate(id=>{
 const p=JSON.parse(localStorage.getItem('circuits-project')!);
 return p.parts.find((item:{id:string})=>item.id===id);
},id);

test('single selected component shows contextual properties without resizing SVG canvas',async({page})=>{
 await page.goto('/');
 const before=await snapshot(page);
 const canvas=page.locator('.canvas');
 const width=await canvas.evaluate(el=>el.getBoundingClientRect().width);
 await page.locator('.item[data-part="r1"]').click();
 const quick=page.locator('.quick-properties[data-quick-for="r1"]');
 await expect(quick).toBeVisible();
 await expect(page.locator('.inspector #value')).toHaveValue('330');
 await expect(quick.locator('[data-quick-field="value"]')).toHaveValue('330');
 expect(await canvas.evaluate(el=>el.getBoundingClientRect().width)).toBe(width);
 expect(await snapshot(page)).toBe(before);
 const [box,stage]=await Promise.all([quick.boundingBox(),canvas.boundingBox()]);
 expect(box).not.toBeNull();expect(stage).not.toBeNull();
 expect(box!.x).toBeGreaterThanOrEqual(stage!.x);
 expect(box!.x+box!.width).toBeLessThanOrEqual(stage!.x+stage!.width+1);
 expect(box!.y).toBeGreaterThanOrEqual(stage!.y);
 expect(box!.y+box!.height).toBeLessThanOrEqual(stage!.y+stage!.height+1);
});

test('quick property editing reuses canonical validation and one undo entry',async({page})=>{
 await page.goto('/');
 await page.locator('.item[data-part="r1"]').click();
 await page.locator('.quick-properties [data-quick-field="value"]').fill('470');
 await page.locator('.quick-properties [data-quick-field="value"]').press('Tab');
 await expect(page.locator('.inspector #value')).toHaveValue('470');
 expect((await part(page,'r1')).value).toBe(470);
 await page.locator('[data-action="undo"]').click();
 expect((await part(page,'r1')).value).toBe(330);
 await page.locator('[data-action="redo"]').click();
 expect((await part(page,'r1')).value).toBe(470);
});

test('LED floating selector, rotate, and close are wired to real project state',async({page})=>{
 await page.goto('/');
 await page.locator('.item[data-part="l1"]').click();
 await expect(page.locator('.quick-properties [data-quick-field="led-color"]')).toHaveValue('red');
 await page.locator('.quick-properties [data-quick-field="led-color"]').selectOption('green');
 expect((await part(page,'l1')).ledColor).toBe('green');
 await expect(page.locator('.inspector #led-color')).toHaveValue('green');
 await page.locator('.quick-properties [data-action="rotate"]').click();
 expect((await part(page,'l1')).rotation).toBe(90);
 await page.locator('.quick-heading [data-action="parts"]').click();
 await expect(page.locator('.quick-properties')).toHaveCount(0);
 await expect(page.locator('#component-category')).toBeVisible();
});

test('multi-selection and schematic modal suppress quick card; tablet stays bounded',async({page})=>{
 await page.setViewportSize({width:1024,height:768});
 await page.goto('/');
 await page.locator('.item[data-part="r1"]').click();
 await expect(page.locator('.quick-properties')).toBeVisible();
 await page.locator('.item[data-part="l1"]').click({modifiers:['Shift']});
 await expect(page.locator('.quick-properties')).toHaveCount(0);
 await page.locator('.item[data-part="r1"]').click();
 await expect(page.locator('.quick-properties')).toBeVisible();
 await page.locator('[data-action="schematic-open"]').click();
 await expect(page.locator('.quick-properties')).toHaveCount(0);
 await page.keyboard.press('Escape');
 await expect(page.locator('.quick-properties')).toBeVisible();
 const [card,canvas]=await Promise.all([page.locator('.quick-properties').boundingBox(),page.locator('.canvas').boundingBox()]);
 expect(card).not.toBeNull();expect(canvas).not.toBeNull();
 expect(card!.x).toBeGreaterThanOrEqual(canvas!.x);
 expect(card!.x+card!.width).toBeLessThanOrEqual(canvas!.x+canvas!.width+1);
});
