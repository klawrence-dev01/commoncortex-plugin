var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => CommonCortexPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/views/ContributorPanel.ts
var import_obsidian = require("obsidian");

// src/utils/frontmatter.ts
function getFileMeta(app, file) {
  const cache = app.metadataCache.getFileCache(file);
  return cache?.frontmatter ?? {};
}
function formatDate(iso) {
  if (!iso) return "unknown";
  const d = new Date(iso);
  const now = /* @__PURE__ */ new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 864e5);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(void 0, { month: "short", day: "numeric" });
}
function getInitial(name) {
  return (name ?? "?").charAt(0).toUpperCase();
}

// src/utils/git.ts
var import_child_process = require("child_process");
var import_util = require("util");
var fs = __toESM(require("fs/promises"));
var path = __toESM(require("path"));
var execAsync = (0, import_util.promisify)(import_child_process.exec);
async function gitExec(cmd, cwd) {
  const { stdout } = await execAsync(cmd, { cwd });
  return stdout.trim();
}
async function gitAdd(cwd, file) {
  await gitExec(`git add ${JSON.stringify(file)}`, cwd);
}
async function gitCommit(cwd, message, authorName, authorEmail) {
  const author = `${authorName} <${authorEmail}>`;
  await gitExec(
    `git commit -m ${JSON.stringify(message)} --author=${JSON.stringify(author)}`,
    cwd
  );
}
async function gitPush(cwd) {
  await gitExec("git push", cwd);
}
async function gitClone(repoUrl, localPath) {
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await execAsync(`git clone ${JSON.stringify(repoUrl)} ${JSON.stringify(localPath)}`);
}
async function gitPullRepo(localPath) {
  await gitExec("git pull", localPath);
}
async function gitGetLastAuthor(vaultRoot, filePath) {
  const out = await gitExec(
    `git log --follow -1 --format="%an|%ae|%ai" -- ${JSON.stringify(filePath)}`,
    vaultRoot
  );
  if (!out) return null;
  const [name, email, date] = out.split("|");
  if (!name || !email) return null;
  return { name, email, date: date.trim() };
}

// src/views/ContributorPanel.ts
var CONTRIBUTOR_PANEL_VIEW = "cc-contributor-panel";
var ContributorPanelView = class extends import_obsidian.ItemView {
  unsubscribe;
  vaultRoot;
  agentIds;
  constructor(leaf, vaultRoot, agentIds) {
    super(leaf);
    this.vaultRoot = vaultRoot;
    this.agentIds = agentIds;
  }
  getViewType() {
    return CONTRIBUTOR_PANEL_VIEW;
  }
  getDisplayText() {
    return "Contributor";
  }
  getIcon() {
    return "users";
  }
  async onOpen() {
    this.render(this.app.workspace.getActiveFile());
    this.unsubscribe = (() => {
      const handler = (file) => this.render(file);
      this.app.workspace.on(
        "active-leaf-change",
        () => handler(this.app.workspace.getActiveFile())
      );
      return () => {
        this.app.workspace.off("active-leaf-change", handler);
      };
    })();
  }
  async onClose() {
    this.unsubscribe?.();
  }
  async render(file) {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("cc-contributor-panel");
    if (!file || file.extension !== "md") {
      container.createEl("p", {
        cls: "cc-empty",
        text: "Open a markdown file to see its contributors."
      });
      return;
    }
    const meta = getFileMeta(this.app, file);
    if (meta.author || meta.author_id) {
      this.renderContributorCard(container, {
        name: meta.author ?? meta.author_id ?? "Unknown",
        id: meta.author_id,
        role: this.inferRole(meta.author_id),
        lastModified: meta.last_modified,
        source: "frontmatter"
      });
      return;
    }
    try {
      const gitAuthor = await gitGetLastAuthor(this.vaultRoot, file.path);
      if (gitAuthor) {
        this.renderContributorCard(container, {
          name: gitAuthor.name,
          id: gitAuthor.email,
          role: this.inferRole(gitAuthor.email),
          lastModified: gitAuthor.date,
          source: "git"
        });
      } else {
        container.createEl("p", {
          cls: "cc-empty",
          text: "No contributor metadata in this file."
        });
      }
    } catch {
      container.createEl("p", {
        cls: "cc-empty",
        text: "No contributor metadata in this file."
      });
    }
  }
  inferRole(authorId) {
    if (!authorId) return "owner";
    return this.agentIds.has(authorId) ? "agent" : "owner";
  }
  renderContributorCard(container, info) {
    const card = container.createDiv({ cls: "cc-contributor-card" });
    const avatar = card.createDiv({ cls: `cc-avatar cc-role-${info.role}` });
    avatar.setText(getInitial(info.name));
    const infoEl = card.createDiv({ cls: "cc-contributor-info" });
    infoEl.createEl("p", { cls: "cc-contributor-name", text: info.name });
    infoEl.createEl("p", { cls: "cc-contributor-role", text: info.role });
    if (info.id) {
      infoEl.createEl("p", { cls: "cc-contributor-meta", text: info.id });
    }
    if (info.lastModified) {
      infoEl.createEl("p", {
        cls: "cc-contributor-meta",
        text: `Last modified: ${formatDate(info.lastModified)}`
      });
    }
    if (info.source === "git") {
      infoEl.createEl("p", {
        cls: "cc-contributor-meta cc-source-git",
        text: "via git history"
      });
    }
  }
};

// src/views/InboxView.ts
var import_obsidian2 = require("obsidian");
var INBOX_VIEW_TYPE = "cc-inbox-view";
var INBOX_FOLDER = "CommonCortex/_inbox";
var InboxView = class extends import_obsidian2.ItemView {
  vaultRoot;
  ownerName;
  ownerEmail;
  constructor(leaf, vaultRoot, ownerName, ownerEmail) {
    super(leaf);
    this.vaultRoot = vaultRoot;
    this.ownerName = ownerName;
    this.ownerEmail = ownerEmail;
  }
  getViewType() {
    return INBOX_VIEW_TYPE;
  }
  getDisplayText() {
    return "Agent Inbox";
  }
  getIcon() {
    return "inbox";
  }
  async onOpen() {
    await this.refresh();
    this.registerEvent(
      this.app.vault.on("create", () => this.refresh())
    );
    this.registerEvent(
      this.app.vault.on("delete", () => this.refresh())
    );
  }
  async refresh() {
    const proposals = await this.loadProposals();
    this.renderProposals(proposals);
  }
  async loadProposals() {
    const folder = this.app.vault.getAbstractFileByPath(INBOX_FOLDER);
    if (!folder) return [];
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(INBOX_FOLDER + "/"));
    const proposals = [];
    for (const file of files) {
      const meta = getFileMeta(this.app, file);
      if (!meta.proposal) continue;
      proposals.push({
        file,
        proposedBy: meta.proposed_by ?? "Unknown",
        authorId: meta.author_id ?? "",
        intendedPath: meta.intended_path ?? file.basename,
        note: meta.note ?? "",
        created: meta.created ?? ""
      });
    }
    return proposals.sort((a, b) => b.created.localeCompare(a.created));
  }
  renderProposals(proposals) {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("cc-inbox-view");
    const header = container.createDiv({ cls: "cc-inbox-header" });
    header.createEl("h4", { text: `Inbox (${proposals.length})` });
    const refreshBtn = header.createEl("button", { text: "\u21BA" });
    refreshBtn.title = "Refresh";
    refreshBtn.onclick = () => this.refresh();
    if (proposals.length === 0) {
      container.createEl("p", { cls: "cc-inbox-empty", text: "No pending proposals." });
      return;
    }
    for (const proposal of proposals) {
      this.renderProposalCard(container, proposal);
    }
  }
  renderProposalCard(container, proposal) {
    const card = container.createDiv({ cls: "cc-proposal-card" });
    const headerRow = card.createDiv({ cls: "cc-proposal-header" });
    headerRow.createEl("span", { cls: "cc-proposal-by", text: proposal.proposedBy });
    headerRow.createEl("span", { cls: "cc-proposal-date", text: formatDate(proposal.created) });
    card.createEl("div", { cls: "cc-proposal-path", text: `\u2192 ${proposal.intendedPath}` });
    if (proposal.note) {
      card.createEl("div", { cls: "cc-proposal-note", text: `"${proposal.note}"` });
    }
    const actions = card.createDiv({ cls: "cc-proposal-actions" });
    const approveBtn = actions.createEl("button", { cls: "cc-btn cc-btn-approve", text: "\u2713 Approve" });
    approveBtn.onclick = () => this.approve(proposal);
    const rejectBtn = actions.createEl("button", { cls: "cc-btn cc-btn-reject", text: "\u2715 Reject" });
    rejectBtn.onclick = () => this.reject(proposal);
  }
  async approve(proposal) {
    try {
      const content = await this.app.vault.read(proposal.file);
      const existingDest = this.app.vault.getAbstractFileByPath(proposal.intendedPath);
      if (existingDest instanceof import_obsidian2.TFile) {
        await this.app.vault.delete(existingDest);
      }
      await this.app.vault.rename(proposal.file, proposal.intendedPath);
      await gitAdd(this.vaultRoot, "-A");
      await gitCommit(
        this.vaultRoot,
        `approve: ${proposal.proposedBy} \u2192 ${proposal.intendedPath}`,
        this.ownerName,
        this.ownerEmail
      );
      await gitPush(this.vaultRoot);
      new import_obsidian2.Notice(`\u2705 Approved and moved to ${proposal.intendedPath}`);
      await this.refresh();
    } catch (e) {
      new import_obsidian2.Notice(`\u274C Approve failed: ${e.message}`);
    }
  }
  async reject(proposal) {
    try {
      await this.app.vault.delete(proposal.file);
      await gitAdd(this.vaultRoot, "-A");
      await gitCommit(
        this.vaultRoot,
        `reject: ${proposal.proposedBy} \u2192 ${proposal.intendedPath}`,
        this.ownerName,
        this.ownerEmail
      );
      await gitPush(this.vaultRoot);
      new import_obsidian2.Notice(`\u{1F5D1} Rejected proposal from ${proposal.proposedBy}`);
      await this.refresh();
    } catch (e) {
      new import_obsidian2.Notice(`\u274C Reject failed: ${e.message}`);
    }
  }
};

// src/views/SyncSettingsTab.ts
var import_obsidian3 = require("obsidian");
var fs3 = __toESM(require("fs/promises"));
var path3 = __toESM(require("path"));

// src/utils/sync.ts
var fs2 = __toESM(require("fs/promises"));
var path2 = __toESM(require("path"));
var crypto = __toESM(require("crypto"));
var os = __toESM(require("os"));
function getCachePath(sourceId) {
  return path2.join(os.homedir(), ".commoncortex", "repos", sourceId);
}
async function ensureRepoReady(source) {
  const localPath = getCachePath(source.id);
  const gitDir = path2.join(localPath, ".git");
  let isCloned = false;
  try {
    await fs2.access(gitDir);
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
  await initObsidianVault(localPath);
  return localPath;
}
async function initObsidianVault(localPath) {
  const obsidianDir = path2.join(localPath, ".obsidian");
  try {
    await fs2.access(obsidianDir);
  } catch {
    await fs2.mkdir(obsidianDir, { recursive: true });
    await fs2.writeFile(
      path2.join(obsidianDir, "app.json"),
      JSON.stringify({}, null, 2),
      "utf8"
    );
  }
}
async function syncAll(sources, vaultRoot, ownerName, ownerEmail) {
  const merged = {
    filesUpdated: 0,
    filesPushedBack: 0,
    filesSkipped: 0,
    errors: [],
    finishedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  for (const source of sources) {
    const result = await syncSource(source, vaultRoot, ownerName, ownerEmail);
    merged.filesUpdated += result.filesUpdated;
    merged.filesPushedBack += result.filesPushedBack;
    merged.filesSkipped += result.filesSkipped;
    merged.errors.push(...result.errors);
  }
  merged.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
  return merged;
}
async function syncSource(source, vaultRoot, ownerName, ownerEmail) {
  const result = {
    filesUpdated: 0,
    filesPushedBack: 0,
    filesSkipped: 0,
    errors: [],
    finishedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  let localPath;
  try {
    localPath = await ensureRepoReady(source);
  } catch (err) {
    result.errors.push(`Repo setup failed: ${err.message}`);
    result.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
    return result;
  }
  const baseDir = source.destDir ? path2.join(vaultRoot, source.destDir) : vaultRoot;
  for (const folder of source.folders) {
    const srcDir = path2.join(localPath, folder.folderName);
    const destDir = path2.join(baseDir, folder.folderName);
    try {
      await fs2.mkdir(srcDir, { recursive: true });
      await fs2.mkdir(destDir, { recursive: true });
      await walkAndSync(srcDir, destDir, result);
    } catch (err) {
      result.errors.push(`${folder.folderName}: ${err.message}`);
    }
  }
  if (result.filesUpdated > 0) {
    try {
      await gitAdd(vaultRoot, "-A");
      await gitCommit(
        vaultRoot,
        `sync: ${source.name} \u2014 ${result.filesUpdated} file${result.filesUpdated === 1 ? "" : "s"} pulled`,
        ownerName,
        ownerEmail
      );
    } catch (err) {
      result.errors.push(`git commit (vault) failed: ${err.message}`);
    }
  }
  if (result.filesPushedBack > 0) {
    try {
      await gitAdd(localPath, "-A");
      await gitCommit(
        localPath,
        `sync: from commoncortex \u2014 ${result.filesPushedBack} file${result.filesPushedBack === 1 ? "" : "s"} updated`,
        ownerName,
        ownerEmail
      );
      await gitPush(localPath);
    } catch (err) {
      result.errors.push(`git push (source repo) failed: ${err.message}`);
    }
  }
  result.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
  return result;
}
async function walkAndSync(srcDir, destDir, result) {
  const [srcEntries, destEntries] = await Promise.all([
    readDirSafe(srcDir),
    readDirSafe(destDir)
  ]);
  const srcMap = new Map(srcEntries.map((e) => [e.name, e]));
  const destMap = new Map(destEntries.map((e) => [e.name, e]));
  const allNames = /* @__PURE__ */ new Set([...srcMap.keys(), ...destMap.keys()]);
  for (const name of allNames) {
    if (name.startsWith(".")) continue;
    const srcPath = path2.join(srcDir, name);
    const destPath = path2.join(destDir, name);
    const srcEntry = srcMap.get(name);
    const destEntry = destMap.get(name);
    const isDir = srcEntry?.isDirectory() || destEntry?.isDirectory();
    if (isDir) {
      try {
        await fs2.mkdir(srcPath, { recursive: true });
        await fs2.mkdir(destPath, { recursive: true });
        await walkAndSync(srcPath, destPath, result);
      } catch (err) {
        result.errors.push(`${name}: ${err.message}`);
      }
    } else {
      try {
        if (srcEntry && !destEntry) {
          await fs2.copyFile(srcPath, destPath);
          result.filesUpdated++;
        } else if (!srcEntry && destEntry) {
          await fs2.copyFile(destPath, srcPath);
          result.filesPushedBack++;
        } else if (srcEntry && destEntry) {
          const [srcHash, destHash] = await Promise.all([
            hashFile(srcPath),
            hashFile(destPath)
          ]);
          if (srcHash === destHash) {
            result.filesSkipped++;
          } else {
            const [srcStat, destStat] = await Promise.all([
              fs2.stat(srcPath),
              fs2.stat(destPath)
            ]);
            if (srcStat.mtimeMs >= destStat.mtimeMs) {
              await fs2.copyFile(srcPath, destPath);
              result.filesUpdated++;
            } else {
              await fs2.copyFile(destPath, srcPath);
              result.filesPushedBack++;
            }
          }
        }
      } catch (err) {
        result.errors.push(`${name}: ${err.message}`);
      }
    }
  }
}
async function readDirSafe(dir) {
  try {
    return await fs2.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
async function hashFile(filePath) {
  const buf = await fs2.readFile(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// src/views/SyncSettingsTab.ts
var SyncSettingsTab = class extends import_obsidian3.PluginSettingTab {
  plugin;
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "CommonCortex" });
    containerEl.createEl("h3", { text: "Your Identity" });
    const identityDesc = this.plugin.settings.authorName || this.plugin.settings.authorEmail ? `Using: ${this.plugin.ownerName} <${this.plugin.ownerEmail}>` : `From manifest.json: ${this.plugin.ownerName} <${this.plugin.ownerEmail}>`;
    containerEl.createEl("p", { cls: "cc-settings-desc", text: identityDesc });
    new import_obsidian3.Setting(containerEl).setName("Name").setDesc("Your display name for sync attribution").addText((text) => {
      text.setPlaceholder(this.plugin.ownerName || "Your Name").setValue(this.plugin.settings.authorName).onChange(async (val) => {
        this.plugin.settings.authorName = val.trim();
        await this.plugin.saveSettings();
      });
      text.inputEl.addEventListener("blur", () => this.display());
    });
    new import_obsidian3.Setting(containerEl).setName("Email").setDesc("Must match your entry in vault manifest.json for full permissions").addText((text) => {
      text.setPlaceholder(this.plugin.ownerEmail || "you@example.com").setValue(this.plugin.settings.authorEmail).onChange(async (val) => {
        this.plugin.settings.authorEmail = val.trim();
        await this.plugin.saveSettings();
      });
      text.inputEl.addEventListener("blur", () => this.display());
    });
    containerEl.createEl("p", {
      cls: "cc-settings-desc",
      text: "New collaborators: set your name and email here, then ask the vault owner to add you to manifest.json."
    });
    containerEl.createEl("h3", { text: "Vault Sync" });
    containerEl.createEl("p", {
      cls: "cc-settings-desc",
      text: "Bidirectional sync between GitHub repos and this shared vault. Changes here push to GitHub; changes on GitHub pull here. Config is local to this device \u2014 never committed to git."
    });
    const syncAllSetting = new import_obsidian3.Setting(containerEl).setName("Sync all sources").setDesc(this.buildGlobalSyncDesc());
    syncAllSetting.addButton((btn) => {
      btn.setButtonText("Sync All Now").setCta();
      btn.onClick(async () => {
        if (!this.plugin.settings.syncSources.length) {
          new import_obsidian3.Notice("No sync sources configured. Add one below.");
          return;
        }
        btn.setDisabled(true);
        btn.setButtonText("Syncing\u2026");
        try {
          await this.runSyncAll();
        } finally {
          btn.setDisabled(false);
          btn.setButtonText("Sync All Now");
        }
      });
    });
    const currentMinutes = this.plugin.settings.autoSyncMinutes ?? 0;
    const autoSyncDesc = currentMinutes > 0 ? `Syncing automatically every ${currentMinutes} minute${currentMinutes === 1 ? "" : "s"}` : "Auto-sync is off";
    new import_obsidian3.Setting(containerEl).setName("Auto-sync interval").setDesc(autoSyncDesc).addText((text) => {
      text.setPlaceholder("0").setValue(currentMinutes > 0 ? String(currentMinutes) : "");
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.inputEl.style.width = "72px";
      text.onChange(async (val) => {
        const mins = parseInt(val, 10);
        this.plugin.settings.autoSyncMinutes = !isNaN(mins) && mins > 0 ? mins : 0;
        await this.plugin.saveSettings();
        this.plugin.startAutoSync();
        this.display();
      });
    }).addExtraButton((btn) => {
      btn.setIcon("reset").setTooltip("Disable auto-sync").onClick(async () => {
        this.plugin.settings.autoSyncMinutes = 0;
        await this.plugin.saveSettings();
        this.plugin.stopAutoSync();
        this.display();
      });
    });
    if (this.plugin.settings.syncSources.length > 0) {
      containerEl.createEl("h4", { text: "Sources" });
    }
    for (const source of this.plugin.settings.syncSources) {
      this.renderSource(containerEl, source);
    }
    new import_obsidian3.Setting(containerEl).addButton((btn) => {
      btn.setButtonText("+ Add Sync Source");
      btn.onClick(async () => {
        this.plugin.settings.syncSources.push({
          id: `src_${Date.now()}`,
          name: "",
          repoUrl: "",
          destDir: "",
          folders: [],
          lastSyncAt: null,
          lastSyncResult: null
        });
        await this.plugin.saveSettings();
        this.display();
      });
    });
  }
  // ── Render one source ──────────────────────────────────────────────────────
  renderSource(container, source) {
    const sourceEl = container.createDiv({ cls: "cc-sync-source" });
    const cloneSetting = new import_obsidian3.Setting(sourceEl).setName("GitHub repo URL").setDesc("HTTPS or SSH URL \u2014 e.g. https://github.com/username/my-vault");
    cloneSetting.addText((text) => {
      text.setPlaceholder("https://github.com/username/my-vault").setValue(source.repoUrl).onChange(async (val) => {
        source.repoUrl = val.trim();
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
    cloneSetting.addButton((btn) => {
      const cachePath = getCachePath(source.id);
      this.isRepoCloned(cachePath).then((cloned) => {
        btn.setButtonText(cloned ? "Update" : "Clone");
      });
      btn.onClick(async () => {
        if (!source.repoUrl) {
          new import_obsidian3.Notice("Enter a GitHub repo URL first.");
          return;
        }
        if (!source.name) {
          const repoName = extractRepoName(source.repoUrl);
          if (repoName) {
            source.name = repoName;
            if (!source.destDir) source.destDir = repoName;
            await this.plugin.saveSettings();
          }
        }
        btn.setDisabled(true);
        btn.setButtonText("Working\u2026");
        try {
          await ensureRepoReady(source);
          new import_obsidian3.Notice(`Repo ready: ${source.name || source.repoUrl}`);
        } catch (err) {
          new import_obsidian3.Notice(`Clone failed: ${err.message}`);
        } finally {
          btn.setDisabled(false);
          this.display();
        }
      });
    });
    this.renderCloneStatus(sourceEl, source);
    new import_obsidian3.Setting(sourceEl).setName("Source name").setDesc("Label for this repo (auto-filled from repo name)").addText((text) => {
      text.setPlaceholder("my-vault").setValue(source.name).onChange(async (val) => {
        source.name = val;
        if (!source.destDir) {
          source.destDir = val;
        }
        await this.plugin.saveSettings();
      });
    });
    const destDesc = source.destDir ? `Syncs into: vault/${source.destDir}/<folder>/` : "Syncs into: vault/<folder>/ (no grouping folder)";
    new import_obsidian3.Setting(sourceEl).setName("Destination folder").setDesc(destDesc).addText((text) => {
      text.setPlaceholder("e.g. Shared Brain Vault (leave blank to sync to vault root)").setValue(source.destDir).onChange(async (val) => {
        source.destDir = val.trim();
        await this.plugin.saveSettings();
      });
    });
    this.renderFolderCheckboxes(sourceEl, source);
    const syncSetting = new import_obsidian3.Setting(sourceEl).setName("Sync this source").setDesc(this.buildSourceSyncDesc(source));
    syncSetting.addButton((btn) => {
      btn.setButtonText("Sync Now");
      btn.onClick(async () => {
        if (!source.repoUrl) {
          new import_obsidian3.Notice("Enter a GitHub repo URL first.");
          return;
        }
        btn.setDisabled(true);
        btn.setButtonText("Syncing\u2026");
        try {
          await this.runSyncSource(source);
        } finally {
          btn.setDisabled(false);
          btn.setButtonText("Sync Now");
        }
      });
    });
    new import_obsidian3.Setting(sourceEl).addButton((btn) => {
      btn.setButtonText("Remove Source").setWarning();
      btn.onClick(async () => {
        this.plugin.settings.syncSources = this.plugin.settings.syncSources.filter(
          (s) => s.id !== source.id
        );
        await this.plugin.saveSettings();
        this.display();
      });
    });
    sourceEl.createEl("hr");
  }
  // ── Clone status indicator ─────────────────────────────────────────────────
  renderCloneStatus(container, source) {
    const statusEl = container.createDiv({ cls: "cc-clone-status" });
    (async () => {
      const cachePath = getCachePath(source.id);
      const cloned = await this.isRepoCloned(cachePath);
      if (!source.repoUrl) {
        statusEl.setText("Enter a repo URL above, then click Clone.");
        statusEl.addClass("cc-status-pending");
      } else if (cloned) {
        statusEl.setText(`\u2713 Cloned \u2192 ${cachePath}`);
        statusEl.addClass("cc-status-ok");
      } else {
        statusEl.setText("Not cloned yet \u2014 click Clone to download the repo.");
        statusEl.addClass("cc-status-pending");
      }
    })();
  }
  async isRepoCloned(cachePath) {
    try {
      await fs3.access(path3.join(cachePath, ".git"));
      return true;
    } catch {
      return false;
    }
  }
  // ── Folder multi-select checkboxes ─────────────────────────────────────────
  renderFolderCheckboxes(container, source) {
    const wrapEl = container.createDiv({ cls: "cc-folder-select" });
    wrapEl.createEl("p", { cls: "cc-folder-select-label", text: "Folders to sync" });
    const listEl = wrapEl.createDiv({ cls: "cc-folder-list" });
    listEl.createEl("p", { cls: "cc-folder-hint", text: "Loading\u2026" });
    (async () => {
      const cachePath = getCachePath(source.id);
      const cloned = await this.isRepoCloned(cachePath);
      listEl.empty();
      if (!cloned) {
        listEl.createEl("p", {
          cls: "cc-folder-hint",
          text: source.repoUrl ? "Clone the repo above to see available folders." : "Enter a repo URL and click Clone to get started."
        });
        return;
      }
      try {
        const entries = await fs3.readdir(cachePath, { withFileTypes: true });
        const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name).sort();
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
          checkbox.checked = source.folders.some((f) => f.folderName === name);
          const label = rowEl.createEl("label", { text: name });
          label.htmlFor = cbId;
          checkbox.addEventListener("change", async () => {
            if (checkbox.checked) {
              if (!source.folders.some((f) => f.folderName === name)) {
                source.folders.push({ folderName: name });
              }
            } else {
              source.folders = source.folders.filter((f) => f.folderName !== name);
            }
            await this.plugin.saveSettings();
          });
        }
      } catch {
        listEl.createEl("p", {
          cls: "cc-folder-hint",
          text: "Error reading repo \u2014 try cloning again."
        });
      }
    })();
  }
  // ── Sync runners ───────────────────────────────────────────────────────────
  async runSyncAll() {
    new import_obsidian3.Notice("Syncing all sources\u2026");
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
      new import_obsidian3.Notice(`Sync failed: ${err.message}`);
    }
  }
  async runSyncSource(source) {
    new import_obsidian3.Notice(`Syncing ${source.name || "source"}\u2026`);
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
      new import_obsidian3.Notice(`Sync failed: ${err.message}`);
    }
  }
  showSyncNotice(result, label) {
    const pulled = result.filesUpdated;
    const pushed = result.filesPushedBack;
    if (pulled === 0 && pushed === 0 && result.errors.length === 0) {
      new import_obsidian3.Notice(`${label}: nothing changed.`);
    } else {
      const parts = [];
      if (pulled > 0) parts.push(`${pulled} pulled from GitHub`);
      if (pushed > 0) parts.push(`${pushed} pushed to GitHub`);
      if (parts.length) new import_obsidian3.Notice(`${label}: ${parts.join(", ")}.`);
    }
    if (result.errors.length > 0) {
      new import_obsidian3.Notice(`${label}: ${result.errors.length} error${result.errors.length === 1 ? "" : "s"} \u2014 ${result.errors[0]}`);
    }
  }
  // ── Description helpers ────────────────────────────────────────────────────
  buildGlobalSyncDesc() {
    const sources = this.plugin.settings.syncSources;
    if (!sources.length) return "No sync sources configured yet.";
    const synced = sources.filter((s) => s.lastSyncAt);
    if (!synced.length) return `${sources.length} source${sources.length === 1 ? "" : "s"} configured \u2014 never synced.`;
    const latest = synced.reduce(
      (a, b) => (a.lastSyncAt ?? "") > (b.lastSyncAt ?? "") ? a : b
    );
    return `${sources.length} source${sources.length === 1 ? "" : "s"} \u2014 last sync: ${this.formatSyncTime(latest.lastSyncAt)}`;
  }
  buildSourceSyncDesc(source) {
    const selected = source.folders.length;
    const dest = source.destDir || "(vault root)";
    const base = selected ? `${selected} folder${selected === 1 ? "" : "s"} \u2192 ${dest}` : "No folders selected.";
    if (!source.lastSyncResult || !source.lastSyncAt) return `${base} \u2014 never synced.`;
    const r = source.lastSyncResult;
    const time = this.formatSyncTime(source.lastSyncAt);
    const activity = [];
    if (r.filesUpdated > 0) activity.push(`${r.filesUpdated} pulled`);
    if (r.filesPushedBack > 0) activity.push(`${r.filesPushedBack} pushed`);
    if (r.filesSkipped > 0) activity.push(`${r.filesSkipped} unchanged`);
    if (r.errors.length > 0) activity.push(`${r.errors.length} error${r.errors.length === 1 ? "" : "s"}`);
    const summary = activity.length ? activity.join(", ") : "nothing changed";
    return `${base} \u2014 last sync: ${time} (${summary})`;
  }
  formatSyncTime(iso) {
    if (!iso) return "never";
    const d = new Date(iso);
    const now = /* @__PURE__ */ new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 6e4);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString(void 0, { month: "short", day: "numeric" });
  }
};
function extractRepoName(url) {
  const cleaned = url.replace(/\.git$/, "").trim();
  const parts = cleaned.split(/[/:]/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

// src/settings.ts
var DEFAULT_SETTINGS = {
  syncSources: [],
  autoSyncMinutes: 0,
  authorName: "",
  authorEmail: ""
};

// src/main.ts
var CommonCortexPlugin = class extends import_obsidian4.Plugin {
  // Per-device settings (persisted to data.json, not committed to git)
  settings;
  // Vault identity — loaded from manifest.json
  vaultRoot;
  ownerName;
  ownerEmail;
  agentIds = /* @__PURE__ */ new Set();
  // Auto-sync state
  autoSyncInterval = null;
  isSyncing = false;
  async onload() {
    await this.loadSettings();
    await this.loadVaultManifest();
    this.registerView(
      CONTRIBUTOR_PANEL_VIEW,
      (leaf) => new ContributorPanelView(leaf, this.vaultRoot, this.agentIds)
    );
    this.registerView(
      INBOX_VIEW_TYPE,
      (leaf) => new InboxView(leaf, this.vaultRoot, this.ownerName, this.ownerEmail)
    );
    this.addRibbonIcon("refresh-cw", "Sync All Sources", () => {
      this.runSyncCommand();
    });
    this.addRibbonIcon("inbox", "CommonCortex Inbox", () => {
      this.openInboxView();
    });
    this.addCommand({
      id: "open-contributor-panel",
      name: "Open Contributor Panel",
      callback: () => this.openContributorPanel()
    });
    this.addCommand({
      id: "open-inbox",
      name: "Open Agent Inbox",
      callback: () => this.openInboxView()
    });
    this.addCommand({
      id: "sync-now",
      name: "Sync All Sources Now",
      callback: () => this.runSyncCommand()
    });
    this.addSettingTab(new SyncSettingsTab(this.app, this));
    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.decorateFileExplorer())
    );
    this.registerEvent(
      this.app.vault.on("modify", () => this.decorateFileExplorer())
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.decorateFileExplorer())
    );
    this.app.workspace.onLayoutReady(() => {
      this.openContributorPanel();
      this.decorateFileExplorer();
      this.startAutoSync();
    });
  }
  onunload() {
    this.stopAutoSync();
    this.app.workspace.detachLeavesOfType(CONTRIBUTOR_PANEL_VIEW);
    this.app.workspace.detachLeavesOfType(INBOX_VIEW_TYPE);
  }
  // ── Settings ────────────────────────────────────────────────────────────────
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.applyIdentityOverride();
  }
  // ── Auto-sync ────────────────────────────────────────────────────────────────
  /**
   * Start (or restart) the auto-sync timer using the current autoSyncMinutes setting.
   * Call this whenever the interval setting changes.
   */
  startAutoSync() {
    this.stopAutoSync();
    const minutes = this.settings.autoSyncMinutes ?? 0;
    if (minutes > 0) {
      this.autoSyncInterval = window.setInterval(
        () => this.runSyncCommand(),
        minutes * 60 * 1e3
      );
    }
  }
  stopAutoSync() {
    if (this.autoSyncInterval !== null) {
      window.clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }
  // ── Sync ────────────────────────────────────────────────────────────────────
  async runSyncCommand() {
    if (!this.settings.syncSources.length) {
      new import_obsidian4.Notice("No sync sources configured. Open Settings \u2192 CommonCortex to add one.");
      return;
    }
    if (this.isSyncing) return;
    this.isSyncing = true;
    new import_obsidian4.Notice("Syncing\u2026 (pulling vault + source repos)");
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
      const parts = [];
      if (result.filesUpdated > 0) parts.push(`${result.filesUpdated} pulled`);
      if (result.filesPushedBack > 0) parts.push(`${result.filesPushedBack} pushed`);
      const summary = parts.length ? parts.join(", ") : "nothing changed";
      new import_obsidian4.Notice(`Sync complete: ${summary}.`);
      if (result.errors.length) {
        new import_obsidian4.Notice(`Sync had ${result.errors.length} error${result.errors.length === 1 ? "" : "s"} \u2014 check Settings \u2192 CommonCortex.`);
      }
    } catch (err) {
      new import_obsidian4.Notice(`Sync error: ${err.message}`);
    } finally {
      this.isSyncing = false;
    }
  }
  // ── Vault manifest ──────────────────────────────────────────────────────────
  async loadVaultManifest() {
    this.vaultRoot = this.app.vault.adapter.basePath;
    try {
      const raw = await this.app.vault.adapter.read("manifest.json");
      const manifest = JSON.parse(raw);
      const owner = manifest.contributors.find((c) => c.role === "owner");
      this.ownerName = owner?.name ?? "Owner";
      this.ownerEmail = owner?.id ?? "";
      manifest.contributors.filter((c) => c.role === "agent").forEach((c) => this.agentIds.add(c.id));
    } catch {
      this.ownerName = "Owner";
      this.ownerEmail = "";
    }
    this.applyIdentityOverride();
  }
  /**
   * Apply per-device author name/email from settings, overriding the manifest.json
   * defaults.  Called on load and whenever settings are saved.
   */
  applyIdentityOverride() {
    if (this.settings.authorName) this.ownerName = this.settings.authorName;
    if (this.settings.authorEmail) this.ownerEmail = this.settings.authorEmail;
  }
  // ── View helpers ────────────────────────────────────────────────────────────
  async openContributorPanel() {
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
  async openInboxView() {
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
  decorateFileExplorer() {
    const files = this.app.vault.getMarkdownFiles();
    const agentFiles = /* @__PURE__ */ new Set();
    for (const file of files) {
      const meta = getFileMeta(this.app, file);
      if (meta.author_id && this.agentIds.has(meta.author_id)) {
        agentFiles.add(file.path);
      }
    }
    const navItems = document.querySelectorAll(".nav-file-title");
    navItems.forEach((el) => {
      const titleEl = el;
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
};
