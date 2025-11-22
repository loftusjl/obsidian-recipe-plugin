
import { App, Modal, Setting, Notice } from 'obsidian';
import RecipePlugin from './main';

/**
 * Modal for entering a recipe URL to scrape.
 */
export class RecipeScraperModal extends Modal {
	plugin: RecipePlugin;

	/**
	 * Creates a new RecipeScraperModal.
	 * @param app - The Obsidian App instance.
	 * @param plugin - The plugin instance.
	 */
	constructor(app: App, plugin: RecipePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Scrape Recipe from URL' });

		const input = contentEl.createEl('input', {
			type: 'text',
			placeholder: 'https://www.allrecipes.com/recipe/...',
			attr: { style: 'width: 100%; margin-bottom: 10px;' }
		});

		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
		const scrapeButton = buttonContainer.createEl('button', { text: 'Scrape', cls: 'mod-cta' });

		scrapeButton.onclick = async () => {
			const url = input.value.trim();
			if (!url) {
				new Notice('Please enter a URL.');
				return;
			}

			this.close();
			await this.plugin.scrapeAndSaveRecipe(url);
		};

		// Allow pressing Enter to submit
		input.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				scrapeButton.click();
			}
		});

		input.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
