import type { HandState } from './engine';
import { playerAt } from './engine';
import { expandNotation, handClass, positionOf } from './ranges';

// Tableaux push/fold à tapis court (≤ 13 BB) : ranges approchées type Nash,
// arrondies en notation compacte. C'est LE socle du Spin & Go et des fins de MTT :
// sous ~13 BB, on ne joue plus au poker postflop, on push ou on jette.

/** Paliers de tapis en BB : on utilise le tableau du palier ≥ au tapis effectif. */
export const PUSH_BUCKETS = [5, 8, 10, 13] as const;
export type PushBucket = (typeof PUSH_BUCKETS)[number];

export type PushChart = 'SB_HU' | 'BTN_3MAX';
export type CallChart = 'BB_VS_SB' | 'BB_VS_BTN' | 'SB_VS_BTN';

/** Ranges de PUSH (open-shove) par tableau et palier. */
export const PUSH_RANGES: Record<PushChart, Record<PushBucket, string[]>> = {
  // Heads-up (ou SB 3-max après fold du bouton) : très large.
  SB_HU: {
    5: ['22+', 'A2s+', 'A2o+', 'K2s+', 'K2o+', 'Q2s+', 'Q4o+', 'J2s+', 'J6o+', 'T3s+', 'T7o+', '94s+', '97o+', '85s+', '87o', '74s+', '76o', '64s+', '53s+', '43s'],
    8: ['22+', 'A2s+', 'A2o+', 'K2s+', 'K5o+', 'Q3s+', 'Q7o+', 'J5s+', 'J8o+', 'T6s+', 'T8o+', '96s+', '98o', '85s+', '75s+', '65s'],
    10: ['22+', 'A2s+', 'A2o+', 'K2s+', 'K7o+', 'Q5s+', 'Q9o+', 'J7s+', 'J9o+', 'T7s+', 'T9o', '96s+', '86s+', '76s'],
    13: ['22+', 'A2s+', 'A4o+', 'K5s+', 'K9o+', 'Q8s+', 'QTo+', 'J8s+', 'JTo', 'T8s+', '97s+', '87s', '76s'],
  },
  // Bouton 3-max premier à parler : large mais deux joueurs derrière.
  BTN_3MAX: {
    5: ['22+', 'A2s+', 'A2o+', 'K2s+', 'K6o+', 'Q4s+', 'Q9o+', 'J6s+', 'J9o+', 'T6s+', 'T8o+', '96s+', '98o', '86s+', '76s', '65s'],
    8: ['22+', 'A2s+', 'A4o+', 'K4s+', 'K9o+', 'Q7s+', 'QTo+', 'J8s+', 'JTo', 'T7s+', '97s+', '87s'],
    10: ['22+', 'A2s+', 'A7o+', 'K7s+', 'KTo+', 'Q8s+', 'QJo', 'J9s+', 'T8s+', '98s'],
    13: ['22+', 'A2s+', 'A9o+', 'K9s+', 'KJo+', 'QTs+', 'JTs', 'T9s'],
  },
};

/** Ranges de CALL face à un push, par tableau et palier (tapis effectif). */
export const CALL_RANGES_VS_PUSH: Record<CallChart, Record<PushBucket, string[]>> = {
  // BB face au push du SB (range de push très large → on paie large).
  BB_VS_SB: {
    5: ['22+', 'A2s+', 'A2o+', 'K2s+', 'K7o+', 'Q5s+', 'Q9o+', 'J7s+', 'J9o+', 'T7s+', 'T9o', '97s+', '87s'],
    8: ['22+', 'A2s+', 'A5o+', 'K7s+', 'KTo+', 'Q9s+', 'QJo', 'J9s+', 'T9s'],
    10: ['22+', 'A2s+', 'A8o+', 'K9s+', 'KJo+', 'QTs+', 'JTs'],
    13: ['44+', 'A7s+', 'ATo+', 'KTs+', 'KQo'],
  },
  // BB face au push du BTN (range de push plus serrée → on paie plus serré).
  BB_VS_BTN: {
    5: ['22+', 'A2s+', 'A4o+', 'K5s+', 'K9o+', 'Q8s+', 'QTo+', 'J9s+', 'T9s'],
    8: ['22+', 'A2s+', 'A8o+', 'K9s+', 'KJo+', 'QTs+', 'JTs'],
    10: ['33+', 'A5s+', 'A9o+', 'KTs+', 'KQo'],
    13: ['66+', 'A9s+', 'AJo+', 'KQs'],
  },
  // SB face au push du BTN : la BB parle encore derrière → le plus serré.
  SB_VS_BTN: {
    5: ['22+', 'A2s+', 'A7o+', 'K8s+', 'KTo+', 'Q9s+', 'QJo', 'JTs'],
    8: ['33+', 'A5s+', 'A9o+', 'KTs+', 'KQo'],
    10: ['55+', 'A8s+', 'ATo+', 'KJs+'],
    13: ['77+', 'ATs+', 'AJo+', 'KQs'],
  },
};

/** Palier applicable à un tapis effectif, null si > 13 BB (hors push/fold). */
export function bucketFor(stackBB: number): PushBucket | null {
  if (stackBB <= 0) return null;
  for (const bucket of PUSH_BUCKETS) {
    if (stackBB <= bucket + 0.5) return bucket;
  }
  return null;
}

export function shouldPush(cls: string, chart: PushChart, stackBB: number): boolean | null {
  const bucket = bucketFor(stackBB);
  if (bucket === null) return null;
  return expandNotation(PUSH_RANGES[chart][bucket]).has(cls);
}

export function shouldCallPush(cls: string, chart: CallChart, stackBB: number): boolean | null {
  const bucket = bucketFor(stackBB);
  if (bucket === null) return null;
  return expandNotation(CALL_RANGES_VS_PUSH[chart][bucket]).has(cls);
}

export const CHART_LABELS: Record<PushChart | CallChart, string> = {
  SB_HU: 'SB (heads-up)',
  BTN_3MAX: 'bouton (3 joueurs)',
  BB_VS_SB: 'BB face au push du SB',
  BB_VS_BTN: 'BB face au push du bouton',
  SB_VS_BTN: 'SB face au push du bouton',
};

export type PushFoldSpot =
  | { kind: 'open-shove'; shove: boolean; chart: PushChart; stackBB: number; hand: string }
  | { kind: 'call-shove'; call: boolean; chart: CallChart; stackBB: number; hand: string };

/**
 * Détecte si le siège est dans un spot push/fold préflop couvert par les tableaux
 * et retourne la recommandation. null = situation non couverte (limpé, >13 BB…).
 */
export function pushFoldSpot(state: HandState, seat: number): PushFoldSpot | null {
  if (state.street !== 'preflop' || state.result) return null;
  const me = playerAt(state, seat);
  if (!me.holeCards) return null;
  const bb = state.blinds.bb;
  // Le tapis pertinent est l'EFFECTIF : pour open-shove c'est le mien,
  // pour payer un push c'est le plus petit des deux (vérifié par branche).
  const myBB = (me.stack + me.streetBet) / bb;

  const cls = handClass(me.holeCards[0], me.holeCards[1]);
  const position = positionOf(state, seat);
  const playersInHand = state.players.filter((p) => p.status !== 'folded');
  if (playersInHand.length > 3) return null; // tableaux 2-3 joueurs uniquement

  let raises = 0;
  let raiserSeat: number | null = null;
  let limps = 0;
  for (const entry of state.history) {
    if (entry.street !== 'preflop') break;
    if (entry.action.type === 'raise' || entry.action.type === 'bet') {
      raises++;
      raiserSeat = entry.seat;
    } else if (entry.action.type === 'call' && raises === 0) {
      limps++;
    }
  }

  if (raises === 0) {
    if (limps > 0 || position === 'BB' || myBB > 13.5) return null;
    const chart: PushChart | null =
      position === 'BTN' && state.players.length >= 3
        ? 'BTN_3MAX'
        : position === 'SB' || state.players.length === 2
          ? 'SB_HU'
          : null;
    if (!chart) return null;
    const shove = shouldPush(cls, chart, myBB);
    if (shove === null) return null;
    return { kind: 'open-shove', shove, chart, stackBB: myBB, hand: cls };
  }

  if (raises === 1 && raiserSeat !== null && raiserSeat !== seat) {
    const raiser = playerAt(state, raiserSeat);
    const raiserBB = (raiser.stack + raiser.streetBet) / bb;
    const effective = Math.min(myBB, raiserBB);
    if (effective > 13.5) return null;
    // On ne traite que les vrais shoves (ou quasi) : le reste est du poker normal.
    if (raiser.status !== 'all-in' && raiser.streetBet < Math.min(me.stack + me.streetBet, raiser.streetBet + raiser.stack) * 0.8) {
      return null;
    }
    const raiserPos = positionOf(state, raiserSeat);
    // En heads-up le bouton EST la petite blinde : son push se paie avec BB_VS_SB.
    const headsUp = state.players.length === 2;
    const chart: CallChart | null =
      position === 'BB' && (raiserPos === 'SB' || (headsUp && raiserPos === 'BTN'))
        ? 'BB_VS_SB'
        : raiserPos === 'BTN' && position === 'BB'
          ? 'BB_VS_BTN'
          : raiserPos === 'BTN' && position === 'SB'
            ? 'SB_VS_BTN'
            : null;
    if (!chart) return null;
    const call = shouldCallPush(cls, chart, effective);
    if (call === null) return null;
    return { kind: 'call-shove', call, chart, stackBB: effective, hand: cls };
  }

  return null;
}
