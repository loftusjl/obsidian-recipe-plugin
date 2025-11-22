import { App, TFile, normalizePath } from 'obsidian';
import { Ingredient } from './spoonacular';

/**
 * Manages the grocery list file operations.
 */
export class GroceryListManager {
	app: App;
	filePath: string;

	/**
	 * Creates a new GroceryListManager.
	 * @param app - The Obsidian App instance.
	 * @param filePath - The path to the grocery list file.
	 */
	constructor(app: App, filePath: string) {
		this.app = app;
		this.filePath = filePath;
	}

	/**
	 * Adds a list of ingredients to the grocery list file.
	 * Categorizes ingredients by aisle and appends them to the corresponding sections.
	 * @param ingredients - The list of categorized ingredients to add.
	 * @param recipeName - The name of the recipe these ingredients belong to.
	 */
	async addIngredients(ingredients: Ingredient[], recipeName: string) {
		const file = await this.getOrCreateGroceryList();
		let content = await this.app.vault.read(file);

		// Create a map of Aisle -> Ingredients
		const aisleMap = new Map<string, string[]>();

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

		const updatedContent = newLines.join('\n');
		await this.app.vault.modify(file, updatedContent);
	}

	/**
	 * Gets the grocery list file, creating it if it doesn't exist.
	 * @returns The grocery list TFile.
	 */
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
