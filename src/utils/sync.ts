import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import * as os from "os";
import { SyncSource, SyncResult } from "../settings";
import { gitAdd, gitCommit, gitClone, gitPullRepo, gitPush } from "./git";

// ── Cache path ────────────────────────────────────────────────────────────────

/**
 * Return the local cache path for a sync source's cloned GitHub repo.
 * Stored at ~/.commoncortex/repos/<source-id>/
 */
export function getCachePath(sourceId: string): string {
  return path.join(os.homedir(), ".commoncortex", "repos", sourceId);
}

// ── Repo management ───────────────────────────────────────────────────────────

/**
 * Ensure the source GitHub repo is cloned locally.
 * If already cloned, pulls latest changes.
 * Returns the local cache path.
 * Throws on clone/pull failure.
 */
export async function ensureRepoReady(source: SyncSource): Promise<string> {
  const localPath = getCachePath(source.id);
  const gitDir = path.join(localPath, ".git");

  let isCloned = false;
  try {
    await fs.access(gitDir);
    isCloned = true;
  } catch {
    isCloned = false;
  }

  if (isCloned) {
    await gitPullRepo(localPath);
  } else {
    if (!source.repoUrl) {
      throw new Error("No GitHub repo URL configured.");
    }
    await gitClone(source.repoUrl, localPath);
  }

  // Initialize as an Obsidian vault if it isn't one yet
  await initObsidianVault(localPath);

  return localPath;
}

/**
 * Create a minimal .obsidian/ directory if it doesn't already exist,
 * so the cloned repo can be opened as an Obsidian vault.
 */
async function initObsidianVault(localPath: string): Promise<void> {
  const obsidianDir = path.join(localPath, ".obsidian");
  try {
    await fs.access(obsidianDir);
  } catch {
    await fs.mkdir(obsidianDir, { recursive: true });
    await fs.writeFile(
      path.join(obsidianDir, "app.json"),
      JSON.stringify({}, null, 2),
      "utf8"
    );
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sync all configured sources into vaultRoot sequentially.
 *
 * Step 1: Pull the commoncortex-vault itself from GitHub so this machine has
 *         the latest changes committed by other machines.
 * Step 2: For each source — clone/pull the source repo, bidirectionally sync
 *         selected folders, commit vault changes, push source repo to GitHub.
 *
 * Returns a merged result across all sources.
 */
export async function syncAll(
  sources: SyncSource[],
  vaultRoot: string,
  ownerName: string,
  ownerEmail: string
): Promise<SyncResult> {
  const merged: SyncResult = {
    filesUpdated: 0,
    filesPushedBack: 0,
    filesSkipped: 0,
    errors: [],
    finishedAt: new Date().toISOString(),
  };

  // ── Step 1: Pull the shared vault from GitHub ─────────────────────────────
  // This brings in commits from other machines before we do anything else.
  try {
    await gitPullRepo(vaultRoot);
  } catch (err) {
    // Non-fatal — vault may have uncommitted local changes or no remote set up.
    // Log and continue; the per-source sync will still run.
    merged.errors.push(`vault git pull: ${(err as Error).message}`);
  }

  // ── Step 2: Bidirectional sync with each source repo ─────────────────────
  for (const source of sources) {
    const result = await syncSource(source, vaultRoot, ownerName, ownerEmail);
    merged.filesUpdated += result.filesUpdated;
    merged.filesPushedBack += result.filesPushedBack;
    merged.filesSkipped += result.filesSkipped;
    merged.errors.push(...result.errors);
  }

  // ── Step 3: Commit any local vault changes + push to GitHub ───────────────
  // This covers user edits made directly in Obsidian, plus any files pulled in
  // by source syncs above.  One commit + push at the end keeps it clean.
  try {
    await gitAdd(vaultRoot, "-A");
    await gitCommit(
      vaultRoot,
      `sync: local vault changes`,
      ownerName,
      ownerEmail
    );
  } catch {
    // "nothing to commit" is expected when the tree is clean — ignore
  }
  try {
    await gitPush(vaultRoot);
  } catch (err) {
    merged.errors.push(`vault push failed: ${(err as Error).message}`);
  }

  merged.finishedAt = new Date().toISOString();
  return merged;
}

/**
 * Sync one source bidirectionally:
 *   GitHub repo ←→ commoncortex-vault
 *
 * Pull direction (GitHub → vault):
 *   - New files in GitHub → copy to vault
 *   - Files changed in GitHub more recently → copy to vault
 *
 * Push direction (vault → GitHub):
 *   - New files in vault → copy to source clone
 *   - Files changed in vault more recently → copy to source clone
 *   - After copying, commits + pushes source clone to GitHub
 *
 * Never deletes files from either side.
 * Conflict resolution: newer modification time wins.
 */
export async function syncSource(
  source: SyncSource,
  vaultRoot: string,
  ownerName: string,
  ownerEmail: string
): Promise<SyncResult> {
  const result: SyncResult = {
    filesUpdated: 0,
    filesPushedBack: 0,
    filesSkipped: 0,
    errors: [],
    finishedAt: new Date().toISOString(),
  };

  // Clone or pull the source GitHub repo
  let localPath: string;
  try {
    localPath = await ensureRepoReady(source);
  } catch (err) {
    result.errors.push(`Repo setup failed: ${(err as Error).message}`);
    result.finishedAt = new Date().toISOString();
    return result;
  }

  const baseDir = source.destDir
    ? path.join(vaultRoot, source.destDir)
    : vaultRoot;

  for (const folder of source.folders) {
    const srcDir = path.join(localPath, folder.folderName);
    const destDir = path.join(baseDir, folder.folderName);

    try {
      // Ensure both sides exist before walking
      await fs.mkdir(srcDir, { recursive: true });
      await fs.mkdir(destDir, { recursive: true });
      await walkAndSync(srcDir, destDir, result);
    } catch (err) {
      result.errors.push(`${folder.folderName}: ${(err as Error).message}`);
    }
  }

  // ── Commit commoncortex-vault if files were pulled in ──────────────────────
  if (result.filesUpdated > 0) {
    try {
      await gitAdd(vaultRoot, "-A");
      await gitCommit(
        vaultRoot,
        `sync: ${source.name} — ${result.filesUpdated} file${result.filesUpdated === 1 ? "" : "s"} pulled`,
        ownerName,
        ownerEmail
      );
    } catch (err) {
      result.errors.push(`git commit (vault) failed: ${(err as Error).message}`);
    }
  }

  // ── Commit + push source clone if files were pushed back ───────────────────
  if (result.filesPushedBack > 0) {
    try {
      await gitAdd(localPath, "-A");
      await gitCommit(
        localPath,
        `sync: from commoncortex — ${result.filesPushedBack} file${result.filesPushedBack === 1 ? "" : "s"} updated`,
        ownerName,
        ownerEmail
      );
      await gitPush(localPath);
    } catch (err) {
      result.errors.push(`git push (source repo) failed: ${(err as Error).message}`);
    }
  }

  result.finishedAt = new Date().toISOString();
  return result;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Recursively walk both srcDir and destDir together, syncing files
 * bidirectionally based on content hash + modification time.
 *
 *   - Only in src   → copy src → dest  (filesUpdated)
 *   - Only in dest  → copy dest → src  (filesPushedBack)
 *   - In both, same → skip             (filesSkipped)
 *   - In both, diff → newer mtime wins
 *
 * Skips dotfiles/dotdirs (.git, .obsidian, etc.) on both sides.
 * Never deletes from either side.
 */
async function walkAndSync(
  srcDir: string,
  destDir: string,
  result: { filesUpdated: number; filesPushedBack: number; filesSkipped: number; errors: string[] }
): Promise<void> {
  const [srcEntries, destEntries] = await Promise.all([
    readDirSafe(srcDir),
    readDirSafe(destDir),
  ]);

  const srcMap = new Map(srcEntries.map(e => [e.name, e]));
  const destMap = new Map(destEntries.map(e => [e.name, e]));
  const allNames = new Set([...srcMap.keys(), ...destMap.keys()]);

  for (const name of allNames) {
    if (name.startsWith(".")) continue;

    const srcPath = path.join(srcDir, name);
    const destPath = path.join(destDir, name);
    const srcEntry = srcMap.get(name);
    const destEntry = destMap.get(name);
    const isDir = srcEntry?.isDirectory() || destEntry?.isDirectory();

    if (isDir) {
      try {
        await fs.mkdir(srcPath, { recursive: true });
        await fs.mkdir(destPath, { recursive: true });
        await walkAndSync(srcPath, destPath, result);
      } catch (err) {
        result.errors.push(`${name}: ${(err as Error).message}`);
      }
    } else {
      try {
        if (srcEntry && !destEntry) {
          // File only in source → pull to dest
          await fs.copyFile(srcPath, destPath);
          result.filesUpdated++;

        } else if (!srcEntry && destEntry) {
          // File only in dest → push back to source
          await fs.copyFile(destPath, srcPath);
          result.filesPushedBack++;

        } else if (srcEntry && destEntry) {
          // File in both → compare content, then mtime if different
          const [srcHash, destHash] = await Promise.all([
            hashFile(srcPath),
            hashFile(destPath),
          ]);

          if (srcHash === destHash) {
            result.filesSkipped++;
          } else {
            // Content differs — newer modification time wins
            const [srcStat, destStat] = await Promise.all([
              fs.stat(srcPath),
              fs.stat(destPath),
            ]);

            if (srcStat.mtimeMs >= destStat.mtimeMs) {
              await fs.copyFile(srcPath, destPath);
              result.filesUpdated++;
            } else {
              await fs.copyFile(destPath, srcPath);
              result.filesPushedBack++;
            }
          }
        }
      } catch (err) {
        result.errors.push(`${name}: ${(err as Error).message}`);
      }
    }
  }
}

/** Read a directory, returning an empty array if it doesn't exist. */
async function readDirSafe(dir: string): Promise<fs.Dirent[]> {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function hashFile(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}
