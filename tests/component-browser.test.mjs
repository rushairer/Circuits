import test from 'node:test';
import assert from 'node:assert/strict';
import {parts,labels} from '../.test-dist/model.js';
import {exampleCatalog} from '../.test-dist/core/examples.js';
import {
 COMPONENT_CATEGORIES,isComponentCategory,isStarterCategory,
 matchingComponents,matchingStarters
} from '../.test-dist/core/component-browser.js';

test('component categories expose supported Basic, All, Basic Starters and Arduino Starters',()=>{
 assert.deepEqual(COMPONENT_CATEGORIES.map(item=>item.value),[
   'basic','all','starters-basic','starters-arduino'
 ]);
 for(const item of COMPONENT_CATEGORIES)assert.equal(isComponentCategory(item.value),true);
 for(const bad of ['',null,undefined,'arduino','all-components',{},'ALL'])assert.equal(isComponentCategory(bad),false);
 assert.equal(isStarterCategory('all'),false);
 assert.equal(isStarterCategory('starters-arduino'),true);
 const basic=matchingComponents('basic','');
 const all=matchingComponents('all','');
 assert.equal(basic.length,9);
 assert.equal(all.length,parts.length);
 assert.ok(basic.includes('resistor')&&basic.includes('breadboard')&&basic.includes('arduino'));
 assert.ok(!basic.includes('multimeter')&&!basic.includes('servo'));
 assert.deepEqual(all,parts);
});
test('search finds localized labels and English synonyms across All even in Basic',()=>{
 assert.deepEqual(matchingComponents('basic','ohm'),['resistor']);
 assert.deepEqual(matchingComponents('basic','万用表'),['multimeter']);
 assert.deepEqual(matchingComponents('basic','  arduino UNO  '),['arduino']);
 assert.deepEqual(matchingComponents('all','PIEZO'),['buzzer']);
 assert.deepEqual(matchingComponents('all','舵机'),['servo']);
 assert.deepEqual(matchingComponents('all','电池'),['battery']);
 assert.deepEqual(matchingComponents('basic','nothing-matches'),[]);
 assert.deepEqual(matchingComponents('starters-basic','resistor'),[]);
 assert.deepEqual(matchingComponents('starters-arduino',''),[]);
 for(const kind of matchingComponents('all',''))assert.ok(labels[kind]);
});
test('starter category filters real validated fixture IDs, not fabricated examples',()=>{
 const basic=matchingStarters('starters-basic','');
 const arduino=matchingStarters('starters-arduino','');
 const union=[...basic,...arduino];
 assert.equal(union.length,exampleCatalog.length);
 assert.equal(new Set(union.map(v=>v.id)).size,exampleCatalog.length);
 assert.deepEqual(arduino.map(x=>x.id),['gpio-d13-led','uno-serial','uno-for-pulse']);
 assert.ok(basic.some(x=>x.id==='basic'));
 assert.ok(basic.some(x=>x.id==='rc-charge'));
 assert.deepEqual(matchingStarters('starters-arduino','  SERIAL  ').map(x=>x.id),['uno-serial']);
 assert.deepEqual(matchingStarters('starters-basic','9V').map(x=>x.id).includes('voltmeter'),true);
 assert.deepEqual(matchingStarters('all',''),[]);
 assert.deepEqual(matchingStarters('basic',''),[]);
 assert.deepEqual(matchingStarters('starters-basic','不存在'),[]);
});
