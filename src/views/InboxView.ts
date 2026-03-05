import { ItemView, WorkspaceLeaf, TFile, Notice } from "obsidian";
import { getFileMeta, formatDate } from "../utils/frontmatter";
import { gitAdd, gitCommit, gitPush } from "../utils/git";

export const INBOX_VIEW_TYPE = "cc-inbox-view";
const INBOX_FOLDER = "CommonCortex/_inbox";

interface Proposal {
  file: TFile;
  proposedBy: string;
  authorId: string;
  intendedPath: string;
  note: string;
  created: string;
}

export class InboxView extends ItemView {
  private vaultRoot: string;
  private ownerName: string;
  private ownerEmail: string;

  constructor(
    leaf: WorkspaceLeaf,
    vaultRoot: string,
    ownerName: string,
    ownerEmail: string
  ) {
    super(leaf);
    this.vaultRoot = vaultRoot;
    this.ownerName = ownerName;
    this.ownerEmail = ownerEmail;
  }

  getViewType(): string {
    return INBOX_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Agent Inbox";
  }

  getIcon(): string {
    return "inbox";
  }

  async onOpen(): Promise<void> {
    await this.refresh();

    // Re-render when vault changes
    this.registerEvent(
      this.app.vault.on("create", () => this.refresh())
    );
    this.registerEvent(
      this.app.vault.on("delete", () => this.refresh())
    );
  }

  async refresh(): Promise<void> {
    const proposals = await this.loadProposals();
    this.renderProposals(proposals);
  }

  private async loadProposals(): Promise<Proposal[]> {
    const folder = this.app.vault.getAbstractFileByPath(INBOX_FOLDER);
    if (!folder) return [];

    const files = this.app.vault
      .getMarkdownFiles()
      .filter(f => f.path.startsWith(INBOX_FOLDER + "/"));

    const proposals: Proposal[] = [];
    for (const file of files) {
      const meta = getFileMeta(this.app, file);
      if (!meta.proposal) continue;
      proposals.push({
        file,
        proposedBy: meta.proposed_by ?? "Unknown",
        authorId: meta.author_id ?? "",
        intendedPath: meta.intended_path ?? file.basename,
        note: meta.note ?? "",
        created: meta.created ?? "",
      });
    }

    return proposals.sort((a, b) => b.created.localeCompare(a.created));
  }

  private renderProposals(proposals: Proposal[]): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("cc-inbox-view");

    const header = container.createDiv({ cls: "cc-inbox-header" });
    header.createEl("h4", { text: `Inbox (${proposals.length})` });

    const refreshBtn = header.createEl("button", { text: "↺" });
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

  private renderProposalCard(container: HTMLElement, proposal: Proposal): void {
    const card = container.createDiv({ cls: "cc-proposal-card" });

    const headerRow = card.createDiv({ cls: "cc-proposal-header" });
    headerRow.createEl("span", { cls: "cc-proposal-by", text: proposal.proposedBy });
    headerRow.createEl("span", { cls: "cc-proposal-date", text: formatDate(proposal.created) });

    card.createEl("div", { cls: "cc-proposal-path", text: `→ ${proposal.intendedPath}` });

    if (proposal.note) {
      card.createEl("div", { cls: "cc-proposal-note", text: `"${proposal.note}"` });
    }

    const actions = card.createDiv({ cls: "cc-proposal-actions" });

    const approveBtn = actions.createEl("button", { cls: "cc-btn cc-btn-approve", text: "✓ Approve" });
    approveBtn.onclick = () => this.approve(proposal);

    const rejectBtn = actions.createEl("button", { cls: "cc-btn cc-btn-reject", text: "✕ Reject" });
    rejectBtn.onclick = () => this.reject(proposal);
  }

  private async approve(proposal: Proposal): Promise<void> {
    try {
      const content = await this.app.vault.read(proposal.file);

      // Move file to intended path, creating parent dirs via Obsidian vault API
      const existingDest = this.app.vault.getAbstractFileByPath(proposal.intendedPath);
      if (existingDest instanceof TFile) {
        await this.app.vault.delete(existingDest);
      }

      await this.app.vault.rename(proposal.file, proposal.intendedPath);

      // Git: commit the approval
      await gitAdd(this.vaultRoot, "-A");
      await gitCommit(
        this.vaultRoot,
        `approve: ${proposal.proposedBy} → ${proposal.intendedPath}`,
        this.ownerName,
        this.ownerEmail
      );
      await gitPush(this.vaultRoot);

      new Notice(`✅ Approved and moved to ${proposal.intendedPath}`);
      await this.refresh();
    } catch (e) {
      new Notice(`❌ Approve failed: ${(e as Error).message}`);
    }
  }

  private async reject(proposal: Proposal): Promise<void> {
    try {
      await this.app.vault.delete(proposal.file);

      await gitAdd(this.vaultRoot, "-A");
      await gitCommit(
        this.vaultRoot,
        `reject: ${proposal.proposedBy} → ${proposal.intendedPath}`,
        this.ownerName,
        this.ownerEmail
      );
      await gitPush(this.vaultRoot);

      new Notice(`🗑 Rejected proposal from ${proposal.proposedBy}`);
      await this.refresh();
    } catch (e) {
      new Notice(`❌ Reject failed: ${(e as Error).message}`);
    }
  }
}
