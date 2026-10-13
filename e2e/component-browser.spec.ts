import {test,expect,type Page} from '@playwright/test';

const saved=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
const original=(page:Page)=>page.evaluate(()=>localStorage.getItem('circuits-project'));

test('reference component browser starts Basic, searches all supported parts, and can expand to All',async({page})=>{
 await page.goto('/');
 const snapshot=await original(page);
 const group=page.locator('#component-category');
 await expect(group).toHaveValue('basic');
 await expect(group.locator('option')).toHaveCount(4);
 await expect(page.locator('.part[data-kind]')).toHaveCount(9);
 await page.locator('#search').fill('VOLTMETER');
 await expect(page.locator('.part[data-kind]')).toHaveCount(1);
 await expect(page.locator('.part[data-kind="multimeter"]')).toBeVisible();
 await expect(group).toHaveValue('basic'); // explicit category choice stays
 await page.locator('#search').fill('');
 await group.selectOption('all');
 await expect(page.locator('.part[data-kind]')).toHaveCount(13);
 await page.locator('#search').fill('piezo');
 await expect(page.locator('.part[data-kind="buzzer"]')).toBeVisible();
 await expect(page.locator('.part[data-kind]')).toHaveCount(1);
 expect(await original(page)).toBe(snapshot); // browsing cannot write JSON
});

test('search uses native input focus and selection, handles unmatched/malicious terms as text',async({page})=>{
 await page.goto('/');
 const snapshot=await original(page);
 const input=page.locator('#search');
 await input.fill('arduino');
 await expect(page.locator('.part[data-kind="arduino"]')).toHaveCount(1);
 await input.evaluate((node:HTMLInputElement)=>node.setSelectionRange(0,7));
 await input.press('q');
 await expect(input).toHaveValue('q');
 await expect(page.locator('.catalog-empty')).toBeVisible();
 await input.fill('<svg onload=alert(1)>');
 await expect(page.locator('.catalog-empty')).toBeVisible();
 await expect(page.locator('.inspector svg[onload]')).toHaveCount(0);
 await expect(input).toHaveValue('<svg onload=alert(1)>');
 expect(await original(page)).toBe(snapshot);
});

test('Starter categories reuse real separate-workspace examples, not current-project replacements',async({page})=>{
 await page.goto('/');
 const before=await saved(page);
 await page.locator('#component-category').selectOption('starters-basic');
 await expect(page.locator('.part')).toHaveCount(0);
 await expect(page.locator('.example-card')).toHaveCount(12);
 await page.locator('#search').fill('RC 电容充电');
 await expect(page.locator('.example-card')).toHaveCount(1);
 await expect(page.locator('.example-card[data-load-example="rc-charge"]')).toBeVisible();
 await page.locator('#component-category').selectOption('starters-arduino');
 await expect(page.locator('.example-card')).toHaveCount(3);
 await expect(page.locator('.example-card[data-load-example="gpio-d13-led"]')).toBeVisible();
 await page.locator('.example-card[data-load-example="gpio-d13-led"]').click();
 const opened=await saved(page);
 expect(opened.name).toContain('Arduino D13');
 expect(opened.parts).not.toEqual(before.parts);
 await expect(page.locator('button.project-switcher')).toContainText('(2)');
 await page.locator('button[data-action="projects"]').first().click();
 await page.locator('.project-open').filter({hasText:'我的第一个电路'}).click();
 expect(await saved(page)).toEqual(before);
});

test('All selection is retained on property inspection, reload and return to component library',async({page})=>{
 await page.goto('/');
 await page.locator('#component-category').selectOption('all');
 await expect(page.locator('.part[data-kind="servo"]')).toBeVisible();
 await page.locator('.part[data-kind="servo"]').click();
 await expect(page.locator('.item[data-part]')).toHaveCount(6);
 await page.locator('.item[data-part]').last().click();
 await expect(page.locator('.inspector h2')).toContainText('属性');
 await page.locator('.inspector [data-action="parts"]').click();
 await expect(page.locator('#component-category')).toHaveValue('all');
 await expect(page.locator('.part[data-kind]')).toHaveCount(13);
 await page.reload();
 await expect(page.locator('#component-category')).toHaveValue('all');
 await expect(page.locator('.part[data-kind]')).toHaveCount(13);
});

test('component-browser invalid persisted category defaults safely; native select shortcuts are not canvas gestures',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>localStorage.setItem('circuits-component-category','__proto__'));
 await page.reload();
 await expect(page.locator('#component-category')).toHaveValue('basic');
 await page.locator('#component-category').focus();
 await page.keyboard.press('n');
 await expect(page.locator('[data-action="note-add"]')).toHaveAttribute('aria-pressed','false');
 await expect(page.locator('.circuit-note')).toHaveCount(0);
 const category=page.locator('#component-category');
 await category.selectOption('starters-arduino');
 await page.locator('#search').fill('Serial');
 await expect(page.locator('.example-card')).toHaveCount(1);
 await expect(page.locator('.example-card[data-load-example="uno-serial"]')).toBeVisible();
});
