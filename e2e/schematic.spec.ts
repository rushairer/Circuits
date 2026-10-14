import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const snapshot=(page:Page)=>page.evaluate(()=>localStorage.getItem('circuits-project'));
const project=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
async function openSchematic(page:Page){
 await page.locator('[data-action="schematic-open"]').click();
 await expect(page.getByRole('dialog',{name:'自动原理图 · Schematic'})).toBeVisible();
}

test('schematic generates actual three-net series circuit, not copied screen-space traces',async({page})=>{
 await page.goto('/');
 const before=await snapshot(page);
 await openSchematic(page);
 const dialog=page.locator('.schematic-dialog');
 const svg=dialog.locator('svg.schematic-svg');
 await expect(svg).toBeVisible();
 await expect(svg.locator('.sch-component')).toHaveCount(4);
 await expect(svg.locator('.sch-net')).toHaveCount(3);
 await expect(svg.locator('.sch-link')).toHaveCount(6);
 await expect(svg.locator('[data-schematic-part="bb1"]')).toHaveCount(0);
 await expect(svg.locator('[data-terminal="a1::d13"]')).toHaveAttribute('data-schematic-net','NC');
 await expect(svg.locator('[data-terminal="b1::positive"]')).not.toHaveAttribute('data-schematic-net','NC');
 await expect(dialog.locator('.schematic-toolbar-stats')).toContainText('未连接端子');
 await expect(dialog).toContainText('路径交叉不表示新连接');
 expect(await snapshot(page)).toBe(before);
 await dialog.locator('[data-action="schematic-close"]').first().click();
 await expect(dialog).toHaveCount(0);
 await expect(page.locator('[data-action="schematic-open"]')).toBeFocused();
});

test('Schematic focus remains in dialog, global Delete/undo commands cannot modify active circuit',async({page})=>{
 await page.goto('/');
 const before=await snapshot(page);
 await openSchematic(page);
 const first=page.locator('.schematic-dialog [data-action="schematic-close"]').first();
 const last=page.locator('.schematic-dialog [data-action="schematic-export"]');
 await expect(first).toBeFocused();
 await page.keyboard.press('Shift+Tab');
 await expect(last).toBeFocused();
 await page.keyboard.press('Tab');
 await expect(first).toBeFocused();
 await page.keyboard.press('Delete');
 await page.keyboard.press('ControlOrMeta+z');
 expect(await snapshot(page)).toBe(before);
 await page.keyboard.press('Escape');
 await expect(page.locator('.schematic-dialog')).toHaveCount(0);
 await expect(page.locator('[data-action="schematic-open"]')).toBeFocused();
 expect(await snapshot(page)).toBe(before);
});

test('generated SVG can be exported without script injection or changing simulation',async({page})=>{
 await page.goto('/');
 await page.locator('[data-action="run"]').click();
 await expect(page.locator('[data-action="run"]')).toContainText('停止仿真');
 await page.locator('#name').fill('<img src=x onerror=alert(1)>');
 await page.locator('#name').press('Tab');
 const before=await snapshot(page);
 await openSchematic(page);
 const svg=page.locator('.schematic-dialog svg');
 await expect(svg).toContainText('<img src=x onerror=alert(1)>');
 await expect(page.locator('.schematic-dialog img')).toHaveCount(0);
 const dlPromise=page.waitForEvent('download');
 await page.locator('.schematic-dialog [data-action="schematic-export"]').click();
 const dl=await dlPromise;
 expect(dl.suggestedFilename()).toBe('circuits-schematic.svg');
 const path=await dl.path();
 expect(path).not.toBeNull();
 const content=await readFile(path!,'utf8');
 expect(content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
 expect(content).toContain('&lt;img src=x onerror=alert(1)&gt;');
 expect(content).not.toContain('<img src=x');
 expect(content).toContain('data-schematic-net="N1"');
 expect(await snapshot(page)).toBe(before);
 await page.keyboard.press('Escape');
 await expect(page.locator('[data-action="run"]')).toContainText('停止仿真');
});

test('breadboard split rails are respected in generated read-only schematic',async({page})=>{
 await page.goto('/');
 const p=await project(page);
 p.parts=[
  {id:'bb1',kind:'breadboard',x:100,y:380,rotation:0},
  {id:'r1',kind:'resistor',x:250,y:140,rotation:0,value:220},
  {id:'r2',kind:'resistor',x:430,y:140,rotation:0,value:220},
  {id:'r3',kind:'resistor',x:610,y:140,rotation:0,value:220}
 ];
 p.wires=[
  {id:'w1',from:{componentId:'r1',pinId:'a'},to:{componentId:'bb1',pinId:'top-plus-0'},color:'#e45454'},
  {id:'w2',from:{componentId:'r2',pinId:'a'},to:{componentId:'bb1',pinId:'top-plus-10'},color:'#e45454'},
  {id:'w3',from:{componentId:'r3',pinId:'a'},to:{componentId:'bb1',pinId:'top-plus-11'},color:'#e45454'}
 ];
 p.insertions=[];
 await page.locator('#file').setInputFiles({
  name:'rail-split.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))
 });
 const before=await snapshot(page);
 await openSchematic(page);
 const svg=page.locator('.schematic-dialog svg');
 const n1=await svg.locator('[data-terminal="r1::a"]').getAttribute('data-schematic-net');
 const n2=await svg.locator('[data-terminal="r2::a"]').getAttribute('data-schematic-net');
 const n3=await svg.locator('[data-terminal="r3::a"]').getAttribute('data-schematic-net');
 expect(n1).toBe(n2);
 expect(n1).not.toBe(n3);
 await expect(svg.locator('.sch-net')).toHaveCount(2);
 await expect(page.locator('.schematic-dialog')).toContainText('插孔');
 expect(await snapshot(page)).toBe(before);
});

test('empty projects and oversized circuits are explained instead of showing fabricated connectivity',async({page})=>{
 await page.goto('/');
 await page.locator('[data-action="new"]').click();
 await openSchematic(page);
 await expect(page.locator('.schematic-svg')).toContainText('尚无元件');
 await expect(page.locator('.sch-net')).toHaveCount(0);
 await page.keyboard.press('Escape');
 const doc=await project(page);
 doc.parts=Array.from({length:81},(_,i)=>({
   id:'r'+i,kind:'resistor',x:i*10,y:i*2,rotation:0,value:220
 }));
 await page.locator('#file').setInputFiles({
   name:'oversize.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))
 });
 const before=await snapshot(page);
 await openSchematic(page);
 await expect(page.locator('.schematic-unavailable')).toContainText('超过');
 await expect(page.locator('.schematic-svg')).toHaveCount(0);
 await expect(page.locator('.schematic-dialog [data-action="schematic-export"]')).toBeDisabled();
 expect(await snapshot(page)).toBe(before);
 await page.locator('.schematic-shade').click({position:{x:8,y:8}});
 await expect(page.locator('.schematic-dialog')).toHaveCount(0);
});

test('schematic regeneration follows ideal switch topology rather than its pixel rotation',async({page})=>{
 await page.goto('/');
 const p=await project(page);
 p.parts=[{id:'s1',kind:'switch',x:180,y:140,rotation:0,closed:false}];
 p.wires=[];
 p.insertions=[];
 await page.locator('#file').setInputFiles({
  name:'switch.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))
 });
 await openSchematic(page);
 await expect(page.locator('.schematic-svg .sch-net')).toHaveCount(0);
 await page.keyboard.press('Escape');
 await page.locator('.item[data-part="s1"]').click();
 await page.locator('[data-action="toggle-switch"]').click();
 await openSchematic(page);
 await expect(page.locator('.schematic-svg .sch-net')).toHaveCount(1);
 const svg=page.locator('.schematic-svg');
 const a=await svg.locator('[data-terminal="s1::a"]').getAttribute('data-schematic-net');
 const b=await svg.locator('[data-terminal="s1::b"]').getAttribute('data-schematic-net');
 expect(a).toBe(b);
});
