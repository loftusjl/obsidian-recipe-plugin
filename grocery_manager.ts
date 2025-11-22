import { App, TFile, normalizePath } from 'obsidian';
import { Ingredient } from './spoonacular';

export class GroceryListManager {
	app: App;
	filePath: string;

	constructor(app: App, filePath: string) {
		this.app = app;
		this.filePath = filePath;
	}

	async addIngredients(ingredients: Ingredient[], recipeName: string) {
		const file = await this.getOrCreateGroceryList();
		let content = await this.app.vault.read(file);

		// Create a map of Aisle -> Ingredients
		const aisleMap = new Map<string, string[]>();

		// Parse existing list to preserve structure if possible, 
		// but for now, let's just append or insert into sections.
		// A simple approach: 
		// 1. Read existing file.
		// 2. Find existing headers for aisles.
		// 3. Append new items.

		// Actually, the user wants "create a new or append a grocery list note".
		// And "categorized by grocery aisle".
		// And "adding a callout for what recipe the ingredient is for".

		// Strategy:
		// Append a new section for the Recipe? 
		// OR
		// Group by Aisle, and tag the ingredient with the recipe?
		// User said: "categorized by grocery aisle... adding a callout for what recipe the ingredient is for would be good as well"
		// This implies the structure might be:
		// # Grocery List
		// > [!INFO] Recipe: Chicken Thighs
		// > - [ ] Chicken Thighs (Meat)
		// > - [ ] Olive Oil (Pantry)

		// OR
		// ## Meat
		// - [ ] Chicken Thighs (Recipe: Chicken Thighs)

		// The user said "categorized by grocery aisle". Usually this means headers are Aisles.
		// If headers are Aisles, the callout for recipe is tricky.
		// Maybe the callout is at the top of the addition?

		// Let's go with:
		// Add a Callout block for the Recipe, but inside that block, categorize by aisle?
		// No, that defeats the purpose of a master grocery list sorted by aisle.

		// Standard Grocery List app behavior:
		// ## Produce
		// - [ ] Carrots (Chicken Soup)
		// - [ ] Onions (Steak)

		// Let's try to parse the existing file and inject items under Aisle headers.
		// And append the recipe name to the item.

		const lines = content.split('\n');
		const newLines = [...lines];

		// Group new ingredients by aisle
		const newIngredientsByAisle = new Map<string, string[]>();
		ingredients.forEach(ing => {
			const aisle = ing.aisle || 'Uncategorized';
			if (!newIngredientsByAisle.has(aisle)) {
				newIngredientsByAisle.set(aisle, []);
			}
			newIngredientsByAisle.get(aisle)?.push(`- [ ] ${ing.original} (*${recipeName}*)`);
		});

		// For each aisle, find the header in the file and append items.
		// If header doesn't exist, append it to the end.

		for (const [aisle, items] of newIngredientsByAisle) {
			const headerRegex = new RegExp(`^#+\\s*${escapeRegExp(aisle)}`, 'i');
			const headerIndex = newLines.findIndex(line => line.match(headerRegex));

			if (headerIndex !== -1) {
				// Found header, append after it (and after any existing list items)
				// Find the end of this section (next header or end of file)
				let insertIndex = headerIndex + 1;
				while (insertIndex < newLines.length && !newLines[insertIndex].match(/^#+\s/)) {
					insertIndex++;
				}
				// Insert before the next section
				newLines.splice(insertIndex, 0, ...items);
			} else {
				// Header not found, append to end
				newLines.push(`\n## ${aisle}`);
				newLines.push(...items);
			}
		}

		// Add a log/callout at the bottom or top?
		// User said "adding a callout for what recipe the ingredient is for would be good as well".
		// Maybe just a log entry?
		// "Added ingredients for [[Recipe Name]]"

		const updatedContent = newLines.join('\n');
		await this.app.vault.modify(file, updatedContent);
	}

	async getOrCreateGroceryList(): Promise<TFile> {
		const path = normalizePath(this.filePath || 'Grocery List.md');
		let file = this.app.vault.getAbstractFileByPath(path);

		if (!file) {
			file = await this.app.vault.create(path, '# Grocery List\n');
		}

		if (file instanceof TFile) {
			return file;
		}

		throw new Error(`File at ${path} is not a markdown file.`);
	}
}

function escapeRegExp(string: string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
