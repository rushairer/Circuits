import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,blankProject} from '../.test-dist/model.js';
import {createSchematic} from '../.test-dist/core/schematic.js';
import {createBom} from '../.test-dist/core/bom.js';
import {renderSchematicPanel,renderSchematicWorkspace} from '../.test-dist/ui/schematic-panel.js';
import {renderBomPanel,renderBomWorkspace} from '../.test-dist/ui/bom-panel.js';
import {renderWorkspaceTabs,renderReadonlyInspector} from '../.test-dist/ui/workspace-views.js';

test('three semantic editor tabs expose exactly one selected view',()=>{
 for(const v of ['circuit','schematic','bom']){
  const markup=renderWorkspaceTabs(v);
  assert.equal((markup.match(/role="tab"/g)||[]).length,3);
  assert.equal((markup.match(/aria-selected="true"/g)||[]).length,1);
  assert.match(markup,new RegExp('id="tab-'+v+'"[^>]+aria-selected="true"'));
  assert.equal((markup.match(/tabindex="0"/g)||[]).length,1);
  assert.match(markup,/aria-controls="workspace-main"/);
 }
 assert.doesNotMatch(renderReadonlyInspector('schematic'),/data-action="delete"|<input/);
 assert.doesNotMatch(renderReadonlyInspector('bom'),/data-action="rotate"|<select/);
});
test('inline and legacy schematic are identical electrical projections and export remains read-only',()=>{
 const p=demo(),before=structuredClone(p),diagram=createSchematic(p);
 assert.equal(diagram.ok,true);
 const inline=renderSchematicWorkspace(diagram,1.25);
 const legacy=renderSchematicPanel(diagram,1.25);
 assert.equal((inline.match(/class="sch-net"/g)||[]).length,diagram.nets.length);
 assert.equal((inline.match(/class="sch-link"/g)||[]).length,6);
 assert.match(inline,/class="schematic-workspace read-only-workspace"/);
 assert.match(inline,/class="schematic-sheet" style="width:1238px/);
 assert.match(inline,/data-action="schematic-export"/);
 assert.match(inline,/data-action="view-circuit"/);
 assert.doesNotMatch(inline,/aria-modal="true"|class="schematic-shade"/);
 assert.equal((legacy.match(/class="sch-net"/g)||[]).length,diagram.nets.length);
 assert.deepEqual(p,before);
});
test('inline BOM and legacy modal render exactly same real rows with escaped project names',()=>{
 const p=demo();p.name='<script>unsafe</script> & circuit';
 const report=createBom(p);
 const inline=renderBomWorkspace(report),legacy=renderBomPanel(report);
 assert.equal((inline.match(/class="bom-quantity"/g)||[]).length,report.rows.length);
 assert.equal((legacy.match(/class="bom-quantity"/g)||[]).length,report.rows.length);
 assert.match(inline,/&lt;script&gt;unsafe&lt;\/script&gt;/);
 assert.doesNotMatch(inline,/<script|aria-modal="true"/);
 assert.match(inline,/data-action="bom-export"/);
 assert.match(inline,/class="bom-table-scroller"/);
 assert.match(renderBomWorkspace(createBom(blankProject())),/当前电路没有元件/);
});
