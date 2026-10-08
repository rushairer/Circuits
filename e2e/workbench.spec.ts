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

test('Shift-selection moves several components as a rigid group and can undo deletion',async({page})=>{
  await page.goto('/');
  await page.locator('.item[data-part="r1"]').click();
  await page.locator('.item[data-part="l1"]').click({modifiers:['Shift']});
  await expect(page.locator('.inspector h2')).toContainText('已选中 2 个元件');
  const initial=await page.evaluate(()=>{
    const p=JSON.parse(localStorage.getItem('circuits-project')||'{}');
    return {r:p.parts.find((x:{id:string})=>x.id==='r1'),l:p.parts.find((x:{id:string})=>x.id==='l1')};
  });
  const box=await page.locator('.item[data-part="r1"]').boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);
  await page.mouse.down();
  await page.mouse.move(box!.x+box!.width/2+52,box!.y+box!.height/2+12,{steps:14});
  await page.mouse.up();
  const moved=await page.evaluate(()=>{
    const p=JSON.parse(localStorage.getItem('circuits-project')||'{}');
    return {r:p.parts.find((x:{id:string})=>x.id==='r1'),l:p.parts.find((x:{id:string})=>x.id==='l1'),wires:p.wires};
  });
  const dx=moved.r.x-initial.r.x,dy=moved.r.y-initial.r.y;
  expect(Math.abs(dx)).toBeGreaterThan(0);
  expect(moved.l.x-initial.l.x).toBe(dx);
  expect(moved.l.y-initial.l.y).toBe(dy);
  expect(moved.wires).toHaveLength(3);
  await page.locator('.topbar button[data-action="delete"]').click();
  await expect(page.locator('.item[data-part="r1"]')).toHaveCount(0);
  await expect(page.locator('.item[data-part="l1"]')).toHaveCount(0);
  await page.locator('.topbar button[data-action="undo"]').click();
  await expect(page.locator('.item[data-part="r1"]')).toHaveCount(1);
  await expect(page.locator('.item[data-part="l1"]')).toHaveCount(1);
});

test('marquee selection contains a component but does not include an adjacent component',async({page})=>{
  await page.goto('/');
  const points=await page.evaluate(()=>{
    const scene=document.querySelector<SVGGElement>('#scene')!;
    const svg=document.querySelector<SVGSVGElement>('#board')!;
    const matrix=scene.getScreenCTM()!;
    const screen=(x:number,y:number)=>{
      const p=svg.createSVGPoint();p.x=x;p.y=y;
      const c=p.matrixTransform(matrix);return {x:c.x,y:c.y};
    };
    return {start:screen(415,190),end:screen(582,293)};
  });
  await page.mouse.move(points.start.x,points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.end.x,points.end.y,{steps:12});
  await page.mouse.up();
  await expect(page.locator('.item.selected')).toHaveCount(1);
  await expect(page.locator('.item[data-part="r1"]')).toHaveClass(/selected/);
});

test('keyboard selects focusable parts, nudges positions, and supports select-all and escape',async({page})=>{
 await page.goto('/');
 const resistor=page.locator('.item[data-part="r1"]');
 await expect(resistor).toHaveAttribute('role','button');
 await resistor.focus();
 await page.keyboard.press('Enter');
 await expect(page.locator('.item[data-part="r1"]')).toHaveAttribute('aria-pressed','true');
 const original=await page.evaluate(()=>{
   const p=JSON.parse(localStorage.getItem('circuits-project')||'{}');
   return p.parts.find((x:{id:string})=>x.id==='r1').x as number;
 });
 await page.keyboard.press('ArrowRight');
 await expect.poll(async()=>page.evaluate(()=>{
   const p=JSON.parse(localStorage.getItem('circuits-project')||'{}');
   return p.parts.find((x:{id:string})=>x.id==='r1').x as number;
 })).toBe(original+10);
 await page.keyboard.press('ControlOrMeta+z');
 await expect.poll(async()=>page.evaluate(()=>{
   const p=JSON.parse(localStorage.getItem('circuits-project')||'{}');
   return p.parts.find((x:{id:string})=>x.id==='r1').x as number;
 })).toBe(original);
 await page.keyboard.press('ControlOrMeta+a');
 await expect(page.locator('.item.selected')).toHaveCount(5);
 await page.keyboard.press('Escape');
 await expect(page.locator('.item.selected')).toHaveCount(0);
});

test('wheel zoom preserves cursor anchor and Space-drag pans without editing the project',async({page})=>{
 await page.goto('/');
 const anchor=await page.evaluate(()=>{
   const svg=document.querySelector<SVGSVGElement>('#board')!,p=svg.createSVGPoint();
   p.x=330;p.y=135;
   const screen=p.matrixTransform(svg.getScreenCTM()!);
   return {x:screen.x,y:screen.y};
 });
 const worldUnder=()=>page.evaluate(({x,y})=>{
   const scene=document.querySelector<SVGGElement>('#scene')!,svg=document.querySelector<SVGSVGElement>('#board')!;
   const p=svg.createSVGPoint();p.x=x;p.y=y;
   const world=p.matrixTransform(scene.getScreenCTM()!.inverse());
   return {x:world.x,y:world.y};
 },anchor);
 const initial=await page.evaluate(()=>localStorage.getItem('circuits-project'));
 const before=await worldUnder();
 await page.mouse.move(anchor.x,anchor.y);
 await page.mouse.wheel(0,-420);
 await expect.poll(async()=>page.evaluate(()=>{
   const t=document.querySelector('#scene')?.getAttribute('transform')||'';
   return Number(t.match(/scale\(([^)]+)\)/)?.[1]||0);
 })).toBeGreaterThan(1);
 const after=await worldUnder();
 // Mouse events are quantized to CSS pixels; the resulting subpixel
 // world-space drift must remain well below one visible screen pixel.
 expect(Math.abs(after.x-before.x)).toBeLessThan(.2);
 expect(Math.abs(after.y-before.y)).toBeLessThan(.2);
 const transform=await page.locator('#scene').getAttribute('transform');
 await page.keyboard.down('Space');
 await page.mouse.move(anchor.x,anchor.y);
 await page.mouse.down();
 await page.mouse.move(anchor.x+80,anchor.y+35,{steps:10});
 await page.mouse.up();
 await page.keyboard.up('Space');
 expect(await page.locator('#scene').getAttribute('transform')).not.toBe(transform);
 expect(await page.evaluate(()=>localStorage.getItem('circuits-project'))).toBe(initial);
 await page.locator('[data-action="fit"]').click();
 await expect(page.locator('#scene')).toHaveAttribute('transform','translate(0 0) scale(1)');
});

test('experimental nonlinear DC mode displays per-LED computed current', async ({page})=>{
 await page.goto('/');
 await expect(page.locator('button[data-action="solver-mode"]')).toContainText('固定 2V');
 await page.locator('button[data-action="solver-mode"]').click();
 await page.locator('button[data-action="run"]').click();
 await expect(page.locator('.analysis-overview')).toContainText('实验性非线性 DC');
 await expect(page.locator('.analysis-overview')).toContainText('LED l1');
 await expect(page.locator('.analysis-overview')).toContainText('mA');
 await page.locator('.item[data-part="l1"]').click();
 await expect(page.locator('.inspector')).toContainText('非线性 LED');
 await expect(page.locator('.inspector')).toContainText('mA');
});

test('experimental DC voltmeter reads 9 volts from battery probes, and disconnected meter shows no invented zero',async({page})=>{
 await page.goto('/');
 const circuit=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 circuit.parts.push({id:'m1',kind:'multimeter',x:860,y:430,rotation:0});
 await page.locator('#file').setInputFiles({name:'meter-open.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(circuit))});
 await page.locator('button[data-action="solver-mode"]').click();
 await page.locator('button[data-action="run"]').click();
 await expect(page.locator('.analysis-overview')).toContainText('未连接');
 await expect(page.locator('.item[data-part="m1"]')).toContainText('----');
 // Re-import a connected version through the same public user workflow.
 circuit.wires.push({id:'wm1',from:{componentId:'m1',pinId:'positive'},to:{componentId:'b1',pinId:'positive'},color:'#4b5563'},
   {id:'wm2',from:{componentId:'m1',pinId:'negative'},to:{componentId:'b1',pinId:'negative'},color:'#4b5563'});
 await page.locator('#file').setInputFiles({name:'meter-wired.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(circuit))});
 await expect(page.locator('.analysis-overview')).toContainText('9.00 V');
 await expect(page.locator('.item[data-part="m1"]')).toContainText('9.00');
});

test('sample gallery creates separate dual-LED project without overwriting existing work',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await expect(page.locator('.example-card')).toHaveCount(4);
 await page.locator('[data-load-example="parallel"]').click();
 await expect(page.locator('input#name')).toHaveValue('双 LED 并联 · 独立限流');
 await expect(page.locator('button.project-switcher')).toContainText('(2)');
 await expect(page.locator('button[data-action="solver-mode"]')).toContainText('非线性 DC');
 await page.locator('button[data-action="run"]').click();
 await expect(page.locator('.analysis-overview')).toContainText('LED l1');
 await expect(page.locator('.analysis-overview')).toContainText('LED l2');
 await page.locator('button[data-action="projects"]').click();
 await page.locator('.project-open').filter({hasText:'我的第一个电路'}).click();
 await expect(page.locator('input#name')).toHaveValue('我的第一个电路');
 await expect(page.locator('.item[data-part="l2"]')).toHaveCount(0);
});
