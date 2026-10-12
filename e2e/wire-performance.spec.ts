import {test,expect} from '@playwright/test';
import {wireScene} from '../tests/fixtures/wire-scenes.mjs';

/** Interaction correctness at the import ceiling, not a wall-clock FPS gate. */
test('300 parts and 2000 wires stay editable after import, zoom, nudge and undo',async({page})=>{
 const errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1440,height:1000});
 await page.goto('/');
 await expect(page).toHaveTitle(/Circuits/);
 const fixture=wireScene(2000);
 await page.locator('#file').setInputFiles({name:'large-circuit.json',mimeType:'application/json',
  buffer:Buffer.from(JSON.stringify(fixture))});
 await expect(page.locator('.item[data-part]')).toHaveCount(300);
 await expect(page.locator('.wire[data-wire]')).toHaveCount(2000);
 await expect(page.locator('vite-error-overlay')).toHaveCount(0);
 const wire=page.locator('.wire[data-wire="wire-0"]');
 const originalPath=await wire.getAttribute('d');
 expect(originalPath).toBeTruthy();
 expect(originalPath).not.toContain(' Q');
 const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
 await page.locator('button[data-action="zoom-in"]').click();
 await expect(wire).toHaveAttribute('d',originalPath!);
 await page.locator('.item[data-part="p0"]').focus();
 await page.keyboard.press('Enter');
 await page.keyboard.press('ArrowRight');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!).parts[0].x))
  .toBe(original.parts[0].x+10);
 await expect(wire).not.toHaveAttribute('d',originalPath!);
 await expect(page.locator('.wire[data-wire]')).toHaveCount(2000);
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
 expect(after.wires).toEqual(original.wires);
 await page.locator('button[data-action="undo"]').click();
 await expect(wire).toHaveAttribute('d',originalPath!);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!))).toEqual(original);
 expect(errors).toEqual([]);
});
