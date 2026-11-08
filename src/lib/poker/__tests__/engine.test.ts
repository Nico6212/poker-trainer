import { describe, expect, it } from 'vitest';
import type { Card } from '../cards';
import {
  applyAction,
  createHand,
  legalActions,
  playerAt,
  type HandState,
  type SeatConfig,
} from '../engine';

const BLINDS = { sb: 1, bb: 2 }; // 0,01 € / 0,02 € en centimes

function seat(seatNo: number, stack: number): SeatConfig {
  return { id: `p${seatNo}`, name: `Joueur ${seatNo}`, seat: seatNo, stack };
}

// La distribution donne deux cartes consécutives par joueur, en partant de la gauche du bouton,
// puis le board est tiré du dessus du paquet (flop, turn, river, sans burn).
const BOARD: Card[] = ['2c', '7d', '9s', '4c', 'Jh'];

/** Paquet heads-up avec bouton au siège 0 : le siège 1 (BB) reçoit les deux premières cartes. */
function huDeck(bbCards: Card[], btnCards: Card[], board: Card[] = BOARD): Card[] {
  return [...bbCards, ...btnCards, ...board];
}

function huHand(stacks: [number, number] = [200, 200], deck?: Card[]): HandState {
  return createHand({
    handId: 1,
    seats: [seat(0, stacks[0]), seat(1, stacks[1])],
    buttonSeat: 0,
    blinds: BLINDS,
    deck: deck ?? huDeck(['Ah', 'Ad'], ['Kh', 'Kd']),
  });
}

describe('createHand', () => {
  it('heads-up : le bouton poste la petite blinde et parle en premier', () => {
    const state = huHand();
    expect(playerAt(state, 0).streetBet).toBe(1);
    expect(playerAt(state, 1).streetBet).toBe(2);
    expect(state.toActSeat).toBe(0);
    expect(playerAt(state, 1).holeCards).toEqual(['Ah', 'Ad']);
    expect(playerAt(state, 0).holeCards).toEqual(['Kh', 'Kd']);

    const la = legalActions(state);
    expect(la.callAmount).toBe(1);
    expect(la.minRaiseTo).toBe(4); // BB + une relance d'au moins une BB
    expect(la.canBet).toBe(false); // préflop la BB est déjà une mise
  });

  it('6-max : SB et BB à gauche du bouton, l’UTG parle en premier', () => {
    const state = createHand({
      handId: 1,
      seats: [0, 1, 2, 3, 4, 5].map((n) => seat(n, 200)),
      buttonSeat: 0,
      blinds: BLINDS,
    });
    expect(playerAt(state, 1).streetBet).toBe(1);
    expect(playerAt(state, 2).streetBet).toBe(2);
    expect(state.toActSeat).toBe(3);
  });
});

describe('enchères', () => {
  it('rejette une relance sous le minimum', () => {
    const state = huHand();
    expect(() => applyAction(state, { type: 'raise', amount: 3 })).toThrow(/minimum/i);
  });

  it('après une relance, le minimum de sur-relance grandit d’autant', () => {
    const state = applyAction(huHand(), { type: 'raise', amount: 6 }); // relance de 4
    expect(state.toActSeat).toBe(1);
    const la = legalActions(state);
    expect(la.callAmount).toBe(4);
    expect(la.minRaiseTo).toBe(10); // 6 + relance précédente de 4
  });

  it('rejette un check face à une mise et un bet préflop', () => {
    const state = huHand();
    expect(() => applyAction(state, { type: 'check' })).toThrow();
    expect(() => applyAction(state, { type: 'bet', amount: 10 })).toThrow();
  });

  it('la BB garde son option : elle peut checker ou relancer après un limp', () => {
    const state = applyAction(huHand(), { type: 'call' });
    expect(state.toActSeat).toBe(1);
    const la = legalActions(state);
    expect(la.canCheck).toBe(true);
    expect(la.canRaise).toBe(true);
    expect(la.minRaiseTo).toBe(4);
  });

  it('fold préflop : l’adversaire encaisse sans abattage', () => {
    const state = applyAction(huHand(), { type: 'fold' });
    expect(state.result?.wonWithoutShowdown).toBe(true);
    expect(state.toActSeat).toBeNull();
    // La BB récupère sa blinde non suivie + la petite blinde adverse.
    expect(playerAt(state, 1).stack).toBe(201);
    expect(playerAt(state, 0).stack).toBe(199);
  });

  it('une mise non suivie est remboursée', () => {
    let state = applyAction(huHand(), { type: 'call' });
    state = applyAction(state, { type: 'check' }); // flop
    state = applyAction(state, { type: 'bet', amount: 10 }); // BB mise
    state = applyAction(state, { type: 'fold' }); // bouton se couche
    expect(playerAt(state, 1).stack).toBe(202); // 200 − 2 − 10 + 10 remboursés + pot de 4
    expect(playerAt(state, 0).stack).toBe(198);
  });

  it('rejette une mise sous la blinde postflop', () => {
    let state = applyAction(huHand(), { type: 'call' });
    state = applyAction(state, { type: 'check' });
    expect(state.street).toBe('flop');
    expect(() => applyAction(state, { type: 'bet', amount: 1 })).toThrow(/minimum/i);
  });
});

describe('déroulé des streets', () => {
  it('check-check fait avancer flop → turn → river → abattage', () => {
    let state = applyAction(huHand(), { type: 'call' });
    state = applyAction(state, { type: 'check' });
    expect(state.street).toBe('flop');
    expect(state.board).toEqual(['2c', '7d', '9s']);
    expect(state.pot).toBe(4);
    expect(state.toActSeat).toBe(1); // postflop, la BB parle en premier en heads-up

    for (const expected of ['turn', 'river', 'showdown'] as const) {
      state = applyAction(state, { type: 'check' });
      state = applyAction(state, { type: 'check' });
      expect(state.street).toBe(expected);
    }

    // AA de la BB bat KK du bouton sur 2c 7d 9s 4c Jh.
    expect(state.result?.wonWithoutShowdown).toBe(false);
    expect(state.result?.winners).toEqual([
      expect.objectContaining({ seat: 1, amount: 4 }),
    ]);
    expect(playerAt(state, 1).stack).toBe(202);
    expect(playerAt(state, 0).stack).toBe(198);
  });
});

describe('all-in et side pots', () => {
  it('trois joueurs à des tapis différents → pot principal + side pot', () => {
    // Bouton siège 0 ; distribution en partant du siège 1 (SB), puis 2 (BB), puis 0.
    const deck: Card[] = ['Kh', 'Kd', 'Ah', 'Ad', 'Qh', 'Qd', ...BOARD];
    let state = createHand({
      handId: 1,
      seats: [seat(0, 200), seat(1, 100), seat(2, 40)],
      buttonSeat: 0,
      blinds: BLINDS,
      deck,
    });
    expect(state.toActSeat).toBe(0); // à 3 joueurs, le bouton est UTG

    state = applyAction(state, { type: 'raise', amount: 100 });
    state = applyAction(state, { type: 'call' }); // SB all-in à 100
    state = applyAction(state, { type: 'call' }); // BB all-in à 40
    // Plus personne ne peut enchérir : le board se déroule jusqu'à l'abattage.
    expect(state.street).toBe('showdown');
    expect(state.result?.pots).toEqual([
      { amount: 120, eligibleSeats: [0, 1, 2] },
      { amount: 120, eligibleSeats: [0, 1] },
    ]);
    // AA (siège 2) gagne le pot principal, KK (siège 1) le side pot, QQ (siège 0) rien.
    expect(playerAt(state, 2).stack).toBe(120);
    expect(playerAt(state, 1).stack).toBe(120);
    expect(playerAt(state, 0).stack).toBe(100);
  });

  it('un all-in plus petit qu’une relance complète ne rouvre pas l’enchère', () => {
    let state = huHand([100, 8], huDeck(['Ah', 'Ad'], ['Kh', 'Kd']));
    state = applyAction(state, { type: 'raise', amount: 6 }); // relance complète de 4
    state = applyAction(state, { type: 'raise', amount: 8 }); // all-in BB : relance de 2 < 4

    expect(state.toActSeat).toBe(0);
    const la = legalActions(state);
    expect(la.canRaise).toBe(false);
    expect(la.callAmount).toBe(2);
    expect(() => applyAction(state, { type: 'raise', amount: 12 })).toThrow(/autorisée/i);

    state = applyAction(state, { type: 'call' });
    expect(state.street).toBe('showdown');
    expect(playerAt(state, 1).stack).toBe(16); // la BB double avec ses as
    expect(playerAt(state, 0).stack).toBe(92);
  });

  it('rembourse la part non couverte d’un all-in sur-relancé', () => {
    // BB n'a que 40 : le bouton relance à 100, la BB paie 40 all-in → 60 rendus au bouton.
    let state = huHand([200, 40], huDeck(['Ah', 'Ad'], ['Kh', 'Kd']));
    state = applyAction(state, { type: 'raise', amount: 100 });
    state = applyAction(state, { type: 'call' });
    expect(state.street).toBe('showdown');
    expect(playerAt(state, 1).stack).toBe(80); // 40 contre 40
    expect(playerAt(state, 0).stack).toBe(160); // 200 − 100 + 60 remboursés
  });
});

describe('abattage', () => {
  it('partage le pot en cas d’égalité, centime impair au plus proche à gauche du bouton', () => {
    // Board AAKKQ : les deux mains jouent le board → égalité, pot impair de 5.
    const deck: Card[] = ['7c', '8c', '2h', '3s', '2c', '3d', 'Ah', 'Ad', 'Kh', 'Kc', 'Qs'];
    let state = createHand({
      handId: 1,
      seats: [seat(0, 200), seat(1, 200), seat(2, 200)],
      buttonSeat: 0,
      blinds: BLINDS,
      deck,
    });
    state = applyAction(state, { type: 'call' }); // bouton limp
    state = applyAction(state, { type: 'fold' }); // SB se couche → pot impair
    state = applyAction(state, { type: 'check' }); // BB checke son option
    for (let i = 0; i < 6; i++) state = applyAction(state, { type: 'check' });

    expect(state.street).toBe('showdown');
    expect(playerAt(state, 2).stack).toBe(201); // 2 + le centime impair
    expect(playerAt(state, 0).stack).toBe(200);
    expect(playerAt(state, 1).stack).toBe(199);
  });

  it('expose la combinaison gagnante', () => {
    let state = applyAction(huHand(), { type: 'call' });
    for (let i = 0; i < 7; i++) state = applyAction(state, { type: 'check' });
    expect(state.street).toBe('showdown');
    expect(state.result?.winners[0]?.handName).toMatch(/pair/i);
  });
});
