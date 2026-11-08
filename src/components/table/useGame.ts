'use client';

import { useCallback, useEffect, useState } from 'react';
import { decideBot } from '@/lib/poker/bots/decide';
import { PROFILE_LABELS } from '@/lib/poker/bots/profiles';
import {
  applyAction,
  createHand,
  nextSeatClockwise,
  playerAt,
  type Action,
  type BotProfile,
  type HandState,
  type SeatConfig,
} from '@/lib/poker/engine';
import { loadSession } from '@/lib/poker/session';

export const HERO_SEAT = 0;

export type StakesKey = 'nl2' | 'nl5' | 'nl10';
export const STAKES: Record<StakesKey, { label: string; blinds: { sb: number; bb: number } }> = {
  nl2: { label: 'NL2 · 0,01/0,02 €', blinds: { sb: 1, bb: 2 } },
  nl5: { label: 'NL5 · 0,02/0,05 €', blinds: { sb: 2, bb: 5 } },
  nl10: { label: 'NL10 · 0,05/0,10 €', blinds: { sb: 5, bb: 10 } },
};

/** Spin & Go 3-max : tapis 25 BB, blindes qui montent, pas de recave, winner-take-all. */
export const SPIN_START_STACK = 500;
export const SPIN_LEVELS = [
  { sb: 10, bb: 20 },
  { sb: 15, bb: 30 },
  { sb: 20, bb: 40 },
  { sb: 30, bb: 60 },
  { sb: 40, bb: 80 },
  { sb: 60, bb: 120 },
  { sb: 100, bb: 200 },
];
export const SPIN_HANDS_PER_LEVEL = 10;

export type TableConfig = {
  mode: 'cash' | 'spin';
  /** Cash : 1 à 5 bots. Spin : exactement 2. Le héros est toujours au siège 0. */
  bots: BotProfile[];
  stakes: StakesKey;
};

export const DEFAULT_CONFIG: TableConfig = { mode: 'cash', bots: ['station'], stakes: 'nl2' };
const CONFIG_STORAGE_KEY = 'poker-table-config';

const VALID_PROFILES: BotProfile[] = ['station', 'tight', 'aggro', 'reg'];

function normalizeConfig(raw: Partial<TableConfig> & { bots?: unknown }): TableConfig {
  const bots = Array.isArray(raw.bots)
    ? (raw.bots.filter((b) => VALID_PROFILES.includes(b as BotProfile)) as BotProfile[])
    : [];
  const mode = raw.mode === 'spin' ? 'spin' : 'cash';
  const stakes: StakesKey =
    raw.stakes === 'nl5' || raw.stakes === 'nl10' ? raw.stakes : 'nl2';
  if (mode === 'spin') {
    return { mode, stakes, bots: [bots[0] ?? 'aggro', bots[1] ?? 'tight'] };
  }
  return { mode, stakes, bots: bots.length >= 1 ? bots.slice(0, 5) : ['station'] };
}

function loadConfig(): TableConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) return normalizeConfig(JSON.parse(raw) as TableConfig);
  } catch {
    // config corrompue : valeurs par défaut
  }
  return DEFAULT_CONFIG;
}

function botName(profile: BotProfile, index: number, bots: BotProfile[]): string {
  const label = PROFILE_LABELS[profile];
  if (bots.filter((b) => b === profile).length <= 1) return label;
  return `${label} ${bots.slice(0, index + 1).filter((b) => b === profile).length}`;
}

function cashStack(stakes: StakesKey): number {
  return 100 * STAKES[stakes].blinds.bb;
}

function buildSeats(config: TableConfig): SeatConfig[] {
  const stack = config.mode === 'spin' ? SPIN_START_STACK : cashStack(config.stakes);
  return [
    { id: 'hero', name: 'Toi', seat: HERO_SEAT, stack },
    ...config.bots.map((profile, i) => ({
      id: `bot-${i + 1}`,
      name: botName(profile, i, config.bots),
      seat: i + 1,
      stack,
      isBot: true,
      botProfile: profile,
    })),
  ];
}

export function spinLevelFor(handId: number, spinStart: number): number {
  return Math.min(
    SPIN_LEVELS.length - 1,
    Math.floor((handId - spinStart) / SPIN_HANDS_PER_LEVEL),
  );
}

function blindsFor(config: TableConfig, handId: number, spinStart: number | null) {
  if (config.mode === 'spin' && spinStart !== null) {
    return SPIN_LEVELS[spinLevelFor(handId, spinStart)];
  }
  return STAKES[config.stakes].blinds;
}

export function useGame() {
  const [config, setConfig] = useState<TableConfig>(DEFAULT_CONFIG);
  // La main est créée au montage (et pas au rendu) : le paquet est aléatoire,
  // le HTML serveur ne doit donc rien en connaître pour éviter un mismatch d'hydratation.
  const [hand, setHand] = useState<HandState | null>(null);
  const [spinStart, setSpinStart] = useState<number | null>(null);
  const [spinResult, setSpinResult] = useState<'won' | 'lost' | null>(null);

  useEffect(() => {
    const cfg = loadConfig();
    setConfig(cfg);
    // La numérotation continue celle de la session en cours (localStorage).
    // On tient compte des DÉCISIONS en plus des mains terminées : une main
    // interrompue par un rechargement a pu enregistrer des décisions sans jamais
    // produire de HandRecord, et son handId ne doit pas être réutilisé.
    const saved = loadSession();
    const maxHandId = (records: { handId: number }[]) =>
      records.reduce((max, r) => Math.max(max, r.handId), 0);
    const startId = Math.max(maxHandId(saved.hands), maxHandId(saved.decisions)) + 1;
    const start = cfg.mode === 'spin' ? startId : null;
    setSpinStart(start);
    setHand(
      createHand({
        handId: startId,
        seats: buildSeats(cfg),
        buttonSeat: HERO_SEAT,
        blinds: blindsFor(cfg, startId, start),
      }),
    );
  }, []);

  const apply = useCallback((current: HandState, action: Action) => {
    try {
      setHand(applyAction(current, action));
    } catch (error) {
      console.warn('Action refusée par le moteur :', error);
    }
  }, []);

  const heroAct = useCallback(
    (action: Action) => {
      if (hand && !hand.result && hand.toActSeat === HERO_SEAT) apply(hand, action);
    },
    [hand, apply],
  );

  const nextHand = useCallback(() => {
    const h = hand;
    if (!h || !h.result) return;

    if (config.mode === 'spin') {
      // Tournoi : pas de recave, on élimine les tapis à zéro.
      const survivors = h.players.filter((p) => p.stack > 0);
      if (!survivors.some((p) => p.seat === HERO_SEAT)) {
        setSpinResult('lost');
        return;
      }
      if (survivors.length === 1) {
        setSpinResult('won');
        return;
      }
      const seats: SeatConfig[] = survivors.map((p) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        stack: p.stack,
        isBot: p.isBot,
        botProfile: p.botProfile,
      }));
      const nextId = h.handId + 1;
      setHand(
        createHand({
          handId: nextId,
          seats,
          buttonSeat: nextSeatClockwise(
            seats.map((s) => s.seat),
            h.buttonSeat,
          ),
          blinds: blindsFor(config, nextId, spinStart),
        }),
      );
      return;
    }

    const seats: SeatConfig[] = h.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      // Recave automatique : un tapis vide repart à 100 BB de la limite.
      stack: p.stack > 0 ? p.stack : cashStack(config.stakes),
      isBot: p.isBot,
      botProfile: p.botProfile,
    }));
    setHand(
      createHand({
        handId: h.handId + 1,
        seats,
        buttonSeat: nextSeatClockwise(
          seats.map((s) => s.seat),
          h.buttonSeat,
        ),
        blinds: blindsFor(config, h.handId + 1, null),
      }),
    );
  }, [hand, config, spinStart]);

  /** Change la table (mode, limite, bots) : nouvelle main, tapis réinitialisés. */
  const applyConfig = useCallback(
    (cfg: TableConfig) => {
      const normalized = normalizeConfig(cfg);
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(normalized));
      setConfig(normalized);
      setSpinResult(null);
      const nextId = (hand?.handId ?? 0) + 1;
      const start = normalized.mode === 'spin' ? nextId : null;
      setSpinStart(start);
      setHand(
        createHand({
          handId: nextId,
          seats: buildSeats(normalized),
          buttonSeat: HERO_SEAT,
          blinds: blindsFor(normalized, nextId, start),
        }),
      );
    },
    [hand],
  );

  /** Nouvelle session : tapis réinitialisés et numérotation repartant de 1. */
  const resetGame = useCallback(() => {
    setSpinResult(null);
    const start = config.mode === 'spin' ? 1 : null;
    setSpinStart(start);
    setHand(
      createHand({
        handId: 1,
        seats: buildSeats(config),
        buttonSeat: HERO_SEAT,
        blinds: blindsFor(config, 1, start),
      }),
    );
  }, [config]);

  // Tour d'un bot : il agit avec un délai de 300 à 800 ms pour rester lisible.
  useEffect(() => {
    if (!hand || hand.result || hand.toActSeat === null) return;
    if (!playerAt(hand, hand.toActSeat).isBot) return;
    const timer = setTimeout(() => {
      apply(hand, decideBot(hand));
    }, 300 + Math.random() * 500);
    return () => clearTimeout(timer);
  }, [hand, apply]);

  // Main terminée : enchaîne automatiquement après une pause de lecture.
  useEffect(() => {
    if (!hand?.result || spinResult) return;
    const timer = setTimeout(nextHand, 4000);
    return () => clearTimeout(timer);
  }, [hand, nextHand, spinResult]);

  const spinLevel =
    config.mode === 'spin' && spinStart !== null && hand
      ? spinLevelFor(hand.handId, spinStart)
      : null;

  return { hand, config, spinLevel, spinResult, heroAct, nextHand, applyConfig, resetGame };
}
