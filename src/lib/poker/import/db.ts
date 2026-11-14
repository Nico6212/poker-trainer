import type { Mistake } from './classify-mistake';
import { newReview, type Review } from './mistake-srs';
import type { ParsedHand } from './parse-pokerstars';

// Stockage local des mains importées (par milliers) et des erreurs, en IndexedDB.
// Dédoublonnage des mains par numéro. 100 % navigateur, rien n'est envoyé.

const DB_NAME = 'poker-trainer-import';
const DB_VERSION = 1;
const HANDS = 'hands';
const MISTAKES = 'mistakes';

export type StoredMistake = {
  id: string;
  handId: string;
  type: Mistake['type'];
  detail: string;
  equity?: number;
  required?: number;
  villainRange?: string;
  spot: Mistake['spot'];
  createdAt: number;
} & Review;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(HANDS)) db.createObjectStore(HANDS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(MISTAKES)) db.createObjectStore(MISTAKES, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

function getAll<T>(store: string): Promise<T[]> {
  return tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
}

/**
 * Insère mains (dédoublonnées par id) et erreurs. L'id d'une erreur est stable
 * (`handId:rang-dans-la-main`) : réimporter une main ne duplique rien et PRÉSERVE
 * la progression de répétition espacée. Retourne combien de mains étaient nouvelles.
 */
export async function saveImport(
  hands: ParsedHand[],
  mistakes: Mistake[],
  now: number = Date.now(),
): Promise<{ newHands: number; duplicates: number }> {
  const db = await open();
  const existing = new Set((await getAll<ParsedHand>(HANDS)).map((h) => h.id));
  const existingMistakes = new Map(
    (await getAll<StoredMistake>(MISTAKES)).map((m) => [m.id, m]),
  );
  let newHands = 0;
  let duplicates = 0;

  await new Promise<void>((resolve, reject) => {
    const t = db.transaction([HANDS, MISTAKES], 'readwrite');
    const handStore = t.objectStore(HANDS);
    const mistakeStore = t.objectStore(MISTAKES);
    for (const hand of hands) {
      if (existing.has(hand.id)) {
        duplicates += 1;
        continue;
      }
      existing.add(hand.id);
      newHands += 1;
      handStore.put(hand);
    }
    const perHand = new Map<string, number>();
    for (const m of mistakes) {
      const n = perHand.get(m.handId) ?? 0;
      perHand.set(m.handId, n + 1);
      const id = `${m.handId}:${n}`;
      const prev = existingMistakes.get(id);
      const review: Review = prev
        ? { box: prev.box, dueAt: prev.dueAt, reps: prev.reps, lapses: prev.lapses }
        : newReview(now);
      const stored: StoredMistake = {
        id,
        handId: m.handId,
        type: m.type,
        detail: m.detail,
        equity: m.equity,
        required: m.required,
        villainRange: m.villainRange,
        spot: m.spot,
        createdAt: prev?.createdAt ?? now,
        ...review,
      };
      mistakeStore.put(stored);
    }
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });

  return { newHands, duplicates };
}

/**
 * Fusionne une sauvegarde : ajoute les mains/erreurs ABSENTES (dédoublonnage par id),
 * sans toucher aux existantes (progression de répétition espacée préservée).
 */
export async function mergeImport(
  hands: ParsedHand[],
  mistakes: StoredMistake[],
): Promise<{ addedHands: number; addedMistakes: number }> {
  const db = await open();
  const existingHands = new Set((await getAll<ParsedHand>(HANDS)).map((h) => h.id));
  const existingMistakes = new Set((await getAll<StoredMistake>(MISTAKES)).map((m) => m.id));
  let addedHands = 0;
  let addedMistakes = 0;
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction([HANDS, MISTAKES], 'readwrite');
    const hs = t.objectStore(HANDS);
    const ms = t.objectStore(MISTAKES);
    for (const h of hands) {
      if (h?.id && !existingHands.has(h.id)) {
        existingHands.add(h.id);
        hs.put(h);
        addedHands += 1;
      }
    }
    for (const m of mistakes) {
      if (m?.id && !existingMistakes.has(m.id)) {
        existingMistakes.add(m.id);
        ms.put(m);
        addedMistakes += 1;
      }
    }
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  return { addedHands, addedMistakes };
}

/** Persiste une révision (nouvelle boîte/échéance) après un rejeu. */
export async function updateMistakeReview(id: string, review: Review): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(MISTAKES, 'readwrite');
    const store = t.objectStore(MISTAKES);
    const get = store.get(id);
    get.onsuccess = () => {
      const current = get.result as StoredMistake | undefined;
      if (current) store.put({ ...current, ...review });
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/** Comptage léger (sans charger les enregistrements) : mains et erreurs stockées. */
export async function countImport(): Promise<{ hands: number; mistakes: number }> {
  const db = await open();
  const count = (store: string) =>
    new Promise<number>((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const [hands, mistakes] = await Promise.all([count(HANDS), count(MISTAKES)]);
  return { hands, mistakes };
}

export function loadHands(): Promise<ParsedHand[]> {
  return getAll<ParsedHand>(HANDS);
}

export function loadMistakes(): Promise<StoredMistake[]> {
  return getAll<StoredMistake>(MISTAKES);
}

export function getHand(id: string): Promise<ParsedHand | undefined> {
  return tx<ParsedHand | undefined>(HANDS, 'readonly', (s) => s.get(id) as IDBRequest<ParsedHand | undefined>);
}

export async function clearImport(): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction([HANDS, MISTAKES], 'readwrite');
    t.objectStore(HANDS).clear();
    t.objectStore(MISTAKES).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
