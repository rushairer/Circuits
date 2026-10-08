import test from 'node:test';import assert from 'node:assert/strict';
import {demo,validProject} from '../.test-dist/model.js';
import {evaluate} from '../.test-dist/core/simulator.js';
test('sample lights LED',()=>{assert.equal(evaluate(demo()).lit,true)});
test('broken connection turns LED off',()=>{const p=demo();p.wires.pop();assert.equal(evaluate(p).lit,false)});
test('import rejects wrong schema',()=>{assert.equal(validProject({}),false);assert.equal(validProject(demo()),true)});
