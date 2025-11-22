import { App, Modal, Setting, Notice } from 'obsidian';
import RecipePlugin from './main';

export class RecipeScraperModal extends Modal {
	plugin: RecipePlugin;
	url: string;

	constructor(app: App, plugin: RecipePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Scrape Recipe' });

		new Setting(contentEl)
			.setName('Recipe URL')
			.setDesc('Enter the URL of the recipe to scrape.')
			.addText(text => text
				.setPlaceholder('https://example.com/recipe')
				.setValue('')
				.onChange(value => {
					this.url = value;
				}));

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Scrape')
				.setCta()
				.onClick(async () => {
					if (!this.url) {
						new Notice('Please enter a URL.');
						return;
					}
					this.close();
					await this.plugin.scrapeAndSaveRecipe(this.url);
				}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
