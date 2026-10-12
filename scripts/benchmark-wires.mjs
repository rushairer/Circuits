import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {paintCrossingWires} from '../.test-dist/core/wire-crossings.js';
import {wireScene,wireBenchmarkCases} from '../tests/fixtures/wire-scenes.mjs';

// Diagnostic only: wall-clock thresholds are intentionally NOT unit-test gates.
const implementations=[{name:'current',paint:paintCrossingWires}];
const index=process.argv.indexOf('--baseline');
if(index!==-1){
 const path=process.argv[index+1];
 if(!path||path.startsWith('--'))throw new Error('--baseline requires a compiled local module path');
 const module=await import(pathToFileURL(resolve(path)).href);
 if(typeof module.paintCrossingWires!=='function')throw new Error('Baseline must export paintCrossingWires');
 implementations.unshift({name:'baseline',paint:module.paintCrossingWires});
}
const rows=[];
let checksum=0;
for(const item of wireBenchmarkCases){
 const p=wireScene(item.count,item.options);
 const measurements=implementations.map(()=>[]);
 for(let i=0;i<12;i++)for(const implementation of implementations)implementation.paint(p.wires,p.parts);
 // Alternate implementation order to reduce persistent warm-up/order bias.
 for(let i=0;i<40;i++)for(let j=0;j<implementations.length;j++){
  const k=(j+i)%implementations.length,start=performance.now();
  const result=implementations[k].paint(p.wires,p.parts);
  measurements[k].push(performance.now()-start);
  checksum+=result.length;
 }
 for(let i=0;i<implementations.length;i++){
  const values=measurements[i].sort((a,b)=>a-b);
  rows.push({case:item.name,implementation:implementations[i].name,parts:p.parts.length,wires:p.wires.length,
   samples:values.length,p50Ms:+values[Math.floor(values.length*0.5)].toFixed(3),
   p95Ms:+values[Math.ceil(values.length*0.95)-1].toFixed(3)});
 }
}
console.log(JSON.stringify({scope:'Wire geometry only; excludes DOM, browser paint, input latency and solver. Not FPS.',
 node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model??'unknown',
 revision:process.env.GITHUB_SHA??'local',checksum,rows},null,2));
