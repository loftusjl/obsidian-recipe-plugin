import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, normalizePath, requestUrl, TFile } from 'obsidian';
import { SpoonacularService } from './spoonacular';
import { GroceryListManager } from './grocery_manager';
import { RecipeScraper, ScrapedRecipe } from './scraper';
import { RecipeScraperModal } from './scraper_modal';
import { IngredientModal } from './ingredient_modal';
import { ManualGroceryModal } from './grocery_manual_modal';
import { ManualRecipeModal } from './manual_recipe_modal';
import { EditRecipeModal } from './edit_recipe_modal';
import { NutritionModal } from './nutrition_modal';
import { CookNowManager } from './cook_now_manager';
import { CookingNoteModal } from './cooking_note_modal';

interface RecipePluginSettings {
	groceryListPath: string;
	recipeInboxPath: string;
	spoonacularApiKey: string;
	usdaApiKey: string;
	cookingNotesPath: string;
	debugMode: boolean;
}

const DEFAULT_SETTINGS: RecipePluginSettings = {
	groceryListPath: '',
	recipeInboxPath: 'Recipe Inbox',
	spoonacularApiKey: '',
	usdaApiKey: '',
	cookingNotesPath: 'Cooking Now',
	debugMode: false
}

/**
 * The main plugin class for the Obsidian Recipe Plugin.
 * Handles plugin initialization, settings, and commands.
 */
export default class RecipePlugin extends Plugin {
	settings: RecipePluginSettings;
	spoonacularService: SpoonacularService;
	groceryListManager: GroceryListManager;
	recipeScraper: RecipeScraper;
	cookNowManager: CookNowManager;

	/**
	 * Called when the plugin is loaded.
	 * Initializes services, loads settings, and registers commands.
	 */
	async onload() {
		await this.loadSettings();

		this.spoonacularService = new SpoonacularService(this.settings.spoonacularApiKey, this.settings.debugMode);
		this.groceryListManager = new GroceryListManager(this.app, this.settings.groceryListPath);
		this.recipeScraper = new RecipeScraper();
		this.cookNowManager = new CookNowManager(this.app, this.settings.cookingNotesPath);

		// Command: Add ingredients from current note
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

		// Command: Add manual item
		this.addCommand({
			id: 'add-manual-item-to-grocery-list',
			name: 'Add manual item to Grocery List',
			callback: () => {
				new ManualGroceryModal(this.app, this).open();
			}
		});

		// Command: Create Manual Recipe
		this.addCommand({
			id: 'create-manual-recipe',
			name: 'Create Manual Recipe',
			callback: () => {
				new ManualRecipeModal(this.app, this).open();
			}
		});

		// Command: Scrape Recipe
		this.addCommand({
			id: 'scrape-recipe',
			name: 'Scrape Recipe from URL',
			callback: () => {
				new RecipeScraperModal(this.app, this).open();
			}
		});

		// Command: Edit/Fill Recipe
		this.addCommand({
			id: 'edit-recipe',
			name: 'Edit/Fill Recipe',
			checkCallback: (checking: boolean) => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView && markdownView.file) {
					if (!checking) {
						new EditRecipeModal(this.app, this, markdownView.file).open();
					}
					return true;
				}
			}
		});

		// Command: Calculate Nutrition Facts
		this.addCommand({
			id: 'calculate-nutrition',
			name: 'Calculate Nutrition Facts',
			checkCallback: (checking: boolean) => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView && markdownView.file) {
					if (!checking) {
						new NutritionModal(this.app, this, markdownView.file).open();
					}
					return true;
				}
			}
		});

		// Command: Cook this Recipe
		this.addCommand({
			id: 'cook-this-recipe',
			name: 'Cook this Recipe',
			checkCallback: (checking: boolean) => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView && markdownView.file) {
					if (!checking) {
						this.cookNowManager.createCookingNote(markdownView.file)
							.then(newFile => {
								new Notice('Cooking note created!');
								// Open the new note
								this.app.workspace.getLeaf().openFile(newFile);
							})
							.catch(error => {
								new Notice('Failed to create cooking note. Is this a recipe?');
								console.error(error);
							});
					}
					return true;
				}
			}
		});

		// Command: Clear Cooking Notes
		this.addCommand({
			id: 'clear-cooking-notes',
			name: 'Clear Cooking Notes',
			callback: async () => {
				const count = await this.cookNowManager.clearCookingNotes();
				if (count > 0) {
					new Notice(`Cleared ${count} cooking note(s)`);
				} else {
					new Notice('No cooking notes to clear');
				}
			}
		});

		// Command: Add Cooking Note
		this.addCommand({
			id: 'add-cooking-note',
			name: 'Add Cooking Note',
			checkCallback: (checking: boolean) => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView && markdownView.file) {
					if (!checking) {
						new CookingNoteModal(this.app, async (noteText) => {
							const content = await this.app.vault.read(markdownView.file);

							if (this.cookNowManager.isTempCookingNote(content)) {
								// In cooking note - find source recipe
								const sourceRecipe = await this.cookNowManager.findSourceRecipe(markdownView.file);
								if (sourceRecipe) {
									await this.cookNowManager.syncNoteToFiles(sourceRecipe, markdownView.file, noteText);
									new Notice('Cooking note added and synced!');
								} else {
									new Notice('Could not find source recipe');
								}
							} else if (this.cookNowManager.isRecipe(content)) {
								// In recipe - add to recipe, find cooking note if exists
								const cookingNotePath = normalizePath(
									`${this.settings.cookingNotesPath}/${markdownView.file.basename} - Cooking.md`
								);
								const cookingNote = this.app.vault.getAbstractFileByPath(cookingNotePath);
								await this.cookNowManager.syncNoteToFiles(
									markdownView.file,
									cookingNote instanceof TFile ? cookingNote : null,
									noteText
								);
								new Notice('Cooking note added!');
							} else {
								new Notice('This note is not a recipe or cooking note');
							}
						}).open();
					}
					return true;
				}
			}
		});

		this.addSettingTab(new RecipeSettingTab(this.app, this));
	}

	/**
	 * Called when the plugin is unloaded.
	 */
	onunload() {

	}

	/**
	 * Loads plugin settings from disk.
	 */
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Update services when settings load
		if (this.spoonacularService) {
			this.spoonacularService.apiKey = this.settings.spoonacularApiKey;
			this.spoonacularService.debugMode = this.settings.debugMode;
		}
		if (this.groceryListManager) this.groceryListManager.filePath = this.settings.groceryListPath;
	}

	/**
	 * Saves plugin settings to disk.
	 */
	async saveSettings() {
		await this.saveData(this.settings);
		// Update services when settings save
		if (this.spoonacularService) {
			this.spoonacularService.apiKey = this.settings.spoonacularApiKey;
			this.spoonacularService.debugMode = this.settings.debugMode;
		}
		if (this.groceryListManager) this.groceryListManager.filePath = this.settings.groceryListPath;
	}

	/**
	 * Parses ingredients from a recipe note and opens the selection modal.
	 * @param file - The recipe note file to parse.
	 */
	async parseAndShowIngredients(file: TFile) {
		const content = await this.app.vault.read(file);
		const ingredients = this.parseIngredients(content);

		if (ingredients.length === 0) {
			new Notice('No ingredients found in this note. Make sure they are listed under an "Ingredients" header.');
			return;
		}

		new IngredientModal(this.app, this, file.basename, ingredients).open();
	}

	/**
	 * Parses ingredient lines from the note content.
	 * Looks for lines starting with '-' or '*' under an "Ingredients" header.
	 * @param content - The note content.
	 * @returns An array of ingredient strings.
	 */
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

	/**
	 * Scrapes a recipe from a URL and saves it as a new note.
	 * @param url - The URL of the recipe.
	 */
	async scrapeAndSaveRecipe(url: string) {
		try {
			new Notice(`Scraping recipe from ${url}...`);
			const recipe = await this.recipeScraper.scrapeRecipe(url);

			if (!recipe) {
				new Notice('Failed to scrape recipe.');
				return;
			}

			await this.saveRecipe(recipe);

		} catch (error) {
			console.error('Error scraping recipe:', error);
			new Notice('Error scraping recipe. Check console.');
		}
	}

	/**
	 * Saves a recipe object as a new note.
	 * @param recipe - The recipe data.
	 */
	async saveRecipe(recipe: ScrapedRecipe) {
		try {
			const sanitizedTitle = recipe.title.replace(/[\\/:*?"<>|]/g, '').trim();
			const inboxPath = this.settings.recipeInboxPath || 'Recipe Inbox';
			const recipeFolder = normalizePath(`${inboxPath}/${sanitizedTitle}`);

			// Create folder
			if (!this.app.vault.getAbstractFileByPath(recipeFolder)) {
				await this.app.vault.createFolder(recipeFolder);
			}

			let imagePath = '';
			// Download image or save provided buffer
			if (recipe.image || recipe.imageData) {
				try {
					let buffer: ArrayBuffer | null = null;
					let extension = 'jpg';

					if (recipe.imageData) {
						buffer = recipe.imageData;
						extension = 'png';
					} else if (recipe.image && recipe.image.startsWith('http')) {
						const imageResponse = await requestUrl({ url: recipe.image });
						buffer = imageResponse.arrayBuffer;
						extension = recipe.image.split('.').pop()?.split('?')[0] || 'jpg';
					}

					let imageFile: TFile | null = null;
					if (buffer) {
						const imageName = `${sanitizedTitle}.${extension}`;
						const imageFilePath = normalizePath(`${recipeFolder}/${imageName}`);

						// Check if image already exists
						const existingFile = this.app.vault.getAbstractFileByPath(imageFilePath);
						if (existingFile instanceof TFile) {
							imageFile = existingFile;
						} else {
							imageFile = await this.app.vault.createBinary(imageFilePath, buffer);
						}
					}

					if (imageFile) {
						imagePath = this.app.fileManager.generateMarkdownLink(imageFile, recipeFolder);
					}
				} catch (e) {
					console.error('Failed to save image', e);
					new Notice('Failed to save image.');
				}
			}

			// Create Note
			const tags = ['recipe'];
			if (recipe.cuisine) tags.push(...recipe.cuisine.map(c => c.toLowerCase().replace(/\s+/g, '-')));
			if (recipe.category) tags.push(...recipe.category.map(c => c.toLowerCase().replace(/\s+/g, '-')));

			const frontmatter = [
				'---',
				'recipe-plugin: true',
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

			// Build quick links
			const quickLinks = [];
			if (recipe.video) quickLinks.push('[Video](#video)');
			const quickLinksLine = quickLinks.length > 0
				? `\n> **Quick Links**: ${quickLinks.join(' | ')}\n`
				: '';

			const content = [
				frontmatter,
				'',
				`# ${recipe.title}`,
				'',
				recipe.description ? `> [!info] Description\n> ${recipe.description.replace(/\n/g, '\n> ')}${quickLinksLine}` : '',
				imagePath ? `!${imagePath}` : '',
				'',
				'## Ingredients',
				...recipe.ingredients.map(i => `- ${i}`),
				'',
				'## Instructions',
				...recipe.instructions.map((step, index) => `${index + 1}. ${step}`),
				'',
				recipe.video ? '## Video\n\n' + recipe.video + '\n' : '',
				nutritionSection
			].join('\n');

			const notePath = normalizePath(`${recipeFolder}/${sanitizedTitle}.md`);
			let file = this.app.vault.getAbstractFileByPath(notePath);

			if (file instanceof TFile) {
				new Notice(`Recipe already exists: ${sanitizedTitle}`);
			} else {
				file = await this.app.vault.create(notePath, content);
				new Notice(`Recipe saved: ${sanitizedTitle}`);
			}

			if (file instanceof TFile) {
				this.app.workspace.getLeaf(true).openFile(file);
			}
		} catch (error) {
			console.error('Error saving recipe:', error);
			new Notice('Error saving recipe. Check console.');
			throw error;
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
			.setName('Cooking Notes Folder')
			.setDesc('Folder for temporary "Cook this Recipe" notes (cannot be root vault)')
			.addText(text => text
				.setPlaceholder('Cooking Now')
				.setValue(this.plugin.settings.cookingNotesPath)
				.onChange(async (value) => {
					// Validate path
					if (!value || value.trim() === '' || value === '/' || value === '.' || value === '..') {
						new Notice('Invalid folder path. Cannot use root vault or empty path.');
						return;
					}
					this.plugin.settings.cookingNotesPath = value;
					this.plugin.cookNowManager.cookingNotesPath = value; // Update manager
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('USDA API Key')
			.setDesc(createFragment((frag) => {
				frag.appendText('Optional API key for nutrition data from USDA FoodData Central. ');
				frag.createEl('br');
				frag.appendText('Get a free key at ');
				frag.createEl('a', {
					text: 'api.data.gov/signup',
					href: 'https://api.data.gov/signup'
				});
				frag.appendText('. If not provided, only Open Food Facts will be used.');
			}))
			.addText(text => text
				.setPlaceholder('Enter USDA API Key (optional)')
				.setValue(this.plugin.settings.usdaApiKey)
				.onChange(async (value) => {
					this.plugin.settings.usdaApiKey = value;
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
