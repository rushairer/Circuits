import { test, expect } from '@playwright/test';

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
 await expect(page.locator('.example-card')).toHaveCount(13);
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
 await expect(page.locator('.example-card')).toHaveCount(13);
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
 await expect(page.locator('.example-card')).toHaveCount(13);
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
 await expect(page.locator('.example-card')).toHaveCount(13);
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
 await expect(page.locator('.example-card')).toHaveCount(13);
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
