import {test,expect,type Page} from '@playwright/test';
const snapshot=(page:Page)=>page.evaluate(()=>localStorage.getItem('circuits-project'));
const part=(page:Page,id:string)=>page.evaluate(id=>{
 const p=JSON.parse(localStorage.getItem('circuits-project')!);
 return p.parts.find((item:{id:string})=>item.id===id);
},id);

test('single selected component shows contextual properties without resizing SVG canvas',async({page})=>{
 await page.goto('/');
 const before=await snapshot(page);
 const canvas=page.locator('.canvas');
 const width=await canvas.evaluate(el=>el.getBoundingClientRect().width);
 await page.locator('.item[data-part="r1"]').click();
 const quick=page.locator('.quick-properties[data-quick-for="r1"]');
 await expect(quick).toBeVisible();
 await expect(page.locator('.inspector #value')).toHaveValue('330');
 await expect(quick.locator('[data-quick-field="value"]')).toHaveValue('330');
 expect(await canvas.evaluate(el=>el.getBoundingClientRect().width)).toBe(width);
 expect(await snapshot(page)).toBe(before);
 const [box,stage]=await Promise.all([quick.boundingBox(),canvas.boundingBox()]);
 expect(box).not.toBeNull();expect(stage).not.toBeNull();
 expect(box!.x).toBeGreaterThanOrEqual(stage!.x);
 expect(box!.x+box!.width).toBeLessThanOrEqual(stage!.x+stage!.width+1);
 expect(box!.y).toBeGreaterThanOrEqual(stage!.y);
 expect(box!.y+box!.height).toBeLessThanOrEqual(stage!.y+stage!.height+1);
});

test('quick property editing reuses canonical validation and one undo entry',async({page})=>{
 await page.goto('/');
 await page.locator('.item[data-part="r1"]').click();
 await page.locator('.quick-properties [data-quick-field="value"]').fill('470');
 await page.locator('.quick-properties [data-quick-field="value"]').press('Tab');
 await expect(page.locator('.inspector #value')).toHaveValue('470');
 expect((await part(page,'r1')).value).toBe(470);
 await page.locator('[data-action="undo"]').click();
 expect((await part(page,'r1')).value).toBe(330);
 await page.locator('[data-action="redo"]').click();
 expect((await part(page,'r1')).value).toBe(470);
});

test('LED floating selector, rotate, and close are wired to real project state',async({page})=>{
 await page.goto('/');
 await page.locator('.item[data-part="l1"]').click();
 await expect(page.locator('.quick-properties [data-quick-field="led-color"]')).toHaveValue('red');
 await page.locator('.quick-properties [data-quick-field="led-color"]').selectOption('green');
 expect((await part(page,'l1')).ledColor).toBe('green');
 await expect(page.locator('.inspector #led-color')).toHaveValue('green');
 await page.locator('.quick-properties [data-action="rotate"]').click();
 expect((await part(page,'l1')).rotation).toBe(90);
 await page.locator('.quick-heading [data-action="parts"]').click();
 await expect(page.locator('.quick-properties')).toHaveCount(0);
 await expect(page.locator('#component-category')).toBeVisible();
});

test('multi-selection and schematic modal suppress quick card; tablet stays bounded',async({page})=>{
 await page.setViewportSize({width:1024,height:768});
 await page.goto('/');
 await page.locator('.item[data-part="r1"]').click();
 await expect(page.locator('.quick-properties')).toBeVisible();
 await page.locator('.item[data-part="l1"]').click({modifiers:['Shift']});
 await expect(page.locator('.quick-properties')).toHaveCount(0);
 await page.locator('.item[data-part="b1"]').click();
 await expect(page.locator('.quick-properties[data-quick-for="b1"]')).toBeVisible();
 await page.locator('[data-action="schematic-open"]').click();
 await expect(page.locator('.quick-properties')).toHaveCount(0);
 await page.keyboard.press('Escape');
 await expect(page.locator('.quick-properties')).toBeVisible();
 const [card,canvas]=await Promise.all([page.locator('.quick-properties').boundingBox(),page.locator('.canvas').boundingBox()]);
 expect(card).not.toBeNull();expect(canvas).not.toBeNull();
 expect(card!.x).toBeGreaterThanOrEqual(canvas!.x);
 expect(card!.x+card!.width).toBeLessThanOrEqual(canvas!.x+canvas!.width+1);
});

test('quick switch uses a unique action, toggles the real circuit, and retains right-inspector control',async({page})=>{
 await page.goto('/');
 const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
 p.parts.push({id:'qs1',kind:'switch',x:510,y:100,rotation:0,closed:false});
 await page.locator('#file').setInputFiles({
  name:'quick-switch.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))
 });
 await page.locator('.item[data-part="qs1"]').click();
 await expect(page.locator('.quick-properties [data-action="quick-toggle-switch"]')).toHaveCount(1);
 await expect(page.locator('.inspector [data-action="toggle-switch"]')).toHaveCount(1);
 await page.locator('.quick-properties [data-action="quick-toggle-switch"]').click();
 const switched=await part(page,'qs1');
 expect(switched.closed).toBe(true);
 await page.locator('[data-action="undo"]').click();
 expect((await part(page,'qs1')).closed).toBe(false);
});


test('single selected wire exposes contextual type/direction without changing electrical endpoints',async({page})=>{
 await page.goto('/');
 const original=JSON.parse((await snapshot(page))!);
 await page.locator('.wire[data-wire="w1"]').click();
 const quick=page.locator('.quick-wire-properties[data-quick-wire-for="w1"]');
 await expect(quick).toBeVisible();
 await expect(quick.locator('[data-quick-field="wire-type"]')).toHaveValue('normal');
 await quick.locator('[data-quick-field="wire-type"]').selectOption('hookup');
 let saved=JSON.parse((await snapshot(page))!);
 expect(saved.wires[0].type).toBe('hookup');
 expect(saved.wires[0].from).toEqual(original.wires[0].from);
 expect(saved.wires[0].to).toEqual(original.wires[0].to);
 await page.locator('.quick-wire-properties [data-action="quick-wire-flip-direction"]').click();
 saved=JSON.parse((await snapshot(page))!);
 expect(saved.wires[0].routing).toBe('horizontal');
 expect(saved.wires[0].from).toEqual(original.wires[0].from);
 expect(saved.wires[0].to).toEqual(original.wires[0].to);
 await page.locator('[data-action="undo"]').click();
 saved=JSON.parse((await snapshot(page))!);
 expect(saved.wires[0].routing).toBeUndefined();
 expect(saved.wires[0].type).toBe('hookup');
 await page.locator('[data-action="undo"]').click();
 expect(JSON.parse((await snapshot(page))!).wires).toEqual(original.wires);
});

test('floating wire inspector leaves Shift batch selection and native keyboard shortcuts intact',async({page})=>{
 await page.goto('/');
 await page.locator('.wire[data-wire="w1"]').click();
 await expect(page.locator('.quick-wire-properties')).toBeVisible();
 await page.locator('.wire[data-wire="w2"]').click({modifiers:['Shift']});
 await expect(page.locator('.quick-wire-properties')).toHaveCount(0);
 await expect(page.locator('.inspector')).toContainText('已选中 2 根导线');
 await page.locator('#wire-type').selectOption('alligator');
 const p=JSON.parse((await snapshot(page))!);
 expect(p.wires[0].type).toBe('alligator');
 expect(p.wires[1].type).toBe('alligator');
});

test('tablet quick-property panel keeps adjacent component hit targets available',async({page})=>{
 await page.setViewportSize({width:1024,height:768});
 await page.goto('/');
 await page.locator('.item[data-part="r1"]').click();
 await expect(page.locator('.quick-properties[data-quick-for="r1"]')).toBeVisible();
 const info=await page.evaluate(()=>{
   const asRect=(el:Element|null)=>{
     if(!el)return null;
     const r=el.getBoundingClientRect();
     return {x:Math.round(r.x),y:Math.round(r.y),
       width:Math.round(r.width),height:Math.round(r.height)};
   };
   const target=document.querySelector('.item[data-part="l1"]');
   const rect=target?.getBoundingClientRect();
   const center=rect?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:null;
   const at=center?document.elementFromPoint(center.x,center.y):null;
   const owning=at?.closest('.item[data-part]')?.getAttribute('data-part')??null;
   const overlay=at?.closest('.quick-properties')?.getAttribute('data-quick-for')??null;
   const stage=document.querySelector('.canvas');
   return {
     stage:asRect(stage),
     popover:asRect(document.querySelector('.quick-properties')),
     resistor:asRect(document.querySelector('.item[data-part="r1"]')),
     led:asRect(target),
     battery:asRect(document.querySelector('.item[data-part="b1"]')),
     center,element:at?.tagName??null,owning,overlay
   };
 });
 if(info.owning!=='l1')console.log('TABLET_QUICK_HIT_DIAGNOSTIC '+JSON.stringify(info));
 expect(info.owning,'Selected resistor popover must not intercept LED hit; geometry is logged above').toBe('l1');
});


test('single-part quick inspector leaves neighboring physical terminal hit regions usable',async({page})=>{
 await page.setViewportSize({width:1024,height:768});
 await page.goto('/');
 await page.locator('.item[data-part="r1"]').click();
 await expect(page.locator('.quick-properties[data-quick-for="r1"]')).toBeVisible();
 const inspect=await page.evaluate(()=>{
   const pins=Array.from(document.querySelectorAll<SVGCircleElement>(
     '.item[data-part="l1"] .pin-hit,.item[data-part="b1"] .pin-hit'));
   return pins.map(pin=>{
     const r=pin.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
     const at=document.elementFromPoint(x,y);
     return {part:pin.getAttribute('data-part'),pin:pin.getAttribute('data-pin'),
       intercepted:!!at?.closest('.quick-properties')};
   });
 });
 expect(inspect.length).toBeGreaterThanOrEqual(4);
 expect(inspect.filter(p=>p.intercepted),'quick panel cannot steal a terminal activation center')
   .toEqual([]);
});

test('wire quick properties keep endpoint and bend handles clickable in tablet viewport',async({page})=>{
 await page.setViewportSize({width:1024,height:768});
 await page.goto('/');
 await page.locator('.wire[data-wire="w1"]').click();
 const card=page.locator('.quick-wire-properties[data-quick-wire-for="w1"]');
 await expect(card).toBeVisible();
 const check=await page.evaluate(()=>{
   const handles=Array.from(document.querySelectorAll<SVGCircleElement>(
     '.endpoint-handle[data-wire="w1"]'));
   return handles.map(handle=>{
     const r=handle.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
     const at=document.elementFromPoint(x,y);
     return {end:handle.getAttribute('data-wire-end'),
       cardIntercepts:!!at?.closest('.quick-properties'),
       hitHandle:at===handle||!!at?.closest('.endpoint-handle')};
   });
 });
 expect(check).toHaveLength(2);
 expect(check.filter(x=>x.cardIntercepts)).toEqual([]);
});
