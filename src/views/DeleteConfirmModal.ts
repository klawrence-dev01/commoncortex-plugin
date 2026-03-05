import { App, Modal } from "obsidian";

/**
 * A simple yes/no confirmation modal for deleting a file from the shared repo.
 */
export class DeleteConfirmModal extends Modal {
  private fileName: string;
  private onConfirm: () => void;
  private onCancel: () => void;

  constructor(app: App, fileName: string, onConfirm: () => void, onCancel: () => void) {
    super(app);
    this.fileName = fileName;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("cc-delete-modal");

    contentEl.createEl("h2", { text: "Delete from shared repo?" });
    contentEl.createEl("p", {
      text: `"${this.fileName}" was deleted locally. Remove it from the shared GitHub repo for everyone?`,
    });

    const buttons = contentEl.createDiv({ cls: "cc-delete-modal-buttons" });

    const deleteBtn = buttons.createEl("button", {
      text: "Delete for everyone",
      cls: "mod-warning",
    });
    deleteBtn.addEventListener("click", () => {
      this.close();
      this.onConfirm();
    });

    const cancelBtn = buttons.createEl("button", { text: "Keep in repo" });
    cancelBtn.addEventListener("click", () => {
      this.close();
      this.onCancel();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
