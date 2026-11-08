export type DisplayMode = 'eur' | 'bb';

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/** Formate un montant en centimes, en € ou en nombre de grosses blindes. */
export function formatAmount(cents: number, mode: DisplayMode, bbCents: number): string {
  if (mode === 'bb') {
    const bb = cents / bbCents;
    const rounded = Math.round(bb * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} BB`;
  }
  return euros.format(cents / 100);
}
