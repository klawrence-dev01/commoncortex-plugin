import { TFile, App } from "obsidian";

export interface FileMeta {
  author?: string;
  author_id?: string;
  last_modified?: string;
  proposal?: boolean;
  proposed_by?: string;
  intended_path?: string;
  note?: string;
  created?: string;
}

/**
 * Read frontmatter fields from a file using Obsidian's metadata cache.
 * Falls back to manual parse if cache is not ready.
 */
export function getFileMeta(app: App, file: TFile): FileMeta {
  const cache = app.metadataCache.getFileCache(file);
  return (cache?.frontmatter as FileMeta) ?? {};
}

/**
 * Format an ISO date string as a human-readable relative or short date.
 */
export function formatDate(iso?: string): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Return the display initial for an avatar from a name string.
 */
export function getInitial(name?: string): string {
  return (name ?? "?").charAt(0).toUpperCase();
}
