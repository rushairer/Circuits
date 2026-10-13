import {test,expect,type Page} from '@playwright/test';

const snapshot=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));

test('selected resistor uses floating property inspector while Basic component palette stays available',async({page})=>{
 await page.goto('/');
 const original=await snapshot(page);
 await page.locator('.item[data-part="r1"]').click();
 await expect(page.locator('.inspector')).toHaveClass(/inspector-floating/);
 await expect(page.locator('.inspector h2')).toContainText('属性 · 电阻');
 await expect(page.locator('.component-sidebar')).toBeVisible();
 await expect(page.locator('.component-sidebar #component-category')).toHaveValue('basic');
 await expect(page.locator('.component-sidebar .part[data-kind]')).toHaveCount(9);
 await expect(page.locator('.component-sidebar .part[data-kind="led"]')).toBeVisible();
 const floating=await page.locator('.inspector').boundingBox();
 const sidebar=await page.locator('.component-sidebar').boundingBox();
 expect(floating).not.toBeNull();expect(sidebar).not.toBeNull();
 expect(floating!.x+floating!.width).toBeLessThanOrEqual(sidebar!.x+1);
 expect(await snapshot(page)).toEqual(original);
});

test('palette category remains operable while selected inspector stays open, including selected-value edit',async({page})=>{
 await page.goto('/');
 const before=await snapshot(page);
 await page.locator('.item[data-part="r1"]').click();
 await page.locator('.component-sidebar #component-category').selectOption('all');
 await expect(page.locator('.component-sidebar .part[data-kind]')).toHaveCount(13);
 await expect(page.locator('.inspector h2')).toContainText('属性 · 电阻');
 await page.locator('.inspector #value').fill('470');
 await page.locator('.inspector #value').press('Tab');
 expect((await snapshot(page)).parts.find((p:{id:string})=>p.id==='r1').value).toBe(470);
 expect((await snapshot(page)).wires).toEqual(before.wires);
 await page.locator('[data-action="undo"]').click();
 expect((await snapshot(page)).parts.find((p:{id:string})=>p.id==='r1').value).toBe(330);
 await expect(page.locator('.component-sidebar #component-category')).toHaveValue('all');
 await page.locator('.inspector [data-action="parts"]').click();
 await expect(page.locator('.inspector')).not.toHaveClass(/inspector-floating/);
 await expect(page.locator('.component-sidebar')).toHaveCount(0);
 await expect(page.locator('.inspector #component-category')).toHaveValue('all');
});

test('component library remains draggable/clickable during inspector edits and new part undo is atomic',async({page})=>{
 await page.goto('/');
 const before=await snapshot(page);
 await page.locator('.item[data-part="r1"]').click();
 await expect(page.locator('.component-sidebar')).toBeVisible();
 await page.locator('.component-sidebar .part[data-kind="led"]').click();
 await expect(page.locator('.item[data-part]')).toHaveCount(before.parts.length+1);
 const after=await snapshot(page);
 expect(after.parts).toHaveLength(before.parts.length+1);
 expect(after.wires).toEqual(before.wires);
 await page.locator('[data-action="undo"]').click();
 expect((await snapshot(page)).parts).toEqual(before.parts);
 await expect(page.locator('.component-sidebar')).toBeVisible();
});

test('floating inspector does not block real LED pin wiring or the read-only BOM dialog',async({page})=>{
 await page.goto('/');
 const before=await snapshot(page);
 await page.locator('.item[data-part="r1"]').click();
 await expect(page.locator('.inspector-floating')).toBeVisible();
 await page.locator('.item[data-part="l1"] .pin[data-pin="cathode"]').click();
 await expect(page.locator('#wire-preview')).toHaveCount(1);
 await page.keyboard.press('Escape');
 await page.locator('.item[data-part="r1"]').click();
 await page.locator('[data-action="bom-open"]').click();
 await expect(page.locator('.bom-dialog')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.locator('.inspector-floating')).toBeVisible();
 expect(await snapshot(page)).toEqual(before);
});

test('property card and component rail remain side by side at responsive editor widths',async({page})=>{
 await page.setViewportSize({width:760,height:790});
 await page.goto('/');
 await page.locator('.item[data-part="r1"]').click();
 const property=await page.locator('.inspector-floating').boundingBox();
 const catalog=await page.locator('.component-sidebar').boundingBox();
 expect(property).not.toBeNull();expect(catalog).not.toBeNull();
 expect(property!.x).toBeGreaterThanOrEqual(0);
 expect(property!.x+property!.width).toBeLessThanOrEqual(catalog!.x+1);
 await expect(page.locator('.component-sidebar #search')).toBeVisible();
 await expect(page.locator('.inspector [data-action="delete"]')).toBeVisible();
});
