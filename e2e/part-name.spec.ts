import {test,expect,type Page} from '@playwright/test';
const project=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));

test('component name is editable from both right Inspector and floating quick properties with one undo',async({page})=>{
 await page.goto('/');
 const before=await project(page);
 await page.locator('.item[data-part="r1"]').click();
 await expect(page.locator('#part-name')).toBeVisible();
 await expect(page.locator('.quick-properties [data-quick-field="part-name"]')).toHaveValue('');
 await page.locator('.quick-properties [data-quick-field="part-name"]').fill('Limit R1');
 await page.locator('.quick-properties [data-quick-field="part-name"]').press('Tab');
 let current=await project(page);
 expect(current.parts.find((p:{id:string})=>p.id==='r1').name).toBe('Limit R1');
 expect(current.wires).toEqual(before.wires);
 await expect(page.locator('#part-name')).toHaveValue('Limit R1');
 await page.locator('[data-action="undo"]').click();
 expect((await project(page)).parts.find((p:{id:string})=>p.id==='r1').name).toBeUndefined();
 await page.locator('[data-action="redo"]').click();
 expect((await project(page)).parts.find((p:{id:string})=>p.id==='r1').name).toBe('Limit R1');
 await page.locator('.item[data-part="r1"]').click();
 await page.locator('#part-name').fill('');
 await page.locator('#part-name').press('Tab');
 expect((await project(page)).parts.find((p:{id:string})=>p.id==='r1').name).toBeUndefined();
});

test('custom display names remain escaped in editor and schematic, preserving simulator state',async({page})=>{
 await page.goto('/');
 await page.locator('[data-action="run"]').click();
 const before=await project(page);
 await page.locator('.item[data-part="l1"]').click();
 await page.locator('#part-name').fill('<img src=x onerror=alert(1)>');
 await page.locator('#part-name').press('Tab');
 await expect(page.locator('[data-action="run"]')).toContainText('停止仿真');
 await expect(page.locator('.quick-properties strong')).toContainText('<img src=x');
 await expect(page.locator('.quick-properties img')).toHaveCount(0);
 await page.locator('[data-action="schematic-open"]').click();
 await expect(page.locator('.schematic-svg')).toContainText('<img src=x onerror=alert(1)>');
 await expect(page.locator('.schematic-dialog img')).toHaveCount(0);
 const after=await project(page);
 expect(after.wires).toEqual(before.wires);
 await page.keyboard.press('Escape');
});
