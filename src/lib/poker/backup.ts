import { loadDrillStats, saveDrillStats, type DrillStats } from './drill';
import { loadHands, loadMistakes, mergeImport, type StoredMistake } from './import/db';
import type { ParsedHand } from './import/parse-pokerstars';
import {
  loadHistory,
  loadSession,
  saveHistory,
  saveSession,
  type SessionArchive,
  type SessionData,
} from './session';
import { loadSrs, saveSrs, type SrsCard } from './srs';

// Export / import JSON de TOUTE la progression : localStorage (jeu, drill, répétition
// espacée) ET IndexedDB (mains importées + erreurs). Sans compte, c'est la seule façon
// de changer d'ordinateur sans rien perdre. L'import FUSIONNE (dédoublonnage), n'écrase pas.

type Backup = {
  version: 1 | 2;
  exportedAt: string;
  session: SessionData;
  history: SessionArchive[];
  srs: SrsCard[];
  drill: DrillStats;
  // v2 : données IndexedDB (absentes des sauvegardes v1).
  hands?: ParsedHand[];
  mistakes?: StoredMistake[];
};

export async function exportBackup(): Promise<string> {
  const [hands, mistakes] = await Promise.all([loadHands(), loadMistakes()]);
  const backup: Backup = {
    version: 2,
    exportedAt: new Date().toISOString(),
    session: loadSession(),
    history: loadHistory(),
    srs: loadSrs(),
    drill: loadDrillStats(),
    hands,
    mistakes,
  };
  return JSON.stringify(backup);
}

/** Union par clé : garde l'existant, ajoute ce qui manque. */
function mergeByKey<T>(existing: T[], incoming: T[], key: (t: T) => string): T[] {
  const seen = new Set(existing.map(key));
  const out = [...existing];
  for (const item of incoming) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

/** Fusionne les stats de drill : par paquet, on additionne essais/réussites et on concatène les temps. */
function mergeDrill(a: DrillStats, b: DrillStats): DrillStats {
  const out: DrillStats = { ...a };
  for (const [pack, s] of Object.entries(b)) {
    const cur = out[pack];
    out[pack] = cur
      ? {
          attempts: cur.attempts + s.attempts,
          correct: cur.correct + s.correct,
          times: [...cur.times, ...s.times].slice(-50),
        }
      : s;
  }
  return out;
}

/**
 * Restaure une sauvegarde en la FUSIONNANT avec les données existantes.
 * Retourne le nombre de mains/erreurs ajoutées, ou null si le fichier n'est pas reconnu.
 */
export async function importBackup(
  json: string,
): Promise<{ addedHands: number; addedMistakes: number } | null> {
  let parsed: Backup;
  try {
    parsed = JSON.parse(json) as Backup;
  } catch {
    return null;
  }
  if (!parsed || (parsed.version !== 1 && parsed.version !== 2)) return null;

  // --- localStorage : fusion (jamais d'écrasement) ---
  if (Array.isArray(parsed.history)) {
    saveHistory(mergeByKey(loadHistory(), parsed.history, (h) => h.startedAt));
  }
  if (Array.isArray(parsed.srs)) {
    saveSrs(mergeByKey(loadSrs(), parsed.srs, (c) => c.id));
  }
  if (parsed.drill && typeof parsed.drill === 'object') {
    saveDrillStats(mergeDrill(loadDrillStats(), parsed.drill));
  }
  // Session en cours : on ne clobbe pas une session locale déjà entamée.
  const local = loadSession();
  if (
    local.hands.length === 0 &&
    parsed.session &&
    Array.isArray(parsed.session.hands) &&
    parsed.session.hands.length > 0
  ) {
    saveSession(parsed.session);
  }

  // --- IndexedDB : fusion (dédoublonnage par numéro de main et par id d'erreur) ---
  const hands = Array.isArray(parsed.hands) ? parsed.hands : [];
  const mistakes = Array.isArray(parsed.mistakes) ? parsed.mistakes : [];
  const { addedHands, addedMistakes } = await mergeImport(hands, mistakes);

  return { addedHands, addedMistakes };
}
