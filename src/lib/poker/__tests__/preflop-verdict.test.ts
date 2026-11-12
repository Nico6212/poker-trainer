import { describe, expect, it } from 'vitest';
import { createDeck, type Card } from '../cards';
import { applyAction, createHand, type SeatConfig } from '../engine';
import { buildRangeGrid, preflopHintsVisible, preflopVerdict } from '../preflop-verdict';
import { combosForClasses, expandNotation, openRangeFor } from '../ranges';

const CASH = { sb: 1, bb: 2 };

/** Paquet où la main du héros est insérée à l'indice de distribution voulu. */
function deckWith(firstCardIndex: number, hero: [Card, Card]): Card[] {
  const rest = createDeck().filter((c) => c !== hero[0] && c !== hero[1]);
  const deck = rest.slice(0, 40);
  deck.splice(firstCardIndex, 0, hero[0], hero[1]);
  return deck;
}

function seat(n: number, stack: number): SeatConfig {
  return { id: `p${n}`, name: `J${n}`, seat: n, stack };
}

// Heads-up : bouton = siège 1 (= SB, parle en premier). Distribution : siège 0 d'abord.
// → héros SB/BTN = siège 1, ses cartes à l'indice 2 ; héros BB = siège 0, indice 0.
function huHand(hero: [Card, Card], who: 'sb' | 'bb', blinds = CASH, stacks: [number, number] = [400, 400]) {
  const firstCardIndex = who === 'sb' ? 2 : 0;
  return createHand({
    handId: 1,
    seats: [seat(0, stacks[0]), seat(1, stacks[1])],
    buttonSeat: 1,
    blinds,
    deck: deckWith(firstCardIndex, hero),
  });
}

describe('lot 1 — verdict préflop (plus jamais de limp)', () => {
  it('76o en SB heads-up : relance ou fold, jamais « payer rentable »', () => {
    const state = huHand(['7c', '6h'], 'sb');
    const v = preflopVerdict(state, 1)!;
    expect(v.situation).toBe('open');
    expect(v.position).toBe('BTN'); // en HU le bouton est la SB
    expect(v.headsUp).toBe(true);
    expect(v.hand).toBe('76o');
    expect(v.recommended).toEqual(['raise']);
    expect(v.recommended).not.toContain('call');
    expect(v.limpDiscouraged).toBe(true);
    expect(v.raiseTo).toBe(6); // 3 BB
  });

  it('72o UTG 6-max : fold', () => {
    const state = createHand({
      handId: 1,
      seats: [0, 1, 2, 3, 4, 5].map((n) => seat(n, 200)),
      buttonSeat: 0,
      blinds: CASH,
      deck: deckWith(4, ['7c', '2h']), // siège 3 (UTG) reçoit les cartes à l'indice 4
    });
    expect(state.toActSeat).toBe(3);
    const v = preflopVerdict(state, 3)!;
    expect(v.position).toBe('UTG');
    expect(v.hand).toBe('72o');
    expect(v.recommended).toEqual(['fold']);
  });

  it('AA : relance partout', () => {
    const v = preflopVerdict(huHand(['As', 'Ac'], 'sb'), 1)!;
    expect(v.recommended).toEqual(['raise']);
  });

  it('mains mixtes : AJs en BB face à une ouverture = call OU 3-bet', () => {
    let state = huHand(['As', 'Js'], 'bb');
    state = applyAction(state, { type: 'raise', amount: 6 }); // la SB ouvre
    expect(state.toActSeat).toBe(0); // au tour de la BB (héros)
    const v = preflopVerdict(state, 0)!;
    expect(v.situation).toBe('vs-raise');
    expect(v.recommended).toContain('raise');
    expect(v.recommended).toContain('call');
  });

  it('BB qui peut checker gratuitement : aucun verdict (ce n’est pas un limp)', () => {
    let state = huHand(['9s', '4d'], 'bb');
    state = applyAction(state, { type: 'call' }); // la SB complète (limpe)
    expect(state.toActSeat).toBe(0);
    expect(preflopVerdict(state, 0)).toBeNull();
  });

  it('tapis court (≤ 13 BB) : push ou fold, jamais « relance à 3 BB »', () => {
    const shove = preflopVerdict(huHand(['As', 'Ac'], 'sb', { sb: 10, bb: 20 }, [4000, 200]), 1)!;
    expect(shove.situation).toBe('push-fold');
    expect(shove.recommended).toEqual(['raise']);
    expect(shove.isAllIn).toBe(true);
    expect(shove.raiseTo).not.toBe(60); // surtout pas 3 BB

    const laydown = preflopVerdict(huHand(['3c', '2d'], 'sb', { sb: 10, bb: 20 }, [4000, 200]), 1)!;
    expect(laydown.situation).toBe('push-fold');
    expect(laydown.recommended).toEqual(['fold']);
  });
});

describe('ranges par format', () => {
  it('range d’open SB heads-up : large (76o oui), jette les pires dépareillées', () => {
    const open = expandNotation(openRangeFor(2, 'BTN'));
    expect(open.has('76o')).toBe(true);
    for (const trash of ['72o', '82o', '32o', '92o', 'T2o', '63o', '43o']) {
      expect(open.has(trash)).toBe(false);
    }
    const share = combosForClasses(open).length / 1326;
    expect(share).toBeGreaterThan(0.78);
    expect(share).toBeLessThan(0.9);
  });
});

describe('mode Masqué : aucun indice avant la décision', () => {
  it('masqué ne montre aucun indice de l’action conseillée tant que le joueur n’a pas décidé', () => {
    // La politique gouverne tout l'affichage préflop (texte du verdict, entourage
    // du bouton, grisé du limp, chip « Conseil »). En masqué, tout est masqué.
    expect(preflopHintsVisible('masque', false)).toBe(false);
    expect(preflopHintsVisible('masque', true)).toBe(false);
    // Découverte montre tout avant la décision ; l'examen seulement après la réponse.
    expect(preflopHintsVisible('decouverte', false)).toBe(true);
    expect(preflopHintsVisible('examen', false)).toBe(false);
    expect(preflopHintsVisible('examen', true)).toBe(true);
  });
});

describe('buildRangeGrid', () => {
  it('produit une grille 13×13 avec la main du héros surlignée', () => {
    const v = preflopVerdict(huHand(['7c', '6h'], 'sb'), 1)!;
    const grid = buildRangeGrid(v);
    expect(grid).toHaveLength(13);
    expect(grid[0]).toHaveLength(13);
    const hero = grid.flat().filter((c) => c.isHero);
    expect(hero).toHaveLength(1);
    expect(hero[0].hand).toBe('76o');
    expect(hero[0].action).toBe('raise');
    // La diagonale, ce sont les paires.
    expect(grid[0][0].hand).toBe('AA');
    expect(grid[12][12].hand).toBe('22');
  });
});
