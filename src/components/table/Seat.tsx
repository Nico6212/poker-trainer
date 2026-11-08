import type { Action, Player } from '@/lib/poker/engine';
import { formatAmount, type DisplayMode } from '@/lib/poker/format';
import { CardView } from './CardView';

type Props = {
  player: Player;
  isButton: boolean;
  isToAct: boolean;
  showCards: boolean;
  lastAction?: Action;
  mode: DisplayMode;
  bb: number;
  /** Version réduite pour les tables à plusieurs bots. */
  compact?: boolean;
};

function actionLabel(action: Action, mode: DisplayMode, bb: number): string {
  switch (action.type) {
    case 'fold':
      return 'Se couche';
    case 'check':
      return 'Check';
    case 'call':
      return 'Suit';
    case 'bet':
      return `Mise ${formatAmount(action.amount, mode, bb)}`;
    case 'raise':
      return `Relance à ${formatAmount(action.amount, mode, bb)}`;
  }
}

export function Seat({
  player,
  isButton,
  isToAct,
  showCards,
  lastAction,
  mode,
  bb,
  compact = false,
}: Props) {
  const folded = player.status === 'folded';
  const cardSize = compact ? 'sm' : 'md';

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`flex gap-1 ${folded ? 'opacity-30' : ''}`}>
        {player.holeCards ? (
          player.holeCards.map((card, i) =>
            showCards ? (
              <CardView key={i} card={card} size={cardSize} />
            ) : (
              <CardView key={i} hidden size={cardSize} />
            ),
          )
        ) : (
          <>
            <CardView placeholder size={cardSize} />
            <CardView placeholder size={cardSize} />
          </>
        )}
      </div>

      <div
        className={`flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-white shadow ${
          compact ? 'text-xs' : 'text-sm'
        } ${isToAct ? 'ring-2 ring-amber-400' : ''}`}
      >
        {isButton && (
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-black"
            title="Bouton (donneur)"
          >
            D
          </span>
        )}
        <span className="font-semibold">{player.name}</span>
        <span className="text-emerald-300">
          {player.status === 'all-in' && player.stack === 0
            ? 'À tapis'
            : formatAmount(player.stack, mode, bb)}
        </span>
      </div>

      <div className="h-5 text-xs font-medium text-amber-200">
        {folded ? 'Couché' : lastAction ? actionLabel(lastAction, mode, bb) : ''}
      </div>
    </div>
  );
}
