import { failure } from '../core/errors';
import { intersectionOverUnion } from '../core/geometry';
import { PROFILE } from './profile';
import { cosine } from './sface';
import type { FaceCandidate } from './types';

interface Entry {
  face: FaceCandidate & { embedding: Float32Array };
  last: FaceCandidate;
  lastSeenUs: number;
  lastEmbedding: Float32Array;
  appearances: Float32Array[];
}

interface Match {
  index: number;
  entry: Entry;
  score: number;
}

const MAX_APPEARANCES = 8;
const SAME_APPEARANCE = 0.9;
const CONTINUITY_WINDOW_US = 500_000;
const MIN_CONTINUITY_OVERLAP = 0.15;

function appearanceScore(entry: Entry, embedding: Float32Array): number {
  let score = cosine(entry.face.embedding, embedding);
  for (const sample of entry.appearances) {
    score = Math.max(score, cosine(sample, embedding));
  }
  return score;
}

export class FaceDiscovery {
  private readonly entries: Entry[] = [];

  get faces(): FaceCandidate[] {
    return this.entries.map(entry => entry.face);
  }

  observe(faces: FaceCandidate[], embeddings: Float32Array[], timestampUs: number): FaceCandidate[] {
    if (faces.length !== embeddings.length) throw failure('tracking-failed');

    const claimed = new Set<Entry>();
    const assignments = new Map<number, Entry>();
    const scores = embeddings.map(embedding => this.entries.map(entry => appearanceScore(entry, embedding)));
    const pairs: Match[] = [];

    faces.forEach((face, index) => {
      this.entries.forEach((entry, entryIndex) => {
        const elapsedUs = timestampUs - entry.lastSeenUs;
        if (elapsedUs < 0 || elapsedUs > CONTINUITY_WINDOW_US) return;

        const overlap = intersectionOverUnion(entry.last.rect, face.rect);
        if (overlap <= MIN_CONTINUITY_OVERLAP) return;

        const similarity = Math.max(cosine(entry.lastEmbedding, embeddings[index]!), scores[index]![entryIndex]!);
        if (similarity >= PROFILE.similarity) {
          pairs.push({ index, entry, score: overlap + similarity });
        }
      });
    });

    pairs.sort((a, b) => b.score - a.score);
    for (const pair of pairs) {
      if (assignments.has(pair.index) || claimed.has(pair.entry)) continue;
      assignments.set(pair.index, pair.entry);
      claimed.add(pair.entry);
    }

    faces.forEach((_, index) => {
      if (assignments.has(index)) return;

      let best: Entry | undefined;
      let bestScore = -Infinity;
      let secondScore = -Infinity;

      // Claimed identities still contribute to ambiguity between lookalikes.
      this.entries.forEach((entry, entryIndex) => {
        const score = scores[index]![entryIndex]!;
        if (score > bestScore) {
          secondScore = bestScore;
          bestScore = score;
          best = entry;
        } else if (score > secondScore) {
          secondScore = score;
        }
      });

      if (best && !claimed.has(best) && bestScore >= PROFILE.similarity && bestScore - secondScore >= PROFILE.margin) {
        assignments.set(index, best);
        claimed.add(best);
      }
    });

    const added: FaceCandidate[] = [];
    faces.forEach((face, index) => {
      const embedding = embeddings[index]!;
      let entry = assignments.get(index);
      if (!entry) {
        const reference: Entry['face'] = {
          ...face,
          id: `${face.sourceId}:face:${this.entries.length}`,
          firstSeenUs: timestampUs,
          embedding: embedding.slice(),
        };
        entry = { face: reference, last: face, lastSeenUs: timestampUs, lastEmbedding: reference.embedding, appearances: [] };
        this.entries.push(entry);
        added.push(reference);
      } else if (appearanceScore(entry, embedding) < SAME_APPEARANCE) {
        entry.appearances.push(embedding.slice());
        if (entry.appearances.length > MAX_APPEARANCES) entry.appearances.shift();
      }

      entry.lastEmbedding = embedding.slice();
      entry.last = face;
      entry.lastSeenUs = timestampUs;
    });
    return added;
  }
}
