import { App, Modal, Notice } from 'obsidian';
import RecipePlugin from './main';

export class IngredientModal extends Modal {
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
