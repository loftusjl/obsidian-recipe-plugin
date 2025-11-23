import { App, TFile, Notice, normalizePath } from 'obsidian';

/**
 * Manages "Cook this Recipe" functionality - creating temporary cooking notes
 * with checkboxes for ingredients and instructions
 */
export class CookNowManager {
	app: App;
	cookingNotesPath: string;

	/**
	 * Creates a new CookNowManager
	 * @param app - The Obsidian App instance
	 * @param cookingNotesPath - Path to the cooking notes folder
	 */
	constructor(app: App, cookingNotesPath: string) {
		this.app = app;
		this.cookingNotesPath = cookingNotesPath;
	}

	/**
	 * Creates a temporary cooking note from a recipe file
	 * @param recipeFile - The recipe file to create a cooking note from
	 * @returns The created cooking note file
	 */
	async createCookingNote(recipeFile: TFile): Promise<TFile> {
		const content = await this.app.vault.read(recipeFile);

		// Validate this is a recipe
		if (!this.isRecipe(content)) {
			throw new Error('This note does not appear to be a recipe.');
		}

		// Parse recipe data
		const recipe = this.parseRecipeForCooking(content, recipeFile.basename);

		// Generate cooking note content
		const cookingContent = this.generateCookingNote(recipe, recipeFile.basename, content);

		// Ensure cooking notes folder exists
		await this.ensureCookingNotesFolder();

		// Create the cooking note
		const cookingNotePath = normalizePath(
			`${this.cookingNotesPath}/${recipeFile.basename} - Cooking.md`
		);

		// Check if file already exists and handle it
		let existingFile = this.app.vault.getAbstractFileByPath(cookingNotePath);
		if (existingFile instanceof TFile) {
			// Overwrite existing cooking note
			await this.app.vault.modify(existingFile, cookingContent);
			return existingFile;
		}

		// Create new file
		const newFile = await this.app.vault.create(cookingNotePath, cookingContent);
		return newFile;
	}

	/**
	 * Clears all temporary cooking notes from the cooking notes folder
	 * @returns Number of notes deleted
	 */
	async clearCookingNotes(): Promise<number> {
		const folder = this.app.vault.getAbstractFileByPath(
			normalizePath(this.cookingNotesPath)
		);

		if (!folder) {
			new Notice('Cooking notes folder not found.');
			return 0;
		}

		let deletedCount = 0;
		const files = this.app.vault.getMarkdownFiles().filter(file =>
			file.path.startsWith(normalizePath(this.cookingNotesPath))
		);

		for (const file of files) {
			const content = await this.app.vault.read(file);

			// Only delete files with temp-cooking-note property
			if (this.isTempCookingNote(content)) {
				await this.app.vault.delete(file);
				deletedCount++;
			}
		}

		return deletedCount;
	}

	/**
	 * Checks if content is a valid recipe
	 * @param content - The note content
	 * @returns True if this appears to be a recipe
	 */
	isRecipe(content: string): boolean {
		// Check for recipe-plugin property OR ingredients section
		const hasRecipePlugin = /recipe-plugin:\s*true/i.test(content);
		const hasIngredients = /##\s+Ingredients/i.test(content);

		return hasRecipePlugin || hasIngredients;
	}

	/**
	 * Checks if content is a temporary cooking note
	 * @param content - The note content
	 * @returns True if this is a temp cooking note
	 */
	isTempCookingNote(content: string): boolean {
		return /temp-cooking-note:\s*true/i.test(content);
	}

	/**
	 * Parses recipe content for cooking
	 * @param content - The recipe content
	 * @param recipeName - The recipe name
	 * @returns Parsed recipe data
	 * @private
	 */
	private parseRecipeForCooking(content: string, recipeName: string) {
		// Extract ingredients
		const ingredientsMatch = content.match(/##\s+Ingredients\n([\s\S]*?)(?=\n##|$)/i);
		const ingredients: string[] = [];
		if (ingredientsMatch) {
			ingredients.push(...ingredientsMatch[1]
				.split('\n')
				.map(line => line.replace(/^-\s*/, '').trim())
				.filter(line => line.length > 0));
		}

		// Extract instructions
		const instructionsMatch = content.match(/##\s+Instructions\n([\s\S]*?)(?=\n##|$)/i);
		const instructions: string[] = [];
		if (instructionsMatch) {
			instructions.push(...instructionsMatch[1]
				.split('\n')
				.map(line => line.replace(/^\d+\.\s*/, '').trim())
				.filter(line => line.length > 0));
		}

		// Extract description (optional)
		const descMatch = content.match(/>\s*\[!info\]\s*Description\n>\s*(.+)/);
		const description = descMatch ? descMatch[1].trim() : '';

		// Extract video (optional)
		const videoMatch = content.match(/## Video\n+(.+)/);
		const video = videoMatch ? videoMatch[1].trim() : '';

		return {
			name: recipeName,
			ingredients,
			instructions,
			description,
			video
		};
	}

	/**
	 * Generates the cooking note content
	 * @param recipe - Parsed recipe data
	 * @param recipeName - Original recipe name
	 * @param content - Original recipe content (for extracting cooking notes)
	 * @returns Formatted cooking note content
	 * @private
	 */
	private generateCookingNote(
		recipe: { name: string; ingredients: string[]; instructions: string[]; description: string; video: string },
		recipeName: string,
		content: string
	): string {
		const now = new Date();
		const timestamp = now.toISOString();
		const displayTime = now.toLocaleString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});

		const parts: string[] = [];

		// Frontmatter
		parts.push('---');
		parts.push('temp-cooking-note: true');
		parts.push(`source-recipe: "[[${recipeName}]]"`);
		parts.push(`created: ${timestamp}`);
		parts.push('---');
		parts.push('');

		// Title
		parts.push(`# ${recipe.name} - Cooking`);
		parts.push('');

		// Extract existing cooking notes from recipe
		const existingNotes = this.extractCookingNotes(content);
		const hasNotes = existingNotes.length > 0;

		// Build quick links
		const quickLinks = [];
		if (recipe.video) quickLinks.push('[Video](#video)');
		if (hasNotes) quickLinks.push('[Cooking Notes](#cooking-notes)');
		const quickLinksLine = quickLinks.length > 0
			? `>\n> **Quick Links**: ${quickLinks.join(' | ')}`
			: '';

		// Info callout with anchor links
		parts.push('> [!tip] Cooking Guide');
		parts.push('> This is a temporary cooking note. Check off items as you go!');
		parts.push(`> Source: [[${recipeName}]]`);
		if (quickLinksLine) {
			parts.push(quickLinksLine);
		}
		parts.push('');

		// Description (if available)
		if (recipe.description) {
			parts.push(`**Description**: ${recipe.description}`);
			parts.push('');
		}

		// Ingredients checklist
		if (recipe.ingredients.length > 0) {
			parts.push('## Ingredients Checklist');
			parts.push('');
			recipe.ingredients.forEach(ingredient => {
				parts.push(`- [ ] ${ingredient}`);
			});
			parts.push('');
		} else {
			parts.push('## Ingredients Checklist');
			parts.push('');
			parts.push('*No ingredients found in recipe*');
			parts.push('');
		}

		// Instructions checklist
		if (recipe.instructions.length > 0) {
			parts.push('## Instructions Checklist');
			parts.push('');
			recipe.instructions.forEach(instruction => {
				parts.push(`- [ ] ${instruction}`);
			});
			parts.push('');
		} else {
			parts.push('## Instructions Checklist');
			parts.push('');
			parts.push('*No instructions found in recipe*');
			parts.push('');
		}

		// Add video if available
		if (recipe.video) {
			parts.push('## Video');
			parts.push('');
			parts.push(recipe.video);
			parts.push('');
		}

		// Add existing cooking notes if any
		if (hasNotes) {
			parts.push('---');
			parts.push('');
			parts.push('## Cooking Notes');
			parts.push('');
			parts.push(existingNotes);
			parts.push('');
		}

		// Footer
		parts.push('---');
		parts.push(`*Created: ${displayTime}*`);

		return parts.join('\n');
	}

	/**
	 * Extracts existing cooking notes from content
	 * @param content - The file content
	 * @returns Cooking notes text or empty string
	 * @private
	 */
	private extractCookingNotes(content: string): string {
		const notesMatch = content.match(/## Cooking Notes\n([\s\S]*?)(?=\n##|---\n\*Created:|$)/);
		if (notesMatch) {
			return notesMatch[1].trim();
		}
		return '';
	}

	/**
	 * Adds a timestamped cooking note to a file
	 * @param file - The file to add the note to
	 * @param noteText - The note text to add
	 * @private
	 */
	private async addCookingNoteToFile(file: TFile, noteText: string): Promise<void> {
		let content = await this.app.vault.read(file);

		const now = new Date();
		const timestamp = now.toLocaleString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});

		const formattedNote = `### ${timestamp}\n${noteText}`;

		// Find or create cooking notes section
		const notesMatch = content.match(/## Cooking Notes\n([\s\S]*?)(?=\n##|---\n\*Created:|$)/);

		if (notesMatch) {
			// Section exists - prepend new note (newest first)
			const existingNotes = notesMatch[1].trim();
			const newNotesSection = existingNotes
				? `## Cooking Notes\n\n${formattedNote}\n\n${existingNotes}`
				: `## Cooking Notes\n\n${formattedNote}`;

			content = content.replace(/## Cooking Notes\n[\s\S]*?(?=\n##|---\n\*Created:|$)/, newNotesSection + '\n');
		} else {
			// Section doesn't exist - add before footer or at end
			const footerMatch = content.match(/---\n\*Created:/);
			if (footerMatch && footerMatch.index) {
				// Add before footer
				content = content.slice(0, footerMatch.index) +
					`\n## Cooking Notes\n\n${formattedNote}\n\n` +
					content.slice(footerMatch.index);
			} else {
				// Add at end
				content += `\n\n## Cooking Notes\n\n${formattedNote}\n`;
			}
		}

		await this.app.vault.modify(file, content);
	}

	/**
	 * Finds the source recipe file from a cooking note's frontmatter
	 * @param cookingNoteFile - The cooking note file
	 * @returns The source recipe file or null if not found
	 */
	async findSourceRecipe(cookingNoteFile: TFile): Promise<TFile | null> {
		const content = await this.app.vault.read(cookingNoteFile);
		const sourceMatch = content.match(/source-recipe:\s*"?\[\[([^\]]+)\]\]"?/);

		if (!sourceMatch) return null;

		const recipeName = sourceMatch[1];
		const recipeFile = this.app.vault.getMarkdownFiles().find(
			file => file.basename === recipeName
		);

		return recipeFile || null;
	}

	/**
	 * Syncs a cooking note to both recipe and cooking note files
	 * @param recipeFile - The recipe file
	 * @param cookingNoteFile - The cooking note file (optional)
	 * @param noteText - The note text to add
	 */
	async syncNoteToFiles(recipeFile: TFile, cookingNoteFile: TFile | null, noteText: string): Promise<void> {
		// Add to recipe file
		await this.addCookingNoteToFile(recipeFile, noteText);

		// Add to cooking note file if it exists
		if (cookingNoteFile) {
			await this.addCookingNoteToFile(cookingNoteFile, noteText);
		}
	}

	/**
	 * Ensures the cooking notes folder exists
	 * @private
	 */
	private async ensureCookingNotesFolder(): Promise<void> {
		const path = normalizePath(this.cookingNotesPath);
		const folder = this.app.vault.getAbstractFileByPath(path);

		if (!folder) {
			await this.app.vault.createFolder(path);
		}
	}
}
