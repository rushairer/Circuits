import {test,expect,type Page} from '@playwright/test';

type Coordinate={x:number;y:number};
async function screen(page:Page,x:number,y:number):Promise<Coordinate>{
 return page.evaluate(({x,y})=>{
   const svg=document.querySelector<SVGSVGElement>('#board')!;
   const scene=document.querySelector<SVGGElement>('#scene')!;
   const p=svg.createSVGPoint();p.x=x;p.y=y;
   const point=p.matrixTransform(scene.getScreenCTM()!);
   return {x:point.x,y:point.y};
 },{x,y});
}
const saved=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
async function create(page:Page,x=320,y=140){
 await page.locator('[data-action="note-add"]').click();
 await expect(page.locator('[data-action="note-add"]')).toHaveAttribute('aria-pressed','true');
 const p=await screen(page,x,y);
 await page.mouse.click(p.x,p.y);
 await expect(page.locator('.circuit-note')).toHaveCount(1);
 await expect(page.locator('#note-text')).toBeVisible();
}

test('note toolbar creates a world-space annotation; text, visibility and JSON persist without changing wires',async({page})=>{
 await page.goto('/');
 const before=await saved(page);
 await create(page);
 const first=await saved(page);
 expect(first.notes).toHaveLength(1);
 expect(first.notes[0].text).toBe('新建注释');
 // Browser mouse clicks round to device pixels before SVG's inverse view
 // transform; the persisted world point stays within one logical unit.
 expect(Math.abs(first.notes[0].x-320)).toBeLessThan(1.1);
 expect(Math.abs(first.notes[0].y-140)).toBeLessThan(1.1);
 expect(first.wires).toEqual(before.wires);
 expect(first.parts).toEqual(before.parts);
 const content='电压 9V & <img src=x onerror=alert(1)>\n正极连到电阻';
 await page.locator('#note-text').fill(content);
 await page.locator('#note-text').press('Tab'); // commit once on change
 const after=await saved(page);
 expect(after.notes[0].text).toBe(content);
 expect(after.wires).toEqual(before.wires);
 const visual=await page.locator('.circuit-note').evaluate(el=>el.outerHTML);
 expect(visual).toContain('&lt;img');
 expect(visual).not.toContain('<img');
 expect(await page.locator('.circuit-note text').textContent()).toContain('电压 9V');
 await page.keyboard.press('Shift+N');
 await expect(page.locator('#circuit-notes')).toHaveCount(0);
 expect((await saved(page)).notes).toEqual(after.notes);
 await page.locator('[data-action="notes-visibility"]').click();
 await expect(page.locator('.circuit-note')).toHaveCount(1);
 await page.reload();
 expect((await saved(page)).notes).toEqual(after.notes);
 await expect(page.locator('.circuit-note')).toHaveCount(1);
});

test('N arms note placement, Escape cancels; placement on a physical pin never starts a wire',async({page})=>{
 await page.goto('/');
 const before=await saved(page);
 await page.keyboard.press('n');
 await expect(page.locator('[data-action="note-add"]')).toHaveAttribute('aria-pressed','true');
 await page.keyboard.press('Escape');
 await expect(page.locator('[data-action="note-add"]')).toHaveAttribute('aria-pressed','false');
 expect((await saved(page)).notes).toBeUndefined();
 await page.keyboard.press('n');
 await page.locator('.item[data-part="r1"] .pin[data-pin="a"]').click();
 await expect(page.locator('.circuit-note')).toHaveCount(1);
 await expect(page.locator('#wire-preview')).toHaveCount(0);
 expect((await saved(page)).wires).toEqual(before.wires);
 expect((await saved(page)).parts).toEqual(before.parts);
});

test('dragging a note is a single undoable visual action, Escape restores uncommitted drag',async({page})=>{
 await page.goto('/');
 await create(page);
 const before=await saved(page);
 await page.locator('#note-text').press('Tab'); // avoid global keys in text editor
 const bounding=await page.locator('.circuit-note').boundingBox();
 expect(bounding).not.toBeNull();
 const start={x:bounding!.x+60,y:bounding!.y+38};
 await page.mouse.move(start.x,start.y);
 await page.mouse.down();
 await page.mouse.move(start.x+65,start.y+35,{steps:8});
 await page.mouse.up();
 const after=await saved(page);
 expect(after.notes[0].x).toBeGreaterThan(before.notes[0].x+30);
 expect(after.notes[0].y).toBeGreaterThan(before.notes[0].y+15);
 expect(after.wires).toEqual(before.wires);
 await page.locator('[data-action="undo"]').click();
 expect((await saved(page)).notes).toEqual(before.notes);
 await page.locator('[data-action="redo"]').click();
 expect((await saved(page)).notes).toEqual(after.notes);
 const moved=await page.locator('.circuit-note').boundingBox();
 expect(moved).not.toBeNull();
 const pt={x:moved!.x+60,y:moved!.y+38};
 await page.mouse.move(pt.x,pt.y);
 await page.mouse.down();
 await page.mouse.move(pt.x-43,pt.y+15,{steps:6});
 await page.keyboard.press('Escape');
 await page.mouse.up();
 expect((await saved(page)).notes).toEqual(after.notes);
 await expect(page.locator('.circuit-note')).toHaveCount(1);
});

test('selected note keyboard nudge and delete are undoable and never remove connected wires',async({page})=>{
 await page.goto('/');
 await create(page);
 await page.locator('#note-text').press('Tab');
 const before=await saved(page);
 await page.locator('.circuit-note').focus();
 await page.keyboard.press('ArrowRight');
 const after=await saved(page);
 expect(after.notes[0].x).toBe(before.notes[0].x+10);
 expect(after.wires).toEqual(before.wires);
 await page.keyboard.press('Delete');
 const removed=await saved(page);
 expect(removed.notes).toHaveLength(0);
 expect(removed.wires).toEqual(before.wires);
 await page.keyboard.press('ControlOrMeta+z');
 expect((await saved(page)).notes).toEqual(after.notes);
 await page.keyboard.press('ControlOrMeta+z');
 expect((await saved(page)).notes).toEqual(before.notes);
});

test('notes preserve simulation readouts and malformed note JSON cannot be imported',async({page})=>{
 await page.goto('/');
 await page.locator('[data-action="run"]').click();
 await expect(page.locator('.bottom')).toContainText('LED 正常发光');
 const before=await saved(page);
 await create(page,315,140);
 await expect(page.locator('.bottom')).toContainText('LED 正常发光');
 const current=await saved(page);
 expect(current.wires).toEqual(before.wires);
 const malformed=structuredClone(current);
 malformed.notes[0].text='Z'.repeat(501);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#file').setInputFiles({
   name:'bad-notes.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(malformed))
 });
 expect((await saved(page)).notes).toEqual(current.notes);
});

test('N/Shift+N shortcuts never hijack note textarea editing',async({page})=>{
 await page.goto('/');
 await create(page);
 await page.locator('#note-text').fill('n');
 await page.locator('#note-text').press('Shift+n');
 await expect(page.locator('[data-action="note-add"]')).toHaveAttribute('aria-pressed','false');
 await expect(page.locator('[data-action="notes-visibility"]')).toHaveAttribute('aria-pressed','true');
 const typed=await page.locator('#note-text').inputValue();
 // Playwright keyboard maps Shift+n to lowercase n on some CI layouts.
 // Assert that both characters reached the native textarea and the app
 // did NOT steal the shortcut; preserve actual typed case on save.
 expect(typed.toLowerCase()).toBe('nn');
 await page.locator('#note-text').press('Tab');
 expect((await saved(page)).notes[0].text).toBe(typed);
});
