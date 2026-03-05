import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import { getFileMeta, formatDate, getInitial } from "../utils/frontmatter";
import { gitGetLastAuthor } from "../utils/git";
import { getCachePath, findSourceForVaultFile } from "../utils/sync";
import { SyncSource } from "../settings";

export const CONTRIBUTOR_PANEL_VIEW = "cc-contributor-panel";

export class ContributorPanelView extends ItemView {
  private unsubscribe?: () => void;
  private vaultRoot: string;
  private agentIds: Set<string>;
  private getSyncSources: () => SyncSource[];

  constructor(
    leaf: WorkspaceLeaf,
    vaultRoot: string,
    agentIds: Set<string>,
    getSyncSources: () => SyncSource[]
  ) {
    super(leaf);
    this.vaultRoot = vaultRoot;
    this.agentIds = agentIds;
    this.getSyncSources = getSyncSources;
  }

  getViewType(): string {
    return CONTRIBUTOR_PANEL_VIEW;
  }

  getDisplayText(): string {
    return "Contributor";
  }

  getIcon(): string {
    return "users";
  }

  async onOpen(): Promise<void> {
    this.render(this.app.workspace.getActiveFile());

    this.unsubscribe = (() => {
      const handler = (file: TFile | null) => this.render(file);
      this.app.workspace.on("active-leaf-change", () =>
        handler(this.app.workspace.getActiveFile())
      );
      return () => {
        this.app.workspace.off("active-leaf-change", handler as never);
      };
    })();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
  }

  private async render(file: TFile | null): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("cc-contributor-panel");

    if (!file || file.extension !== "md") {
      container.createEl("p", {
        cls: "cc-empty",
        text: "Open a markdown file to see its contributors.",
      });
      return;
    }

    const meta = getFileMeta(this.app, file);

    // Frontmatter path — preferred when present
    if (meta.author || meta.author_id) {
      this.renderContributorCard(container, {
        name: meta.author ?? meta.author_id ?? "Unknown",
        id: meta.author_id,
        role: this.inferRole(meta.author_id),
        lastModified: meta.last_modified,
        source: "frontmatter",
      });
      return;
    }

    // Git fallback — look up history in the source repo clone, not the vault
    try {
      const match = findSourceForVaultFile(this.getSyncSources(), file.path);
      const repoPath = match
        ? getCachePath(match.source.id)
        : this.vaultRoot; // fallback to vault root (won't work but won't crash)

      const gitAuthor = await gitGetLastAuthor(repoPath, match?.repoRelativePath ?? file.path);
      if (gitAuthor) {
        this.renderContributorCard(container, {
          name: gitAuthor.name,
          id: gitAuthor.email,
          role: this.inferRole(gitAuthor.email),
          lastModified: gitAuthor.date,
          source: "git",
        });
      } else {
        container.createEl("p", {
          cls: "cc-empty",
          text: "No contributor metadata in this file.",
        });
      }
    } catch {
      container.createEl("p", {
        cls: "cc-empty",
        text: "No contributor metadata in this file.",
      });
    }
  }

  private inferRole(authorId?: string): "agent" | "owner" {
    if (!authorId) return "owner";
    return this.agentIds.has(authorId) ? "agent" : "owner";
  }

  private renderContributorCard(
    container: HTMLElement,
    info: {
      name: string;
      id?: string;
      role: string;
      lastModified?: string;
      source: "frontmatter" | "git";
    }
  ): void {
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
        text: `Last modified: ${formatDate(info.lastModified)}`,
      });
    }
    if (info.source === "git") {
      infoEl.createEl("p", {
        cls: "cc-contributor-meta cc-source-git",
        text: "via git history",
      });
    }
  }
}
