import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { containedPath, projectRoot, verifyFile } from './integrity.mjs';

const realScenarios = ['multi-face', 'translation', 'scale', 'tilt', 'crossing', 'occlusion-reentry', 'manual'];
const requiredScenarios = [...realScenarios, 'no-initial-detection', 'mp4', 'webm', 'portrait', 'vfr', 'b-frames', 'audio-offset', 'multiple-audio', 'silent', 'corrupt', 'resource-limits', 'benchmark-720p60'];
export async function verifyFixtures(root = containedPath(projectRoot, 'tests/fixtures')) {
  const manifest = JSON.parse(await readFile(containedPath(root, 'manifest.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.status !== 'complete' || !manifest.entries?.length) {
    throw new Error('Required fixture corpus is incomplete (T005). Supply licensed real-face clips and independent per-frame annotations for calibration and held-out acceptance.');
  }
  const covered = new Map([['calibration', new Set()], ['acceptance', new Set()]]);
  const splitHashes = new Map();
  const recordingSplits = new Map();
  const paths = new Set();
  for (const entry of manifest.entries) {
    if (!covered.has(entry.split) || !entry.path.startsWith(`${entry.split}/`)) throw new Error('Invalid fixture split');
    if (paths.has(entry.path)) throw new Error('Duplicate fixture path');
    paths.add(entry.path);
    if (!entry.provenance?.license || !entry.provenance?.source || !entry.provenance?.rightsEvidence) throw new Error('Missing fixture provenance');
    await verifyFile(root, entry);
    if (splitHashes.has(entry.sha256) && splitHashes.get(entry.sha256) !== entry.split) throw new Error('Calibration/acceptance leakage');
    splitHashes.set(entry.sha256, entry.split);
    if (typeof entry.recordingId !== 'string' || !entry.recordingId) throw new Error('Missing original recording identifier');
    if (recordingSplits.has(entry.recordingId) && recordingSplits.get(entry.recordingId) !== entry.split) throw new Error('Same original recording occurs in both splits');
    recordingSplits.set(entry.recordingId, entry.split);
    if (!entry.scenarios?.length || entry.scenarios.some(scenario => !requiredScenarios.includes(scenario))) throw new Error('Unknown/missing fixture scenario');
    for (const scenario of entry.scenarios) {
      if (realScenarios.includes(scenario) && entry.mediaKind !== 'real-face') throw new Error('Synthetic media cannot satisfy real-face scenario');
      covered.get(entry.split).add(scenario);
    }
    if (entry.scenarios.includes('benchmark-720p60')) {
      const expected = entry.expectedMedia;
      if (!expected || expected.width !== 1280 || expected.height !== 720 || expected.durationUs !== 60_000_000 || expected.frameRate !== 30 || expected.frameCount !== 1800) throw new Error('Invalid 60-second 720p benchmark metadata');
    }
    if (entry.mediaKind === 'real-face') {
      if (!entry.annotations || !entry.expectedFrameCount || !Number.isSafeInteger(entry.expectedFrameCount)) throw new Error('Missing real-face annotations/frame count');
      const annotationBytes = await verifyFile(root, entry.annotations);
      const annotation = JSON.parse(annotationBytes.toString('utf8'));
      if (annotation.schemaVersion !== 1 || annotation.frames?.length !== entry.expectedFrameCount || !annotation.targetIdentityId) throw new Error('Incomplete face annotations');
      if (!Array.isArray(annotation.lossIntervals)) throw new Error('Missing known loss intervals');
      let previousEnd = -1;
      for (const interval of annotation.lossIntervals) {
        if (!Number.isSafeInteger(interval.startUs) || !Number.isSafeInteger(interval.endUs) || interval.startUs < 0 || interval.endUs <= interval.startUs || interval.startUs < previousEnd || !interval.reasons?.length) throw new Error('Invalid annotated loss interval');
        previousEnd = interval.endUs;
      }
      let previousTime = -1;
      for (const frame of annotation.frames) {
        if (!Number.isSafeInteger(frame.timestampUs) || frame.timestampUs <= previousTime || !Number.isSafeInteger(frame.durationUs) || frame.durationUs <= 0 || !Array.isArray(frame.faces)) throw new Error('Invalid annotation timing');
        previousTime = frame.timestampUs;
        const ids = new Set();
        for (const face of frame.faces) {
          if (!face.identityId || ids.has(face.identityId) || !['trackable', 'occluded', 'out-of-frame'].includes(face.visibility)) throw new Error('Invalid identity annotation');
          ids.add(face.identityId);
          if (face.visibility === 'trackable' && (!face.rect || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(face.rect[key])) || face.rect.width <= 0 || face.rect.height <= 0)) throw new Error('Missing face boundary');
        }
      }
    }
  }
  for (const scenario of requiredScenarios) {
    if (!covered.get('acceptance').has(scenario)) throw new Error(`Missing acceptance scenario: ${scenario}`);
    if (realScenarios.includes(scenario) && !covered.get('calibration').has(scenario)) throw new Error(`Missing calibration scenario: ${scenario}`);
  }
  console.log(`Verified ${manifest.entries.length} fixtures and independently annotated real-face splits.`);
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await verifyFixtures();
