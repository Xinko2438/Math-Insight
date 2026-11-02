import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));

assert.ok(exists('SKILL.md'), 'SKILL.md must exist');
assert.ok(exists('agents/openai.yaml'), 'agents/openai.yaml must exist');
assert.ok(exists('references/ai-native-routes.md'), 'AI Native routing reference must exist');
assert.ok(exists('references/upstream.md'), 'upstream attribution must exist');

const skill = read('SKILL.md');
const routes = read('references/ai-native-routes.md');
const upstream = read('references/upstream.md');
const ui = read('agents/openai.yaml');

assert.match(skill, /^---\nname: neat\ndescription:/, 'frontmatter name and description are required');
assert.match(skill, /ordinary coding|普通.*任务|中途/i, 'ordinary work must be excluded');
assert.match(skill, /exact.*turn|精确.*turn/i, 'exact-turn closure must be routed');
assert.match(skill, /never invent|do not invent|不得.*发明|不能.*猜/i, 'turn id or closure command must never be invented');
assert.match(skill, /generated Memory|生成.*Memory/i, 'generated Memory boundary must be explicit');
assert.match(skill, /project.*fact|项目事实/i, 'project fact boundary must be explicit');
assert.match(skill, /Candidate|候选/, 'candidate boundary must be explicit');
assert.match(skill, /placement|归属/, 'file placement gate must be explicit');
assert.match(skill, /delete|删除/i, 'delete boundary must be explicit');
assert.doesNotMatch(skill, /find <project-root>|2>\/dev\/null|必须.*修改.*文件|Codex 没有独立/, 'known stale instructions must be absent');

for (const token of ['Pending', 'Receipt', 'PROJECT.md', 'Complete-AINativeTurn.ps1', 'Apply-AINativeReviewDecisions.ps1', 'extensions/ad_hoc/notes']) {
  assert.ok(routes.includes(token), `routing reference must include ${token}`);
}
assert.match(routes, /Only.*exact|只有.*精确/i, 'closure route must require an exact command');
assert.match(routes, /Memory.*read-only|Memory.*只读/i, 'Memory route must default to read-only');
assert.match(upstream, /KKKKhazix\/khazix-skills/, 'upstream repository must be attributed');
assert.match(upstream, /2b4a645cfdc894156ae347d897723562f719ce95/, 'audited upstream commit must be pinned');
assert.match(ui, /display_name:/, 'UI display name must be present');
assert.match(ui, /default_prompt:/, 'UI default prompt must be present');
const workspace = path.resolve(root, '..', '..', '..');
const workspaceAgents = fs.readFileSync(path.join(workspace, 'AGENTS.md'), 'utf8');
const systemOs = fs.readFileSync(path.join(workspace, 'SYSTEM-OS.md'), 'utf8');
const memoryPlan = fs.readFileSync(path.join(workspace, 'playbooks', 'ai-native-memory-governance.md'), 'utf8');
assert.match(workspaceAgents, /\.agents[\\/]skills[\\/]neat/, 'workspace AGENTS must route $neat to this skill');
assert.match(systemOs, /\.agents[\\/]skills[\\/]neat/, 'SYSTEM-OS must identify the workspace adaptation');
assert.match(systemOs, /exact-turn|精确.*turn/i, 'SYSTEM-OS must preserve exact-turn precedence');
assert.match(memoryPlan, /\.agents[\\/]skills[\\/]neat/, 'Memory governance must route to this skill');

console.log(JSON.stringify({status:'PASS', checks:29, skillRoot:root}));
