import { cardRank, cardSuit, type Card } from '@/lib/poker/cards';

const SUIT_SYMBOLS = { h: '♥', d: '♦', c: '♣', s: '♠' } as const;

type Props = {
  card?: Card;
  /** Carte face cachée (dos bleu). */
  hidden?: boolean;
  /** Emplacement vide (board incomplet). */
  placeholder?: boolean;
  size?: 'md' | 'sm';
};

export function CardView({ card, hidden = false, placeholder = false, size = 'md' }: Props) {
  const base =
    size === 'sm'
      ? 'h-9 w-7 rounded'
      : 'h-14 w-10 rounded-md sm:h-16 sm:w-12';
  const rankClass = size === 'sm' ? 'text-xs font-bold leading-none' : 'text-base font-bold leading-none sm:text-lg';
  const suitClass = size === 'sm' ? 'text-sm leading-none' : 'text-lg leading-none sm:text-xl';

  if (placeholder || (!card && !hidden)) {
    return <div className={`${base} border-2 border-dashed border-white/25`} aria-hidden />;
  }

  if (hidden || !card) {
    return (
      <div
        className={`${base} border border-blue-950 bg-gradient-to-br from-blue-600 to-blue-900 shadow-md`}
        aria-label="Carte cachée"
      />
    );
  }

  const rank = cardRank(card);
  const suit = cardSuit(card);
  const red = suit === 'h' || suit === 'd';
  const color = red ? 'text-red-600' : 'text-neutral-900';

  return (
    <div
      className={`${base} flex flex-col items-center justify-center border border-neutral-300 bg-white shadow-md`}
      aria-label={card}
    >
      <span className={`${rankClass} ${color}`}>{rank === 'T' ? '10' : rank}</span>
      <span className={`${suitClass} ${color}`}>{SUIT_SYMBOLS[suit]}</span>
    </div>
  );
}
