import {test,expect,type Page} from '@playwright/test';

const snapshot=(page:Page)=>page.evaluate(()=>localStorage.getItem('circuits-project'));
const parsed=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
async function openBom(page:Page){
 await page.locator('[data-action="bom-open"]').click();
 await expect(page.getByRole('dialog',{name:'物料清单 · BOM'})).toBeVisible();
}

test('BOM is generated from five demo parts, including exact values and stable IDs, without editing saved circuits',async({page})=>{
 await page.goto('/');
 const before=await snapshot(page);
 await openBom(page);
 const d=page.getByRole('dialog',{name:'物料清单 · BOM'});
 await expect(d.locator('.bom-overview')).toContainText('组件');
 await expect(d.locator('.bom-table tbody tr')).toHaveCount(5);
 await expect(d.locator('.bom-table')).toContainText('330 Ω');
 await expect(d.locator('.bom-table')).toContainText('9 V');
 await expect(d.locator('.bom-table')).toContainText('l1');
 await expect(d.locator('.bom-overview')).toContainText('导线');
 await expect(page.locator('header input#name')).toHaveValue('我的第一个电路');
 expect(await snapshot(page)).toBe(before);
 await page.locator('.bom-dialog [data-action="bom-close"]').first().click();
 await expect(page.locator('.bom-dialog')).toHaveCount(0);
 await expect(page.locator('[data-action="bom-open"]')).toBeFocused();
});

test('BOM dialog traps focus, honors Escape and cannot invoke delete/undo hotkeys on the canvas',async({page})=>{
 await page.goto('/');
 const before=await snapshot(page);
 await openBom(page);
 const first=page.locator('.bom-dialog [data-action="bom-close"]').first();
 const last=page.locator('.bom-dialog [data-action="bom-export"]');
 await expect(first).toBeFocused();
 await page.keyboard.press('Shift+Tab');
 await expect(last).toBeFocused();
 await page.keyboard.press('Tab');
 await expect(first).toBeFocused();
 await page.keyboard.press('Delete');
 await page.keyboard.press('ControlOrMeta+z');
 expect(await snapshot(page)).toBe(before);
 await page.keyboard.press('Escape');
 await expect(page.locator('.bom-dialog')).toHaveCount(0);
 await expect(page.locator('[data-action="bom-open"]')).toBeFocused();
 expect(await snapshot(page)).toBe(before);
});

test('empty new circuit renders BOM empty state and disabled source imports remain unaffected',async({page})=>{
 await page.goto('/');
 await page.locator('[data-action="new"]').click();
 const before=await snapshot(page);
 const doc=await parsed(page);
 expect(doc.parts).toHaveLength(0);
 await openBom(page);
 const d=page.locator('.bom-dialog');
 await expect(d.locator('.bom-empty')).toContainText('当前电路没有元件');
 await expect(d.locator('.bom-overview')).toContainText('组件');
 await expect(d.locator('.bom-table tbody tr')).toHaveCount(1);
 expect(await snapshot(page)).toBe(before);
 await page.locator('.bom-shade').click({position:{x:8,y:8}});
 await expect(d).toHaveCount(0);
});

test('BOM groups resistor values and LED color variants from imported saved schema',async({page})=>{
 await page.goto('/');
 const doc=await parsed(page);
 doc.wires=[];
 doc.parts=[
  {id:'r1',kind:'resistor',x:20,y:25,rotation:0,value:220},
  {id:'r2',kind:'resistor',x:45,y:35,rotation:0,value:220},
  {id:'r3',kind:'resistor',x:70,y:45,rotation:0,value:1000},
  {id:'l1',kind:'led',x:90,y:45,rotation:0},
  {id:'l2',kind:'led',x:110,y:45,rotation:0,ledColor:'red'},
  {id:'l3',kind:'led',x:130,y:45,rotation:0,ledColor:'green'}
 ];
 await page.locator('#file').setInputFiles({name:'BOM-variants.json',mimeType:'application/json',
  buffer:Buffer.from(JSON.stringify(doc))});
 const before=await snapshot(page);
 await openBom(page);
 const rows=page.locator('.bom-table tbody tr');
 await expect(rows).toHaveCount(4);
 await expect(rows.filter({hasText:'220 Ω'}).locator('.bom-quantity')).toHaveText('2');
 await expect(rows.filter({hasText:'1000 Ω'}).locator('.bom-quantity')).toHaveText('1');
 await expect(rows.filter({hasText:'红色'}).locator('.bom-quantity')).toHaveText('2');
 await expect(rows.filter({hasText:'绿色'}).locator('.bom-quantity')).toHaveText('1');
 expect(await snapshot(page)).toBe(before);
});

test('BOM opens while simulation runs, can export a CSV and return without stopping or modifying the model',async({page})=>{
 await page.goto('/');
 await page.locator('[data-action="run"]').click();
 await expect(page.locator('[data-action="run"]')).toContainText('停止仿真');
 const before=await snapshot(page);
 await openBom(page);
 const downloadPromise=page.waitForEvent('download');
 await page.locator('.bom-dialog [data-action="bom-export"]').click();
 const download=await downloadPromise;
 expect(download.suggestedFilename()).toBe('circuits-bom.csv');
 await expect(page.locator('.bom-dialog')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.locator('[data-action="run"]')).toContainText('停止仿真');
 expect(await snapshot(page)).toBe(before);
});
