import { App, Modal, Notice, Setting } from 'obsidian';
import RecipePlugin from './main';
import { ScrapedRecipe } from './scraper';

export class ManualRecipeModal extends Modal {
	plugin: RecipePlugin;
	title: string = '';
	url: string = '';
	description: string = '';
	ingredients: string = '';
	instructions: string = '';
	nutrition: string = '';

	constructor(app: App, plugin: RecipePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Create Manual Recipe' });

		new Setting(contentEl)
			.setName('Title')
			.addText(text => text
				.setPlaceholder('Recipe Title')
				.onChange(value => this.title = value));

		new Setting(contentEl)
			.setName('URL')
			.setDesc('Optional source URL')
			.addText(text => text
				.setPlaceholder('https://example.com')
				.onChange(value => this.url = value));

		new Setting(contentEl)
			.setName('Description')
			.addTextArea(text => text
				.setPlaceholder('Brief description...')
				.onChange(value => this.description = value));

		new Setting(contentEl)
			.setName('Ingredients')
			.setDesc('One per line')
			.addTextArea(text => text
				.setPlaceholder('1 cup flour\n2 eggs')
				.onChange(value => this.ingredients = value));

		new Setting(contentEl)
			.setName('Instructions')
			.setDesc('One step per line')
			.addTextArea(text => text
				.setPlaceholder('Mix ingredients.\nBake at 350F.')
				.onChange(value => this.instructions = value));

		new Setting(contentEl)
			.setName('Nutrition')
			.setDesc('Key: Value (one per line)')
			.addTextArea(text => text
				.setPlaceholder('Calories: 500\nProtein: 20g')
				.onChange(value => this.nutrition = value));

		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container', attr: { style: 'margin-top: 20px;' } });
		const createButton = buttonContainer.createEl('button', { text: 'Create Recipe', cls: 'mod-cta' });

		createButton.onclick = async () => {
			if (!this.title) {
				new Notice('Title is required.');
				return;
			}

			createButton.setAttr('disabled', 'true');
			createButton.setText('Creating...');

			try {
				const ingredientsList = this.ingredients.split('\n').map(l => l.trim()).filter(l => l.length > 0)
					.map(i => this.plugin.recipeScraper.formatIngredient(i));

				const instructionsList = this.instructions.split('\n').map(l => l.trim()).filter(l => l.length > 0);

				const nutritionObj: Record<string, string> = {};
				this.nutrition.split('\n').forEach(line => {
					const [key, value] = line.split(':').map(s => s.trim());
					if (key && value) nutritionObj[key] = value;
				});

				// Construct recipe object
				const recipe: ScrapedRecipe = {
					title: this.title,
					url: this.url || '',
					description: this.description,
					ingredients: ingredientsList,
					instructions: instructionsList,
					nutrition: Object.keys(nutritionObj).length > 0 ? nutritionObj : undefined,
					// Default values for others
					cuisine: [],
					category: [],
					image: undefined,
					prepTime: undefined,
					cookTime: undefined,
					totalTime: undefined,
					recipeYield: undefined,
					calories: nutritionObj['Calories']
				};

				await this.plugin.saveRecipe(recipe);

				this.close();
			} catch (error) {
				console.error(error);
				new Notice('Error creating recipe.');
				createButton.removeAttribute('disabled');
				createButton.setText('Create Recipe');
			}
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
