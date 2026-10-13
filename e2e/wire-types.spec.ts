import {test,expect,type Page} from '@playwright/test';
const saved=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
const pin=(id:string,pinId:string)=>'.item[data-part="'+id+'"] .pin[data-pin="'+pinId+'"]';

test('hookup wire type visibly adds two terminal sleeves and changes just one undoable property',async({page})=>{
 await page.goto('/');
 const baseline=await saved(page);
 const route=await page.locator('.wire[data-wire="w1"]').getAttribute('d');
 await page.locator('.wire[data-wire="w1"]').click();
 await page.locator('#wire-type').selectOption('hookup');
 const current=await saved(page);
 const currentWire=current.wires.find((w:{id:string})=>w.id==='w1');
 expect(currentWire.type).toBe('hookup');
 expect(currentWire.from).toEqual(baseline.wires[0].from);
 expect(currentWire.to).toEqual(baseline.wires[0].to);
 expect(currentWire.color).toEqual(baseline.wires[0].color);
 await expect(page.locator('.wire[data-wire="w1"]')).toHaveAttribute('d',route!);
 await expect(page.locator('.wire[data-wire="w1"]')).toHaveAttribute('data-wire-type','hookup');
 await expect(page.locator('.wire-connectors[data-wire="w1"] .wire-plug')).toHaveCount(2);
 await page.locator('[data-action="undo"]').click();
 expect((await saved(page)).wires).toEqual(baseline.wires);
 await expect(page.locator('.wire-connectors[data-wire="w1"]')).toHaveCount(0);
 await page.locator('[data-action="redo"]').click();
 expect((await saved(page)).wires[0].type).toBe('hookup');
});

test('Shift+3 selects alligator wire with two visible jaws and immutable electrical endpoints',async({page})=>{
 await page.goto('/');
 const baseline=await saved(page);
 await page.locator('.wire[data-wire="w1"]').click();
 await page.keyboard.press('Shift+3');
 const current=await saved(page);
 expect(current.wires[0].type).toBe('alligator');
 await expect(page.locator('#wire-type')).toHaveValue('alligator');
 await expect(page.locator('.wire-connectors[data-wire="w1"] .wire-clip-jaws')).toHaveCount(2);
 expect(current.wires[0].from).toEqual(baseline.wires[0].from);
 expect(current.wires[0].to).toEqual(baseline.wires[0].to);
 await page.keyboard.press('Shift+1');
 expect((await saved(page)).wires[0].type).toBe('normal');
 await expect(page.locator('.wire-connectors[data-wire="w1"]')).toHaveCount(0);
});

test('automatic resolves battery terminals to visual clips and ordinary terminals to normal',async({page})=>{
 await page.goto('/');
 await page.locator('.wire[data-wire="w1"]').click();
 await page.locator('#wire-type').selectOption('automatic');
 await expect(page.locator('.wire-connectors[data-wire="w1"]')).toHaveAttribute('data-effective-wire-type','alligator');
 const before=await saved(page);
 await page.locator('.wire[data-wire="w2"]').click();
 await page.locator('#wire-type').selectOption('automatic');
 await expect(page.locator('.wire-connectors[data-wire="w2"]')).toHaveCount(0);
 const doc=await saved(page);
 expect(doc.wires.find((w:{id:string})=>w.id==='w2').type).toBe('automatic');
 expect(doc.wires.find((w:{id:string})=>w.id==='w1').type).toBe('automatic');
 expect(doc.wires.map((w:{from:unknown;to:unknown})=>[w.from,w.to]))
   .toEqual(before.wires.map((w:{from:unknown;to:unknown})=>[w.from,w.to]));
});

test('chosen wire type is applied to newly authored connections, not just old strokes',async({page})=>{
 await page.goto('/');
 const baseline=await saved(page);
 await page.locator('#wire-type').selectOption('hookup');
 await expect(page.locator('#wire-type')).toHaveValue('hookup');
 await page.locator(pin('b1','negative')).click();
 await page.locator(pin('r1','b')).click();
 const changed=await saved(page);
 expect(changed.wires).toHaveLength(baseline.wires.length+1);
 const added=changed.wires.at(-1);
 expect(added.type).toBe('hookup');
 expect(added.from).toEqual({componentId:'b1',pinId:'negative'});
 expect(added.to).toEqual({componentId:'r1',pinId:'b'});
 await expect(page.locator('.wire-connectors[data-wire="'+added.id+'"] .wire-plug')).toHaveCount(2);
 await page.locator('[data-action="undo"]').click();
 expect((await saved(page)).wires).toEqual(baseline.wires);
});

test('Shift selection recolors connector types in one operation without changing nets',async({page})=>{
 await page.goto('/');
 const baseline=await saved(page);
 await page.locator('.wire[data-wire="w1"]').click();
 await page.keyboard.down('Shift');
 await page.locator('.wire[data-wire="w2"]').click();
 await page.keyboard.up('Shift');
 await expect(page.locator('.inspector')).toContainText('已选中 2 根导线');
 await page.locator('#wire-type').selectOption('alligator');
 const changed=await saved(page);
 expect(changed.wires.slice(0,2).map((w:{type:string})=>w.type)).toEqual(['alligator','alligator']);
 expect(changed.wires[2]).toEqual(baseline.wires[2]);
 await page.locator('[data-action="undo"]').click();
 expect((await saved(page)).wires).toEqual(baseline.wires);
});

test('imported legacy wires remain Normal; invalid type is rejected and shortcut does not hijack inputs',async({page})=>{
 await page.goto('/');
 const baseline=await saved(page);
 expect(baseline.wires.every((w:{type?:string})=>w.type===undefined)).toBe(true);
 await expect(page.locator('.wire-connectors')).toHaveCount(0);
 await page.locator('#name').focus();
 await page.keyboard.press('Shift+3');
 await expect(page.locator('#wire-type')).toHaveValue('normal');
 expect((await saved(page)).wires).toEqual(baseline.wires);
 const invalid=structuredClone(baseline);
 invalid.wires[0].type='bad-type';
 page.once('dialog',d=>d.accept());
 await page.locator('#file').setInputFiles({
   name:'invalid-type.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))
 });
 expect((await saved(page)).wires).toEqual(baseline.wires);
});
