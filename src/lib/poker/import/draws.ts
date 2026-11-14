import { rankValue, type Card, type Rank } from '../cards';

// Détection de tirages (couleur, quinte). Partagé entre le classifieur, les stats
// d'abattage et la calibration (évite un cycle d'import).

function suitCount(cards: Card[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) m.set(c[1], (m.get(c[1]) ?? 0) + 1);
  return m;
}

/** Valeurs de rangs présentes (l'as compte haut ET bas), pour détecter les quintes. */
function rankValueSet(cards: Card[]): Set<number> {
  const s = new Set<number>();
  for (const c of cards) {
    const v = rankValue(c[0] as Rank);
    s.add(v);
    if (v === 14) s.add(1);
  }
  return s;
}

function hasStraight(vals: Set<number>): boolean {
  for (let lo = 1; lo <= 10; lo++) {
    let ok = true;
    for (let k = 0; k < 5; k++) {
      if (!vals.has(lo + k)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** Nombre de rangs distincts qui complètent une quinte (≥ 2 = tirage bilatéral / double ventral). */
function straightCompletions(vals: Set<number>): number {
  let n = 0;
  for (let r = 2; r <= 14; r++) {
    if (vals.has(r)) continue;
    const s = new Set(vals);
    s.add(r);
    if (r === 14) s.add(1);
    if (hasStraight(s)) n += 1;
  }
  return n;
}

/** Tirage couleur (4 à la couleur avec une carte privée) ou tirage quinte à ≥ 2 outs. */
export function hasBigDraw(combo: [Card, Card], board: Card[]): boolean {
  const counts = suitCount([...board, ...combo]);
  for (const [suit, cnt] of counts) {
    if (cnt === 4 && combo.some((c) => c[1] === suit)) return true;
  }
  const allVals = rankValueSet([...board, ...combo]);
  if (hasStraight(allVals)) return false; // quinte faite = value, déjà comptée
  const boardVals = rankValueSet(board);
  return (
    straightCompletions(allVals) >= 2 && straightCompletions(allVals) > straightCompletions(boardVals)
  );
}
