import {test,expect,type Page} from '@playwright/test';
const pin=(part:string,name:string)=>'.item[data-part="'+part+'"] .pin[data-pin="'+name+'"]';
const saved=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('circuits-project')!));
const setup=async(page:Page)=>{
 await page.goto('/');
 const p=await saved(page);
 p.parts=[
  {id:'left',kind:'resistor',x:0,y:100,rotation:0,value:220},
  {id:'obstacle',kind:'battery',x:230,y:72,rotation:0,value:9},
  {id:'right',kind:'resistor',x:470,y:100,rotation:0,value:220}
 ];
 p.wires=[];p.insertions=[];
 await page.locator('#file').setInputFiles({
  name:'visibility.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))
 });
 await expect(page.locator('.wire')).toHaveCount(0);
 return p;
};
async function screenFromWorld(page:Page,x:number,y:number){
 return page.evaluate(({x,y})=>{
  const svg=document.querySelector<SVGSVGElement>('#board')!;
  const scene=document.querySelector<SVGGElement>('#scene')!;
  const point=svg.createSVGPoint();point.x=x;point.y=y;
  const pos=point.matrixTransform(scene.getScreenCTM()!);
  return {x:pos.x,y:pos.y};
 },{x,y});
}
async function center(page:Page,selector:string){
 const bounds=await page.locator(selector).boundingBox();
 expect(bounds).not.toBeNull();
 return {x:bounds!.x+bounds!.width/2,y:bounds!.y+bounds!.height/2};
}
const vertices=(path:string)=>path.match(/-?\d+(?:\.\d+)?/g)?.map(Number).reduce(
 (out:{x:number;y:number}[],value,index,all)=>{
  if(index%2===0)out.push({x:value,y:all[index+1]});
  return out;
 },[])??[];
const crosses=(a:{x:number;y:number},b:{x:number;y:number},r:{left:number;right:number;top:number;bottom:number})=>
 a.y===b.y?a.y>r.top&&a.y<r.bottom&&Math.max(Math.min(a.x,b.x),r.left)<Math.min(Math.max(a.x,b.x),r.right):
 a.x===b.x&&a.x>r.left&&a.x<r.right&&Math.max(Math.min(a.y,b.y),r.top)<Math.min(Math.max(a.y,b.y),r.bottom);
test('live auto-wire preview routes around another component and matches the committed SVG',async({page},testInfo)=>{
 await setup(page);
 await page.locator(pin('left','b')).click();
 const free=await screenFromWorld(page,420,130);
 await page.mouse.move(free.x,free.y,{steps:6});
 const temporary=await page.locator('#wire-preview-path').getAttribute('d');
 const withoutTarget=vertices(temporary!);
 expect(withoutTarget.length).toBeGreaterThan(3);
 const batteryPreview={left:217,right:335,top:59,bottom:220};
 for(let i=1;i<withoutTarget.length;i++)
  expect(crosses(withoutTarget[i-1],withoutTarget[i],batteryPreview)).toBe(false);
 const target=await center(page,pin('right','a'));
 await page.mouse.move(target.x,target.y,{steps:5});
 const draft=await page.locator('#wire-preview-path').getAttribute('d');
 expect(draft).not.toBeNull();
 const points=vertices(draft!);
 expect(points.length).toBeGreaterThan(3);
 await expect(page.locator('.wire-preview-auto-corner')).not.toHaveCount(0);
 await testInfo.attach('live-obstacle-route',{body:await page.screenshot(),
   contentType:'image/png'});
 const battery={left:217,right:335,top:59,bottom:220};
 for(let i=1;i<points.length;i++)expect(crosses(points[i-1],points[i],battery)).toBe(false);
 await page.locator(pin('right','a')).click();
 const final=await page.locator('.wire[data-wire]').getAttribute('d');
 expect(final).toBe(draft);
 await expect(page.locator('.wire-preview-auto-corner')).toHaveCount(0);
 await testInfo.attach('committed-obstacle-route',{body:await page.screenshot(),
   contentType:'image/png'});
 const updated=await saved(page);
 expect(updated.wires).toHaveLength(1);
 expect(updated.wires[0].routing).toBe('horizontal');
 expect(updated.wires[0].autoAvoid).toBe(true);
 expect(updated.wires[0].bends).toBeUndefined();
 expect(updated.wires[0].from).toEqual({componentId:'left',pinId:'b'});
 expect(updated.wires[0].to).toEqual({componentId:'right',pinId:'a'});
});
test('moving obstruction regenerates a simpler conductor while preserving wire JSON',async({page})=>{
 await setup(page);
 const p=await saved(page);
 p.wires=[{id:'wire1',from:{componentId:'left',pinId:'b'},to:{componentId:'right',pinId:'a'},
   color:'#159f91',routing:'horizontal',autoAvoid:true}];
 await page.locator('#file').setInputFiles({
  name:'routed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))
 });
 const before=await page.locator('.wire[data-wire="wire1"]').getAttribute('d');
 expect(vertices(before!).length).toBeGreaterThan(3);
 const copy=await saved(page);
 copy.parts.find((part:{id:string})=>part.id==='obstacle').y=490;
 await page.locator('#file').setInputFiles({
  name:'moved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(copy))
 });
 const after=await page.locator('.wire[data-wire="wire1"]').getAttribute('d');
 expect(vertices(after!).length).toBeLessThan(vertices(before!).length);
 expect((await saved(page)).wires).toEqual(p.wires);
});


test('one-click smart cleanup upgrades legacy unbent circuits with atomic undo and live simulation preserved',async({page})=>{
 await page.goto('/');
 const initial=await saved(page);
 await page.locator('[data-action="run"]').click();
 await expect(page.locator('[data-action="run"]')).toContainText('停止仿真');
 await page.locator('[data-action="auto-route-wires"]').click();
 const routed=await saved(page);
 expect(routed.wires).toHaveLength(initial.wires.length);
 expect(routed.wires.every((w:{routing?:string;autoAvoid?:boolean})=>Boolean(w.routing)&&w.autoAvoid===true)).toBe(true);
 expect(routed.wires.map((w:{from:unknown;to:unknown})=>({from:w.from,to:w.to})))
  .toEqual(initial.wires.map((w:{from:unknown;to:unknown})=>({from:w.from,to:w.to})));
 await expect(page.locator('[data-action="run"]')).toContainText('停止仿真');
 await page.locator('[data-action="undo"]').click();
 const undone=await saved(page);
 expect(undone.wires).toEqual(initial.wires);
 await page.locator('[data-action="redo"]').click();
 expect((await saved(page)).wires).toEqual(routed.wires);
});


test('dense breadboard corridor is visibly clear, selectable and stable through manual editing',async({page},testInfo)=>{
 await page.goto('/');
 const p=await saved(page);
 const ox=220,oy=180;
 p.parts=[{id:'board',kind:'breadboard',x:ox,y:oy,rotation:0}];
 p.insertions=[];
 const ep=(pinId:string)=>({componentId:'board',pinId});
 const fixed=(id:string,from:string,to:string,routing:'horizontal'|'vertical')=>
  ({id,from:ep(from),to:ep(to),routing,color:'#159f91'});
 p.wires=[
  ...[10,11,12].map(c=>fixed('v'+c,'top-plus-'+c,'hole-c-'+c,'vertical')),
  ...['c','d','e'].map(r=>fixed('h'+r,'hole-'+r+'-2','hole-'+r+'-5','horizontal')),
  {...fixed('auto','hole-a-4','hole-j-14','horizontal'),autoAvoid:true,color:'#e45454'}
 ];
 await page.locator('#file').setInputFiles({
  name:'dense-board.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))
 });
 await expect(page.locator('.wire')).toHaveCount(7);
 const original=await saved(page);
 const wire=page.locator('.wire[data-wire="auto"]');
 const hit=page.locator('.wire-hit[data-wire="auto"]');
 await expect(wire).toHaveAttribute('data-crossovers','0');
 const before=await hit.getAttribute('d');
 expect(before).not.toBeNull();
 expect(await wire.getAttribute('d')).toBe(before);
 const points=vertices(before!);
 expect(points[0]).toEqual({x:ox+100,y:oy+67});
 expect(points.at(-1)).toEqual({x:ox+280,y:oy+148});
 expect(points.length).toBe(4);
 expect(points.slice(1).reduce((n,b,i)=>n+Math.abs(b.x-points[i].x)+Math.abs(b.y-points[i].y),0)).toBe(261);
 const fixedPaths=await page.locator('.wire-hit:not([data-wire="auto"])').evaluateAll(els=>
  Object.fromEntries(els.map(el=>[el.getAttribute('data-wire'),el.getAttribute('d')])));
 for(const d of Object.values(fixedPaths)){
  const [c,dest]=vertices(d!);
  const between=(x:number,a:number,b:number)=>x>Math.min(a,b)&&x<Math.max(a,b);
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i];
   expect(a.y===b.y&&c.x===dest.x&&between(c.x,a.x,b.x)&&between(a.y,c.y,dest.y)||
    a.x===b.x&&c.y===dest.y&&between(a.x,c.x,dest.x)&&between(c.y,a.y,b.y)).toBe(false);
  }
 }
 await testInfo.attach('dense-board-clear-corridor',{body:await page.screenshot(),contentType:'image/png'});
 // Choose a real painted point on the middle leg, not a hole center or a bend.
 const pick=await wire.evaluate((el,pts)=>{
  const path=el as SVGPathElement,mat=path.getScreenCTM()!;
  const a=pts[1],b=pts[2];
  for(let i=2;i<=18;i++){
   const t=i/20,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
   const screen=new DOMPoint(x,y).matrixTransform(mat);
   const target=document.elementFromPoint(screen.x,screen.y);
   if(target===path)return {x:screen.x,y:screen.y,wx:x,wy:y,axis:a.x===b.x?'vertical':'horizontal'};
  }
  return null;
 },points);
 expect(pick,'a real conductor point must be accessible between sockets').not.toBeNull();
 await page.mouse.click(pick!.x,pick!.y);
 await expect(page.locator('.endpoint-handle[data-wire="auto"]')).toHaveCount(2);
 expect(await hit.getAttribute('d')).toBe(before);
 expect((await saved(page)).wires).toEqual(original.wires);
 const target=await screenFromWorld(page,pick!.wx+(pick!.axis==='vertical'?30:0),
  pick!.wy+(pick!.axis==='horizontal'?30:0));
 await page.mouse.move(pick!.x,pick!.y);
 await page.mouse.down();
 await page.mouse.move(target.x,target.y,{steps:8});
 await page.mouse.up();
 const edited=await saved(page);
 expect(edited.wires.slice(0,-1)).toEqual(original.wires.slice(0,-1));
 expect(edited.wires.at(-1).from).toEqual(original.wires.at(-1).from);
 expect(edited.wires.at(-1).to).toEqual(original.wires.at(-1).to);
 expect(edited.wires.at(-1).bends?.length).toBeGreaterThan(0);
 expect(await hit.getAttribute('d')).not.toBe(before);
 await page.locator('[data-action="undo"]').click();
 expect((await saved(page)).wires).toEqual(original.wires);
 expect(await hit.getAttribute('d')).toBe(before);
 await page.locator('[data-action="redo"]').click();
 expect((await saved(page)).wires).toEqual(edited.wires);
 const editedPath=await hit.getAttribute('d');
 await page.reload();
 await expect(page.locator('.wire')).toHaveCount(7);
 expect((await saved(page)).wires).toEqual(edited.wires);
 expect(await hit.getAttribute('d')).toBe(editedPath);
 await testInfo.attach('dense-board-edited-corridor',{body:await page.screenshot(),contentType:'image/png'});
});
