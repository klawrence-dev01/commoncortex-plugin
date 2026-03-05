import { Plugin, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { ContributorPanelView, CONTRIBUTOR_PANEL_VIEW } from "./views/ContributorPanel";
import { InboxView, INBOX_VIEW_TYPE } from "./views/InboxView";
import { SyncSettingsTab } from "./views/SyncSettingsTab";
import { getFileMeta } from "./utils/frontmatter";
import { syncAll } from "./utils/sync";
import { PluginSettings, DEFAULT_SETTINGS } from "./settings";

// Read vault manifest to find owner identity
interface Contributor {
  id: string;
  name: string;
  role: string;
  access: Record<string, string[]>;
}

interface VaultManifest {
  contributors: Contributor[];
}

export default class CommonCortexPlugin extends Plugin {
  // Per-device settings (persisted to data.json, not committed to git)
  settings!: PluginSettings;

  // Vault identity — loaded from manifest.json
  vaultRoot!: string;
  ownerName!: string;
  ownerEmail!: string;
  agentIds = new Set<string>();

  // Auto-sync state
  private autoSyncInterval: ReturnType<typeof window.setInterval> | null = null;
  private isSyncing = false;

  async onload(): Promise<void> {
    await this.loadSettings();       // must be first — other features may depend on settings
    await this.loadVaultManifest();

    // Register views
    this.registerView(
      CONTRIBUTOR_PANEL_VIEW,
      (leaf) => new ContributorPanelView(leaf, this.vaultRoot, this.agentIds)
    );
    this.registerView(
      INBOX_VIEW_TYPE,
      (leaf) => new InboxView(leaf, this.vaultRoot, this.ownerName, this.ownerEmail)
    );

    // Ribbon icon: manual sync
    this.addRibbonIcon("refresh-cw", "Sync All Sources", () => {
      this.runSyncCommand();
    });

    // Ribbon icon: open agent inbox
    this.addRibbonIcon("inbox", "CommonCortex Inbox", () => {
      this.openInboxView();
    });

    // Commands
    this.addCommand({
      id: "open-contributor-panel",
      name: "Open Contributor Panel",
      callback: () => this.openContributorPanel(),
    });

    this.addCommand({
      id: "open-inbox",
      name: "Open Agent Inbox",
      callback: () => this.openInboxView(),
    });

    this.addCommand({
      id: "sync-now",
      name: "Sync All Sources Now",
      callback: () => this.runSyncCommand(),
    });

    // Settings tab
    this.addSettingTab(new SyncSettingsTab(this.app, this));

    // Attribution badges in file explorer
    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.decorateFileExplorer())
    );
    this.registerEvent(
      this.app.vault.on("modify", () => this.decorateFileExplorer())
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.decorateFileExplorer())
    );

    // Open contributor panel on startup, then kick off auto-sync if configured
    this.app.workspace.onLayoutReady(() => {
      this.openContributorPanel();
      this.decorateFileExplorer();
      this.startAutoSync();
    });
  }

  onunload(): void {
    this.stopAutoSync();
    this.app.workspace.detachLeavesOfType(CONTRIBUTOR_PANEL_VIEW);
    this.app.workspace.detachLeavesOfType(INBOX_VIEW_TYPE);
  }

  // ── Settings ────────────────────────────────────────────────────────────────

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.applyIdentityOverride(); // keep ownerName/ownerEmail in sync
  }

  // ── Auto-sync ────────────────────────────────────────────────────────────────

  /**
   * Start (or restart) the auto-sync timer using the current autoSyncMinutes setting.
   * Call this whenever the interval setting changes.
   */
  startAutoSync(): void {
    this.stopAutoSync();
    const minutes = this.settings.autoSyncMinutes ?? 0;
    if (minutes > 0) {
      this.autoSyncInterval = window.setInterval(
        () => this.runSyncCommand(),
        minutes * 60 * 1000
      );
    }
  }

  stopAutoSync(): void {
    if (this.autoSyncInterval !== null) {
      window.clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }

  // ── Sync ────────────────────────────────────────────────────────────────────

  async runSyncCommand(): Promise<void> {
    if (!this.settings.syncSources.length) {
      new Notice("No sync sources configured. Open Settings → CommonCortex to add one.");
      return;
    }

    // Prevent concurrent syncs (auto-sync could fire while one is running)
    if (this.isSyncing) return;
    this.isSyncing = true;

    new Notice("Syncing… (pulling vault + source repos)");
    try {
      const result = await syncAll(
        this.settings.syncSources,
        this.vaultRoot,
        this.ownerName,
        this.ownerEmail
      );

      const ts = result.finishedAt;
      for (const src of this.settings.syncSources) {
        src.lastSyncAt = ts;
        src.lastSyncResult = result;
      }
      await this.saveSettings();

      // Build a concise summary notice
      const parts: string[] = [];
      if (result.filesUpdated > 0)    parts.push(`${result.filesUpdated} pulled`);
      if (result.filesPushedBack > 0) parts.push(`${result.filesPushedBack} pushed`);
      const summary = parts.length ? parts.join(", ") : "nothing changed";
      new Notice(`Sync complete: ${summary}.`);

      if (result.errors.length) {
        new Notice(`Sync had ${result.errors.length} error${result.errors.length === 1 ? "" : "s"} — check Settings → CommonCortex.`);
      }
    } catch (err) {
      new Notice(`Sync error: ${(err as Error).message}`);
    } finally {
      this.isSyncing = false;
    }
  }

  // ── Vault manifest ──────────────────────────────────────────────────────────

  private async loadVaultManifest(): Promise<void> {
    this.vaultRoot = (this.app.vault.adapter as { basePath: string }).basePath;

    // Load vault manifest for agent IDs and as fallback identity
    try {
      const raw = await this.app.vault.adapter.read("manifest.json");
      const manifest: VaultManifest = JSON.parse(raw);

      const owner = manifest.contributors.find(c => c.role === "owner");
      this.ownerName = owner?.name ?? "Owner";
      this.ownerEmail = owner?.id ?? "";

      manifest.contributors
        .filter(c => c.role === "agent")
        .forEach(c => this.agentIds.add(c.id));
    } catch {
      this.ownerName = "Owner";
      this.ownerEmail = "";
    }

    // Per-device identity (Settings → CommonCortex → Identity) overrides manifest.json.
    // New collaborators set this here instead of editing manifest.json.
    this.applyIdentityOverride();
  }

  /**
   * Apply per-device author name/email from settings, overriding the manifest.json
   * defaults.  Called on load and whenever settings are saved.
   */
  applyIdentityOverride(): void {
    if (this.settings.authorName)  this.ownerName  = this.settings.authorName;
    if (this.settings.authorEmail) this.ownerEmail = this.settings.authorEmail;
  }

  // ── View helpers ────────────────────────────────────────────────────────────

  private async openContributorPanel(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(CONTRIBUTOR_PANEL_VIEW);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: CONTRIBUTOR_PANEL_VIEW, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  private async openInboxView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(INBOX_VIEW_TYPE);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: INBOX_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  /**
   * Decorate file explorer nav items with a green dot for agent-authored files.
   * Only files with frontmatter author_id matching a known agent get badged —
   * git-history-only attribution is not scanned here (too slow for every change).
   */
  private decorateFileExplorer(): void {
    const files = this.app.vault.getMarkdownFiles();
    const agentFiles = new Set<string>();

    for (const file of files) {
      const meta = getFileMeta(this.app, file);
      if (meta.author_id && this.agentIds.has(meta.author_id)) {
        agentFiles.add(file.path);
      }
    }

    const navItems = document.querySelectorAll(".nav-file-title");
    navItems.forEach((el) => {
      const titleEl = el as HTMLElement;
      const filePath = titleEl.dataset.path ?? "";

      titleEl.querySelector(".cc-badge")?.remove();

      if (agentFiles.has(filePath)) {
        const badge = document.createElement("span");
        badge.className = "cc-badge cc-badge-agent";
        badge.title = "Agent-authored file";
        titleEl.appendChild(badge);
      }
    });
  }
}
