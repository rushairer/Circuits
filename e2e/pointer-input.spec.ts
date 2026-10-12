import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test.use({ hasTouch: true });
type XY = {x:number; y:number};
const saved = (page:Page) => page.evaluate(() => JSON.parse(localStorage.getItem('circuits-project')!));
const at = async (page:Page, selector:string):Promise<XY> => {
  const box = await page.locator(selector).boundingBox();
  expect(box).not.toBeNull();
  return {x:box!.x+box!.width/2, y:box!.y+box!.height/2};
};
const pin = (id:string, name:string) => `.item[data-part="${id}"] .pin[data-pin="${name}"]`;
async function send(page:Page, phase:string, point:XY, type='touch', id=41, primary=true) {
  await page.evaluate(({phase,point,type,id,primary}) => {
    // Move/up deliberately target the capture root rather than the release pin.
    const target = phase === 'pointerdown' ? document.elementFromPoint(point.x,point.y) : document.querySelector('#app');
    if (!target) throw new Error('Missing pointer test target');
    target.dispatchEvent(new PointerEvent(phase, {bubbles:true, cancelable:true,
      clientX:point.x, clientY:point.y, pointerType:type, pointerId:id, isPrimary:primary,
      button:phase==='pointermove'?-1:0, buttons:/up|cancel/.test(phase)?0:1}));
  }, {phase,point,type,id,primary});
}
async function boot(page:Page) {
  await page.goto('/');
  await expect(page).toHaveTitle(/Circuits/);
  await expect(page.locator('#board')).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
}

test('native touch taps connect exactly once and native toolbar taps still work', async({page},info) => {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await boot(page);
  const before=await saved(page), from=await at(page,pin('b1','negative')), to=await at(page,pin('r1','b'));
  await page.touchscreen.tap(from.x,from.y);
  await page.touchscreen.tap(to.x,to.y);
  const after=await saved(page);
  expect(after.wires).toHaveLength(before.wires.length+1);
  expect(after.wires.at(-1).from).toEqual({componentId:'b1',pinId:'negative'});
  expect(after.wires.at(-1).to).toEqual({componentId:'r1',pinId:'b'});
  await mkdir('/tmp/circuits-pointer-evidence',{recursive:true});
  await page.screenshot({path:`/tmp/circuits-pointer-evidence/${info.project.name}-touch-wire.png`});
  const undo=await at(page,'.topbar [data-action="undo"]');
  await page.touchscreen.tap(undo.x,undo.y);
  expect(await saved(page)).toEqual(before);
  expect(errors).toEqual([]);
});

for (const type of ['touch','pen']) {
  test(`${type} captured pin drag resolves actual release pin and one undo`, async({page}) => {
    await boot(page);const before=await saved(page);
    await page.locator('[data-action="zoom-out"]').click();
    const from=await at(page,pin('b1','negative')), to=await at(page,pin('r1','b'));
    await send(page,'pointerdown',from,type);
    await send(page,'pointermove',to,type);
    expect(await saved(page)).toEqual(before);
    await send(page,'pointerup',to,type);
    const after=await saved(page);
    expect(after.wires).toHaveLength(before.wires.length+1);
    expect(after.wires.at(-1).to).toEqual({componentId:'r1',pinId:'b'});
    await page.keyboard.press('ControlOrMeta+z');expect(await saved(page)).toEqual(before);
  });
  test(`${type} part drag commits final up coordinates, unrelated pointers cannot finish it`, async({page}) => {
    await boot(page);const before=await saved(page), start=await at(page,'.item[data-part="r1"]');
    const end={x:start.x+56,y:start.y+24};
    await send(page,'pointerdown',start,type);
    await send(page,'pointermove',end,'touch',99,false);
    await send(page,'pointerup',end,'touch',99,false);
    expect(await saved(page)).toEqual(before);
    // No owned move event: final sample must still be applied before commit.
    await send(page,'pointerup',end,type);
    const after=await saved(page);
    expect(after.parts.find((p:{id:string})=>p.id==='r1').x).not.toBe(before.parts.find((p:{id:string})=>p.id==='r1').x);
    expect(after.wires.map((w:{from:unknown;to:unknown})=>[w.from,w.to])).toEqual(before.wires.map((w:{from:unknown;to:unknown})=>[w.from,w.to]));
    await page.keyboard.press('ControlOrMeta+z');expect(await saved(page)).toEqual(before);
  });
}

for (const reason of ['pointercancel','Escape','blur','lostpointercapture']) {
  for (const kind of ['part','bend']) {
    test(`${reason} restores ${kind} preview without an undo entry or stale later up`, async({page}) => {
      await boot(page);
      if (kind==='bend') {
        await page.locator('.wire[data-wire="w1"]').click();
        await page.locator('[data-action="wire-add-bend"]').click();
      }
      const selector=kind==='part'?'.item[data-part="r1"]':'.bend-handle[data-wire="w1"]';
      const before=await saved(page), start=await at(page,selector), end={x:start.x+53,y:start.y+34};
      const markup=await page.locator(selector).first().getAttribute(kind==='part'?'transform':'cx');
      await send(page,'pointerdown',start);
      await send(page,'pointermove',end);
      expect(await page.locator(selector).first().getAttribute(kind==='part'?'transform':'cx')).not.toBe(markup);
      if(reason==='Escape') await page.keyboard.press('Escape');
      else if(reason==='blur') await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
      else await send(page,reason,end);
      await send(page,'pointerup',end);
      expect(await saved(page)).toEqual(before);
      expect(await page.locator(selector).first().getAttribute(kind==='part'?'transform':'cx')).toBe(markup);
      if(kind==='part') await expect(page.locator('.topbar [data-action="undo"]')).toBeDisabled();
      else {
        await page.keyboard.press('ControlOrMeta+z');
        expect((await saved(page)).wires.find((w:{id:string})=>w.id==='w1').bends).toBeUndefined();
      }
    });
  }
}

test('second contact cancels a part preview, blocks both lift orders and permits a fresh drag',async({page})=>{
  await boot(page);
  for(const order of [[41,42],[42,41]]){
    const before=await saved(page), start=await at(page,'.item[data-part="r1"]'), end={x:start.x+57,y:start.y+26};
    await send(page,'pointerdown',start);await send(page,'pointermove',end);
    await send(page,'pointerdown',{x:start.x,y:start.y+120},'touch',42,false);
    for(const id of order) await send(page,'pointerup',end,'touch',id,id===41);
    expect(await saved(page)).toEqual(before);
    await expect(page.locator('.topbar [data-action="undo"]')).toBeDisabled();
    await send(page,'pointerdown',start,'pen',51);await send(page,'pointerup',end,'pen',51);
    expect(await saved(page)).not.toEqual(before);
    await page.keyboard.press('ControlOrMeta+z');expect(await saved(page)).toEqual(before);
  }
});

test('second contact cannot complete a draft, and release outside the canvas cannot wire',async({page})=>{
  await boot(page);const before=await saved(page), from=await at(page,pin('b1','negative')), to=await at(page,pin('r1','b'));
  await send(page,'pointerdown',from);await send(page,'pointermove',to);
  await send(page,'pointerdown',to,'touch',42,false);
  await send(page,'pointerup',to);await send(page,'pointerup',to,'touch',42,false);
  expect(await saved(page)).toEqual(before);
  const toolbar=await at(page,'.topbar [data-action="code"]');
  await send(page,'pointerdown',from);await send(page,'pointermove',to);await send(page,'pointerup',toolbar);
  expect(await saved(page)).toEqual(before);
  await expect(page.locator('.topbar [data-action="undo"]')).toBeDisabled();
});

test('touch tap jitter does not move a component or create history',async({page})=>{
  await boot(page);const before=await saved(page), from=await at(page,'.item[data-part="r1"]');
  const to={x:from.x+5,y:from.y+2};
  await send(page,'pointerdown',from);await send(page,'pointermove',to);await send(page,'pointerup',to);
  expect(await saved(page)).toEqual(before);
  await expect(page.locator('.topbar [data-action="undo"]')).toBeDisabled();
  await expect(page.locator('.item[data-part="r1"]')).toHaveAttribute('aria-pressed','true');
});

test('native Chromium touch and pen capture survives scene replacement',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Native drag injection is Chromium CDP; other engines run the shared pointer traces and native taps.');
  await boot(page);const cdp=await page.context().newCDPSession(page);
  for(const type of ['touch','pen']){
    const before=await saved(page), from=await at(page,pin('b1','negative')), to=await at(page,pin('r1','b'));
    if(type==='touch'){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...to,id:1}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else{
      await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...from,button:'left',buttons:1,clickCount:1,pointerType:'pen'});
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...to,button:'none',buttons:1,pointerType:'pen'});
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...to,button:'left',buttons:0,clickCount:1,pointerType:'pen'});
    }
    expect((await saved(page)).wires).toHaveLength(before.wires.length+1);
    expect((await saved(page)).wires.at(-1).to).toEqual({componentId:'r1',pinId:'b'});
    await page.keyboard.press('ControlOrMeta+z');expect(await saved(page)).toEqual(before);
  }
});
