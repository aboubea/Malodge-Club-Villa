import { describe, expect, it } from 'vitest';
import { applyNameAliases, looksLikeSamePerson } from './people-merge';

describe('duplicate people (typos)', () => {
  it('finds the same person written twice', () => {
    expect(looksLikeSamePerson('Marc brunet', 'Marck brunet')).toBe(true);
    expect(looksLikeSamePerson('Stéphanie Gowenko', 'stephanie gowenko')).toBe(true);
    expect(looksLikeSamePerson('Véronique Smet', 'VeroniqueSmet')).toBe(true);
  });

  it('does not merge different people', () => {
    expect(looksLikeSamePerson('Marc brunet', 'Paul Durand')).toBe(false);
    // Short names: one letter changes the person.
    expect(looksLikeSamePerson('Ana', 'Ina')).toBe(false);
    expect(looksLikeSamePerson('', 'Ana')).toBe(false);
  });

  it('sends the lines of a merged name to the record kept, at the next import', () => {
    const data = {
      people: [{ name: 'Marck brunet' }, { name: 'Marc brunet' }],
      extras: [{ stay: 'Marck brunet' }],
      settlements: [{ person: 'Marck brunet' }],
    };
    applyNameAliases(data, { 'marck brunet': 'Marc brunet' });
    expect(data.extras[0].stay).toBe('Marc brunet');
    expect(data.settlements[0].person).toBe('Marc brunet');
  });
});
