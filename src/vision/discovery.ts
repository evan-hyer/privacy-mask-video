import { intersectionOverUnion } from '../core/geometry';
import type { FaceCandidate } from './types';
import { cosine } from './sface';
import { PROFILE } from './profile';

interface Entry {
  face: FaceCandidate;
  last: FaceCandidate;
  lastSeenUs: number;
  lastEmbedding: Float32Array;
  appearances: Float32Array[];
}

const MAX_APPEARANCES = 8;
const SAME_APPEARANCE = .9;

function appearanceScore(entry: Entry, embedding: Float32Array): number {
  return Math.max(cosine(entry.face.embedding!, embedding), ...entry.appearances.map(sample => cosine(sample, embedding)));
}

// One-to-one matches keep simultaneously visible people separate, even when
// their recognition descriptors are similar. References never leave the device.
export class FaceDiscovery {
  private entries: Entry[] = [];
  get faces(): FaceCandidate[] { return this.entries.map(entry => entry.face); }

  observe(faces: FaceCandidate[], embeddings: Float32Array[], timestampUs: number): FaceCandidate[] {
    const claimed = new Set<Entry>();
    const assignments = new Map<number, Entry>();
    const pairs = faces.flatMap((face, index) => this.entries.flatMap(entry => {
      const overlap = intersectionOverUnion(entry.last.rect, face.rect);
      // Consecutive frames can remain recognizable to each other even after a
      // head turn makes them quite different from the original thumbnail.
      const similarity = Math.max(cosine(entry.lastEmbedding, embeddings[index]!), appearanceScore(entry, embeddings[index]!));
      return timestampUs - entry.lastSeenUs <= 500_000 && overlap > .15 && similarity >= PROFILE.similarity
        ? [{ index, entry, score: overlap + similarity }] : [];
    })).sort((a, b) => b.score - a.score);
    for (const pair of pairs) {
      if (assignments.has(pair.index) || claimed.has(pair.entry)) continue;
      assignments.set(pair.index, pair.entry); claimed.add(pair.entry);
    }
    // Compare against every identity for ambiguity, including already claimed
    // ones. A lookalike must not inherit an unrelated person's gallery entry.
    faces.forEach((face, index) => {
      if (assignments.has(index)) return;
      const scores = this.entries.map(entry => ({entry, score: appearanceScore(entry, embeddings[index]!)})).sort((a,b) => b.score-a.score);
      const best = scores[0], second = scores[1];
      // Catalog matching uses the ordinary identity threshold. Export's stricter
      // lost-target threshold otherwise splits returning people into new entries.
      if (best && !claimed.has(best.entry) && best.score >= PROFILE.similarity && (!second || best.score-second.score >= PROFILE.margin)) {
        assignments.set(index, best.entry); claimed.add(best.entry);
      }
    });
    const added: FaceCandidate[] = [];
    faces.forEach((face, index) => {
      let entry = assignments.get(index);
      if (!entry) {
        const reference: FaceCandidate = {...face, id: `${face.sourceId}:face:${this.entries.length}`, firstSeenUs: timestampUs, embedding: embeddings[index]!.slice()};
        entry = {face: reference, last: face, lastSeenUs: timestampUs, lastEmbedding: reference.embedding!, appearances: []};
        this.entries.push(entry); added.push(reference);
      }
      // Keep a bounded set of distinct views, rather than a descriptor per
      // frame. Preserve the original reference, timestamp and thumbnail.
      if (appearanceScore(entry, embeddings[index]!) < SAME_APPEARANCE) {
        entry.appearances.push(embeddings[index]!.slice());
        if (entry.appearances.length > MAX_APPEARANCES) entry.appearances.shift();
      }
      entry.lastEmbedding = embeddings[index]!.slice();
      entry.last = face; entry.lastSeenUs = timestampUs;
    });
    return added;
  }
}
