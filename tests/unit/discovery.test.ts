import { expect, it, vi } from 'vitest';
import { FaceDiscovery } from '../../src/vision/discovery';
import { Association } from '../../src/vision/association';
import { faceColor } from '../../src/element/face-colors';
import type { FaceCandidate, TargetSelection } from '../../src/vision/types';
import type { SFace } from '../../src/vision/sface';

const identityA = new Float32Array([1, 0]);
const identityB = new Float32Array([0, 1]);

function appearance(degrees: number): Float32Array {
  const radians = degrees * Math.PI / 180;
  return new Float32Array([Math.cos(radians), Math.sin(radians)]);
}

function face(x: number): FaceCandidate {
  return {
    id: `frame:${x}`,
    sourceId: 'video',
    rect: { x, y: 10, width: 50, height: 60 },
    landmarks: [
      { x: x + 10, y: 20 },
      { x: x + 35, y: 20 },
      { x: x + 25, y: 35 },
      { x: x + 15, y: 50 },
      { x: x + 35, y: 50 },
    ],
    confidence: 0.99,
  };
}

it('discovers a brief late entrance after a face-free opening and retains its timestamp', () => {
  const gallery = new FaceDiscovery();
  gallery.observe([], [], 0);
  gallery.observe([face(20)], [identityA], 5_000_000);
  gallery.observe([], [], 5_040_000);
  expect(gallery.faces).toHaveLength(1);
  expect(gallery.faces[0]!.firstSeenUs).toBe(5_000_000);
});

it('keeps repeated and returning identities stable without overwriting the original reference', () => {
  const gallery = new FaceDiscovery();
  gallery.observe([face(20)], [identityA], 0);
  const original = gallery.faces[0]!;
  gallery.observe([face(23)], [identityA], 40_000);
  gallery.observe([], [], 2_000_000);
  gallery.observe([face(200)], [identityA], 3_000_000);
  expect(gallery.faces).toEqual([original]);
  expect(original.rect.x).toBe(20);
});

it('retains simultaneous lookalikes independently across frames and catalogs more than eight faces', () => {
  const gallery = new FaceDiscovery();
  const faces = Array.from({ length: 10 }, (_, index) => face(index * 100));
  gallery.observe(faces, faces.map(() => identityA), 0);
  gallery.observe(faces.map(item => face(item.rect.x + 2)), faces.map(() => identityA), 40_000);
  expect(gallery.faces).toHaveLength(10);
  expect(new Set(gallery.faces.map(item => item.id)).size).toBe(10);
});

it('adds a different later person even at the previous face position', () => {
  const gallery = new FaceDiscovery();
  gallery.observe([face(20)], [identityA], 0);
  gallery.observe([face(20)], [identityB], 1_000_000);
  expect(gallery.faces).toHaveLength(2);
});

it('keeps one catalog entry as appearance gradually changes away from the first frame', () => {
  const gallery = new FaceDiscovery();
  gallery.observe([face(20)], [appearance(0)], 0);
  const original = gallery.faces[0]!;
  const reference = original.embedding!.slice();
  for (let step = 1; step <= 6; step++) {
    expect(gallery.observe([face(20 + step)], [appearance(step * 15)], step * 40_000)).toEqual([]);
  }
  expect(gallery.faces).toEqual([original]);
  expect(original.embedding).toEqual(reference);
  expect(original.firstSeenUs).toBe(0);
  expect(original.rect.x).toBe(20);
});

it('recognizes a returning person from an earlier view after a detection gap', () => {
  const gallery = new FaceDiscovery();
  for (let step = 0; step <= 12; step++) {
    gallery.observe([face(20)], [appearance(step * 15)], step * 40_000);
  }
  gallery.observe([], [], 2_000_000);
  // This view matches neither the original nor the most recent descriptor.
  expect(gallery.observe([face(200)], [appearance(90)], 3_000_000)).toEqual([]);
  expect(gallery.faces).toHaveLength(1);
});

it('uses catalog similarity for a returning person whose appearance has changed', () => {
  const gallery = new FaceDiscovery();
  gallery.observe([face(20)], [identityA], 0);
  const changed = new Float32Array([0.6, 0.8]);
  gallery.observe([], [], 1_000_000);
  expect(gallery.observe([face(200)], [changed], 2_000_000)).toEqual([]);
  expect(gallery.faces).toHaveLength(1);
});

it('does not collapse simultaneous people while their appearances change', () => {
  const gallery = new FaceDiscovery();
  for (let step = 0; step <= 6; step++) {
    const added = gallery.observe(
      [face(20 + step), face(200 + step)],
      [appearance(step * 15), appearance(step * 15)],
      step * 40_000,
    );
    expect(added).toHaveLength(step === 0 ? 2 : 0);
  }
  expect(gallery.faces).toHaveLength(2);
});

it('keeps ambiguous returning lookalikes separate from existing catalog entries', () => {
  const gallery = new FaceDiscovery();
  gallery.observe([face(20), face(200)], [appearance(0), appearance(10)], 0);
  gallery.observe([], [], 1_000_000);
  expect(gallery.observe([face(400)], [appearance(5)], 2_000_000)).toHaveLength(1);
  expect(gallery.faces).toHaveLength(3);
});

it('includes already matched identities when checking catalog ambiguity', () => {
  const gallery = new FaceDiscovery();
  gallery.observe([face(20), face(200)], [appearance(0), appearance(60)], 0);
  const added = gallery.observe([face(22), face(400)], [appearance(0), appearance(32)], 40_000);
  expect(added).toHaveLength(1);
  expect(added[0]!.rect.x).toBe(400);
  expect(gallery.faces).toHaveLength(3);
});

it('copies descriptors so caller buffer reuse cannot change catalog identities', () => {
  const gallery = new FaceDiscovery();
  const descriptor = identityA.slice();
  gallery.observe([face(20)], [descriptor], 0);
  descriptor.set(identityB);
  expect(gallery.observe([face(200)], [identityA], 2_000_000)).toEqual([]);
  expect(gallery.faces[0]!.embedding).toEqual(identityA);
});

it.each([{ embeddings: [] }, { embeddings: [identityA, identityB] }])('rejects mismatched descriptor counts without changing the catalog: $embeddings.length', ({ embeddings }) => {
  const gallery = new FaceDiscovery();
  gallery.observe([face(20)], [identityA], 0);
  const original = gallery.faces[0]!;
  expect(() => gallery.observe([face(200)], embeddings, 40_000)).toThrow(expect.objectContaining({ code: 'tracking-failed' }));
  expect(gallery.faces).toEqual([original]);
  expect(gallery.observe([face(22)], [identityA], 80_000)).toEqual([]);
});

it('initializes a late target from its reference embedding, never the opening-frame crop', async () => {
  const reference = face(20);
  const describe = vi.fn().mockResolvedValue(identityB);
  const selection: TargetSelection = {
    selectionId: 'selected',
    sourceId: 'video',
    candidateId: 'catalog:7',
    kind: 'detected',
    initialRect: reference.rect,
    initialLandmarks: reference.landmarks.map(point => ({ ...point })),
    initialRotationRad: 0,
    firstSeenUs: 1_000_000,
    embedding: identityA,
  };
  const association = new Association(selection, { describe } as unknown as SFace, 'hash');
  try {
    await association.initialize({} as ImageData);
    expect(describe).not.toHaveBeenCalled();
    const tracking = await association.track({} as ImageData, [reference], 25, 1_000_000, 40_000);
    expect(tracking.status).toBe('acquired');
    expect(tracking.candidateId).toBe(reference.id);
  } finally {
    association.dispose();
  }
});

it('keeps Face 1 green independently of selection order', () => {
  expect(faceColor(0)).toEqual({ name: 'green', value: '#48ed95' });
  expect(faceColor(1).value).not.toBe(faceColor(0).value);
});
