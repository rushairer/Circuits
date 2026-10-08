import { test, expect } from '@playwright/test';

test('workbench loads 12 parts and the sample LED circuit lights', async ({page})=>{
  await page.goto('/');
  await expect(page).toHaveTitle(/Circuits/);
  await expect(page.locator('.part[data-kind]')).toHaveCount(12);
  await expect(page.locator('.item[data-part]')).toHaveCount(5);
  await page.locator('button[data-action="run"]').click();
  await expect(page.locator('.bottom')).toContainText('LED 正常发光');
  await expect(page.locator('.bottom')).toContainText('21.21mA');
});

test('project library survives browser reload and switches without overwriting', async ({page})=>{
  await page.goto('/');
  await page.locator('button[data-action="projects"]').first().click();
  await expect(page.locator('.project-row')).toHaveCount(1);
  await page.locator('button[data-action="duplicate"]').click();
  await expect(page.locator('button.project-switcher')).toContainText('(2)');
  await page.locator('input#name').fill('回归测试工程');
  await page.locator('input#name').press('Tab');
  await page.reload();
  await expect(page.locator('input#name')).toHaveValue('回归测试工程');
  await page.locator('button[data-action="projects"]').first().click();
  await expect(page.locator('.project-row')).toHaveCount(2);
  await page.locator('.project-open').filter({hasText:'我的第一个电路'}).last().click();
  await expect(page.locator('input#name')).toHaveValue('我的第一个电路');
});

test('existing wire end can be dragged to a breadboard hole', async ({page})=>{
  await page.goto('/');
  await page.locator('.wire[data-wire="w1"]').click();
  await expect(page.locator('.endpoint-handle')).toHaveCount(2);
  const handle=page.locator('.endpoint-handle[data-wire="w1"][data-wire-end="to"]');
  const target=page.locator('.item[data-part="bb1"] .pin[data-pin="hole-a-1"]');
  const start=await handle.boundingBox(),end=await target.boundingBox();
  expect(start).not.toBeNull();expect(end).not.toBeNull();
  await page.mouse.move(start!.x+start!.width/2,start!.y+start!.height/2);
  await page.mouse.down();
  await page.mouse.move(end!.x+end!.width/2,end!.y+end!.height/2,{steps:12});
  await page.mouse.up();
  await expect.poll(async()=>page.evaluate(()=>{
    const p=JSON.parse(localStorage.getItem('circuits-project')||'{}');
    return p.wires?.find((wire:{id:string})=>wire.id==='w1')?.to?.pinId;
  })).toBe('hole-a-1');
});
