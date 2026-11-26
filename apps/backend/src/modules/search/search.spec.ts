import { describe, expect, it } from 'vitest';
import { norm, score } from './search';

describe('global search matching', () => {
  it('ignores accents and case', () => {
    expect(norm('  Dar Clémentine ')).toBe('dar clementine');
    expect(score('clementine', ['Dar Clémentine'])).toBeGreaterThan(0);
    expect(score('CLÉM', ['dar clementine'])).toBeGreaterThan(0);
  });

  it('needs every word, in any field', () => {
    expect(score('marie villa', ['Marie Zevaco', 'Villa 58'])).toBeGreaterThan(0);
    expect(score('marie riad', ['Marie Zevaco', 'Villa 58'])).toBe(0);
  });

  it('ranks the start of a name above a word inside it, above anywhere', () => {
    const start = score('villa', ['Villa 58']);
    const word = score('58', ['Villa 58']);
    const inside = score('ill', ['Villa 58']);
    expect(start).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(inside);
    expect(score('villa 58', ['Villa 58'])).toBeGreaterThan(start);
  });
});
