import { describe, expect, it } from 'vitest';
import { planMerge } from './VillaMerge';

const villa = (id: string, logifyId?: string) => ({ id, name: id, logifyId: logifyId ?? null }) as any;

describe('drag and drop of a villa onto another', () => {
  it('always keeps the Lodgify listing', () => {
    expect(planMerge(villa('excel'), villa('lodgify', '42'))).toMatchObject({ source: { id: 'excel' }, target: { id: 'lodgify' } });
    expect(planMerge(villa('lodgify', '42'), villa('excel'))).toMatchObject({ source: { id: 'excel' }, target: { id: 'lodgify' } });
  });

  it('groups two Lodgify listings as formulas of one house, never merges them', () => {
    expect(planMerge(villa('58-small', '1'), villa('58', '2'))).toEqual({ group: { formula: villa('58-small', '1'), main: villa('58', '2') } });
  });

  it('does nothing when dropped on itself', () => {
    expect(planMerge(villa('a'), villa('a'))).toBeNull();
  });
});
