import { describe, expect, it } from 'vitest';
import { decideBot } from '../bots/decide';
import { mulberry32, type Card } from '../cards';
import {
  applyAction,
  createHand,
  nextSeatClockwise,
  type BotProfile,
  type SeatConfig,
} from '../engine';

const BLINDS = { sb: 1, bb: 2 };
const START_STACK = 200;
const BOARD: Card[] = ['2c', '7d', '9s', '4c', 'Jh'];

function seat(seatNo: number, profile: BotProfile, stack = START_STACK): SeatConfig {
  return {
    id: `bot${seatNo}`,
    name: `Bot ${seatNo}`,
    seat: seatNo,
    stack,
    isBot: true,
    botProfile: profile,
  };
}

describe('nextSeatClockwise', () => {
  it('tourne dans le sens horaire et reboucle', () => {
    expect(nextSeatClockwise([0, 2, 5], 0)).toBe(2);
    expect(nextSeatClockwise([0, 2, 5], 5)).toBe(0);
  });
});

describe('profils préflop', () => {
  // Le bot est au bouton heads-up avec J7o (hors range d'open du BTN) et parle en premier.
  const j7oAtButton = () =>
    createHand({
      handId: 1,
      seats: [seat(0, 'station'), seat(1, 'aggro')],
      buttonSeat: 1,
      blinds: BLINDS,
      // Distribution : siège 0 (BB) d'abord, puis siège 1 (BTN) qui reçoit J7o.
      deck: ['Ah', 'Ad', 'Jh', '7c', ...BOARD],
    });

  function countOpens(profile: BotProfile): number {
    let opens = 0;
    for (let i = 0; i < 100; i++) {
      const state = j7oAtButton();
      state.players[1].botProfile = profile;
      if (decideBot(state, mulberry32(i)).type === 'raise') opens++;
    }
    return opens;
  }

  it('l’agressif ouvre bien plus large que le serré', () => {
    const aggro = countOpens('aggro');
    const tight = countOpens('tight');
    expect(aggro).toBeGreaterThan(20);
    expect(tight).toBeLessThan(10);
    expect(aggro).toBeGreaterThan(tight + 15);
  });

  // 72o en BB face à une open du bouton : hors de toutes les ranges.
  const trash72oFacingOpen = () => {
    const state = createHand({
      handId: 1,
      seats: [seat(0, 'station'), seat(1, 'station')],
      buttonSeat: 1,
      // Siège 0 est la BB et reçoit 7♠2♥.
      deck: ['7s', '2h', 'Kh', 'Kd', ...BOARD],
      blinds: BLINDS,
    });
    return applyAction(state, { type: 'raise', amount: 6 });
  };

  function countFolds(profile: BotProfile): number {
    let folds = 0;
    for (let i = 0; i < 100; i++) {
      const state = trash72oFacingOpen();
      state.players[0].botProfile = profile;
      if (decideBot(state, mulberry32(1000 + i)).type === 'fold') folds++;
    }
    return folds;
  }

  it('le serré jette 72o face à une open, la station paie souvent', () => {
    expect(countFolds('tight')).toBeGreaterThan(85);
    expect(countFolds('station')).toBeLessThan(50);
  });

  it('aucun profil ne se couche quand il peut checker', () => {
    for (let i = 0; i < 50; i++) {
      const state = applyAction(j7oAtButton(), { type: 'call' }); // limp du bouton
      for (const profile of ['station', 'tight', 'aggro'] as const) {
        state.players[0].botProfile = profile;
        expect(decideBot(state, mulberry32(i)).type).not.toBe('fold');
      }
    }
  });
});

describe('fuzzing multi-profils', () => {
  function runFuzz(seats: SeatConfig[], hands: number, seed: number) {
    const rng = mulberry32(seed);
    let stacks = new Map(seats.map((s) => [s.seat, s.stack]));
    let button = seats[0].seat;

    for (let handId = 1; handId <= hands; handId++) {
      const configs = seats.map((s) => ({
        ...s,
        stack: (stacks.get(s.seat) ?? 0) > 0 ? stacks.get(s.seat)! : START_STACK,
      }));
      const totalBefore = configs.reduce((sum, s) => sum + s.stack, 0);

      let state = createHand({ handId, seats: configs, buttonSeat: button, blinds: BLINDS, rng });
      let guard = 0;
      while (!state.result) {
        if (++guard > 200) throw new Error(`Main ${handId} sans fin`);
        state = applyAction(state, decideBot(state, rng, { equityIterations: 30 }));
      }

      const totalAfter = state.players.reduce((sum, p) => sum + p.stack, 0);
      expect(totalAfter).toBe(totalBefore);
      for (const p of state.players) expect(p.stack).toBeGreaterThanOrEqual(0);

      stacks = new Map(state.players.map((p) => [p.seat, p.stack]));
      button = nextSeatClockwise(
        configs.map((s) => s.seat),
        button,
      );
    }
  }

  it('6-max, trois profils mélangés : 60 mains sans action illégale ni jeton perdu', () => {
    runFuzz(
      [
        seat(0, 'station'),
        seat(1, 'tight'),
        seat(2, 'aggro'),
        seat(3, 'station'),
        seat(4, 'tight'),
        seat(5, 'aggro'),
      ],
      60,
      2026,
    );
  });

  it('heads-up serré contre agressif : 40 mains propres', () => {
    runFuzz([seat(0, 'tight'), seat(1, 'aggro')], 40, 7);
  });
});
