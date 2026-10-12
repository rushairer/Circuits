// One-shot exact-base follow-up, removed before the final quality run.
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
let source=readFileSync('src/main.ts','utf8');
const bytes=Buffer.from(source);
const sha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
if(sha!=='90960518ef832b3b2fb8615f9fdc382d37159f65')throw Error(`Unexpected main.ts base: ${sha}`);
const before='function cancelCanvasGesture(){\n';
if(source.split(before).length!==2)throw Error('Unexpected cancellation helper');
source=source.replace(before,before+' // Do not replace a native file input or an unfinished text edit on idle blur.\n if(!drag&&!bendDrag&&!segmentDrag&&!endpointDrag&&!marquee&&!panDrag&&!wiring&&!spaceHeld)return;\n');
writeFileSync('src/main.ts',source);
unlinkSync('scripts/apply-pointer-batch.mjs');
unlinkSync('.github/workflows/apply-pointer-batch.yml');
