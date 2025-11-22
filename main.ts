import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { SpoonacularService } from './spoonacular';
import { GroceryListManager } from './grocery_manager';

// Remember to rename these classes and interfaces!

interface RecipePluginSettings {
	groceryListPath: string;
	spoonacularApiKey: string;
	debugMode: boolean;
}

const DEFAULT_SETTINGS: RecipePluginSettings = {
	groceryListPath: '',
	spoonacularApiKey: '',
	debugMode: false
}

export default class RecipePlugin extends Plugin {
	settings: RecipePluginSettings;
	spoonacularService: SpoonacularService;
	groceryListManager: GroceryListManager;

	async onload() {
		await this.loadSettings();

		this.spoonacularService = new SpoonacularService(this.settings.spoonacularApiKey, this.settings.debugMode);
		this.groceryListManager = new GroceryListManager(this.app, this.settings.groceryListPath);

		this.addCommand({
			id: 'add-ingredients-to-grocery-list',
			name: 'Add ingredients to Grocery List',
			checkCallback: (checking: boolean) => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					if (!checking) {
						this.parseAndShowIngredients(markdownView.file);
					}
					return true;
				}
			}
		});

		this.addCommand({
			id: 'add-manual-grocery-item',
			name: 'Add manual item to Grocery List',
			callback: () => {
				new ManualEntryModal(this.app, this).open();
			}
		});

		this.addSettingTab(new RecipeSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Update services when settings load
		if (this.spoonacularService) {
			this.spoonacularService.apiKey = this.settings.spoonacularApiKey;
			this.spoonacularService.debugMode = this.settings.debugMode;
		}
		if (this.groceryListManager) this.groceryListManager.filePath = this.settings.groceryListPath;
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update services when settings save
		if (this.spoonacularService) {
			this.spoonacularService.apiKey = this.settings.spoonacularApiKey;
			this.spoonacularService.debugMode = this.settings.debugMode;
		}
		if (this.groceryListManager) this.groceryListManager.filePath = this.settings.groceryListPath;
	}

	async parseAndShowIngredients(file: TFile | null) {
		if (!file) return;
		const content = await this.app.vault.read(file);
		const ingredients = this.parseIngredients(content);

		if (ingredients.length === 0) {
			new Notice('No ingredients found in this note.');
			return;
		}

		new IngredientModal(this.app, this, file.basename, ingredients).open();
	}

	parseIngredients(content: string): string[] {
		const lines = content.split('\n');
		const ingredients: string[] = [];
		let capturing = false;

		// Simple state machine to find "Ingredients" section
		for (const line of lines) {
			const trimmed = line.trim();

			// Start capturing after "Ingredients" header or block
			if (trimmed.match(/^#*\s*Ingredients/i) || trimmed.match(/^Ingredients:/i)) {
				capturing = true;
				continue;
			}

			// Stop capturing at next header or empty line (if we want to be strict, but recipes often have empty lines)
			// For now, let's stop at the next Header
			if (capturing && trimmed.match(/^#+\s/)) {
				capturing = false;
			}

			if (capturing) {
				// Look for list items
				const listMatch = trimmed.match(/^[-*]\s+(.*)/);
				if (listMatch) {
					ingredients.push(listMatch[1].trim());
				}
			}
		}

		return ingredients;
	}
}

class IngredientModal extends Modal {
	plugin: RecipePlugin;
	recipeName: string;
	ingredients: string[];
	selectedIngredients: Set<string>;

	constructor(app: App, plugin: RecipePlugin, recipeName: string, ingredients: string[]) {
		super(app);
		this.plugin = plugin;
		this.recipeName = recipeName;
		this.ingredients = ingredients;
		this.selectedIngredients = new Set(ingredients); // Default all selected
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: `Add Ingredients from ${this.recipeName}` });

		const listContainer = contentEl.createDiv({ cls: 'ingredient-list-container' });

		this.ingredients.forEach(ingredient => {
			const itemDiv = listContainer.createDiv({ cls: 'ingredient-item' });

			const checkbox = itemDiv.createEl('input', { type: 'checkbox' });
			checkbox.checked = true;
			checkbox.onchange = () => {
				if (checkbox.checked) {
					this.selectedIngredients.add(ingredient);
				} else {
					this.selectedIngredients.delete(ingredient);
				}
			};

			itemDiv.createSpan({ text: ingredient });
		});

		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
		const addButton = buttonContainer.createEl('button', { text: 'Add to Grocery List', cls: 'mod-cta' });

		addButton.onclick = async () => {
			addButton.setAttr('disabled', 'true');
			addButton.setText('Processing...');
			await this.addToGroceryList();
			this.close();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	async addToGroceryList() {
		if (this.selectedIngredients.size === 0) {
			new Notice('No ingredients selected.');
			return;
		}

		try {
			const ingredientsList = Array.from(this.selectedIngredients);
			new Notice(`Categorizing ${ingredientsList.length} ingredients...`);

			const categorized = await this.plugin.spoonacularService.categorizeIngredients(ingredientsList);

			new Notice('Adding to grocery list...');
			await this.plugin.groceryListManager.addIngredients(categorized, this.recipeName);

			new Notice('Grocery list updated!');
		} catch (error) {
			console.error(error);
			new Notice('Error updating grocery list. Check console.');
		}
	}
}

class ManualEntryModal extends Modal {
	plugin: RecipePlugin;

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

class RecipeSettingTab extends PluginSettingTab {
	plugin: RecipePlugin;

	constructor(app: App, plugin: RecipePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Recipe Plugin Settings' });

		new Setting(containerEl)
			.setName('Grocery List Path')
			.setDesc('Path to the grocery list file (e.g., "Grocery List.md" or "Folder/List.md"). Defaults to vault root.')
			.addText(text => text
				.setPlaceholder('Grocery List.md')
				.setValue(this.plugin.settings.groceryListPath)
				.onChange(async (value) => {
					this.plugin.settings.groceryListPath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Spoonacular API Key')
			.setDesc('API Key for ingredient categorization. Get one at https://spoonacular.com/food-api')
			.addText(text => text
				.setPlaceholder('API Key')
				.setValue(this.plugin.settings.spoonacularApiKey)
				.onChange(async (value) => {
					this.plugin.settings.spoonacularApiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Debug Mode')
			.setDesc('Enable verbose logging to the developer console (Ctrl+Shift+I).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debugMode)
				.onChange(async (value) => {
					this.plugin.settings.debugMode = value;
					await this.plugin.saveSettings();
				}));
	}
}
