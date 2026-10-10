import { test, expect, type Page } from '@playwright/test';

test('workbench loads 13 parts and the sample LED circuit lights', async ({page})=>{
  await page.goto('/');
  await expect(page).toHaveTitle(/Circuits/);
  await expect(page.locator('.part[data-kind]')).toHaveCount(13);
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
  const target=page.locator('.breadboard-sockets[data-part="bb1"] .pin[data-pin="hole-a-1"]');
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
  await page.keyboard.down('Shift');
  await page.mouse.move(points.start.x,points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.end.x,points.end.y,{steps:12});
  await page.mouse.up();
  await page.keyboard.up('Shift');
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
 const fitted=await page.locator('#scene').getAttribute('transform');
 expect(fitted).toMatch(/translate\(-?[\d.]+ -?[\d.]+\) scale\([\d.]+\)/);
 await page.keyboard.press('f');
 expect(await page.locator('#scene').getAttribute('transform')).toBe(fitted);
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
 await expect(page.locator('.example-card')).toHaveCount(15);
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

test('development index includes explicit build-revision provenance metadata',async({page})=>{
 await page.goto('/');
 await expect(page.locator('meta[name="circuits-revision"]')).toHaveAttribute('content','local');
});

test('RC example charges capacitor with time scrubber and preserved user projects',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await expect(page.locator('.example-card')).toHaveCount(15);
 await page.locator('[data-load-example="rc-charge"]').click();
 await expect(page.locator('button.project-switcher')).toContainText('(2)');
 await expect(page.locator('button[data-action="solver-mode"]')).toContainText('RC 暂态');
 await page.locator('button[data-action="run"]').click();
 await expect(page.locator('.rc-panel')).toContainText('τ 0.1000 s');
 await expect(page.locator('.rc-curve')).toHaveCount(1);
 await expect(page.locator('#rc-voltage-value')).toHaveText('0.00 V');
 await page.locator('#rc-time').evaluate((el:HTMLInputElement)=>{el.value='20';el.dispatchEvent(new Event('input',{bubbles:true}))});
 await expect(page.locator('#rc-voltage-value')).toHaveText('5.69 V');
 await expect(page.locator('#rc-current-value')).toHaveText('3.311 mA');
 await page.locator('.item[data-part="c1"]').click();
 await expect(page.locator('#rc-initial')).toHaveValue('0');
 await expect(page.locator('#value')).toHaveValue('100');
 await page.locator('button[data-action="projects"]').click();
 await page.locator('.project-open').filter({hasText:'我的第一个电路'}).click();
 await expect(page.locator('.item[data-part="c1"]')).toHaveCount(0);
});

test('RC source-free discharge shows negative capacitor current and editable initial charge',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await page.locator('[data-load-example="rc-discharge"]').click();
 await page.locator('button[data-action="run"]').click();
 await expect(page.locator('#rc-voltage-value')).toHaveText('9.00 V');
 await expect(page.locator('#rc-current-value')).toHaveText('-9.000 mA');
 await page.locator('#rc-time').evaluate((el:HTMLInputElement)=>{el.value='20';el.dispatchEvent(new Event('input',{bubbles:true}))});
 await expect(page.locator('#rc-voltage-value')).toHaveText('3.31 V');
 await page.locator('.item[data-part="c1"]').click();
 await page.locator('#rc-initial').fill('6');
 await page.locator('#rc-initial').press('Tab');
 await expect(page.locator('#rc-voltage-value')).toHaveText('6.00 V');
 await page.reload();
 await expect(page.locator('#rc-initial')).toHaveCount(0);
 await page.locator('.item[data-part="c1"]').click();
 await expect(page.locator('#rc-initial')).toHaveValue('6');
});

test('parallel capacitor example plots selectable numerical traces and preserves project',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await expect(page.locator('.example-card')).toHaveCount(15);
 await page.locator('[data-load-example="rc-parallel"]').click();
 await expect(page.locator('input#name')).toHaveValue('双电容并联 · 300µF 等效');
 await expect(page.locator('button.project-switcher')).toContainText('(2)');
 await expect(page.locator('button[data-action="solver-mode"]')).toContainText('RC 暂态');
 await page.locator('button[data-action="run"]').click();
 await expect(page.locator('.rc-network-panel')).toContainText('多电容 RC · 数值近似');
 await expect(page.locator('.rc-network-curve')).toHaveCount(1);
 await expect(page.locator('#rc-network-current')).toHaveText('—');
 await page.locator('#rc-network-time').evaluate((el:HTMLInputElement)=>{
   el.value='60';el.dispatchEvent(new Event('input',{bubbles:true}));
 });
 const c1=Number((await page.locator('#rc-network-voltage').textContent())?.replace(' V',''));
 expect(c1).toBeGreaterThan(5.6);expect(c1).toBeLessThan(5.8);
 await page.locator('#rc-trace').selectOption('c2');
 const c2=Number((await page.locator('#rc-network-voltage').textContent())?.replace(' V',''));
 expect(Math.abs(c1-c2)).toBeLessThan(.03);
 await page.locator('#rc-window').selectOption('0.1');
 await expect(page.locator('#rc-network-time-value')).toHaveText('0.000');
 await page.locator('#rc-network-time').evaluate((el:HTMLInputElement)=>{
   el.value='100';el.dispatchEvent(new Event('input',{bubbles:true}));
 });
 const early=Number((await page.locator('#rc-network-voltage').textContent())?.replace(' V',''));
 expect(early).toBeLessThan(c2);
 await page.locator('button[data-action="projects"]').click();
 await page.locator('.project-open').filter({hasText:'我的第一个电路'}).click();
 await expect(page.locator('.item[data-part="c2"]')).toHaveCount(0);
});

test('series capacitor numerical traces split voltage evenly',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await page.locator('[data-load-example="rc-series"]').click();
 await page.locator('button[data-action="run"]').click();
 await expect(page.locator('.rc-network-panel')).toContainText('数值近似');
 await page.locator('#rc-network-time').evaluate((el:HTMLInputElement)=>{
   el.value='10';el.dispatchEvent(new Event('input',{bubbles:true}));
 });
 const one=Number((await page.locator('#rc-network-voltage').textContent())?.replace(' V',''));
 expect(one).toBeGreaterThan(2.78);expect(one).toBeLessThan(2.92);
 await page.locator('#rc-trace').selectOption('c2');
 const two=Number((await page.locator('#rc-network-voltage').textContent())?.replace(' V',''));
 expect(Math.abs(one-two)).toBeLessThan(.03);
 await page.locator('.item[data-part="c2"]').click();
 await expect(page.locator('#rc-network-inspector')).toContainText('多电容当前采样');
 const before=await page.evaluate(()=>{
   const p=JSON.parse(localStorage.getItem('circuits-project')||'{}');
   return p.parts.find((part:{id:string})=>part.id==='c2').x;
 });
 await page.locator('#rc-window').focus();
 await page.keyboard.press('ArrowDown');
 const after=await page.evaluate(()=>{
   const p=JSON.parse(localStorage.getItem('circuits-project')||'{}');
   return p.parts.find((part:{id:string})=>part.id==='c2').x;
 });
 expect(after).toBe(before);
});

test('incompatible initial charges display a diagnostic instead of invented waveform',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await page.locator('[data-load-example="rc-parallel"]').click();
 const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 draft.parts.find((p:{id:string})=>p.id==='c2').initialVolts=3;
 await page.locator('#file').setInputFiles({
   name:'conflicting-capacitors.json',
   mimeType:'application/json',
   buffer:Buffer.from(JSON.stringify(draft))
 });
 await page.locator('button[data-action="run"]').click();
 await expect(page.locator('.rc-network-panel')).toContainText('初始电压');
 await expect(page.locator('.rc-network-curve')).toHaveCount(0);
});

test('simulated oscilloscope shows two distinct RC channels, scrubs time and downloads CSV',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await page.locator('[data-load-example="rc-parallel"]').click();
 await page.locator('button[data-action="run"]').click();
 await expect(page.locator('button[data-action="scope-open"]')).toBeEnabled();
 await page.locator('button[data-action="scope-open"]').click();
 const dlg=page.locator('.scope-dialog');
 await expect(dlg).toContainText('模拟示波器');
 await expect(dlg).toContainText('向后欧拉近似');
 await expect(page.locator('.scope-voltage-curve')).toHaveCount(1);
 await expect(page.locator('.scope-current-curve')).toHaveCount(1);
 await expect(page.locator('#scope-current-value')).toHaveText('—');
 await page.locator('#scope-time').evaluate((el:HTMLInputElement)=>{
   el.value='60';el.dispatchEvent(new Event('input',{bubbles:true}));
 });
 const v1=Number((await page.locator('#scope-voltage-value').textContent())?.replace(' V',''));
 expect(v1).toBeGreaterThan(5.6);expect(v1).toBeLessThan(5.9);
 await expect(page.locator('#scope-current-value')).toContainText('mA');
 await page.locator('#scope-channel').selectOption('c2');
 const v2=Number((await page.locator('#scope-voltage-value').textContent())?.replace(' V',''));
 expect(Math.abs(v2-v1)).toBeLessThan(.03);
 const [download]=await Promise.all([
   page.waitForEvent('download'),
   page.locator('[data-action="scope-export"]').click()
 ]);
 expect(download.suggestedFilename()).toBe('circuits-rc-waveform.csv');
 await page.keyboard.press('Escape');
 await expect(dlg).toHaveCount(0);
 await expect(page.locator('.rc-network-panel')).toBeVisible();
});

test('RC circuit voltmeter follows time and detects reversed probes',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await page.locator('[data-load-example="rc-charge"]').click();
 const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 p.parts.push({id:'m1',kind:'multimeter',x:890,y:440,rotation:0});
 p.wires.push(
   {id:'wm1',from:{componentId:'m1',pinId:'positive'},to:{componentId:'c1',pinId:'a'},color:'#48525b'},
   {id:'wm2',from:{componentId:'m1',pinId:'negative'},to:{componentId:'c1',pinId:'b'},color:'#48525b'}
 );
 await page.locator('#file').setInputFiles({name:'rc-meter.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 await page.locator('button[data-action="run"]').click();
 await expect(page.locator('text[data-meter-id="m1"]')).toHaveText('0.00');
 await page.locator('#rc-time').evaluate((el:HTMLInputElement)=>{
   el.value='20';el.dispatchEvent(new Event('input',{bubbles:true}));
 });
 await expect(page.locator('text[data-meter-id="m1"]')).toHaveText('5.69');
 await page.locator('.item[data-part="m1"]').click();
 await expect(page.locator('#rc-meter-inspector')).toContainText('RC 采样电压');
 await expect(page.locator('#rc-meter-inspector')).toContainText('V');
 p.wires[3].to.pinId='b';
 p.wires[4].to.pinId='a';
 await page.locator('#file').setInputFiles({name:'rc-reversed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 await expect(page.locator('text[data-meter-id="m1"]')).toHaveText('0.00');
 await page.locator('#rc-time').evaluate((el:HTMLInputElement)=>{
   el.value='20';el.dispatchEvent(new Event('input',{bubbles:true}));
 });
 await expect(page.locator('text[data-meter-id="m1"]')).toHaveText('-5.69');
});

test('virtual scope controls do not mutate JSON circuits and the Escape key closes its dialog',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await page.locator('[data-load-example="rc-discharge"]').click();
 await page.locator('button[data-action="run"]').click();
 const before=await page.evaluate(()=>localStorage.getItem('circuits-project'));
 await page.locator('button[data-action="scope-open"]').click();
 await expect(page.locator('.scope-dialog')).toBeVisible();
 await expect(page.locator('#scope-current-value')).toContainText('mA');
 await page.locator('#scope-time').evaluate((el:HTMLInputElement)=>{
   el.value='20';el.dispatchEvent(new Event('input',{bubbles:true}));
 });
 await expect(page.locator('#scope-voltage-value')).toHaveText('3.31 V');
 await page.keyboard.press('Escape');
 await expect(page.locator('.scope-dialog')).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.getItem('circuits-project'))).toBe(before);
});

test('one-click RC resistor-voltage sample tracks charge and keeps prior project',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await expect(page.locator('.example-card')).toHaveCount(15);
 await page.locator('[data-load-example="rc-resistor-meter"]').click();
 await expect(page.locator('#name')).toHaveValue('RC 充电 · 万用表测量电阻压降');
 await expect(page.locator('button.project-switcher')).toContainText('(2)');
 await expect(page.locator('button[data-action="solver-mode"]')).toContainText('RC 暂态');
 await page.locator('button[data-action="run"]').click();
 await expect(page.locator('text[data-meter-id="m1"]')).toHaveText('9.00');
 await page.locator('#rc-time').evaluate((el:HTMLInputElement)=>{
   el.value='20';el.dispatchEvent(new Event('input',{bubbles:true}));
 });
 await expect(page.locator('text[data-meter-id="m1"]')).toHaveText('3.31');
 await page.locator('.item[data-part="m1"]').click();
 await expect(page.locator('#rc-meter-inspector')).toContainText('3.311 V');
 await page.locator('button[data-action="projects"]').click();
 await page.locator('.project-open').filter({hasText:'我的第一个电路'}).click();
 await expect(page.locator('.item[data-part="m1"]')).toHaveCount(0);
});

test('multi-cap RC convergence inspection is non-destructive and invalidates on window change',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await page.locator('[data-load-example="rc-parallel"]').click();
 await page.locator('button[data-action="run"]').click();
 const before=await page.evaluate(()=>localStorage.getItem('circuits-project'));
 const panel=page.locator('.rc-network-panel');
 await expect(panel.locator('.rc-convergence')).toHaveCount(0);
 await panel.locator('[data-action="rc-accuracy"]').click();
 await expect(panel.locator('.rc-convergence')).toContainText('数值一致性：通过');
 await expect(panel.locator('.rc-convergence')).toContainText('粗细步长最大电压差');
 await expect(panel.locator('.rc-convergence')).toContainText('不是实际仿真误差上界');
 expect(await page.evaluate(()=>localStorage.getItem('circuits-project'))).toBe(before);
 await panel.locator('#rc-window').selectOption('1');
 await expect(panel.locator('.rc-convergence')).toHaveCount(0);
});
test('a severely under-resolved RC window is flagged rather than marked reliable',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await page.locator('[data-load-example="rc-parallel"]').click();
 const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 p.parts.filter((part:{kind:string})=>part.kind==='capacitor').forEach((part:{value:number})=>{part.value=0.001});
 await page.locator('#file').setInputFiles({name:'fast-rc.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 await page.locator('button[data-action="run"]').click();
 await page.locator('#rc-window').selectOption('10');
 await page.locator('[data-action="rc-accuracy"]').click();
 await expect(page.locator('.rc-convergence')).toContainText('数值一致性：需关注');
 await expect(page.locator('.rc-convergence')).toContainText('缩短时间窗口');
});

test('series current meter is inserted in LED branch with measurable current',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await expect(page.locator('.example-card')).toHaveCount(15);
 await page.locator('[data-load-example="dc-ammeter"]').click();
 await expect(page.locator('button[data-action="solver-mode"]')).toContainText('非线性 DC');
 await expect(page.locator('button.project-switcher')).toContainText('(2)');
 await page.locator('button[data-action="run"]').click();
 const shown=Number(await page.locator('text[data-ammeter-id="i1"]').textContent());
 expect(shown).toBeGreaterThan(0);
 expect(shown).toBeLessThan(30);
 await page.locator('.item[data-part="i1"]').click();
 await expect(page.locator('#ammeter-inspector')).toContainText('非线性 DC 串联电流');
});
test('RC shunt series current changes with time without modifying saved circuit',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await page.locator('[data-load-example="rc-ammeter"]').click();
 await expect(page.locator('button[data-action="solver-mode"]')).toContainText('RC 暂态');
 await page.locator('button[data-action="run"]').click();
 await expect(page.locator('text[data-ammeter-id="i1"]')).toHaveText('9.00');
 const before=await page.evaluate(()=>localStorage.getItem('circuits-project'));
 await page.locator('#rc-time').evaluate((el:HTMLInputElement)=>{
   el.value='20';el.dispatchEvent(new Event('input',{bubbles:true}));
 });
 await expect(page.locator('text[data-ammeter-id="i1"]')).toHaveText('3.31');
 await page.locator('.item[data-part="i1"]').click();
 await expect(page.locator('#ammeter-inspector')).toContainText('RC 串联电流');
 await expect(page.locator('#ammeter-inspector')).toContainText('3.311 mA');
 expect(await page.evaluate(()=>localStorage.getItem('circuits-project'))).toBe(before);
});
test('switch contact resistance is editable and opening it interrupts RC path',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await page.locator('[data-load-example="rc-contact-switch"]').click();
 await page.locator('button[data-action="run"]').click();
 await expect(page.locator('.rc-panel')).toContainText('τ 0.1100 s');
 await page.locator('.item[data-part="s1"]').click();
 await expect(page.locator('#switch-contact')).toHaveValue('100');
 await page.locator('#switch-contact').fill('0');
 await page.locator('#switch-contact').press('Tab');
 await expect(page.locator('.rc-panel')).toContainText('τ 0.1000 s');
 await page.locator('[data-action="toggle-switch"]').click();
 await expect(page.locator('.rc-panel')).toContainText('无法分析');
 await page.locator('[data-action="toggle-switch"]').click();
 await expect(page.locator('.rc-panel')).toContainText('τ 0.1000 s');
});

test('Arduino Blink preview drives only the Uno built-in D13 indicator with time scrubbing',async({page})=>{
 await page.goto('/');
 const previous=await page.evaluate(()=>localStorage.getItem('circuits-project'));
 await page.locator('button[data-action="code"]').click();
 await expect(page.locator('h2')).toContainText('Arduino 代码');
 await page.locator('[data-action="uno-preview-run"]').click();
 await expect(page.locator('#uno-preview')).toContainText('循环周期 2000ms');
 await expect(page.locator('#uno-level')).toHaveText('HIGH');
 await expect(page.locator('.item[data-part="a1"] [data-uno-d13-led]')).toHaveAttribute('fill','#ffca36');
 await page.locator('#uno-time').evaluate((el:HTMLInputElement)=>{
   el.value='1000';el.dispatchEvent(new Event('input',{bubbles:true}));
 });
 await expect(page.locator('#uno-level')).toHaveText('LOW');
 await expect(page.locator('#uno-preview-time')).toHaveText('1000 ms');
 await expect(page.locator('.item[data-part="a1"] [data-uno-d13-led]')).toHaveAttribute('fill','#667f8b');
 await page.locator('#uno-time').evaluate((el:HTMLInputElement)=>{
   el.value='2000';el.dispatchEvent(new Event('input',{bubbles:true}));
 });
 await expect(page.locator('#uno-level')).toHaveText('HIGH');
 await expect(page.locator('#uno-cycle')).toHaveText('2');
 expect(await page.evaluate(()=>localStorage.getItem('circuits-project'))).toBe(previous);
 await page.locator('[data-action="uno-preview-stop"]').click();
 await expect(page.locator('#uno-preview')).toHaveCount(0);
 await expect(page.locator('.item[data-part="a1"] [data-uno-d13-led]')).toHaveAttribute('fill','#667f8b');
});
test('unsupported sketch rejects unsafe instructions and editing invalidates old GPIO preview',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="code"]').click();
 await page.locator('[data-action="uno-preview-run"]').click();
 await expect(page.locator('#uno-level')).toHaveText('HIGH');
 await page.locator('#code').fill('void setup(){pinMode(13,OUTPUT);}void loop(){Serial.begin(9600);delay(1000);}');
 await expect(page.locator('#uno-preview')).toHaveCount(0);
 await expect(page.locator('.item[data-part="a1"] [data-uno-d13-led]')).toHaveAttribute('fill','#667f8b');
 await page.locator('[data-action="uno-preview-run"]').click();
 await expect(page.locator('#uno-preview')).toContainText('不支持');
 await expect(page.locator('#uno-time')).toHaveCount(0);
 await page.reload();
 await page.locator('button[data-action="code"]').click();
 await expect(page.locator('#code')).toContainText('Serial.begin(9600)');
});
test('Arduino D13 preview is explicitly unavailable with no Uno on the canvas',async({page})=>{
 await page.goto('/');
 await page.locator('[data-action="new"]').click();
 await page.locator('button[data-action="code"]').click();
 await page.locator('[data-action="uno-preview-run"]').click();
 await expect(page.locator('#uno-preview')).toContainText('仅支持一块 Arduino Uno');
 await expect(page.locator('#uno-level')).toHaveCount(0);
});

test('external D13 example drives a physically wired LED HIGH/LOW without changing saved project',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await expect(page.locator('.example-card')).toHaveCount(15);
 await page.locator('[data-load-example="gpio-d13-led"]').click();
 await expect(page.locator('input#name')).toHaveValue('Arduino D13 · 外接 LED + 330Ω');
 await expect(page.locator('#code')).toBeVisible();
 const before=await page.evaluate(()=>localStorage.getItem('circuits-project'));
 await page.locator('[data-action="uno-preview-run"]').click();
 await expect(page.locator('#uno-level')).toHaveText('HIGH');
 await expect(page.locator('#gpio-external-status')).toContainText('5V / 25Ω');
 await expect(page.locator('[data-gpio-led-status="l1"]')).toContainText('已点亮');
 const milliAmps=Number((await page.locator('#gpio-drive-current').textContent())?.replace('mA',''));
 expect(milliAmps).toBeGreaterThan(7);expect(milliAmps).toBeLessThan(11);
 await expect(page.locator('.item[data-part="l1"] [data-gpio-glow]')).toHaveAttribute('opacity','0.28');
 await page.locator('#uno-time').evaluate((el:HTMLInputElement)=>{
   el.value='1000';el.dispatchEvent(new Event('input',{bubbles:true}));
 });
 await expect(page.locator('#uno-level')).toHaveText('LOW');
 await expect(page.locator('[data-gpio-led-status="l1"]')).toContainText('熄灭');
 await expect(page.locator('.item[data-part="l1"] [data-gpio-glow]')).toHaveAttribute('opacity','0');
 await page.locator('#uno-time').evaluate((el:HTMLInputElement)=>{
   el.value='2000';el.dispatchEvent(new Event('input',{bubbles:true}));
 });
 await expect(page.locator('#uno-level')).toHaveText('HIGH');
 await expect(page.locator('[data-gpio-led-status="l1"]')).toContainText('已点亮');
 expect(await page.evaluate(()=>localStorage.getItem('circuits-project'))).toBe(before);
 await page.locator('[data-action="uno-preview-stop"]').click();
 await expect(page.locator('[data-gpio-glow]')).toHaveCount(0);
});
test('D13 wiring faults are visible and never falsely glow under missing resistor',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await page.locator('[data-load-example="gpio-d13-led"]').click();
 const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 p.parts=p.parts.filter((part:{id:string})=>part.id!=='r1');
 p.wires=[
   {id:'w1',from:{componentId:'a1',pinId:'d13'},to:{componentId:'l1',pinId:'anode'},color:'#e45454'},
   {id:'w2',from:{componentId:'l1',pinId:'cathode'},to:{componentId:'a1',pinId:'gnd'},color:'#354553'}
 ];
 await page.locator('#file').setInputFiles({name:'unsafe-led.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 await page.locator('[data-action="uno-preview-run"]').click();
 await expect(page.locator('#gpio-external-status')).toContainText('过流');
 await expect(page.locator('#gpio-external-status')).toContainText('20mA');
 await expect(page.locator('.item[data-part="l1"] [data-gpio-glow]')).toHaveAttribute('opacity','0');
 p.wires.pop();
 await page.locator('#file').setInputFiles({name:'disconnected-led.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 await page.locator('[data-action="uno-preview-run"]').click();
 await expect(page.locator('#gpio-external-status')).toContainText('D13 和 GND');
 await expect(page.locator('[data-gpio-led-status="l1"]')).toHaveCount(0);
});
test('editing Arduino source clears previous external GPIO emissions and saved code is preserved',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await page.locator('[data-load-example="gpio-d13-led"]').click();
 await page.locator('[data-action="uno-preview-run"]').click();
 await expect(page.locator('.item[data-part="l1"] [data-gpio-glow]')).toHaveAttribute('opacity','0.28');
 await page.locator('#code').fill('void setup(){pinMode(13,OUTPUT);}void loop(){Serial.begin(9600);delay(1000);}');
 await expect(page.locator('#gpio-external-status')).toHaveCount(0);
 await expect(page.locator('.item[data-part="l1"] [data-gpio-glow]')).toHaveAttribute('opacity','0');
 await page.locator('[data-action="uno-preview-run"]').click();
 await expect(page.locator('#uno-preview')).toContainText('不支持');
 await expect(page.locator('.item[data-part="l1"] [data-gpio-glow]')).toHaveCount(0);
 await page.reload();
 await page.locator('button[data-action="code"]').click();
 await expect(page.locator('#code')).toContainText('Serial.begin(9600)');
});

test('Arduino serial monitor shows deterministic output and supports text export',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await expect(page.locator('.example-card')).toHaveCount(15);
 await page.locator('[data-load-example="uno-serial"]').click();
 await expect(page.locator('#code')).toBeVisible();
 await expect(page.locator('#code')).toContainText('Serial.begin(9600)');
 const before=await page.evaluate(()=>localStorage.getItem('circuits-project'));
 await page.locator('[data-action="uno-preview-run"]').click();
 await expect(page.locator('#uno-preview')).toContainText('串口受限时序预览');
 await expect(page.locator('#uno-level')).toHaveText('未配置');
 await expect(page.locator('#uno-serial-monitor')).toContainText('9600 baud');
 await expect(page.locator('#uno-serial-lines')).toContainText('[0 ms] Serial ready');
 await expect(page.locator('#uno-serial-lines')).toContainText('[0 ms] tick,42');
 await page.locator('#uno-time').evaluate((el:HTMLInputElement)=>{
   el.value='500';el.dispatchEvent(new Event('input',{bubbles:true}));
 });
 await expect(page.locator('#uno-serial-lines')).toContainText('[500 ms] tick,42');
 const [file]=await Promise.all([
   page.waitForEvent('download'),
   page.locator('[data-action="uno-serial-export"]').click()
 ]);
 expect(file.suggestedFilename()).toBe('circuits-serial-monitor.txt');
 expect(await page.evaluate(()=>localStorage.getItem('circuits-project'))).toBe(before);
 await page.locator('[data-action="uno-preview-stop"]').click();
 await expect(page.locator('#uno-serial-monitor')).toHaveCount(0);
});
test('D13 preview and serial output coexist with preserved saved JSON',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await page.locator('[data-load-example="gpio-d13-led"]').click();
 const code=await page.locator('#code').inputValue();
 await page.locator('#code').fill(
   code.replace('pinMode(13, OUTPUT);','pinMode(13, OUTPUT); Serial.begin(9600); Serial.println("boot");')
       .replace('digitalWrite(13, HIGH); delay(1000);',
                'digitalWrite(13, HIGH); Serial.println("HIGH"); delay(1000);')
 );
 const before=await page.evaluate(()=>localStorage.getItem('circuits-project'));
 await page.locator('[data-action="uno-preview-run"]').click();
 await expect(page.locator('#uno-level')).toHaveText('HIGH');
 await expect(page.locator('#uno-serial-lines')).toContainText('boot');
 await expect(page.locator('#uno-serial-lines')).toContainText('HIGH');
 await expect(page.locator('[data-gpio-led-status="l1"]')).toContainText('已点亮');
 await page.locator('#uno-time').evaluate((el:HTMLInputElement)=>{
   el.value='1000';el.dispatchEvent(new Event('input',{bubbles:true}));
 });
 await expect(page.locator('#uno-level')).toHaveText('LOW');
 await expect(page.locator('[data-gpio-led-status="l1"]')).toContainText('熄灭');
 await expect(page.locator('#uno-serial-lines')).toContainText('boot');
 expect(await page.evaluate(()=>localStorage.getItem('circuits-project'))).toBe(before);
});
test('virtual Serial escapes HTML and never executes unsupported expressions',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await page.locator('[data-load-example="uno-serial"]').click();
 const safe='void setup(){Serial.begin(9600);}'+
   'void loop(){Serial.println("<img src=x onerror=alert(1)>");delay(1000);}';
 await page.locator('#code').fill(safe);
 await page.locator('[data-action="uno-preview-run"]').click();
 await expect(page.locator('#uno-serial-lines')).toContainText('<img src=x onerror=alert(1)>');
 await expect(page.locator('#uno-serial-lines img')).toHaveCount(0);
 await page.locator('#code').fill(
   'void setup(){Serial.begin(9600);}void loop(){Serial.println(analogRead(A0));delay(1000);}'
 );
 await expect(page.locator('#uno-serial-monitor')).toHaveCount(0);
 await page.locator('[data-action="uno-preview-run"]').click();
 await expect(page.locator('#uno-preview')).toContainText('不支持');
});

test('static Arduino for loop previews D13 and serial while retaining project JSON',async({page})=>{
 await page.goto('/');
 await page.locator('button[data-action="sample"]').click();
 await expect(page.locator('.example-card')).toHaveCount(15);
 await page.locator('[data-load-example="uno-for-pulse"]').click();
 await expect(page.locator('#code')).toContainText('for (int i = 0; i < 3; i++)');
 const saved=await page.evaluate(()=>localStorage.getItem('circuits-project'));
 await page.locator('[data-action="uno-preview-run"]').click();
 await expect(page.locator('#uno-preview')).toContainText('循环周期 1000ms');
 await expect(page.locator('#uno-level')).toHaveText('HIGH');
 await page.locator('#uno-time').evaluate((el:HTMLInputElement)=>{
   el.value='100';el.dispatchEvent(new Event('input',{bubbles:true}));
 });
 await expect(page.locator('#uno-level')).toHaveText('LOW');
 await page.locator('#uno-time').evaluate((el:HTMLInputElement)=>{
   el.value='400';el.dispatchEvent(new Event('input',{bubbles:true}));
 });
 await expect(page.locator('#uno-level')).toHaveText('HIGH');
 await expect(page.locator('#uno-serial-lines')).toContainText('[400 ms] pulse');
 expect(await page.evaluate(()=>localStorage.getItem('circuits-project'))).toBe(saved);
 await page.locator('#code').fill('void setup(){pinMode(13,OUTPUT);}void loop(){for(;;){delay(1);}}');
 await page.locator('[data-action="uno-preview-run"]').click();
 await expect(page.locator('#uno-preview')).toContainText('不支持');
});

/** Exercise public SVG pointer gestures, not internal project mutation APIs. */
async function dragWireBetween(page:Page,fromSelector:string,toSelector:string){
 const source=await page.locator(fromSelector).boundingBox(),target=await page.locator(toSelector).boundingBox();
 expect(source).not.toBeNull();expect(target).not.toBeNull();
 await page.mouse.move(source!.x+source!.width/2,source!.y+source!.height/2);
 await page.mouse.down();
 await page.mouse.move(target!.x+target!.width/2,target!.y+target!.height/2,{steps:12});
 await expect(page.locator('#wire-preview-path')).toHaveCount(1);
 await page.mouse.up();
}
test('wiring: drag three actual pin-to-pin wires and light a previously disconnected LED circuit',async({page})=>{
 await page.goto('/');
 const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 p.wires=[];
 await page.locator('#file').setInputFiles({name:'unwired.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 await expect(page.locator('.wire')).toHaveCount(0);
 const pin=(part:string,pin:string)=>'.item[data-part="'+part+'"] .pin[data-pin="'+pin+'"]';
 await dragWireBetween(page,pin('b1','positive'),pin('r1','a'));
 await dragWireBetween(page,pin('r1','b'),pin('l1','anode'));
 await dragWireBetween(page,pin('l1','cathode'),pin('b1','negative'));
 await expect(page.locator('.wire')).toHaveCount(3);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 expect(saved.wires).toHaveLength(3);
 expect(saved.wires.map((w:{from:{pinId:string},to:{pinId:string}})=>[w.from.pinId,w.to.pinId])).toEqual([
  ['positive','a'],['b','anode'],['cathode','negative']
 ]);
 await expect(page.locator('#wire-preview')).toHaveCount(0);
 await page.locator('button[data-action="run"]').click();
 await expect(page.locator('.bottom')).toContainText('LED 正常发光');
 await page.reload();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires.length)).toBe(3);
});
test('wiring: click-source, add a world-space elbow, click destination, undo and redo',async({page})=>{
 await page.goto('/');
 const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));p.wires=[];
 await page.locator('#file').setInputFiles({name:'elbow.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 await page.locator('.item[data-part="b1"] .pin[data-pin="positive"]').click();
 await expect(page.locator('#wire-preview-path')).toHaveCount(1);
 await expect(page.locator('[data-action="cancel-wire"]')).toHaveCount(1);
 const point=await page.evaluate(()=>{
  const svg=document.querySelector<SVGSVGElement>('#board')!;
  const scene=document.querySelector<SVGGElement>('#scene')!;
  const p=svg.createSVGPoint();p.x=346;p.y=126;
  const pos=p.matrixTransform(scene.getScreenCTM()!);
  return {x:pos.x,y:pos.y};
 });
 await page.mouse.click(point.x,point.y);
 await expect(page.locator('.wire-preview-bend')).toHaveCount(1);
 await page.locator('.item[data-part="r1"] .pin[data-pin="a"]').click();
 const doc=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 expect(doc.wires).toHaveLength(1);
 expect(doc.wires[0].bends).toEqual([{x:350,y:130}]);
 expect(['horizontal','vertical']).toContain(doc.wires[0].routing);
 await assertManhattan(page,'.wire');
 await expect(page.locator('#wire-preview')).toHaveCount(0);
 await page.locator('[data-action="undo"]').click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires.length)).toBe(0);
 await page.locator('[data-action="redo"]').click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires[0].bends)).toEqual([{x:350,y:130}]);
 await assertManhattan(page,'.wire');
});
test('wiring: zoomed breadboard socket drag, duplicate rejection and explicit cancellation',async({page})=>{
 await page.goto('/');
 const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));p.wires=[];
 await page.locator('#file').setInputFiles({name:'board-wiring.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 await page.locator('[data-action="zoom-in"]').click();
 const source='.item[data-part="b1"] .pin[data-pin="positive"]';
 const hole='.breadboard-sockets[data-part="bb1"] .pin[data-pin="hole-a-1"]';
 await dragWireBetween(page,source,hole);
 await expect(page.locator('.wire')).toHaveCount(1);
 let doc=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 expect(doc.wires[0].to).toEqual({componentId:'bb1',pinId:'hole-a-1'});
 await page.locator(source).click();
 await expect(page.locator('#wire-preview')).toHaveCount(1);
 await page.locator(hole).click();
 await expect(page.locator('.bottom')).toContainText('不能连接');
 doc=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 expect(doc.wires).toHaveLength(1);
 await page.locator(source).click();
 await page.locator('[data-action="cancel-wire"]').click();
 await expect(page.locator('#wire-preview')).toHaveCount(0);
 await page.locator(source).click();
 await page.keyboard.press('Escape');
 await expect(page.locator('#wire-preview')).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires.length)).toBe(1);
});

/** Parse rendered SVG commands; every actual leg of an orthogonal wire must be axis-aligned. */
async function assertManhattan(page:Page,selector:string):Promise<string>{
 const d=await page.locator(selector).getAttribute('d');
 expect(d).toBeTruthy();
 const pattern=/[ML](-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?) (-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)/gi;
 const values=[...d!.matchAll(pattern)].map(x=>({x:Number(x[1]),y:Number(x[2])}));
 expect(values.length).toBeGreaterThanOrEqual(2);
 for(let i=1;i<values.length;i++){
   const dx=Math.abs(values[i].x-values[i-1].x),dy=Math.abs(values[i].y-values[i-1].y);
   expect(Math.min(dx,dy),'non-orthogonal wire segment: '+d).toBeLessThan(1e-6);
 }
 return d!;
}
test('directional wire: explicit button switches a live elbow and the selected route is reversible with undo',async({page})=>{
 await page.goto('/');
 const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));p.wires=[];
 await page.locator('#file').setInputFiles({name:'route-switch.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 const source='.item[data-part="b1"] .pin[data-pin="positive"]';
 const target='.item[data-part="r1"] .pin[data-pin="a"]';
 await page.locator(source).click();
 await expect(page.locator('[data-action="wire-direction"]')).toBeVisible();
 const world=await page.evaluate(()=>{
   const svg=document.querySelector<SVGSVGElement>('#board')!,scene=document.querySelector<SVGGElement>('#scene')!;
   const p=svg.createSVGPoint();p.x=347;p.y=325;
   const screen=p.matrixTransform(scene.getScreenCTM()!);
   return {x:screen.x,y:screen.y};
 });
 await page.mouse.move(world.x,world.y);
 const original=await assertManhattan(page,'#wire-preview-path');
 const labelBefore=await page.locator('[data-action="wire-direction"]').textContent();
 await page.locator('[data-action="wire-direction"]').click();
 const flipped=await assertManhattan(page,'#wire-preview-path');
 expect(flipped).not.toBe(original);
 const labelAfter=await page.locator('[data-action="wire-direction"]').textContent();
 expect(labelAfter).not.toBe(labelBefore);
 await page.locator('[data-action="wire-direction"]').click();
 await page.mouse.move(world.x,world.y);
 expect(await assertManhattan(page,'#wire-preview-path')).toBe(original);
 const targetBox=await page.locator(target).boundingBox();
 expect(targetBox).not.toBeNull();
 await page.mouse.move(targetBox!.x+targetBox!.width/2,targetBox!.y+targetBox!.height/2);
 const committedPreview=await assertManhattan(page,'#wire-preview-path');
 await page.mouse.down();await page.mouse.up();
 const wire=page.locator('.wire').first();
 await expect(wire).toHaveCount(1);
 expect(await assertManhattan(page,'.wire')).toBe(committedPreview);
 const first=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires[0]);
 expect(['horizontal','vertical']).toContain(first.routing);
 const hit=await wire.evaluate((el:SVGPathElement)=>{
   const p=el.getPointAtLength(el.getTotalLength()*0.5),m=el.getScreenCTM()!;
   const svg=el.ownerSVGElement!,q=svg.createSVGPoint();q.x=p.x;q.y=p.y;
   const screen=q.matrixTransform(m);return {x:screen.x,y:screen.y};
 });
 await page.mouse.click(hit.x,hit.y);
 await expect(page.locator('[data-action="wire-flip-direction"]')).toBeVisible();
 await page.locator('[data-action="wire-flip-direction"]').click();
 const changed=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires[0]);
 expect(changed.routing).not.toBe(first.routing);
 expect(changed.from).toEqual(first.from);expect(changed.to).toEqual(first.to);
 expect(changed.id).toBe(first.id);
 await assertManhattan(page,'.wire');
 await page.locator('[data-action="undo"]').click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires[0].routing)).toBe(first.routing);
 await page.locator('[data-action="redo"]').click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires[0].routing)).toBe(changed.routing);
 await page.reload();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires[0].routing)).toBe(changed.routing);
 await assertManhattan(page,'.wire');
});
test('palette: repeated component clicks avoid collisions but manual drag placement still remains explicit',async({page})=>{
 await page.goto('/');
 await page.locator('.topbar [data-action="new"]').click();
 for(let i=0;i<3;i++)await page.locator('.part[data-kind="resistor"]').click();
 const values=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 expect(values.parts).toHaveLength(3);
 expect(values.wires).toHaveLength(0);
 for(let i=0;i<values.parts.length;i++){
   for(let j=i+1;j<values.parts.length;j++){
     const a=values.parts[i],b=values.parts[j];
     expect(a.x+140+18<=b.x||b.x+140+18<=a.x||
       a.y+60+18<=b.y||b.y+60+18<=a.y).toBeTruthy();
   }
 }
});

test('original wire gestures: live alignment guide, red pin snap and green default wire',async({page})=>{
 await page.goto('/');
 const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 draft.wires=[];
 await page.locator('#file').setInputFiles({name:'green-wiring.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(draft))});
 const source=page.locator('.item[data-part="b1"] .pin[data-pin="positive"]');
 const destination=page.locator('.item[data-part="r1"] .pin[data-pin="a"]');
 await source.hover();
 await expect(page.locator('#pin-hover')).toHaveAttribute('opacity','1');
 await expect(page.locator('#pin-hover-label')).toHaveText('positive');
 await source.click();
 await expect(page.locator('#wire-preview-path')).toHaveAttribute('stroke','#35b65d');
 await destination.hover();
 await expect(page.locator('#wire-preview-target')).toHaveAttribute('data-valid','true');
 await expect(page.locator('#wire-preview-target')).toHaveAttribute('data-target-pin','a');
 await expect(page.locator('#wire-target-label text')).toHaveText('a');
 await expect(page.locator('#wire-align-guide')).toHaveCount(1);
 await destination.click();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 expect(saved.wires).toHaveLength(1);
 expect(saved.wires[0].color).toBe('#35b65d');
 expect(saved.wires[0].from).toEqual({componentId:'b1',pinId:'positive'});
 expect(saved.wires[0].to).toEqual({componentId:'r1',pinId:'a'});
 await expect(page.locator('#wire-preview')).toHaveCount(0);
});
test('original shortcuts: R rotates a part; number keys change selected wire colors',async({page})=>{
 await page.goto('/');
 await page.locator('.item[data-part="r1"]').click();
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').parts.find((p:{id:string})=>p.id==='r1').rotation);
 await page.keyboard.press('r');
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').parts.find((p:{id:string})=>p.id==='r1').rotation);
 expect(after).toBe((before+90)%360);
 await page.locator('.wire[data-wire="w1"]').click();
 await page.keyboard.press('1');
 let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires.find((w:{id:string})=>w.id==='w1'));
 expect(saved.color).toBe('#de4747');
 await expect(page.locator('#wire-palette')).toHaveValue('#de4747');
 await page.keyboard.press('0');
 saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires.find((w:{id:string})=>w.id==='w1'));
 expect(saved.color).toBe('#252525');
 await page.locator('#wire-palette').selectOption('#3b86d1');
 saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires.find((w:{id:string})=>w.id==='w1'));
 expect(saved.color).toBe('#3b86d1');
 await page.reload();
 await expect(page.locator('.wire[data-wire="w1"]')).toHaveAttribute('stroke','#3b86d1');
});
test('wire editing: dragging a real wire leg creates orthogonal bends; Delete removes only the selected bend',async({page})=>{
 await page.goto('/');
 const selected=page.locator('.wire[data-wire="w1"]');
 const at=await selected.evaluate((el:SVGPathElement)=>{
   const p=el.getPointAtLength(el.getTotalLength()*0.37);
   const q=el.ownerSVGElement!.createSVGPoint();
   q.x=p.x;q.y=p.y;const s=q.matrixTransform(el.getScreenCTM()!);
   return {x:s.x,y:s.y};
 });
 await page.mouse.move(at.x,at.y);
 await page.mouse.down();
 await page.mouse.move(at.x+34,at.y-68,{steps:12});
 await page.mouse.up();
 await expect(page.locator('.bend-handle[data-selected="true"]')).toHaveCount(1);
 const altered=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 expect(altered.wires).toHaveLength(3);
 expect(altered.wires.find((w:{id:string})=>w.id==='w1').bends).toHaveLength(3);
 await page.keyboard.press('Delete');
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 expect(after.wires).toHaveLength(3);
 expect(after.wires.find((w:{id:string})=>w.id==='w1').bends).toHaveLength(2);
 await page.locator('[data-action="undo"]').click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires.find((w:{id:string})=>w.id==='w1').bends.length)).toBe(3);
 await page.locator('[data-action="redo"]').click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires.find((w:{id:string})=>w.id==='w1').bends.length)).toBe(2);
 await page.locator('[data-action="run"]').click();
 await expect(page.locator('.bottom')).toContainText('LED 正常发光');
});
test('wire editing: selecting and deleting one of multiple existing bend points keeps the wire',async({page})=>{
 await page.goto('/');
 await page.locator('.wire[data-wire="w1"]').dblclick();
 await expect(page.locator('.bend-handle[data-wire="w1"]')).toHaveCount(1);
 const wire=page.locator('.wire[data-wire="w1"]');
 const point=await wire.evaluate((el:SVGPathElement)=>{
   const p=el.getPointAtLength(el.getTotalLength()*0.78);
   const q=el.ownerSVGElement!.createSVGPoint();q.x=p.x;q.y=p.y;
   const s=q.matrixTransform(el.getScreenCTM()!);return {x:s.x,y:s.y};
 });
 await page.mouse.dblclick(point.x,point.y);
 await expect(page.locator('.bend-handle[data-wire="w1"]')).toHaveCount(2);
 await page.locator('.bend-handle[data-wire="w1"][data-bend-index="0"]').click();
 await expect(page.locator('.bend-handle[data-selected="true"]')).toHaveCount(1);
 await page.keyboard.press('Delete');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 expect(saved.wires).toHaveLength(3);
 expect(saved.wires.find((w:{id:string})=>w.id==='w1').bends).toHaveLength(1);
});

test('viewport: blank click deselects while blank drag pans without changing project',async({page})=>{
 await page.goto('/');
 await page.locator('.item[data-part="r1"]').click();
 await expect(page.locator('.item[data-part="r1"]')).toHaveClass(/selected/);
 const at=await page.evaluate(()=>{
   const scene=document.querySelector<SVGGElement>('#scene')!;
   const svg=document.querySelector<SVGSVGElement>('#board')!;
   const p=svg.createSVGPoint();p.x=1040;p.y=90;
   const point=p.matrixTransform(scene.getScreenCTM()!);
   return {x:point.x,y:point.y};
 });
 await page.mouse.click(at.x,at.y);
 await expect(page.locator('.item.selected')).toHaveCount(0);
 await page.locator('.item[data-part="r1"]').click();
 await expect(page.locator('.item[data-part="r1"]')).toHaveClass(/selected/);
 const stored=await page.evaluate(()=>localStorage.getItem('circuits-project'));
 const original=await page.locator('#scene').getAttribute('transform');
 await page.mouse.move(at.x,at.y);
 await page.mouse.down();
 await page.mouse.move(at.x+68,at.y+42,{steps:10});
 await page.mouse.up();
 expect(await page.locator('#scene').getAttribute('transform')).not.toBe(original);
 await expect(page.locator('.item[data-part="r1"]')).toHaveClass(/selected/);
 expect(await page.evaluate(()=>localStorage.getItem('circuits-project'))).toBe(stored);
});

/** Project-level overlap fixture: a wire is visibly routed over the board body. */
async function loadBoardSurfaceWire(page:Page,withOverlaidResistor=false){
 const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 p.wires=[{
   id:'surface1',from:{componentId:'b1',pinId:'positive'},
   to:{componentId:'bb1',pinId:'hole-a-8'},color:'#35b65d',
   bends:withOverlaidResistor?
     [{x:595,y:560},{x:680,y:560},{x:810,y:560}]:
     [{x:595,y:560},{x:810,y:560}]
 }];
 if(withOverlaidResistor){
   const r=p.parts.find((x:{id:string})=>x.id==='r1');
   r.x=620;r.y=530;
 }
 await page.locator('#file').setInputFiles({
   name:'surface-wire.json',mimeType:'application/json',
   buffer:Buffer.from(JSON.stringify(p))
 });
}
async function topOfWorld(page:Page,x:number,y:number){
 return page.evaluate(({x,y})=>{
   const svg=document.querySelector<SVGSVGElement>('#board')!;
   const scene=document.querySelector<SVGGElement>('#scene')!;
   const p=svg.createSVGPoint();p.x=x;p.y=y;
   const screen=p.matrixTransform(scene.getScreenCTM()!);
   const hit=document.elementFromPoint(screen.x,screen.y);
   return {x:screen.x,y:screen.y,wire:hit?.getAttribute('data-wire'),
     bend:hit?.getAttribute('data-bend-index'),
     closestPart:hit?.closest('[data-part]')?.getAttribute('data-part')??null,
     className:hit?.getAttribute('class')??''};
 },{x,y});
}
test('Z order: breadboard substrate is under conductors; real sockets stay above wires',async({page})=>{
 await page.goto('/');
 await loadBoardSurfaceWire(page);
 const scene=page.locator('#scene');
 const rendered=await scene.evaluate(el=>{
   const layers=Array.from(el.children).map(x=>x.getAttribute('data-layer'));
   const inLayer=(selector:string)=>document.querySelector(selector)?.closest('[data-layer]')?.getAttribute('data-layer');
   return {layers,board:inLayer('.item[data-part="bb1"]'),
     conductor:inLayer('.wire[data-wire="surface1"]'),
     holes:inLayer('.breadboard-sockets[data-part="bb1"] .pin'),
     resistor:inLayer('.item[data-part="r1"]'),
     parts:document.querySelectorAll('.item[data-part]').length,
     sockets:document.querySelectorAll('.breadboard-sockets[data-part="bb1"] .pin').length};
 });
 expect(rendered.layers).toEqual(['substrate','wires','board-sockets','components','wire-controls','overlays']);
 const sublayers=await page.locator('[data-layer="wires"]').evaluate(root=>
   Array.from(root.children).map(child=>child.getAttribute('data-wire-sublayer')));
 expect(sublayers).toEqual(['hit-targets','conductors']);
 expect(rendered).toMatchObject({board:'substrate',conductor:'wires',
   holes:'board-sockets',resistor:'components',parts:5,sockets:308});
 const crossing=await topOfWorld(page,643,560);
 expect(crossing.wire).toBe('surface1');
 expect(crossing.closestPart).toBeNull();
 await page.mouse.click(crossing.x,crossing.y);
 await expect(page.locator('.endpoint-handle[data-wire="surface1"]')).toHaveCount(2);
 // Even next to the painted conductor, the actual socket wins at its own center.
 const socket=page.locator('.breadboard-sockets[data-part="bb1"] .pin[data-pin="hole-c-9"]');
 await socket.hover();
 await expect(page.locator('#pin-hover-label')).toHaveText('hole-c-9');
 await socket.click();
 await expect(page.locator('#wire-preview-path')).toHaveCount(1);
 await page.locator('.item[data-part="b1"] .pin[data-pin="negative"]').click();
 await expect(page.locator('.wire')).toHaveCount(2);
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 expect(stored.wires.find((w:{id:string})=>w.id==='surface1').bends).toHaveLength(2);
 expect(stored.wires.find((w:{id:string})=>w.id!=='surface1').from).toEqual({componentId:'bb1',pinId:'hole-c-9'});
 await page.reload();
 await expect(page.locator('.wire')).toHaveCount(2);
 expect((await topOfWorld(page,643,560)).wire).toBe('surface1');
});
test('Z order: plugged-in resistor stays above wire, selected bend handle stays above both',async({page})=>{
 await page.goto('/');
 await loadBoardSurfaceWire(page,true);
 const covered=await topOfWorld(page,700,560);
 expect(covered.closestPart).toBe('r1');
 expect(covered.wire).toBeNull();
 const exposed=await topOfWorld(page,605,560);
 expect(exposed.wire).toBe('surface1');
 await page.mouse.click(exposed.x,exposed.y);
 await expect(page.locator('.bend-handle[data-wire="surface1"]')).toHaveCount(3);
 const anchor=await topOfWorld(page,680,560);
 expect(anchor.bend).toBe('1');
 expect(anchor.wire).toBe('surface1');
 await page.mouse.click(anchor.x,anchor.y);
 await page.keyboard.press('Delete');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 expect(saved.wires).toHaveLength(1);
 expect(saved.wires[0].bends).toEqual([{x:595,y:560},{x:810,y:560}]);
 await page.locator('[data-action="undo"]').click();
 await expect(page.locator('.wire[data-wire="surface1"]')).toHaveCount(1);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires[0].bends.length)).toBe(3);
});
test('Z order: zoomed board pin drag and wire selection do not mutate netlist on viewport moves',async({page})=>{
 await page.goto('/');
 await loadBoardSurfaceWire(page);
 const baseline=await page.evaluate(()=>localStorage.getItem('circuits-project'));
 await page.locator('[data-action="zoom-in"]').click();
 const socket=page.locator('.breadboard-sockets[data-part="bb1"] .pin[data-pin="hole-d-6"]');
 await expect(socket).toBeVisible();
 await socket.hover();
 await expect(page.locator('#pin-hover-label')).toHaveText('hole-d-6');
 await page.locator('[data-action="zoom-out"]').click();
 expect(await page.evaluate(()=>localStorage.getItem('circuits-project'))).toBe(baseline);
 const crossing=await topOfWorld(page,643,560);
 await page.mouse.move(crossing.x,crossing.y);
 await expect(page.locator('#pin-hover')).toHaveAttribute('opacity','0');
 expect((await topOfWorld(page,643,560)).wire).toBe('surface1');
});

async function loadSingleRoutedWire(page:Page,legacyDiagonal=false){
 const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 p.wires=[{id:'w1',from:{componentId:'b1',pinId:'positive'},
   to:{componentId:'r1',pinId:'a'},color:'#35b65d',
   ...(legacyDiagonal?{bends:[{x:310,y:340}]}:{routing:'horizontal'})}];
 await page.locator('#file').setInputFiles({
   name:'segment-slide.json',mimeType:'application/json',
   buffer:Buffer.from(JSON.stringify(p))
 });
}
async function screenFromWorld(page:Page,x:number,y:number){
 return page.evaluate(({x,y})=>{
   const scene=document.querySelector<SVGGElement>('#scene')!;
   const svg=document.querySelector<SVGSVGElement>('#board')!;
   const q=svg.createSVGPoint();q.x=x;q.y=y;
   const s=q.matrixTransform(scene.getScreenCTM()!);
   return {x:s.x,y:s.y};
 },{x,y});
}
test('segment slide: horizontal leg moves only vertically, preserves terminals and undo is atomic',async({page})=>{
 await page.goto('/');await loadSingleRoutedWire(page);
 const origin=await screenFromWorld(page,255,208);
 const target=await screenFromWorld(page,470,268); // large parallel move is ignored
 await page.mouse.move(origin.x,origin.y);
 await expect(page.locator('.wire[data-wire="w1"]')).toHaveCSS('cursor','ns-resize');
 await page.mouse.down();
 await page.mouse.move(target.x,target.y,{steps:12});
 await page.mouse.up();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}'));
 expect(saved.wires).toHaveLength(1);
 const moved=saved.wires[0];
 expect(moved.from).toEqual({componentId:'b1',pinId:'positive'});
 expect(moved.to).toEqual({componentId:'r1',pinId:'a'});
 expect(moved.id).toBe('w1');expect(moved.color).toBe('#35b65d');
 expect(moved.routing).toBe('horizontal');
 expect(moved.bends).toEqual([{x:190,y:268},{x:430,y:268}]);
 await assertManhattan(page,'.wire[data-wire="w1"]');
 await page.locator('[data-action="undo"]').click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires[0].bends)).toBeUndefined();
 await page.locator('[data-action="redo"]').click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires[0].bends)).toEqual(moved.bends);
 await page.reload();
 await assertManhattan(page,'.wire[data-wire="w1"]');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires[0].bends)).toEqual(moved.bends);
});
test('segment slide: vertical leg moves only horizontally at changed zoom',async({page})=>{
 await page.goto('/');await loadSingleRoutedWire(page);
 await page.locator('[data-action="zoom-in"]').click();
 const origin=await screenFromWorld(page,430,225);
 const target=await screenFromWorld(page,490,345);
 await page.mouse.move(origin.x,origin.y);
 await expect(page.locator('.wire[data-wire="w1"]')).toHaveCSS('cursor','ew-resize');
 await page.mouse.down();
 await page.mouse.move(target.x,target.y,{steps:12});
 await page.mouse.up();
 const moved=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires[0]);
 expect(moved.bends).toEqual([{x:490,y:208},{x:490,y:245}]);
 expect(moved.routing).toBe('horizontal');
 await assertManhattan(page,'.wire[data-wire="w1"]');
});
test('segment slide: parallel-only movement does not create points or undo history',async({page})=>{
 await page.goto('/');await loadSingleRoutedWire(page);
 const before=await page.evaluate(()=>localStorage.getItem('circuits-project'));
 const origin=await screenFromWorld(page,255,208);
 const target=await screenFromWorld(page,285,208);
 await page.mouse.move(origin.x,origin.y);await page.mouse.down();
 await page.mouse.move(target.x,target.y,{steps:8});await page.mouse.up();
 expect(await page.evaluate(()=>localStorage.getItem('circuits-project'))).toBe(before);
 await expect(page.locator('.bend-handle')).toHaveCount(0);
});
test('segment slide: Escape cancels an in-flight slide without saving any changes',async({page})=>{
 await page.goto('/');await loadSingleRoutedWire(page);
 const before=await page.evaluate(()=>localStorage.getItem('circuits-project'));
 const origin=await screenFromWorld(page,250,208);
 const target=await screenFromWorld(page,270,278);
 await page.mouse.move(origin.x,origin.y);await page.mouse.down();
 await page.mouse.move(target.x,target.y,{steps:8});
 await expect(page.locator('.bend-handle')).toHaveCount(2);
 await page.keyboard.press('Escape');
 await page.mouse.up();
 expect(await page.evaluate(()=>localStorage.getItem('circuits-project'))).toBe(before);
 await expect(page.locator('.bend-handle')).toHaveCount(0);
 await assertManhattan(page,'.wire[data-wire="w1"]');
});
test('segment slide: old diagonal wires remain freely editable, never silently converted',async({page})=>{
 await page.goto('/');await loadSingleRoutedWire(page,true);
 const origin=await screenFromWorld(page,250,274);
 const target=await screenFromWorld(page,270,300);
 await page.mouse.move(origin.x,origin.y);await page.mouse.down();
 await page.mouse.move(target.x,target.y,{steps:10});await page.mouse.up();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires[0]);
 expect(saved.routing).toBeUndefined();
 expect(saved.bends).toHaveLength(2);
 expect(saved.from).toEqual({componentId:'b1',pinId:'positive'});
 expect(saved.to).toEqual({componentId:'r1',pinId:'a'});
 await page.locator('[data-action="undo"]').click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')||'{}').wires[0].bends)).toEqual([{x:310,y:340}]);
});
