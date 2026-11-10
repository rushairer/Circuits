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
