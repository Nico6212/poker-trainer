import { describe, expect, it } from 'vitest';
import { parseAmount, parsePokerStars } from '../parse-pokerstars';
import { extractSpots } from '../extract-spots';

// Fixture : une main cash 6-max NL2 où le héros ouvre, c-bet, puis fait face à un
// check-raise turn (le spot clé). CRLF, BOM et lignes parasites inclus exprès.
const HAND = [
  'PokerStars Hand #241000000001:  Hold\'em No Limit (€0.01/€0.02 EUR) - 2024/01/15 20:00:00 CET',
  "Table 'Firenze' 6-max Seat #1 is the button",
  'Seat 1: villain1 (€2 in chips)',
  'Seat 2: Hero (€2.50 in chips)',
  'Seat 3: villain3 (€1.80 in chips)',
  'villain3: posts small blind €0.01',
  'villain1: posts big blind €0.02',
  'villain3 is connected',
  '*** HOLE CARDS ***',
  'Dealt to Hero [5c 5d]',
  'Hero: raises €0.04 to €0.06',
  'villain1: calls €0.04',
  'villain3: folds',
  'villain1 said, "nh"',
  '*** FLOP *** [5s 6d 2h]',
  'villain1: checks',
  'Hero: bets €0.08',
  'villain1: calls €0.08',
  '*** TURN *** [5s 6d 2h] [7d]',
  'villain1: checks',
  'Hero: bets €0.14',
  'villain1: raises €0.30 to €0.44',
  'Hero: calls €0.30',
  '*** RIVER *** [5s 6d 2h 7d] [3d]',
  'villain1: bets €1.00',
  'Hero: folds',
  'Uncalled bet (€1.00) returned to villain1',
  'villain1 collected €1.78 from pot',
  '*** SUMMARY ***',
  'Total pot €1.80 | Rake €0.02',
].join('\r\n');

const FILE = '﻿' + HAND + '\n\n\n' + HAND.replace('#241000000001', '#241000000002');

describe('parseAmount', () => {
  it('gère €0.02, €2, sans symbole', () => {
    expect(parseAmount('€0.02')).toBe(2);
    expect(parseAmount('€2')).toBe(200);
    expect(parseAmount('0.06')).toBe(6);
  });
});

describe('parsePokerStars', () => {
  it('parse une main cash, ignore le bruit, dédoublonne, gère BOM/CRLF', () => {
    const { hands, skipped } = parsePokerStars(FILE);
    // Deux mains dans le fichier mais numéros différents → 2 ; si mêmes → 1.
    expect(hands).toHaveLength(2);
    expect(skipped).toHaveLength(0);
    const h = hands[0];
    expect(h.id).toBe('241000000001');
    expect(h.sb).toBe(1);
    expect(h.bb).toBe(2);
    expect(h.buttonSeat).toBe(1);
    expect(h.heroName).toBe('Hero');
    expect(h.heroSeat).toBe(2);
    expect(h.heroCards).toEqual(['5c', '5d']);
    expect(h.board).toEqual(['5s', '6d', '2h', '7d', '3d']);
    // Les lignes « is connected », « said, », « collected » n'ont pas créé d'action.
    expect(h.actions.some((a) => a.type === 'raise' && a.name === 'Hero')).toBe(true);
    expect(h.actions.some((a) => a.type === 'uncalled')).toBe(true);
  });

  it('dédoublonne par numéro de main', () => {
    const twice = HAND + '\n\n\n' + HAND;
    expect(parsePokerStars(twice).hands).toHaveLength(1);
  });

  it('signale les historiques français sans planter', () => {
    const fr = 'Main PokerStars n° 123:  No Limit Hold\'em\nTable toto\n';
    const { hands, skipped } = parsePokerStars(fr);
    expect(hands).toHaveLength(0);
    expect(skipped[0].reason).toBe('french');
  });

  it('signale les tournois comme non supportés', () => {
    const tourney = [
      'PokerStars Hand #99: Tournament #1, €1 Hold\'em No Limit - Level I (10/20) - 2024/01/01 12:00:00 ET',
      "Table '1 1' 6-max Seat #1 is the button",
      'Seat 1: a (1500 in chips)',
      'Seat 2: b (1500 in chips)',
      '*** HOLE CARDS ***',
      'Dealt to a [Ah Kh]',
    ].join('\n');
    expect(parsePokerStars(tourney).skipped[0].reason).toBe('tournament');
  });
});

describe('net du héros, table, horodatage', () => {
  it('capture le nom de table et l’horodatage', () => {
    const h = parsePokerStars(HAND).hands[0];
    expect(h.table).toBe('Firenze');
    expect(h.playedAt).toBe(Date.parse('2024-01-15T20:00:00'));
    // Héros perd : investi 6 (préflop) + 8 (flop) + 44 (turn), rien collecté.
    expect(h.heroNet).toBe(-58);
  });

  it('horodatage avec heure à un chiffre (avant 10h) — PokerStars ne zéro-padde pas', () => {
    const morning = HAND.replace('2024/01/15 20:00:00', '2024/01/15 9:34:20');
    const h = parsePokerStars(morning).hands[0];
    expect(h.playedAt).toBe(Date.parse('2024-01-15T09:34:20'));
  });

  it('pot partagé : le héros récupère sa moitié', () => {
    const split = [
      'PokerStars Hand #300: Hold\'em No Limit (€0.01/€0.02 EUR) - 2024/02/02 10:00:00 CET',
      "Table 'Split' 2-max Seat #1 is the button",
      'Seat 1: Hero (€2 in chips)',
      'Seat 2: villain (€2 in chips)',
      'Hero: posts small blind €0.01',
      'villain: posts big blind €0.02',
      '*** HOLE CARDS ***',
      'Dealt to Hero [Ah Ad]',
      'Hero: raises €0.04 to €0.06',
      'villain: calls €0.04',
      '*** FLOP *** [Ks Qd Jc]',
      'villain: checks',
      'Hero: checks',
      '*** TURN *** [Ks Qd Jc] [Td]',
      'villain: checks',
      'Hero: checks',
      '*** RIVER *** [Ks Qd Jc Td] [2c]',
      'villain: checks',
      'Hero: checks',
      '*** SHOW DOWN ***',
      'Hero: shows [Ah Ad] (a straight, Ace to Ten)',
      'villain: shows [As Ac] (a straight, Ace to Ten)',
      'Hero collected €0.06 from pot',
      'villain collected €0.06 from pot',
      '*** SUMMARY ***',
    ].join('\n');
    const h = parsePokerStars(split).hands[0];
    // Héros a investi 6 (SB 1 + 5 de la relance) et récupère 6 → net 0.
    expect(h.heroNet).toBe(0);
  });

  it('side pot : les « collected » du héros sont sommés', () => {
    const side = [
      'PokerStars Hand #301: Hold\'em No Limit (€0.01/€0.02 EUR) - 2024/02/02 11:00:00 CET',
      "Table 'Side' 6-max Seat #1 is the button",
      'Seat 1: Hero (€2 in chips)',
      'Seat 2: shorty (€0.20 in chips)',
      'Seat 3: villain (€2 in chips)',
      'shorty: posts small blind €0.01',
      'villain: posts big blind €0.02',
      '*** HOLE CARDS ***',
      'Dealt to Hero [Ah Ad]',
      'Hero: raises €0.08 to €0.10',
      'shorty: raises €0.10 to €0.20 and is all-in',
      'villain: calls €0.18',
      'Hero: raises €1.00 to €1.20',
      'villain: folds',
      'Uncalled bet (€1.00) returned to Hero',
      '*** FLOP *** [2c 7d 9s]',
      '*** TURN *** [2c 7d 9s] [3h]',
      '*** RIVER *** [2c 7d 9s 3h] [Kd]',
      '*** SHOW DOWN ***',
      'Hero: shows [Ah Ad] (a pair of Aces)',
      'shorty: shows [Ks Kc] (a pair of Kings)',
      'Hero collected €0.40 from main pot',
      'Hero collected €0.36 from side pot',
      '*** SUMMARY ***',
    ].join('\n');
    const h = parsePokerStars(side).hands[0];
    // Investi : 20 (raise to 0.20 après remboursement du 1.00). Collecté : 40 + 36 = 76. Net +56.
    expect(h.heroNet).toBe(56);
  });
});

describe('extractSpots', () => {
  const hand = parsePokerStars(FILE).hands[0];
  const spots = extractSpots(hand);

  it('capture chaque décision du héros', () => {
    // open préflop, c-bet flop, bet turn, call du check-raise turn, fold river.
    expect(spots).toHaveLength(5);
    expect(spots.map((s) => s.street)).toEqual(['preflop', 'flop', 'turn', 'turn', 'river']);
  });

  it('reconstruit pot et à-payer sans double comptage', () => {
    const openSpot = spots[0];
    expect(openSpot.facing).toBe('unopened');
    expect(openSpot.potBefore).toBe(3); // SB 1 + BB 2
    expect(openSpot.heroAction.type).toBe('raise');

    const river = spots[4];
    expect(river.facing).toBe('bet');
    expect(river.toCall).toBe(100); // il mise €1.00
    // Au milieu avant le fold : préflop 13 (SB 1 + BB→6 + Hero 6) + flop 16 + turn 88
    // + sa mise river 100 = 217.
    expect(river.potBefore).toBe(217);
  });

  it('détecte le check-raise turn (le spot clé)', () => {
    const checkRaiseCall = spots[3];
    expect(checkRaiseCall.street).toBe('turn');
    expect(checkRaiseCall.facing).toBe('checkRaise');
    expect(checkRaiseCall.heroAction.type).toBe('call');
    expect(checkRaiseCall.facedRaiseTo).toBe(44);
  });

  it('calcule le tapis effectif en BB', () => {
    // Au turn, villain1 est parti de €2 (100 BB) ; effectif raisonnable.
    const spot = spots[3];
    expect(spot.effectiveBB).toBeGreaterThan(0);
    expect(spot.bb).toBe(2);
  });
});
