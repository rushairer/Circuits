import {test,expect,type Page} from '@playwright/test';

const documentProject=(page:Page)=>page.evaluate(()=>
 JSON.parse(localStorage.getItem('circuits-project')!)
);
const LED:Record<string,{shell:string;foot:string;glow:string}>={
 red:{shell:'#ee525c',foot:'#d73b4a',glow:'#ff7a74'},
 green:{shell:'#43bd78',foot:'#1d9954',glow:'#65ed9e'},
 yellow:{shell:'#f3d64a',foot:'#cca829',glow:'#fff28c'},
 orange:{shell:'#f5a44f',foot:'#cf742d',glow:'#ffbc70'},
 blue:{shell:'#549ee7',foot:'#2e70bc',glow:'#83c0ff'},
 white:{shell:'#f0f4ef',foot:'#bdcad1',glow:'#e8f6ff'}
};
async function selectLED(page:Page){
 await page.locator('.item[data-part="l1"] .led-lens').click();
 await expect(page.locator('#led-color')).toBeVisible();
}

test('LED inspector exposes six original colors with a red legacy default',async({page})=>{
 await page.goto('/');
 const before=await documentProject(page);
 expect(before.parts.find((p:{id:string})=>p.id==='l1').ledColor).toBeUndefined();
 await selectLED(page);
 await expect(page.locator('#led-color')).toHaveValue('red');
 await expect(page.locator('#led-color option')).toHaveCount(6);
 const values=await page.locator('#led-color option').evaluateAll(options=>
  options.map(x=>(x as HTMLOptionElement).value));
 expect(values).toEqual(['red','green','yellow','orange','blue','white']);
 await expect(page.locator('.item[data-part="l1"] .led-lens')).toHaveAttribute('fill',LED.red.shell);
});

test('changing LED color alters only its visual lens and is one undoable project edit',async({page})=>{
 await page.goto('/');
 const before=await documentProject(page);
 await selectLED(page);
 await page.locator('#led-color').selectOption('blue');
 const after=await documentProject(page);
 expect(after.parts.find((p:{id:string})=>p.id==='l1').ledColor).toBe('blue');
 expect(after.wires).toEqual(before.wires);
 expect(after.code).toBe(before.code);
 expect(after.parts.filter((p:{id:string})=>p.id!=='l1')).toEqual(before.parts.filter((p:{id:string})=>p.id!=='l1'));
 await expect(page.locator('.item[data-part="l1"] .led-lens')).toHaveAttribute('fill',LED.blue.shell);
 await expect(page.locator('.item[data-part="l1"] .led-lens-foot')).toHaveAttribute('fill',LED.blue.foot);
 await page.locator('[data-action="undo"]').click();
 expect((await documentProject(page)).parts).toEqual(before.parts);
 await page.locator('[data-action="redo"]').click();
 expect((await documentProject(page)).parts).toEqual(after.parts);
});

test('all six LED colors persist on reload with accurate lens swatches',async({page})=>{
 await page.goto('/');
 await selectLED(page);
 for(const [color,visual] of Object.entries(LED)){
   await page.locator('#led-color').selectOption(color);
   const current=await documentProject(page);
   expect(current.parts.find((p:{id:string})=>p.id==='l1').ledColor??'red').toBe(color);
   await expect(page.locator('.item[data-part="l1"] .led-lens')).toHaveAttribute('fill',visual.shell);
 }
 await page.reload();
 await expect(page.locator('.item[data-part="l1"] .led-lens')).toHaveAttribute('fill',LED.white.shell);
 await selectLED(page);
 await expect(page.locator('#led-color')).toHaveValue('white');
});

test('color change during simulation preserves the running state and solver result',async({page})=>{
 await page.goto('/');
 await page.locator('[data-action="run"]').click();
 await expect(page.locator('[data-action="run"]')).toContainText('停止仿真');
 const before=await documentProject(page);
 await selectLED(page);
 const statusBefore=await page.locator('.bottom span').first().textContent();
 const glowBefore=page.locator('.item[data-part="l1"] .led-glow');
 await expect(glowBefore).toHaveAttribute('fill',LED.red.glow);
 await page.locator('#led-color').selectOption('green');
 await expect(page.locator('[data-action="run"]')).toContainText('停止仿真');
 await expect(page.locator('.bottom span').first()).toHaveText(statusBefore!);
 await expect(page.locator('.item[data-part="l1"] .led-glow')).toHaveAttribute('fill',LED.green.glow);
 expect((await documentProject(page)).wires).toEqual(before.wires);
});

test('non-LED parts have no LED palette and invalid LED colors are rejected on import',async({page})=>{
 await page.goto('/');
 const before=await documentProject(page);
 await page.locator('.item[data-part="r1"]').click();
 await expect(page.locator('#led-color')).toHaveCount(0);
 const invalid=structuredClone(before);
 invalid.parts.find((p:{id:string})=>p.id==='l1').ledColor='purple';
 page.once('dialog',async dialog=>dialog.accept());
 await page.locator('#file').setInputFiles({
  name:'bad-led-color.json',mimeType:'application/json',
  buffer:Buffer.from(JSON.stringify(invalid))
 });
 expect((await documentProject(page)).parts).toEqual(before.parts);
});
