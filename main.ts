import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, normalizePath, requestUrl, TFile } from 'obsidian';
import { SpoonacularService } from './spoonacular';
import { GroceryListManager } from './grocery_manager';
import { RecipeScraper } from './scraper';
import { RecipeScraperModal } from './scraper_modal';
import { IngredientModal } from './ingredient_modal';
import { ManualEntryModal } from './manual_entry_modal';

interface RecipePluginSettings {
	groceryListPath: string;
	recipeInboxPath: string;
	spoonacularApiKey: string;
	debugMode: boolean;
}

const DEFAULT_SETTINGS: RecipePluginSettings = {
	groceryListPath: '',
	recipeInboxPath: 'Recipe Inbox',
	spoonacularApiKey: '',
	debugMode: false
}

export default class RecipePlugin extends Plugin {
	settings: RecipePluginSettings;
	spoonacularService: SpoonacularService;
	groceryListManager: GroceryListManager;
	recipeScraper: RecipeScraper;

	async onload() {
		await this.loadSettings();

		this.spoonacularService = new SpoonacularService(this.settings.spoonacularApiKey, this.settings.debugMode);
		this.groceryListManager = new GroceryListManager(this.app, this.settings.groceryListPath);
		this.recipeScraper = new RecipeScraper();

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

		this.addCommand({
			id: 'scrape-recipe',
			name: 'Scrape Recipe from URL',
			callback: () => {
				new RecipeScraperModal(this.app, this).open();
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

	async scrapeAndSaveRecipe(url: string) {
		try {
			new Notice('Scraping recipe...');
			const recipe = await this.recipeScraper.scrapeRecipe(url);

			if (!recipe) {
				new Notice('Failed to scrape recipe.');
				return;
			}

			const sanitizedTitle = recipe.title.replace(/[\\/:*?"<>|]/g, '');
			const inboxPath = this.settings.recipeInboxPath || 'Recipe Inbox';
			const recipeFolder = normalizePath(`${inboxPath}/${sanitizedTitle}`);

			// Create folder
			if (!this.app.vault.getAbstractFileByPath(recipeFolder)) {
				await this.app.vault.createFolder(recipeFolder);
			}

			let imagePath = '';
			// Download image
			if (recipe.image) {
				try {
					const imageResponse = await requestUrl({ url: recipe.image });
					const buffer = imageResponse.arrayBuffer;
					const extension = recipe.image.split('.').pop()?.split('?')[0] || 'jpg';
					const imageName = `${sanitizedTitle}.${extension}`;
					const imageFile = normalizePath(`${recipeFolder}/${imageName}`);

					// Check if image already exists
					if (!this.app.vault.getAbstractFileByPath(imageFile)) {
						await this.app.vault.createBinary(imageFile, buffer);
					}
					imagePath = imageName; // Relative to note if in same folder
				} catch (e) {
					console.error('Failed to download image', e);
					new Notice('Failed to download image.');
				}
			}

			// Create Note
			const tags = ['recipe'];
			if (recipe.cuisine) tags.push(...recipe.cuisine.map(c => c.toLowerCase().replace(/\s+/g, '-')));
			if (recipe.category) tags.push(...recipe.category.map(c => c.toLowerCase().replace(/\s+/g, '-')));

			const frontmatter = [
				'---',
				`url: ${recipe.url}`,
				`tags: [${tags.join(', ')}]`,
				imagePath ? `banner: "${imagePath}"` : '',
				imagePath ? `content-start: 200` : '',
				recipe.prepTime ? `prepTime: ${recipe.prepTime}` : '',
				recipe.cookTime ? `cookTime: ${recipe.cookTime}` : '',
				recipe.totalTime ? `totalTime: ${recipe.totalTime}` : '',
				recipe.recipeYield ? `yield: "${recipe.recipeYield}"` : '',
				recipe.calories ? `calories: ${recipe.calories}` : '',
				'---'
			].filter(line => line).join('\n');

			const nutritionSection = recipe.nutrition
				? [
					'## Nutrition',
					'| Nutrient | Amount |',
					'| :--- | :--- |',
					...Object.entries(recipe.nutrition).map(([key, value]) => `| ${key} | ${value} |`),
					''
				].join('\n')
				: '';

			const content = [
				frontmatter,
				'',
				`# ${recipe.title}`,
				'',
				recipe.description ? `> [!info] Description\n> ${recipe.description.replace(/\n/g, '\n> ')}\n` : '',
				imagePath ? `![[${imagePath}]]` : '',
				'',
				'## Ingredients',
				...recipe.ingredients.map(i => `- ${i}`),
				'',
				'## Instructions',
				...recipe.instructions.map((step, index) => `${index + 1}. ${step}`),
				'',
				nutritionSection
			].join('\n');

			const notePath = normalizePath(`${recipeFolder}/${sanitizedTitle}.md`);
			let file = this.app.vault.getAbstractFileByPath(notePath);

			if (file instanceof TFile) {
				new Notice(`Recipe already exists: ${sanitizedTitle}`);
				// Optional: overwrite or skip. Let's skip for safety.
			} else {
				file = await this.app.vault.create(notePath, content);
				new Notice(`Recipe saved: ${sanitizedTitle}`);
			}

			if (file instanceof TFile) {
				this.app.workspace.getLeaf(true).openFile(file);
			}

		} catch (error) {
			console.error('Error scraping recipe:', error);
			new Notice('Error scraping recipe. Check console.');
		}
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
			.setName('Recipe Inbox Path')
			.setDesc('Folder where new recipes will be saved (e.g., "Recipes" or "Inbox"). Defaults to "Recipe Inbox".')
			.addText(text => text
				.setPlaceholder('Recipe Inbox')
				.setValue(this.plugin.settings.recipeInboxPath)
				.onChange(async (value) => {
					this.plugin.settings.recipeInboxPath = value;
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
