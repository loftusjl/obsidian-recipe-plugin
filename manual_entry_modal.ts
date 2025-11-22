import { App, Modal, Notice } from 'obsidian';
import RecipePlugin from './main';

/**
 * Modal for manually adding ingredients to the grocery list.
 */
export class ManualEntryModal extends Modal {
	plugin: RecipePlugin;

	/**
	 * Creates a new ManualEntryModal.
	 * @param app - The Obsidian App instance.
	 * @param plugin - The plugin instance.
	 */
	constructor(app: App, plugin: RecipePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Add Manual Items' });

		contentEl.createEl('p', { text: "Enter ingredients, one per line (e.g., '1 lb green beans')." });

		const textarea = contentEl.createEl('textarea', {
			cls: 'manual-entry-textarea',
			attr: { rows: '10', style: 'width: 100%;' }
		});

		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container', attr: { style: 'margin-top: 10px;' } });
		const addButton = buttonContainer.createEl('button', { text: 'Add to Grocery List', cls: 'mod-cta' });

		addButton.onclick = async () => {
			const text = textarea.value.trim();
			if (!text) {
				this.close();
				return;
			}

			const ingredients = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

			addButton.setAttr('disabled', 'true');
			addButton.setText('Processing...');

			try {
				new Notice(`Categorizing ${ingredients.length} ingredients...`);
				const categorized = await this.plugin.spoonacularService.categorizeIngredients(ingredients);

				new Notice('Adding to grocery list...');
				await this.plugin.groceryListManager.addIngredients(categorized, 'Manual Entry');

				new Notice('Grocery list updated!');
				this.close();
			} catch (error) {
				console.error(error);
				new Notice('Error updating grocery list. Check console.');
				addButton.removeAttribute('disabled');
				addButton.setText('Add to Grocery List');
			}
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
