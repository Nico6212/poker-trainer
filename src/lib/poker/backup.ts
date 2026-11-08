import { loadDrillStats, saveDrillStats, type DrillStats } from './drill';
import {
  loadHistory,
  loadSession,
  saveHistory,
  saveSession,
  type SessionArchive,
  type SessionData,
} from './session';
import { loadSrs, saveSrs, type SrsCard } from './srs';

// Export / import JSON de toutes les données d'apprentissage : le localStorage
// peut être effacé par un nettoyage navigateur — une sauvegarde protège la progression.

type Backup = {
  version: 1;
  exportedAt: string;
  session: SessionData;
  history: SessionArchive[];
  srs: SrsCard[];
  drill: DrillStats;
};

export function exportBackup(): string {
  const backup: Backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    session: loadSession(),
    history: loadHistory(),
    srs: loadSrs(),
    drill: loadDrillStats(),
  };
  return JSON.stringify(backup, null, 2);
}

/** Restaure une sauvegarde. Retourne false si le fichier n'est pas reconnu (rien n'est écrit). */
export function importBackup(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as Backup;
    if (
      parsed.version !== 1 ||
      !parsed.session ||
      !Array.isArray(parsed.session.decisions) ||
      !Array.isArray(parsed.session.hands) ||
      typeof parsed.session.startedAt !== 'string'
    ) {
      return false;
    }
    saveSession(parsed.session);
    saveHistory(Array.isArray(parsed.history) ? parsed.history : []);
    saveSrs(Array.isArray(parsed.srs) ? parsed.srs : []);
    saveDrillStats(parsed.drill && typeof parsed.drill === 'object' ? parsed.drill : {});
    return true;
  } catch {
    return false;
  }
}
