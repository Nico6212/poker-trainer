// Traduction en français des descriptions de mains de pokersolver
// (ex. "Two Pair, 9's & 8's" → « Deux paires, 9 et 8 »). Logique pure, testée.

const RANK_FR: Record<string, string> = {
  A: 'As',
  K: 'Roi',
  Q: 'Dame',
  J: 'Valet',
  T: '10',
  '9': '9',
  '8': '8',
  '7': '7',
  '6': '6',
  '5': '5',
  '4': '4',
  '3': '3',
  '2': '2',
};

// Pluriel pour « paire de Rois », « full aux Dames »… (les chiffres ne changent pas).
const RANK_FR_PLURAL: Record<string, string> = {
  ...RANK_FR,
  K: 'Rois',
  Q: 'Dames',
  J: 'Valets',
};

const fr = (letter: string): string => RANK_FR[letter] ?? letter;
const frP = (letter: string): string => RANK_FR_PLURAL[letter] ?? letter;

/** « de 5 », « de Rois », « d’As » (élision devant une voyelle). */
const de = (word: string): string => (/^[AEIOUÉÈ]/i.test(word) ? `d’${word}` : `de ${word}`);

/** Traduit une description de main pokersolver en français, ou la rend telle quelle. */
export function translateHandName(descr: string): string {
  let m: RegExpMatchArray | null;

  if (/^Royal Flush/.test(descr)) return 'Quinte flush royale';
  if ((m = descr.match(/^Straight Flush, (\w)/))) return `Quinte flush au ${fr(m[1])}`;
  if ((m = descr.match(/^Four of a Kind, (\w)'s/))) return `Carré ${de(frP(m[1]))}`;
  if ((m = descr.match(/^Full House, (\w)'s over (\w)'s/)))
    return `Full aux ${frP(m[1])} par les ${frP(m[2])}`;
  if (/^Flush/.test(descr)) return 'Couleur';
  if (/^Straight, Wheel/.test(descr)) return 'Quinte au 5';
  if ((m = descr.match(/^Straight, (\w)/))) return `Quinte au ${fr(m[1])}`;
  if ((m = descr.match(/^Three of a Kind, (\w)'s/))) return `Brelan ${de(frP(m[1]))}`;
  if ((m = descr.match(/^Two Pair, (\w)'s & (\w)'s/)))
    return `Deux paires, ${frP(m[1])} et ${frP(m[2])}`;
  if ((m = descr.match(/^Pair, (\w)'s/))) return `Paire ${de(frP(m[1]))}`;
  if ((m = descr.match(/^(\w) High/))) return `Hauteur ${fr(m[1])}`;

  return descr;
}
