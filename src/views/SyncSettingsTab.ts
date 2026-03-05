import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import * as fs from "fs/promises";
import * as path from "path";
import CommonCortexPlugin from "../main";
import { SyncSource, SyncResult } from "../settings";
import { syncAll, syncSource, getCachePath, ensureRepoReady } from "../utils/sync";

export class SyncSettingsTab extends PluginSettingTab {
  private plugin: CommonCortexPlugin;

  constructor(app: App, plugin: CommonCortexPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Header ──────────────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "CommonCortex" });

    // ── Identity ─────────────────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Your Identity" });

    const identityDesc = this.plugin.settings.authorName || this.plugin.settings.authorEmail
      ? `Using: ${this.plugin.ownerName} <${this.plugin.ownerEmail}>`
      : `From manifest.json: ${this.plugin.ownerName} <${this.plugin.ownerEmail}>`;

    containerEl.createEl("p", { cls: "cc-settings-desc", text: identityDesc });

    new Setting(containerEl)
      .setName("Name")
      .setDesc("Your display name for sync attribution")
      .addText(text => {
        text
          .setPlaceholder(this.plugin.ownerName || "Your Name")
          .setValue(this.plugin.settings.authorName)
          .onChange(async val => {
            this.plugin.settings.authorName = val.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.addEventListener("blur", () => this.display());
      });

    new Setting(containerEl)
      .setName("Email")
      .setDesc("Must match your entry in vault manifest.json for full permissions")
      .addText(text => {
        text
          .setPlaceholder(this.plugin.ownerEmail || "you@example.com")
          .setValue(this.plugin.settings.authorEmail)
          .onChange(async val => {
            this.plugin.settings.authorEmail = val.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.addEventListener("blur", () => this.display());
      });

    containerEl.createEl("p", {
      cls: "cc-settings-desc",
      text: "New collaborators: set your name and email here, then ask the vault owner to add you to manifest.json.",
    });

    containerEl.createEl("h3", { text: "Vault Sync" });
    containerEl.createEl("p", {
      cls: "cc-settings-desc",
      text: "Bidirectional sync between GitHub repos and this shared vault. Changes here push to GitHub; changes on GitHub pull here. Config is local to this device — never committed to git.",
    });

    // ── Sync All button ──────────────────────────────────────────────────────
    const syncAllSetting = new Setting(containerEl)
      .setName("Sync all sources")
      .setDesc(this.buildGlobalSyncDesc());

    syncAllSetting.addButton(btn => {
      btn.setButtonText("Sync All Now").setCta();
      btn.onClick(async () => {
        if (!this.plugin.settings.syncSources.length) {
          new Notice("No sync sources configured. Add one below.");
          return;
        }
        btn.setDisabled(true);
        btn.setButtonText("Syncing…");
        try {
          await this.runSyncAll();
        } finally {
          btn.setDisabled(false);
          btn.setButtonText("Sync All Now");
        }
      });
    });

    // ── Auto-sync interval ───────────────────────────────────────────────────
    const currentMinutes = this.plugin.settings.autoSyncMinutes ?? 0;
    const autoSyncDesc = currentMinutes > 0
      ? `Syncing automatically every ${currentMinutes} minute${currentMinutes === 1 ? "" : "s"}`
      : "Auto-sync is off";

    new Setting(containerEl)
      .setName("Auto-sync interval")
      .setDesc(autoSyncDesc)
      .addText(text => {
        text
          .setPlaceholder("0")
          .setValue(currentMinutes > 0 ? String(currentMinutes) : "");
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.inputEl.style.width = "72px";
        text.onChange(async val => {
          const mins = parseInt(val, 10);
          this.plugin.settings.autoSyncMinutes = (!isNaN(mins) && mins > 0) ? mins : 0;
          await this.plugin.saveSettings();
          this.plugin.startAutoSync();
          this.display(); // refresh the desc line
        });
      })
      .addExtraButton(btn => {
        btn.setIcon("reset").setTooltip("Disable auto-sync").onClick(async () => {
          this.plugin.settings.autoSyncMinutes = 0;
          await this.plugin.saveSettings();
          this.plugin.stopAutoSync();
          this.display();
        });
      });

    // ── Source list ──────────────────────────────────────────────────────────
    if (this.plugin.settings.syncSources.length > 0) {
      containerEl.createEl("h4", { text: "Sources" });
    }

    for (const source of this.plugin.settings.syncSources) {
      this.renderSource(containerEl, source);
    }

    // ── Add source button ────────────────────────────────────────────────────
    new Setting(containerEl)
      .addButton(btn => {
        btn.setButtonText("+ Add Sync Source");
        btn.onClick(async () => {
          this.plugin.settings.syncSources.push({
            id: `src_${Date.now()}`,
            name: "",
            repoUrl: "",
            destDir: "",
            folders: [],
            lastSyncAt: null,
            lastSyncResult: null,
          });
          await this.plugin.saveSettings();
          this.display();
        });
      });
  }

  // ── Render one source ──────────────────────────────────────────────────────

  private renderSource(container: HTMLElement, source: SyncSource): void {
    const sourceEl = container.createDiv({ cls: "cc-sync-source" });

    // ── GitHub repo URL + Clone/Update button ──────────────────────────────
    const cloneSetting = new Setting(sourceEl)
      .setName("GitHub repo URL")
      .setDesc("HTTPS or SSH URL — e.g. https://github.com/username/my-vault");

    cloneSetting.addText(text => {
      text
        .setPlaceholder("https://github.com/username/my-vault")
        .setValue(source.repoUrl)
        .onChange(async val => {
          source.repoUrl = val.trim();
          // Auto-fill name and destDir from repo name if still empty
          if (!source.name) {
            const repoName = extractRepoName(source.repoUrl);
            if (repoName) {
              source.name = repoName;
              if (!source.destDir) source.destDir = repoName;
            }
          }
          await this.plugin.saveSettings();
        });
      text.inputEl.style.width = "260px";
    });

    cloneSetting.addButton(btn => {
      const cachePath = getCachePath(source.id);
      this.isRepoCloned(cachePath).then(cloned => {
        btn.setButtonText(cloned ? "Update" : "Clone");
      });

      btn.onClick(async () => {
        if (!source.repoUrl) {
          new Notice("Enter a GitHub repo URL first.");
          return;
        }
        // Auto-fill name/destDir if still blank
        if (!source.name) {
          const repoName = extractRepoName(source.repoUrl);
          if (repoName) {
            source.name = repoName;
            if (!source.destDir) source.destDir = repoName;
            await this.plugin.saveSettings();
          }
        }
        btn.setDisabled(true);
        btn.setButtonText("Working…");
        try {
          await ensureRepoReady(source);
          new Notice(`Repo ready: ${source.name || source.repoUrl}`);
        } catch (err) {
          new Notice(`Clone failed: ${(err as Error).message}`);
        } finally {
          btn.setDisabled(false);
          this.display();
        }
      });
    });

    // Clone status
    this.renderCloneStatus(sourceEl, source);

    // ── Source name ────────────────────────────────────────────────────────
    new Setting(sourceEl)
      .setName("Source name")
      .setDesc("Label for this repo (auto-filled from repo name)")
      .addText(text => {
        text
          .setPlaceholder("my-vault")
          .setValue(source.name)
          .onChange(async val => {
            source.name = val;
            // Keep destDir in sync if it hasn't been manually changed yet
            if (!source.destDir) {
              source.destDir = val;
            }
            await this.plugin.saveSettings();
          });
      });

    // ── Destination folder ─────────────────────────────────────────────────
    const destDesc = source.destDir
      ? `Syncs into: vault/${source.destDir}/<folder>/`
      : "Syncs into: vault/<folder>/ (no grouping folder)";

    new Setting(sourceEl)
      .setName("Destination folder")
      .setDesc(destDesc)
      .addText(text => {
        text
          .setPlaceholder("e.g. Shared Brain Vault (leave blank to sync to vault root)")
          .setValue(source.destDir)
          .onChange(async val => {
            source.destDir = val.trim();
            await this.plugin.saveSettings();
          });
      });

    // ── Folder multi-select ────────────────────────────────────────────────
    this.renderFolderCheckboxes(sourceEl, source);

    // ── Sync this source + status ──────────────────────────────────────────
    const syncSetting = new Setting(sourceEl)
      .setName("Sync this source")
      .setDesc(this.buildSourceSyncDesc(source));

    syncSetting.addButton(btn => {
      btn.setButtonText("Sync Now");
      btn.onClick(async () => {
        if (!source.repoUrl) {
          new Notice("Enter a GitHub repo URL first.");
          return;
        }
        btn.setDisabled(true);
        btn.setButtonText("Syncing…");
        try {
          await this.runSyncSource(source);
        } finally {
          btn.setDisabled(false);
          btn.setButtonText("Sync Now");
        }
      });
    });

    // ── Remove source ──────────────────────────────────────────────────────
    new Setting(sourceEl)
      .addButton(btn => {
        btn.setButtonText("Remove Source").setWarning();
        btn.onClick(async () => {
          this.plugin.settings.syncSources = this.plugin.settings.syncSources.filter(
            s => s.id !== source.id
          );
          await this.plugin.saveSettings();
          this.display();
        });
      });

    sourceEl.createEl("hr");
  }

  // ── Clone status indicator ─────────────────────────────────────────────────

  private renderCloneStatus(container: HTMLElement, source: SyncSource): void {
    const statusEl = container.createDiv({ cls: "cc-clone-status" });

    (async () => {
      const cachePath = getCachePath(source.id);
      const cloned = await this.isRepoCloned(cachePath);

      if (!source.repoUrl) {
        statusEl.setText("Enter a repo URL above, then click Clone.");
        statusEl.addClass("cc-status-pending");
      } else if (cloned) {
        statusEl.setText(`✓ Cloned → ${cachePath}`);
        statusEl.addClass("cc-status-ok");
      } else {
        statusEl.setText("Not cloned yet — click Clone to download the repo.");
        statusEl.addClass("cc-status-pending");
      }
    })();
  }

  private async isRepoCloned(cachePath: string): Promise<boolean> {
    try {
      await fs.access(path.join(cachePath, ".git"));
      return true;
    } catch {
      return false;
    }
  }

  // ── Folder multi-select checkboxes ─────────────────────────────────────────

  private renderFolderCheckboxes(container: HTMLElement, source: SyncSource): void {
    const wrapEl = container.createDiv({ cls: "cc-folder-select" });
    wrapEl.createEl("p", { cls: "cc-folder-select-label", text: "Folders to sync" });
    const listEl = wrapEl.createDiv({ cls: "cc-folder-list" });
    listEl.createEl("p", { cls: "cc-folder-hint", text: "Loading…" });

    (async () => {
      const cachePath = getCachePath(source.id);
      const cloned = await this.isRepoCloned(cachePath);
      listEl.empty();

      if (!cloned) {
        listEl.createEl("p", {
          cls: "cc-folder-hint",
          text: source.repoUrl
            ? "Clone the repo above to see available folders."
            : "Enter a repo URL and click Clone to get started.",
        });
        return;
      }

      try {
        const entries = await fs.readdir(cachePath, { withFileTypes: true });
        const dirs = entries
          .filter(e => e.isDirectory() && !e.name.startsWith("."))
          .map(e => e.name)
          .sort();

        if (dirs.length === 0) {
          listEl.createEl("p", { cls: "cc-folder-hint", text: "No folders found in the repo." });
          return;
        }

        for (const name of dirs) {
          const rowEl = listEl.createDiv({ cls: "cc-folder-row" });
          const cbId = `cc-folder-${source.id}-${name}`;

          const checkbox = rowEl.createEl("input");
          checkbox.type = "checkbox";
          checkbox.id = cbId;
          checkbox.checked = source.folders.some(f => f.folderName === name);

          const label = rowEl.createEl("label", { text: name });
          label.htmlFor = cbId;

          checkbox.addEventListener("change", async () => {
            if (checkbox.checked) {
              if (!source.folders.some(f => f.folderName === name)) {
                source.folders.push({ folderName: name });
              }
            } else {
              source.folders = source.folders.filter(f => f.folderName !== name);
            }
            await this.plugin.saveSettings();
          });
        }
      } catch {
        listEl.createEl("p", {
          cls: "cc-folder-hint",
          text: "Error reading repo — try cloning again.",
        });
      }
    })();
  }

  // ── Sync runners ───────────────────────────────────────────────────────────

  private async runSyncAll(): Promise<void> {
    new Notice("Syncing all sources…");
    try {
      const result = await syncAll(
        this.plugin.settings.syncSources,
        this.plugin.vaultRoot,
        this.plugin.ownerName,
        this.plugin.ownerEmail
      );

      const ts = result.finishedAt;
      for (const src of this.plugin.settings.syncSources) {
        src.lastSyncAt = ts;
        src.lastSyncResult = result;
      }
      await this.plugin.saveSettings();
      this.showSyncNotice(result, "All sources");
      this.display();
    } catch (err) {
      new Notice(`Sync failed: ${(err as Error).message}`);
    }
  }

  private async runSyncSource(source: SyncSource): Promise<void> {
    new Notice(`Syncing ${source.name || "source"}…`);
    try {
      const result = await syncSource(
        source,
        this.plugin.vaultRoot,
        this.plugin.ownerName,
        this.plugin.ownerEmail
      );
      source.lastSyncAt = result.finishedAt;
      source.lastSyncResult = result;
      await this.plugin.saveSettings();
      this.showSyncNotice(result, source.name || "Source");
      this.display();
    } catch (err) {
      new Notice(`Sync failed: ${(err as Error).message}`);
    }
  }

  private showSyncNotice(result: SyncResult, label: string): void {
    const pulled = result.filesUpdated;
    const pushed = result.filesPushedBack;

    if (pulled === 0 && pushed === 0 && result.errors.length === 0) {
      new Notice(`${label}: nothing changed.`);
    } else {
      const parts: string[] = [];
      if (pulled > 0) parts.push(`${pulled} pulled from GitHub`);
      if (pushed > 0) parts.push(`${pushed} pushed to GitHub`);
      if (parts.length) new Notice(`${label}: ${parts.join(", ")}.`);
    }

    if (result.errors.length > 0) {
      new Notice(`${label}: ${result.errors.length} error${result.errors.length === 1 ? "" : "s"} — ${result.errors[0]}`);
    }
  }

  // ── Description helpers ────────────────────────────────────────────────────

  private buildGlobalSyncDesc(): string {
    const sources = this.plugin.settings.syncSources;
    if (!sources.length) return "No sync sources configured yet.";
    const synced = sources.filter(s => s.lastSyncAt);
    if (!synced.length) return `${sources.length} source${sources.length === 1 ? "" : "s"} configured — never synced.`;
    const latest = synced.reduce((a, b) =>
      (a.lastSyncAt ?? "") > (b.lastSyncAt ?? "") ? a : b
    );
    return `${sources.length} source${sources.length === 1 ? "" : "s"} — last sync: ${this.formatSyncTime(latest.lastSyncAt)}`;
  }

  private buildSourceSyncDesc(source: SyncSource): string {
    const selected = source.folders.length;
    const dest = source.destDir || "(vault root)";
    const base = selected
      ? `${selected} folder${selected === 1 ? "" : "s"} → ${dest}`
      : "No folders selected.";
    if (!source.lastSyncResult || !source.lastSyncAt) return `${base} — never synced.`;
    const r = source.lastSyncResult;
    const time = this.formatSyncTime(source.lastSyncAt);
    const activity: string[] = [];
    if (r.filesUpdated > 0)    activity.push(`${r.filesUpdated} pulled`);
    if (r.filesPushedBack > 0) activity.push(`${r.filesPushedBack} pushed`);
    if (r.filesSkipped > 0)    activity.push(`${r.filesSkipped} unchanged`);
    if (r.errors.length > 0)   activity.push(`${r.errors.length} error${r.errors.length === 1 ? "" : "s"}`);
    const summary = activity.length ? activity.join(", ") : "nothing changed";
    return `${base} — last sync: ${time} (${summary})`;
  }

  private formatSyncTime(iso: string | null): string {
    if (!iso) return "never";
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the repo name from a GitHub URL.
 * https://github.com/user/my-vault  →  "my-vault"
 * git@github.com:user/my-vault.git  →  "my-vault"
 */
function extractRepoName(url: string): string {
  const cleaned = url.replace(/\.git$/, "").trim();
  const parts = cleaned.split(/[/:]/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}
