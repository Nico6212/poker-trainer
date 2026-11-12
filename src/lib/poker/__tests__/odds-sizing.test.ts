import { describe, expect, it } from 'vitest';
import type { Card } from '../cards';
import { applyAction, createHand, getDisplayedPot, heroPotOdds, type SeatConfig } from '../engine';
import { potOddsDetail } from '../pot';
import { betSizeTarget, neutralPrefill, prefillAmount } from '../sizing';

const BLINDS = { sb: 1, bb: 2 };
const BOARD: Card[] = ['2c', '7d', '9s', '4c', 'Jh'];

function seat(n: number, stack: number): SeatConfig {
  return { id: `p${n}`, name: `J${n}`, seat: n, stack };
}

// Heads-up, bouton = siège 1 (= SB, parle en premier).
function huHand(stacks: [number, number] = [400, 400]) {
  return createHand({
    handId: 1,
    seats: [seat(0, stacks[0]), seat(1, stacks[1])],
    buttonSeat: 1,
    blinds: BLINDS,
    deck: [...['Ah', 'Ad'] as Card[], ...['Kh', 'Kd'] as Card[], ...BOARD],
  });
}

describe('heroPotOdds — chemin complet état → cote (pas de double comptage)', () => {
  it('PB en heads-up : il faut 25 %, jamais 14 %', () => {
    const state = huHand(); // SB (siège 1) à parler, a posté 1, BB a 2
    const odds = heroPotOdds(state, 1)!;
    expect(odds.toCall).toBe(1);
    expect(odds.potBefore).toBe(3); // = pot affiché, pas réadditionné
    expect(odds.finalPot).toBe(4);
    expect(odds.required).toBeCloseTo(0.25);
    expect(odds.required).not.toBeCloseTo(1 / 7); // 14 % = le bug du double comptage
  });

  it('potBefore vaut exactement le pot affiché (invariant anti-double-comptage)', () => {
    let state = huHand();
    state = applyAction(state, { type: 'call' }); // SB complète
    state = applyAction(state, { type: 'check' }); // BB checke → flop
    state = applyAction(state, { type: 'bet', amount: 6 }); // BB mise 6 au flop
    const odds = heroPotOdds(state, 1)!; // le bouton fait face à la mise
    expect(odds.potBefore).toBe(getDisplayedPot(state));
    expect(odds.finalPot).toBe(getDisplayedPot(state) + odds.toCall);
  });
});

describe('potOddsDetail — cas postflop du cahier des charges', () => {
  it('pot collecté 0,12 €, il mise 0,06 € → 25 %', () => {
    const d = potOddsDetail({ collectedPot: 12, heroStreetBet: 0, villainBet: 6 });
    expect(d.toCall).toBe(6);
    expect(d.finalPot).toBe(24); // 12 + 6 + 6
    expect(d.required).toBeCloseTo(0.25);
  });
});

describe('betSizeTarget — boutons de taille', () => {
  it('personne n’a misé : la mise se calcule sur le pot affiché', () => {
    const base = { facing: false, currentBet: 0, callAmount: 0, displayedPot: 12, minTo: 2, maxTo: 400 };
    expect(betSizeTarget({ ...base, fraction: 1 / 3 })).toBe(4);
    expect(betSizeTarget({ ...base, fraction: 1 / 2 })).toBe(6);
    expect(betSizeTarget({ ...base, fraction: 2 / 3 })).toBe(8);
    expect(betSizeTarget({ ...base, fraction: 1 })).toBe(12); // « Pot » = pot affiché
  });

  it('face à une mise : relance « pot » = call + (pot après le call)', () => {
    // Pot affiché 18 (dont sa mise de 6), call 6. Relance pot = 6 + (18 + 6) = 30.
    const target = betSizeTarget({
      facing: true,
      currentBet: 6,
      callAmount: 6,
      displayedPot: 18,
      minTo: 12,
      maxTo: 400,
      fraction: 1,
    });
    expect(target).toBe(30);
    // Le montant AJOUTÉ par-dessus la mise en cours = pot après le call (24).
    expect(target - 6).toBe(18 + 6);
  });

  it('tapis : fraction null → maxTo', () => {
    expect(
      betSizeTarget({ facing: true, currentBet: 6, callAmount: 6, displayedPot: 18, minTo: 12, maxTo: 400, fraction: null }),
    ).toBe(400);
  });
});

describe('préremplissage neutre selon le mode d’aide', () => {
  it('neutralPrefill : 3 BB à l’ouverture, ½ pot postflop, 3× la mise face à une relance', () => {
    const common = { bb: 2, callAmount: 0, minTo: 2, maxTo: 1000 };
    // Préflop non relancé (currentBet = bb) → ouverture 3 BB = 6.
    expect(neutralPrefill({ ...common, currentBet: 2, displayedPot: 3 })).toBe(6);
    // Postflop sans mise (currentBet 0) → ½ pot de 12 = 6.
    expect(neutralPrefill({ ...common, currentBet: 0, displayedPot: 12 })).toBe(6);
    // Face à une relance (currentBet 6) → 3× = 18.
    expect(neutralPrefill({ ...common, currentBet: 6, displayedPot: 20, minTo: 12 })).toBe(18);
  });

  it('en Masqué, la valeur préremplie ne révèle pas l’action conseillée', () => {
    // Spot d'isolation : conseil = 8 (3 BB + 1 par limpeur), neutre = 6 (3 BB flat).
    const advice = 8;
    const neutral = 6;
    // Découverte révèle le conseil ; Masqué/Examen restent sur le neutre.
    expect(prefillAmount(true, advice, neutral)).toBe(advice);
    expect(prefillAmount(false, advice, neutral)).toBe(neutral);
    expect(prefillAmount(false, advice, neutral)).not.toBe(advice);
  });
});
