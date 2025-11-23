import { App, Modal, Notice, Setting, TFile, MarkdownView } from 'obsidian';
import RecipePlugin from './main';
import { NutritionService, ParsedIngredient, NutritionTotals } from './nutrition_service';

/**
 * Modal for calculating and displaying nutrition facts for a recipe
 */
export class NutritionModal extends Modal {
	plugin: RecipePlugin;
	file: TFile;

	/**
	 * Creates a new NutritionModal
	 * @param app - The Obsidian App instance
	 * @param plugin - The plugin instance
	 * @param file - The recipe file to calculate nutrition for
	 */
	constructor(app: App, plugin: RecipePlugin, file: TFile) {
		super(app);
		this.plugin = plugin;
		this.file = file;
	}

	/**
	 * Opens the modal and validates the recipe note
	 */
	async onOpen() {
		const { contentEl } = this;

		// Validate that this is a recipe plugin note
		const content = await this.app.vault.read(this.file);
		if (!this.isRecipePluginNote(content)) {
			contentEl.createEl('h2', { text: 'Invalid Recipe Note' });
			contentEl.createEl('p', {
				text: 'This note was not created by the Recipe Plugin. Please use this feature only on recipe notes.',
				attr: { style: 'color: var(--text-error);' }
			});

			const closeButton = contentEl.createEl('button', { text: 'Close', cls: 'mod-cta' });
			closeButton.onclick = () => this.close();
			return;
		}

		contentEl.createEl('h2', { text: 'Calculate Nutrition Facts' });

		const statusEl = contentEl.createDiv({
			cls: 'nutrition-status',
			attr: { style: 'margin: 20px 0; padding: 10px; border-radius: 5px; background: var(--background-secondary);' }
		});

		const calculateButton = contentEl.createEl('button', { text: 'Calculate Nutrition', cls: 'mod-cta' });
		calculateButton.onclick = async () => {
			calculateButton.setAttr('disabled', 'true');
			calculateButton.setText('Calculating...');

			try {
				await this.calculateAndDisplay(statusEl);
			} catch (error) {
				console.error(error);
				new Notice('Error calculating nutrition.');
				statusEl.innerHTML = `<p style="color: var(--text-error);">Error: ${error.message}</p>`;
			} finally {
				calculateButton.removeAttribute('disabled');
				calculateButton.setText('Calculate Nutrition');
			}
		};
	}

	/**
	 * Checks if the note has the recipe-plugin property in frontmatter
	 * @param content - The note content
	 * @returns True if this is a valid recipe plugin note
	 * @private
	 */
	private isRecipePluginNote(content: string): boolean {
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!frontmatterMatch) return false;

		const frontmatter = frontmatterMatch[1];
		return /recipe-plugin:\s*true/i.test(frontmatter);
	}

	/**
	 * Extracts ingredients from the recipe note
	 * @param content - The note content
	 * @returns Array of ingredient strings
	 * @private
	 */
	private extractIngredients(content: string): string[] {
		const ingredientsMatch = content.match(/## Ingredients\n([\s\S]*?)(?=\n##|$)/);
		if (!ingredientsMatch) return [];

		return ingredientsMatch[1]
			.split('\n')
			.map(line => line.replace(/^-\s*/, '').trim())
			.filter(line => line.length > 0);
	}

	/**
	 * Calculates nutrition and displays results
	 * @param statusEl - The HTML element to display status/results in
	 * @private
	 */
	private async calculateAndDisplay(statusEl: HTMLDivElement) {
		const content = await this.app.vault.read(this.file);
		const ingredientTexts = this.extractIngredients(content);

		if (ingredientTexts.length === 0) {
			statusEl.innerHTML = '<p style="color: var(--text-error);">No ingredients found in this recipe.</p>';
			return;
		}

		statusEl.innerHTML = `<p>Parsing ${ingredientTexts.length} ingredients...</p>`;

		const nutritionService = new NutritionService(
			this.plugin.settings.usdaApiKey,
			this.plugin.settings.debugMode
		);

		// Parse ingredients
		const parsedIngredients: ParsedIngredient[] = ingredientTexts.map(text =>
			nutritionService.parseIngredientText(text)
		);

		statusEl.innerHTML = '<p>Fetching nutrition data...</p><ul id="ingredient-list"></ul>';
		const listEl = statusEl.querySelector('#ingredient-list') as HTMLUListElement;

		// Show progress for each ingredient
		for (const ingredient of parsedIngredients) {
			const li = listEl.createEl('li', { text: `${ingredient.foodName}... ` });
			const nutritionData = await nutritionService.searchFood(ingredient.foodName);

			if (nutritionData) {
				li.appendText(`✓ (${nutritionData.source})`);
				li.style.color = 'var(--text-success)';
			} else {
				li.appendText('✗ Not found');
				li.style.color = 'var(--text-error)';
			}
		}

		// Calculate totals
		statusEl.innerHTML += '<p>Calculating totals...</p>';
		const totals = await nutritionService.calculateRecipeNutrition(parsedIngredients);

		// Display results
		this.displayResults(statusEl, totals, content);
	}

	/**
	 * Displays calculated nutrition totals and provides option to save
	 * @param statusEl - The HTML element to display results in
	 * @param totals - The calculated nutrition totals
	 * @param content - The current recipe note content
	 * @private
	 */
	private displayResults(statusEl: HTMLDivElement, totals: NutritionTotals, content: string) {
		statusEl.innerHTML = '<h3>Nutrition Totals (Entire Recipe)</h3>';

		const table = statusEl.createEl('table', { attr: { style: 'width: 100%; margin: 10px 0;' } });
		table.innerHTML = `
			<thead>
				<tr>
					<th style="text-align: left;">Nutrient</th>
					<th style="text-align: right;">Amount</th>
				</tr>
			</thead>
			<tbody>
				<tr><td>Calories</td><td style="text-align: right;">${totals.calories.toFixed(0)} kcal</td></tr>
				<tr><td>Protein</td><td style="text-align: right;">${totals.protein.toFixed(1)} g</td></tr>
				<tr><td>Fat</td><td style="text-align: right;">${totals.fat.toFixed(1)} g</td></tr>
				<tr><td>Carbohydrates</td><td style="text-align: right;">${totals.carbohydrates.toFixed(1)} g</td></tr>
				<tr><td>Fiber</td><td style="text-align: right;">${totals.fiber.toFixed(1)} g</td></tr>
				<tr><td>Sugar</td><td style="text-align: right;">${totals.sugar.toFixed(1)} g</td></tr>
				<tr><td>Sodium</td><td style="text-align: right;">${totals.sodium.toFixed(0)} mg</td></tr>
			</tbody>
		`;

		// Extract recipe yield for per-serving calculation
		const yieldMatch = content.match(/yield:\s*"?(\d+)/);
		const servings = yieldMatch ? parseInt(yieldMatch[1]) : null;

		if (servings && servings > 1) {
			statusEl.createEl('h4', { text: `Per Serving (${servings} servings):` });
			const perServingTable = statusEl.createEl('table', { attr: { style: 'width: 100%; margin: 10px 0;' } });
			perServingTable.innerHTML = `
				<thead>
					<tr>
						<th style="text-align: left;">Nutrient</th>
						<th style="text-align: right;">Amount</th>
					</tr>
				</thead>
				<tbody>
					<tr><td>Calories</td><td style="text-align: right;">${(totals.calories / servings).toFixed(0)} kcal</td></tr>
					<tr><td>Protein</td><td style="text-align: right;">${(totals.protein / servings).toFixed(1)} g</td></tr>
					<tr><td>Fat</td><td style="text-align: right;">${(totals.fat / servings).toFixed(1)} g</td></tr>
					<tr><td>Carbohydrates</td><td style="text-align: right;">${(totals.carbohydrates / servings).toFixed(1)} g</td></tr>
					<tr><td>Fiber</td><td style="text-align: right;">${(totals.fiber / servings).toFixed(1)} g</td></tr>
					<tr><td>Sugar</td><td style="text-align: right;">${(totals.sugar / servings).toFixed(1)} g</td></tr>
					<tr><td>Sodium</td><td style="text-align: right;">${(totals.sodium / servings).toFixed(0)} mg</td></tr>
				</tbody>
			`;
		}

		// Add save button
		const saveButton = statusEl.createEl('button', { text: 'Save to Recipe', cls: 'mod-cta', attr: { style: 'margin-top: 15px;' } });
		saveButton.onclick = async () => {
			await this.saveNutritionToRecipe(totals);
			this.close();
		};
	}

	/**
	 * Saves calculated nutrition to the recipe note, replacing existing nutrition section
	 * @param totals - The calculated nutrition totals
	 * @private
	 */
	private async saveNutritionToRecipe(totals: NutritionTotals) {
		let content = await this.app.vault.read(this.file);

		// Extract recipe yield for per-serving calculation
		const yieldMatch = content.match(/yield:\s*"?(\d+)/);
		const servings = yieldMatch ? parseInt(yieldMatch[1]) : 1;

		// Generate nutrition table with both total and per-serving columns
		let nutritionTable: string;

		if (servings > 1) {
			// Table with Total Recipe and Per Serving columns (like food package labels)
			nutritionTable = [
				'## Nutrition',
				`Servings: ${servings}`,
				'',
				'| Nutrient | Total Recipe | Per Serving |',
				'| :--- | ---: | ---: |',
				`| **Calories** | ${totals.calories.toFixed(0)} kcal | ${(totals.calories / servings).toFixed(0)} kcal |`,
				`| **Protein** | ${totals.protein.toFixed(1)}g | ${(totals.protein / servings).toFixed(1)}g |`,
				`| **Fat** | ${totals.fat.toFixed(1)}g | ${(totals.fat / servings).toFixed(1)}g |`,
				`| **Carbohydrates** | ${totals.carbohydrates.toFixed(1)}g | ${(totals.carbohydrates / servings).toFixed(1)}g |`,
				`| Fiber | ${totals.fiber.toFixed(1)}g | ${(totals.fiber / servings).toFixed(1)}g |`,
				`| Sugar | ${totals.sugar.toFixed(1)}g | ${(totals.sugar / servings).toFixed(1)}g |`,
				`| **Sodium** | ${totals.sodium.toFixed(0)}mg | ${(totals.sodium / servings).toFixed(0)}mg |`
			].join('\n');
		} else {
			// Single column table if no servings info
			nutritionTable = [
				'## Nutrition',
				'| Nutrient | Amount |',
				'| :--- | ---: |',
				`| **Calories** | ${totals.calories.toFixed(0)} kcal |`,
				`| **Protein** | ${totals.protein.toFixed(1)}g |`,
				`| **Fat** | ${totals.fat.toFixed(1)}g |`,
				`| **Carbohydrates** | ${totals.carbohydrates.toFixed(1)}g |`,
				`| Fiber | ${totals.fiber.toFixed(1)}g |`,
				`| Sugar | ${totals.sugar.toFixed(1)}g |`,
				`| **Sodium** | ${totals.sodium.toFixed(0)}mg |`
			].join('\n');
		}

		// Check if nutrition section exists
		const nutritionMatch = content.match(/## Nutrition\n[\s\S]*?(?=\n##|$)/);

		if (nutritionMatch) {
			// Replace existing nutrition section
			content = content.replace(/## Nutrition\n[\s\S]*?(?=\n##|$)/, nutritionTable);
		} else {
			// Append nutrition section before any custom sections
			// Insert before the last ## heading or at the end
			const lastHeadingMatch = content.match(/\n## (?!Ingredients|Instructions)[^\n]+\n/);
			if (lastHeadingMatch && lastHeadingMatch.index) {
				content = content.slice(0, lastHeadingMatch.index) + '\n\n' + nutritionTable + content.slice(lastHeadingMatch.index);
			} else {
				content += '\n\n' + nutritionTable;
			}
		}

		await this.app.vault.modify(this.file, content);
		new Notice('Nutrition facts saved to recipe!');
	}

	/**
	 * Cleanup when modal is closed
	 */
	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
