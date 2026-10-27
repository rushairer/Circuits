import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const saved=(page:Page)=>page.evaluate(()=>localStorage.getItem('circuits-project'));

test('editor switches between circuit, schematic, BOM without editing a single endpoint',async({page})=>{
 await page.goto('/');
 const before=await saved(page);
 await expect(page.locator('#tab-circuit')).toHaveAttribute('aria-selected','true');
 await expect(page.locator('#board')).toHaveCount(1);
 await page.locator('#tab-schematic').click();
 await expect(page.locator('#tab-schematic')).toHaveAttribute('aria-selected','true');
 await expect(page.locator('#workspace-main')).toHaveAttribute('data-view','schematic');
 await expect(page.locator('.schematic-workspace')).toBeVisible();
 await expect(page.locator('.schematic-dialog')).toHaveCount(0);
 await expect(page.locator('.schematic-svg .sch-net')).toHaveCount(3);
 await expect(page.locator('.schematic-svg .sch-link')).toHaveCount(6);
 await expect(page.locator('#board')).toHaveCount(0);
 expect(await saved(page)).toBe(before);
 await page.locator('#tab-bom').click();
 await expect(page.locator('.bom-workspace')).toBeVisible();
 await expect(page.locator('.bom-table tbody tr')).toHaveCount(5);
 await expect(page.locator('.bom-overview')).toContainText('组件');
 expect(await saved(page)).toBe(before);
 await page.locator('#tab-circuit').click();
 await expect(page.locator('#board')).toBeVisible();
 await expect(page.locator('.schematic-workspace')).toHaveCount(0);
 await expect(page.locator('.bom-workspace')).toHaveCount(0);
 expect(await saved(page)).toBe(before);
});

test('schematic zoom, net focus and SVG export use complete topology while remaining in editor',async({page})=>{
 await page.goto('/');
 const before=await saved(page);
 await page.locator('#tab-schematic').click();
 const filter=page.locator('#schematic-net-focus');
 await filter.selectOption('N1');
 await expect(page.locator('.schematic-svg')).toHaveAttribute('data-schematic-focus-net','N1');
 await expect(page.locator('.sch-net[data-schematic-net="N2"]')).toHaveClass(/sch-dimmed/);
 await page.locator('.schematic-workspace [data-action="schematic-zoom-in"]').click();
 await expect(page.locator('.schematic-view-toolbar output')).toHaveText('125%');
 await expect(page.locator('.schematic-svg')).toHaveAttribute('data-schematic-focus-net','N1');
 const dlPromise=page.waitForEvent('download');
 await page.locator('.schematic-workspace [data-action="schematic-export"]').click();
 const dl=await dlPromise;
 const svg=await readFile((await dl.path())!,'utf8');
 expect(svg).toContain('data-schematic-net="N1"');
 expect(svg).toContain('data-schematic-net="N2"');
 expect(svg).not.toContain('sch-dimmed');
 expect(svg).not.toContain('data-schematic-focus-net');
 expect(await saved(page)).toBe(before);
});

test('inline component list exports real BOM and never exposes editing commands',async({page})=>{
 await page.goto('/');
 const before=await saved(page);
 await page.locator('#tab-bom').click();
 await expect(page.locator('[data-action="delete"]')).toBeDisabled();
 await expect(page.locator('[data-action="undo"]')).toBeDisabled();
 await expect(page.locator('#wire-type')).toBeDisabled();
 await expect(page.locator('#wire-palette')).toBeDisabled();
 await expect(page.locator('#name')).toHaveAttribute('readonly','');
 const dlPromise=page.waitForEvent('download');
 await page.locator('.bom-workspace [data-action="bom-export"]').click();
 const dl=await dlPromise;
 const contents=await readFile((await dl.path())!,'utf8');
 expect(contents).toContain('组件 ID');
 expect(contents).toContain('电阻');
 expect(await saved(page)).toBe(before);
 await page.keyboard.press('Delete');
 await page.keyboard.press('ControlOrMeta+z');
 expect(await saved(page)).toBe(before);
 await page.keyboard.press('Escape');
 await expect(page.locator('#tab-circuit')).toHaveAttribute('aria-selected','true');
});

test('keyboard arrow tabs and running simulation survive readonly view transitions',async({page})=>{
 await page.goto('/');
 await page.locator('[data-action="run"]').click();
 const before=await saved(page);
 await expect(page.locator('[data-action="run"]')).toContainText('停止仿真');
 await page.locator('#tab-circuit').focus();
 await page.keyboard.press('ArrowRight');
 await expect(page.locator('#tab-schematic')).toBeFocused();
 await expect(page.locator('#tab-schematic')).toHaveAttribute('aria-selected','true');
 await page.keyboard.press('ArrowRight');
 await expect(page.locator('#tab-bom')).toBeFocused();
 await page.keyboard.press('Home');
 await expect(page.locator('#tab-circuit')).toBeFocused();
 await expect(page.locator('[data-action="run"]')).toContainText('停止仿真');
 expect(await saved(page)).toBe(before);
});

test('1024px integrated schematic scrolls within canvas and preserves circuit pan and selection',async({page})=>{
 await page.setViewportSize({width:1024,height:768});
 await page.goto('/');
 await page.locator('.item[data-part="r1"]').click();
 const initial=await saved(page);
 const originalViewBox=await page.locator('#board').getAttribute('viewBox');
 await page.locator('#tab-schematic').click();
 const panel=page.locator('.schematic-workspace');
 await expect(panel).toBeVisible();
 const box=await panel.boundingBox(),stage=await page.locator('.canvas').boundingBox();
 expect(box).not.toBeNull();expect(stage).not.toBeNull();
 expect(box!.height).toBeLessThanOrEqual(stage!.height+1);
 const scroll=page.locator('.schematic-scroll');
 await scroll.evaluate(el=>{el.scrollLeft=140;});
 expect(await scroll.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
 await expect(page.locator('.schematic-dialog')).toHaveCount(0);
 await page.locator('#tab-circuit').click();
 await expect(page.locator('.quick-properties[data-quick-for="r1"]')).toBeVisible();
 expect(await page.locator('#board').getAttribute('viewBox')).toBe(originalViewBox);
 expect(await saved(page)).toBe(initial);
});


test('legacy toolbar viewers and scope actions are not inert when accessed from integrated views',async({page})=>{
 await page.goto('/');
 await page.locator('#tab-schematic').click();
 await page.locator('[data-action="bom-open"]').click();
 await expect(page.locator('.bom-dialog')).toBeVisible();
 await expect(page.locator('#tab-circuit')).toHaveAttribute('aria-selected','true');
 await page.keyboard.press('Escape');
 await expect(page.locator('.bom-dialog')).toHaveCount(0);
 await page.locator('#tab-bom').click();
 await page.locator('[data-action="schematic-open"]').click();
 await expect(page.locator('.schematic-dialog')).toBeVisible();
 await expect(page.locator('#tab-circuit')).toHaveAttribute('aria-selected','true');
 await page.keyboard.press('Escape');
 await expect(page.locator('.schematic-dialog')).toHaveCount(0);
});
