import { readFile, writeFile } from 'node:fs/promises';
import { containedPath, projectRoot } from './integrity.mjs';

const filename = containedPath(projectRoot, 'specs/001-local-video-privacy-mask/tasks.md');
let contents = await readFile(filename, 'utf8');
if (process.argv.includes('--defer-testing')) {
  const note = `## User-authorized execution change (2026-10-14)\n\nThe user instructed: "lets defere testing". Testing, fixture acquisition,\ncalibration, runtime acceptance and performance qualification are deferred.\nThey remain unchecked and are not prerequisites for implementation tasks.\nAll test-before-code and acceptance checkpoint dependencies below are superseded\nby this instruction. Follow implementation dependencies in order; retain basic\nTypeScript compilation, build and asset-integrity checks. Existing test scripts\ncontinue to fail on absent fixtures when explicitly invoked. Code portions of\nmixed tasks may be implemented; their verification portions remain deferred.\nProvisional tracking thresholds must be labeled uncalibrated. No test success or\nprivacy/coverage/performance qualification is implied by a successful build.\n\n`;
  if (!contents.includes('## User-authorized execution change')) contents = contents.replace('## Format:', `${note}## Format:`);
  const deferred = ['T005','T016','T017','T018','T019','T020','T040','T041','T042','T049','T050','T051','T057','T059','T060','T061'];
  contents = contents.split('\n').map(line => deferred.some(id => line.startsWith(`- [ ] ${id} `)) && !line.includes('[DEFERRED]') ? line.replace(/(T\d+) /, '$1 [DEFERRED] ') : line).join('\n');
}
const mode = process.argv.includes('--partial') ? 'partial' : 'complete';
const ids = process.argv.slice(2).filter(arg => /^T\d{3}$/.test(arg));
for (const id of ids) {
  if (mode === 'complete') contents = contents.replace(`- [ ] ${id} `, `- [X] ${id} `);
  else contents = contents.split('\n').map(line => line.startsWith(`- [ ] ${id} `) && !line.includes('[CODE COMPLETE; VALIDATION DEFERRED]') ? line.replace(`${id} `, `${id} [CODE COMPLETE; VALIDATION DEFERRED] `) : line).join('\n');
}
await writeFile(filename, contents);
console.log(ids.length ? `${mode}: ${ids.join(', ')}` : 'Testing deferred; implementation gates updated.');
