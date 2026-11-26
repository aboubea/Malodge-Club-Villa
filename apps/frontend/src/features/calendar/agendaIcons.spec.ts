import { describe, expect, it } from 'vitest';
import { activityKind, chipLabel } from './agendaIcons';

/** Real names of the catalogue: the icon tells the kind, the chip says the rest. */
const cases: [name: string, category: string, kind: string, chip: string][] = [
  ['Transfert aéroport - Amelkis - 1 à 3 pers.', 'Transferts aéroport', 'airport', 'Amelkis'],
  ['Transfert aéroport - Bab Doukkala (Riad Al Amana) - jour - 1 à 6 pers.', 'Transferts aéroport', 'airport', 'Bab Doukkala'],
  ['Transfert Clémentine aéroport', 'Transferts', 'airport', 'Clémentine'],
  ['Transfert Médina - 4 à 7 pers.', 'Transferts', 'transfer', 'Médina'],
  ['Agafay - Minibus 17 pers. - aller et retour', 'Transferts', 'transfer', 'Agafay'],
  ['transfert dexcursion dans 3', '', 'transfer', 'transfert dexcursion dans 3'],
  ['Excursion 3 vallées - 4 à 7 pers.', 'Excursions', 'excursion', '3 vallées'],
  ['Montgolfière - prix par personne - groupe 1 à 3 pers.', 'Activités individuelles', 'balloon', 'Montgolfière'],
  ['Agafay - balade à dos de chameau - 1 h par pers. — Sur place - hors transferts', 'Activités individuelles', 'camel', 'Agafay'],
  ['Agafay - quad 1 h - 16 personne — Sur place - hors transferts', '', 'quad', 'Agafay'],
  ['Massage balinais 1 h', 'Soins', 'spa', 'Massage balinais 1 h'],
  ['Chef à domicile', '', 'food', 'Chef à domicile'],
  ['Agafay', '', 'excursion', 'Agafay'],
  ['Bouquet de fleurs', '', 'other', 'Bouquet de fleurs'],
];

describe('agenda icons', () => {
  it.each(cases)('%s', (name, category, kind, chip) => {
    expect(activityKind(name, category).key).toBe(kind);
    expect(chipLabel(name)).toBe(chip);
  });
});
