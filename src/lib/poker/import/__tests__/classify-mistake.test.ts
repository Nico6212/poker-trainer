import { describe, expect, it } from 'vitest';
import type { Card } from '../../cards';
import { classifySpot } from '../classify-mistake';
import type { FacingKind, HeroAction, HeroSpot } from '../extract-spots';

const BB = 2; // NL2 : 0,02 €

function spot(p: Partial<HeroSpot> & { heroCards: [Card, Card]; heroAction: HeroAction }): HeroSpot {
  return {
    handId: 'h',
    street: 'flop',
    board: [],
    bb: BB,
    potBefore: 100,
    toCall: 0,
    heroStreetInvested: 0,
    currentBet: 0,
    facingBet: false,
    facing: 'bet' as FacingKind,
    effectiveBB: 100,
    playersInHand: 2,
    limpers: 0,
    villainAllIn: false,
    aggressorSeat: 1,
    facedRaiseTo: 0,
    ...p,
  };
}

const call = (amount = 0): HeroAction => ({ type: 'call', amount });
const foldA: HeroAction = { type: 'fold', amount: 0 };
const jam: HeroAction = { type: 'raise', amount: 0, allIn: true };

describe('non-régression — mes vraies mains (adversaires anonymisés)', () => {
  it('Brelan de 5 : call du check-raise turn (39 % pour 24 %) → PAS une erreur', () => {
    const m = classifySpot(
      spot({
        street: 'turn',
        heroCards: ['5s', '5d'],
        board: ['6d', '5h', '7d', '3d'],
        facing: 'checkRaise',
        facingBet: true,
        toCall: 28,
        potBefore: 89, // il a les cotes directes : call défendable
        heroAction: call(28),
      }),
      { preAggressor: false },
    );
    expect(m).toBeNull();
  });

  it('Brelan de 5 : call du tapis river (il faut ~31 %) → erreur', () => {
    const m = classifySpot(
      spot({
        street: 'river',
        heroCards: ['5s', '5d'],
        board: ['6d', '5h', '7d', '3d', '2c'],
        facing: 'raisePostflop', // le tapis sur-relance la mise du héros
        villainAllIn: true,
        facingBet: true,
        toCall: 121,
        potBefore: 265, // pot final ~3,86 € − call 1,21 €
        heroAction: call(121),
      }),
      { preAggressor: false },
    );
    expect(m).not.toBeNull();
    expect(['call-raise-faible', 'call-sans-cote']).toContain(m!.type);
  });

  it('QQ court flop : tapis de 0,11 € dans ~0,70 € (il faut ~14 %) → PAS une erreur', () => {
    const m = classifySpot(
      spot({
        street: 'flop',
        heroCards: ['Qs', 'Qd'],
        board: ['Kd', '4h', '8s'],
        facing: 'bet',
        villainAllIn: true,
        facingBet: true,
        toCall: 11,
        potBefore: 70,
        heroAction: call(11),
      }),
      { preAggressor: false },
    );
    expect(m).toBeNull();
  });

  it('JJ : call d’une sur-relance sur board pairé → erreur', () => {
    const m = classifySpot(
      spot({
        street: 'flop',
        heroCards: ['Js', 'Jd'],
        board: ['9c', '9d', '5c'],
        facing: 'raisePostflop',
        facingBet: true,
        toCall: 22,
        potBefore: 60,
        heroAction: call(22),
      }),
      { preAggressor: false },
    );
    expect(m?.type).toBe('call-raise-faible');
  });

  it('JJ : tapis turn après le K → jam avec une main moyenne', () => {
    const m = classifySpot(
      spot({
        street: 'turn',
        heroCards: ['Js', 'Jd'],
        board: ['9c', '9d', '5c', 'Ks'],
        facing: 'checkPostflop',
        facingBet: false,
        toCall: 0,
        potBefore: 120,
        heroAction: jam,
      }),
      { preAggressor: false },
    );
    expect(m?.type).toBe('jam-main-moyenne');
  });

  it('QQ : tapis sur board bas sans tirage → PAS une erreur (la population paie large)', () => {
    // Overpair massif sur 8-5-2 rainbow : la range qui paie un tapis à NL2 (paires
    // inférieures, top paire, tirages) est battue par QQ → tapis légitime, pas d'erreur.
    const m = classifySpot(
      spot({
        street: 'flop',
        heroCards: ['Qh', 'Qs'],
        board: ['8s', '5d', '2c'],
        facing: 'checkPostflop',
        facingBet: false,
        toCall: 0,
        potBefore: 60,
        heroAction: { type: 'bet', amount: 60, allIn: true },
      }),
      { preAggressor: false },
    );
    expect(m).toBeNull();
  });

  it('Q4o : call du tapis river (trips battus par les fulls/couleurs) → erreur', () => {
    const m = classifySpot(
      spot({
        street: 'river',
        heroCards: ['4d', 'Qc'],
        board: ['5h', '6c', '4c', 'Jc', '4h'],
        facing: 'raisePostflop', // le tapis sur-relance la mise du héros
        villainAllIn: true,
        facingBet: true,
        toCall: 83,
        potBefore: 90,
        heroAction: call(83),
      }),
      { preAggressor: false },
    );
    expect(m?.type).toBe('call-raise-faible');
  });

  it('Q9cc : call d’un tapis turn avec le seul tirage couleur → call sans la cote', () => {
    const m = classifySpot(
      spot({
        street: 'turn',
        heroCards: ['9c', 'Qc'],
        board: ['Kc', 'Ac', '5d', '3h'],
        facing: 'bet',
        villainAllIn: true,
        facingBet: true,
        toCall: 89,
        potBefore: 60,
        heroAction: call(89),
      }),
      { preAggressor: false },
    );
    expect(m).not.toBeNull();
    expect(['call-raise-faible', 'call-sans-cote']).toContain(m!.type);
  });

  it('QQ profond : call d’un 4-bet à ~100 BB → erreur', () => {
    const m = classifySpot(
      spot({
        street: 'preflop',
        heroCards: ['Qs', 'Qd'],
        facing: '4bet+',
        facingBet: true,
        effectiveBB: 100,
        toCall: 42,
        heroAction: call(42),
      }),
      { preAggressor: true },
    );
    expect(m?.type).toBe('4bet-call');
  });

  it('QQ court : call d’un 4-bet d’un joueur à 20 BB → PAS une erreur', () => {
    const m = classifySpot(
      spot({
        street: 'preflop',
        heroCards: ['Qs', 'Qd'],
        facing: '4bet+',
        facingBet: true,
        effectiveBB: 20,
        toCall: 11,
        heroAction: call(11),
      }),
      { preAggressor: true },
    );
    expect(m).toBeNull();
  });

  it('J8s : deux paires max face au tapis du 3-bettor (~80 %) → PAS une erreur', () => {
    const m = classifySpot(
      spot({
        street: 'flop',
        heroCards: ['Js', '8s'],
        board: ['8c', 'Jc', '4s'],
        facing: 'bet',
        villainAllIn: true,
        facingBet: true,
        toCall: 150,
        potBefore: 120,
        heroAction: call(150),
      }),
      { preAggressor: true },
    );
    expect(m).toBeNull();
  });

  it('QJ : fold d’une quinte face à une mise → fold avec la cote', () => {
    const m = classifySpot(
      spot({
        street: 'river',
        heroCards: ['Qh', 'Js'],
        board: ['Kd', 'Qc', '9h', 'Th', '7d'],
        facing: 'bet',
        facingBet: true,
        toCall: 44,
        potBefore: 66,
        heroAction: foldA,
      }),
      { preAggressor: false },
    );
    expect(m?.type).toBe('fold-avec-cote');
  });

  it('3-bet petit : AJo à 5 BB contre 3 BB → erreur de taille', () => {
    const m = classifySpot(
      spot({
        street: 'preflop',
        heroCards: ['Ah', 'Jc'],
        facing: 'raise',
        facedRaiseTo: 6,
        heroAction: { type: 'raise', amount: 4, toAmount: 10 },
      }),
      { preAggressor: false },
    );
    expect(m?.type).toBe('small-3bet');
  });

  it('3-bet correct : A9o à 9 BB contre 3 BB → PAS d’erreur', () => {
    const m = classifySpot(
      spot({
        street: 'preflop',
        heroCards: ['As', '9d'],
        facing: 'raise',
        facedRaiseTo: 6,
        heroAction: { type: 'raise', amount: 12, toAmount: 18 },
      }),
      { preAggressor: false },
    );
    expect(m).toBeNull();
  });
});
