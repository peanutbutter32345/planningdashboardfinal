import test from 'node:test';
import assert from 'node:assert/strict';
import {PROJECTS} from '../data/projects.js';
import {dashboardProjects} from '../scripts/sync-projects.js';
test('dashboard and server use identical project facts',()=>{
 assert.deepEqual(PROJECTS,dashboardProjects(),'Run npm run sync:projects after changing embedded project data.');
 assert.equal(new Set(PROJECTS.map(p=>p.city+':'+p.id)).size,PROJECTS.length,'Project IDs must be unique within each city');
});
