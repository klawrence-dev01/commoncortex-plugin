/** A single top-level folder within a source GitHub repo to sync into commoncortex-vault. */
export interface SyncFolder {
  folderName: string; // e.g. "Agent Work" — top-level folder name in the cloned repo
}

/** Summary returned after a sync run. Stored on SyncSource for UI display. */
export interface SyncResult {
  filesUpdated: number;    // files pulled from GitHub → commoncortex-vault
  filesPushedBack: number; // files pushed from commoncortex-vault → GitHub repo
  filesSkipped: number;    // identical files (no change needed)
  errors: string[];
  finishedAt: string; // ISO timestamp
}

/**
 * One GitHub repository configured as a sync source.
 * The repo is cloned to ~/.commoncortex/repos/<id>/ on first use.
 * Each device configures its own repo URL — never committed to git.
 */
export interface SyncSource {
  id: string;                      // "src_" + Date.now() — stable identity
  name: string;                    // user label, e.g. "Shared Brain Vault"
  repoUrl: string;                 // GitHub repo URL (HTTPS or SSH)
  destDir: string;                 // subfolder in commoncortex-vault to sync into
                                   // e.g. "Shared Brain Vault" → vault/Shared Brain Vault/<folder>/
                                   // empty string = sync directly into vault root
  folders: SyncFolder[];           // which top-level repo folders to sync
  lastSyncAt: string | null;       // ISO timestamp of last successful sync
  lastSyncResult: SyncResult | null;
}

export interface PluginSettings {
  syncSources: SyncSource[];
  autoSyncMinutes: number;   // 0 = disabled; positive = sync every N minutes
  // Per-device identity — overrides manifest.json if set.
  // New collaborators fill these in; existing users can leave blank.
  authorName: string;
  authorEmail: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  syncSources: [],
  autoSyncMinutes: 0,
  authorName: "",
  authorEmail: "",
};
