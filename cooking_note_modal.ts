import { App, Modal, Setting } from 'obsidian';

/**
 * Modal for adding a cooking note with timestamp
 * Allows users to add observations and adjustments to recipes
 */
export class CookingNoteModal extends Modal {
	onSubmit: (text: string) => void;
	noteText: string = '';

	/**
	 * Creates a new CookingNoteModal
	 * @param app - The Obsidian App instance
	 * @param onSubmit - Callback function called with note text when submitted
	 */
	constructor(app: App, onSubmit: (text: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	/**
	 * Called when modal is opened
	 * Creates the UI for note input
	 */
	onOpen() {
		const { contentEl } = this;

		contentEl.createEl('h2', { text: 'Add Cooking Note' });

		contentEl.createEl('p', {
			text: 'Add a timestamped note about this recipe. It will be saved to both the recipe and any active cooking note.',
			attr: { style: 'color: var(--text-muted); margin-bottom: 15px;' }
		});

		// Text area for note
		const textAreaContainer = contentEl.createDiv({ attr: { style: 'margin: 20px 0;' } });
		const textArea = textAreaContainer.createEl('textarea', {
			attr: {
				placeholder: 'e.g., "Used brown sugar instead - cookies were chewier!"',
				style: 'width: 100%; min-height: 100px; padding: 10px; font-family: var(--font-text);'
			}
		});

		textArea.addEventListener('input', (e) => {
			this.noteText = (e.target as HTMLTextAreaElement).value;
		});

		// Auto-focus the text area
		textArea.focus();

		// Buttons
		const buttonContainer = contentEl.createDiv({
			attr: { style: 'display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;' }
		});

		// Cancel button
		const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelButton.onclick = () => this.close();

		// Submit button
		const submitButton = buttonContainer.createEl('button', {
			text: 'Add Note',
			cls: 'mod-cta'
		});
		submitButton.onclick = () => {
			if (this.noteText.trim()) {
				this.onSubmit(this.noteText.trim());
				this.close();
			}
		};

		// Submit on Enter (Ctrl/Cmd + Enter)
		textArea.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				if (this.noteText.trim()) {
					this.onSubmit(this.noteText.trim());
					this.close();
				}
			}
		});
	}

	/**
	 * Called when modal is closed
	 * Cleans up the UI
	 */
	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
