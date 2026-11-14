import { describe, expect, it } from 'vitest';
import type { ParsedHand } from '../import/parse-pokerstars';
import { measureRake, rakeEntryFor, theoreticalRake } from '../rake-config';

const nl2 = (playersDealt: number) => rakeEntryFor({ site: 'PokerStars.FR', stake: 'NL2', playersDealt });

describe('theoreticalRake (plafond selon joueurs distribués)', () => {
  it('3,32 € à 5 joueurs → 0,15 € (plafond atteint)', () => {
    expect(theoreticalRake(332, true, nl2(5))).toBe(15);
  });
  it('4,02 € à 4 joueurs → 0,10 € (plafond 2-4 joueurs)', () => {
    expect(theoreticalRake(402, true, nl2(4))).toBe(10);
  });
  it('5,59 € à 6 joueurs → 0,25 € (plafond 6 joueurs)', () => {
    expect(theoreticalRake(559, true, nl2(6))).toBe(25);
  });
  it('0,40 € à 6 joueurs → 0,02 € (6 % arrondi au centime inférieur)', () => {
    expect(theoreticalRake(40, true, nl2(6))).toBe(2);
  });
  it('pot sans flop → 0 (no flop, no drop)', () => {
    expect(theoreticalRake(500, false, nl2(6))).toBe(0);
  });
});

describe('rakeEntryFor', () => {
  it('sélectionne la bonne tranche de plafond', () => {
    expect(nl2(2).capCents).toBe(10);
    expect(nl2(3).capCents).toBe(10);
    expect(nl2(4).capCents).toBe(10);
    expect(nl2(5).capCents).toBe(15);
    expect(nl2(6).capCents).toBe(25);
  });
  it('NL5/NL10 : plafond non mesuré (null)', () => {
    expect(rakeEntryFor({ stake: 'NL5', playersDealt: 6 }).capCents).toBeNull();
    expect(rakeEntryFor({ stake: 'NL10', playersDealt: 6 }).capCents).toBeNull();
  });
});

// Mains minimales pour measureRake (ne lit que board/totalPot/rake/playersDealt/bb).
const pot = (p: Partial<ParsedHand>): ParsedHand =>
  ({ bb: 2, board: ['Ah', 'Kd', 'Qc'], totalPot: 0, rake: 0, playersDealt: 6, ...p }) as ParsedHand;

describe('measureRake', () => {
  it('retient un plafond seulement si ≥ 3 pots partagent le rake maximal', () => {
    const hands = [
      pot({ playersDealt: 6, totalPot: 500, rake: 25 }),
      pot({ playersDealt: 6, totalPot: 600, rake: 25 }),
      pot({ playersDealt: 6, totalPot: 700, rake: 25 }),
      pot({ playersDealt: 6, totalPot: 100, rake: 6 }),
    ];
    const six = measureRake(hands).find((b) => b.min === 6)!;
    expect(six.capCents).toBe(25); // 3 pots à 25
    expect(six.sampleSize).toBe(4);
    expect(six.rate).toBeGreaterThan(0.04);
  });

  it('pas de plafond si moins de 3 pots au max', () => {
    const hands = [
      pot({ playersDealt: 6, totalPot: 500, rake: 25 }),
      pot({ playersDealt: 6, totalPot: 600, rake: 25 }),
      pot({ playersDealt: 6, totalPot: 100, rake: 6 }),
    ];
    const six = measureRake(hands).find((b) => b.min === 6)!;
    expect(six.capCents).toBeNull();
  });
});
