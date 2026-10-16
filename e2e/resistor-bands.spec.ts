import {test,expect,type Page} from '@playwright/test';
const part=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!).parts.find((x:{id:string})=>x.id==='r1'));
test('resistor body bands reflect actual SI resistance edits and undo in workbench',async({page})=>{
 await page.goto('/');
 const stripes=page.locator('.item[data-part="r1"] .resistor-band');
 await expect(stripes).toHaveCount(4);
 await expect(stripes.nth(0)).toHaveAttribute('data-band-color','orange');
 await expect(stripes.nth(1)).toHaveAttribute('data-band-color','orange');
 await expect(stripes.nth(2)).toHaveAttribute('data-band-color','brown');
 await expect(stripes.nth(3)).toHaveAttribute('data-band-color','gold');
 await page.locator('.item[data-part="r1"]').click();
 await page.locator('#value-unit').selectOption('k');
 expect((await part(page)).value).toBe(330000);
 await expect(stripes.nth(2)).toHaveAttribute('data-band-color','yellow');
 await page.locator('[data-action="undo"]').click();
 await expect(stripes.nth(2)).toHaveAttribute('data-band-color','brown');
});
test('non-standard resistance keeps value text and avoids misleading 4/5 bands',async({page})=>{
 await page.goto('/');
 await page.locator('.item[data-part="r1"]').click();
 await page.locator('#value').fill('123.456');
 await page.locator('#value').press('Tab');
 await expect(page.locator('.item[data-part="r1"] .resistor-body')).toHaveAttribute('data-resistor-bands','0');
 await expect(page.locator('.item[data-part="r1"] .resistor-band')).toHaveCount(0);
 await expect(page.locator('.item[data-part="r1"] .resistor-body')).toContainText('123.456Ω');
 expect((await part(page)).value).toBe(123.456);
});
