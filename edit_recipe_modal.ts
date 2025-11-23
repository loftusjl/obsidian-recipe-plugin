import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import RecipePlugin from './main';
import { ScrapedRecipe } from './scraper';

interface ParsedRecipe {
	title: string;
	url: string;
	description: string;
	ingredients: string[];
	instructions: string[];
	nutrition: Record<string, string>;
	imagePath: string;
	prepTime?: string;
	cookTime?: string;
	totalTime?: string;
	recipeYield?: string;
	calories?: string;
}

export class EditRecipeModal extends Modal {
	plugin: RecipePlugin;
	file: TFile;
	originalRecipe: ParsedRecipe | null = null;

	// Form fields
	title: string = '';
	url: string = '';
	description: string = '';
	ingredients: string = '';
	instructions: string = '';
	nutrition: string = '';
	imageData: ArrayBuffer | null = null;

	constructor(app: App, plugin: RecipePlugin, file: TFile) {
		super(app);
		this.plugin = plugin;
		this.file = file;
	}

	async onOpen() {
		const { contentEl } = this;

		// Validate that this is a recipe plugin note
		const content = await this.app.vault.read(this.file);
		if (!this.isRecipePluginNote(content)) {
			contentEl.createEl('h2', { text: 'Invalid Recipe Note' });
			contentEl.createEl('p', {
				text: 'This note was not created by the Recipe Plugin and cannot be edited with this tool. Please use manual editing or create a new recipe.',
				attr: { style: 'color: var(--text-error);' }
			});

			const closeButton = contentEl.createEl('button', { text: 'Close', cls: 'mod-cta' });
			closeButton.onclick = () => this.close();
			return;
		}

		// Parse existing recipe
		this.originalRecipe = this.parseRecipe(content);

		// Pre-populate form fields
		this.title = this.originalRecipe.title;
		this.url = this.originalRecipe.url;
		this.description = this.originalRecipe.description;
		this.ingredients = this.originalRecipe.ingredients.join('\n');
		this.instructions = this.originalRecipe.instructions.join('\n');
		this.nutrition = Object.entries(this.originalRecipe.nutrition)
			.map(([key, value]) => `${key}: ${value}`)
			.join('\n');

		contentEl.createEl('h2', { text: 'Edit Recipe' });
		contentEl.createEl('p', {
			text: 'Update any fields below. Leave a field unchanged to keep the existing value.',
			attr: { style: 'color: var(--text-muted); margin-bottom: 20px;' }
		});

		new Setting(contentEl)
			.setName('Title')
			.addText(text => text
				.setPlaceholder('Recipe Title')
				.setValue(this.title)
				.onChange(value => this.title = value));

		new Setting(contentEl)
			.setName('URL')
			.setDesc('Optional source URL')
			.addText(text => text
				.setPlaceholder('https://example.com')
				.setValue(this.url)
				.onChange(value => this.url = value));

		new Setting(contentEl)
			.setName('Description')
			.addTextArea(text => text
				.setPlaceholder('Brief description...')
				.setValue(this.description)
				.onChange(value => this.description = value));

		new Setting(contentEl)
			.setName('Ingredients')
			.setDesc('One per line')
			.addTextArea(text => text
				.setPlaceholder('1 cup flour\\n2 eggs')
				.setValue(this.ingredients)
				.onChange(value => this.ingredients = value));

		new Setting(contentEl)
			.setName('Instructions')
			.setDesc('One step per line')
			.addTextArea(text => text
				.setPlaceholder('Mix ingredients.\\nBake at 350F.')
				.setValue(this.instructions)
				.onChange(value => this.instructions = value));

		new Setting(contentEl)
			.setName('Nutrition')
			.setDesc('Key: Value (one per line)')
			.addTextArea(text => text
				.setPlaceholder('Calories: 500\\nProtein: 20g')
				.setValue(this.nutrition)
				.onChange(value => this.nutrition = value));

		// Image section
		const imageSection = contentEl.createDiv({
			cls: 'image-section',
			attr: { style: 'margin-top: 20px; border: 1px solid var(--background-modifier-border); padding: 10px; border-radius: 5px;' }
		});
		imageSection.createEl('h3', { text: 'Image' });

		if (this.originalRecipe.imagePath) {
			imageSection.createEl('p', {
				text: `Current: ${this.originalRecipe.imagePath}`,
				attr: { style: 'color: var(--text-muted); font-size: 0.9em;' }
			});
		}

		const imagePreviewContainer = imageSection.createDiv({
			cls: 'image-preview-container',
			attr: { style: 'text-align: center; margin-bottom: 10px;' }
		});

		const pasteArea = imageSection.createDiv({
			cls: 'image-paste-area',
			text: 'Click here and Paste (Ctrl+V) to replace image',
			attr: {
				style: 'border: 2px dashed var(--text-muted); padding: 20px; text-align: center; cursor: pointer; border-radius: 5px; color: var(--text-muted);',
				tabindex: '0'
			}
		});

		pasteArea.addEventListener('focus', () => {
			pasteArea.style.borderColor = 'var(--interactive-accent)';
			pasteArea.style.color = 'var(--interactive-accent)';
		});

		pasteArea.addEventListener('blur', () => {
			pasteArea.style.borderColor = 'var(--text-muted)';
			pasteArea.style.color = 'var(--text-muted)';
		});

		pasteArea.addEventListener('paste', async (e: ClipboardEvent) => {
			if (e.clipboardData && e.clipboardData.items) {
				for (let i = 0; i < e.clipboardData.items.length; i++) {
					const item = e.clipboardData.items[i];
					if (item.type.indexOf('image') !== -1) {
						e.preventDefault();
						const blob = item.getAsFile();
						if (blob) {
							this.imageData = await blob.arrayBuffer();

							imagePreviewContainer.empty();
							const url = URL.createObjectURL(blob);
							imagePreviewContainer.createEl('img', {
								attr: {
									src: url,
									style: 'max-width: 100%; max-height: 200px; border-radius: 5px;'
								}
							});
							pasteArea.setText('Image Pasted!');
							new Notice('Image pasted successfully!');
						}
					}
				}
			}
		});

		const clearButton = imageSection.createEl('button', {
			text: 'Clear Image',
			attr: { style: 'margin-top: 10px; width: 100%;' }
		});
		clearButton.onclick = () => {
			if (this.imageData) {
				this.imageData = null;
				imagePreviewContainer.empty();
				pasteArea.setText('Click here and Paste (Ctrl+V) to replace image');
				new Notice('Image cleared.');
			} else {
				new Notice('No new image to clear.');
			}
		};

		const buttonContainer = contentEl.createDiv({
			cls: 'modal-button-container',
			attr: { style: 'margin-top: 20px;' }
		});
		const updateButton = buttonContainer.createEl('button', { text: 'Update Recipe', cls: 'mod-cta' });

		updateButton.onclick = async () => {
			if (!this.title) {
				new Notice('Title is required.');
				return;
			}

			updateButton.setAttr('disabled', 'true');
			updateButton.setText('Updating...');

			try {
				await this.updateRecipe();
				this.close();
			} catch (error) {
				console.error(error);
				new Notice('Error updating recipe.');
				updateButton.removeAttribute('disabled');
				updateButton.setText('Update Recipe');
			}
		};
	}

	/**
	 * Checks if the note has the recipe-plugin property in frontmatter
	 */
	private isRecipePluginNote(content: string): boolean {
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!frontmatterMatch) return false;

		const frontmatter = frontmatterMatch[1];
		return /recipe-plugin:\s*true/i.test(frontmatter);
	}

	/**
	 * Parses the recipe note to extract current values
	 */
	private parseRecipe(content: string): ParsedRecipe {
		const recipe: ParsedRecipe = {
			title: '',
			url: '',
			description: '',
			ingredients: [],
			instructions: [],
			nutrition: {},
			imagePath: ''
		};

		// Extract frontmatter
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (frontmatterMatch) {
			const frontmatter = frontmatterMatch[1];

			const urlMatch = frontmatter.match(/url:\s*(.+)/);
			if (urlMatch) recipe.url = urlMatch[1].trim();

			const prepTimeMatch = frontmatter.match(/prepTime:\s*(.+)/);
			if (prepTimeMatch) recipe.prepTime = prepTimeMatch[1].trim();

			const cookTimeMatch = frontmatter.match(/cookTime:\s*(.+)/);
			if (cookTimeMatch) recipe.cookTime = cookTimeMatch[1].trim();

			const totalTimeMatch = frontmatter.match(/totalTime:\s*(.+)/);
			if (totalTimeMatch) recipe.totalTime = totalTimeMatch[1].trim();

			const yieldMatch = frontmatter.match(/yield:\s*"?([^"\n]+)"?/);
			if (yieldMatch) recipe.recipeYield = yieldMatch[1].trim();

			const caloriesMatch = frontmatter.match(/calories:\s*(.+)/);
			if (caloriesMatch) recipe.calories = caloriesMatch[1].trim();
		}

		// Extract title (from # heading)
		const titleMatch = content.match(/^#\s+(.+)$/m);
		if (titleMatch) recipe.title = titleMatch[1].trim();

		// Extract description (from callout)
		const descMatch = content.match(/>\s*\[!info\]\s*Description\n>\s*(.+)/);
		if (descMatch) recipe.description = descMatch[1].replace(/\n>/g, '\n').trim();

		// Extract image path
		const imageMatch = content.match(/!\[\[([^\]]+)\]\]|!\[.*?\]\(([^)]+)\)/);
		if (imageMatch) recipe.imagePath = imageMatch[1] || imageMatch[2];

		// Extract ingredients
		const ingredientsMatch = content.match(/## Ingredients\n([\s\S]*?)(?=\n##|$)/);
		if (ingredientsMatch) {
			recipe.ingredients = ingredientsMatch[1]
				.split('\n')
				.map(line => line.replace(/^-\s*/, '').trim())
				.filter(line => line.length > 0);
		}

		// Extract instructions
		const instructionsMatch = content.match(/## Instructions\n([\s\S]*?)(?=\n##|$)/);
		if (instructionsMatch) {
			recipe.instructions = instructionsMatch[1]
				.split('\n')
				.map(line => line.replace(/^\d+\.\s*/, '').trim())
				.filter(line => line.length > 0);
		}

		// Extract nutrition
		const nutritionMatch = content.match(/## Nutrition\n[\s\S]*?\n((?:\|[^\n]+\n)+)/);
		if (nutritionMatch) {
			const rows = nutritionMatch[1].split('\n').filter(r => r.trim());
			rows.slice(1).forEach(row => { // Skip header row
				const cells = row.split('|').map(c => c.trim()).filter(c => c);
				if (cells.length >= 2) {
					recipe.nutrition[cells[0]] = cells[1];
				}
			});
		}

		return recipe;
	}

	/**
	 * Updates the recipe note with changes, preserving custom sections
	 */
	private async updateRecipe() {
		if (!this.originalRecipe) return;

		const content = await this.app.vault.read(this.file);

		// Process updated fields
		const ingredientsList = this.ingredients.split('\n')
			.map(l => l.trim())
			.filter(l => l.length > 0)
			.map(i => this.plugin.recipeScraper.formatIngredient(i));

		const instructionsList = this.instructions.split('\n')
			.map(l => l.trim())
			.filter(l => l.length > 0);

		const nutritionObj: Record<string, string> = {};
		this.nutrition.split('\n').forEach(line => {
			const [key, value] = line.split(':').map(s => s.trim());
			if (key && value) nutritionObj[key] = value;
		});

		// Parse the content into sections
		const sections = this.parseContentSections(content);

		// Update frontmatter
		sections.frontmatter = this.updateFrontmatter(sections.frontmatter);

		// Update title if changed
		if (this.title !== this.originalRecipe.title) {
			sections.title = `# ${this.title}`;
		}

		// Update description if changed
		if (this.description !== this.originalRecipe.description) {
			if (this.description) {
				sections.description = `> [!info] Description\n> ${this.description.replace(/\n/g, '\n> ')}`;
			} else {
				sections.description = '';
			}
		}

		// Update ingredients if changed
		const origIng = this.originalRecipe.ingredients.join('\n');
		if (this.ingredients !== origIng) {
			sections.ingredients = '## Ingredients\n' + ingredientsList.map(i => `- ${i}`).join('\n');
		}

		// Update instructions if changed
		const origInst = this.originalRecipe.instructions.join('\n');
		if (this.instructions !== origInst) {
			sections.instructions = '## Instructions\n' + instructionsList.map((step, idx) => `${idx + 1}. ${step}`).join('\n');
		}

		// Update nutrition if changed
		const origNutr = Object.entries(this.originalRecipe.nutrition).map(([k, v]) => `${k}: ${v}`).join('\n');
		if (this.nutrition !== origNutr) {
			if (Object.keys(nutritionObj).length > 0) {
				sections.nutrition = '## Nutrition\n| Nutrient | Amount |\n| :--- | :--- |\n' +
					Object.entries(nutritionObj).map(([key, value]) => `| ${key} | ${value} |`).join('\n');
			} else {
				sections.nutrition = '';
			}
		}

		// Handle image update
		if (this.imageData) {
			const sanitizedTitle = this.title.replace(/[\\/:*?"<>|]/g, '').trim();
			const recipeFolder = this.file.parent?.path || '';
			const imageName = `${sanitizedTitle}.png`;
			const imageFilePath = `${recipeFolder}/${imageName}`;

			const imageFile = await this.app.vault.createBinary(imageFilePath, this.imageData);
			const imagePath = this.app.fileManager.generateMarkdownLink(imageFile, recipeFolder);
			sections.image = `!${imagePath}`;

			// Update frontmatter banner
			sections.frontmatter = sections.frontmatter.replace(
				/banner: "[^"]*"/,
				`banner: "${imagePath}"`
			);
			if (!sections.frontmatter.includes('banner:')) {
				sections.frontmatter = sections.frontmatter.replace(
					/\n---$/,
					`\nbanner: "${imagePath}"\ncontent-start: 200\n---`
				);
			}
		}

		// Rebuild the content
		const newContent = this.rebuildContent(sections);

		// Write back to file
		await this.app.vault.modify(this.file, newContent);
		new Notice('Recipe updated successfully!');
	}

	/**
	 * Parses content into sections, including custom user sections
	 */
	private parseContentSections(content: string): Record<string, string> {
		const sections: Record<string, string> = {
			frontmatter: '',
			title: '',
			description: '',
			image: '',
			ingredients: '',
			instructions: '',
			nutrition: '',
			custom: ''
		};

		// Extract frontmatter
		const frontmatterMatch = content.match(/^(---\n[\s\S]*?\n---)/);
		if (frontmatterMatch) {
			sections.frontmatter = frontmatterMatch[1];
			content = content.substring(frontmatterMatch[0].length).trim();
		}

		// Extract title
		const titleMatch = content.match(/^(#\s+.+)$/m);
		if (titleMatch) {
			sections.title = titleMatch[1];
		}

		// Extract description callout
		const descMatch = content.match(/(>\s*\[!info\]\s*Description\n(?:>.*\n?)*)/);
		if (descMatch) {
			sections.description = descMatch[1].trim();
		}

		// Extract image
		const imageMatch = content.match(/(!(?:\[\[.*?\]\]|\[.*?\]\(.*?\)))/);
		if (imageMatch) {
			sections.image = imageMatch[1];
		}

		// Extract standard sections
		const ingredientsMatch = content.match(/(## Ingredients\n[\s\S]*?)(?=\n##|$)/);
		if (ingredientsMatch) sections.ingredients = ingredientsMatch[1].trim();

		const instructionsMatch = content.match(/(## Instructions\n[\s\S]*?)(?=\n##|$)/);
		if (instructionsMatch) sections.instructions = instructionsMatch[1].trim();

		const nutritionMatch = content.match(/(## Nutrition\n[\s\S]*?)(?=\n##|$)/);
		if (nutritionMatch) sections.nutrition = nutritionMatch[1].trim();

		// Extract custom sections (anything not standard)
		const standardSections = ['Ingredients', 'Instructions', 'Nutrition'];
		const customSectionMatches = content.matchAll(/## ([^\n]+)\n([\s\S]*?)(?=\n##|$)/g);
		const customSections: string[] = [];

		for (const match of customSectionMatches) {
			const sectionName = match[1].trim();
			if (!standardSections.includes(sectionName)) {
				customSections.push(match[0].trim());
			}
		}

		sections.custom = customSections.join('\n\n');

		return sections;
	}

	/**
	 * Updates frontmatter URL field
	 */
	private updateFrontmatter(frontmatter: string): string {
		if (!frontmatter) return frontmatter;

		// Update URL if changed
		if (this.url !== this.originalRecipe!.url) {
			frontmatter = frontmatter.replace(/url: .+/, `url: ${this.url}`);
		}

		return frontmatter;
	}

	/**
	 * Rebuilds content from sections
	 */
	private rebuildContent(sections: Record<string, string>): string {
		const parts: string[] = [];

		if (sections.frontmatter) parts.push(sections.frontmatter);
		parts.push('');
		if (sections.title) parts.push(sections.title);
		parts.push('');
		if (sections.description) parts.push(sections.description);
		if (sections.description) parts.push('');
		if (sections.image) parts.push(sections.image);
		parts.push('');
		if (sections.ingredients) parts.push(sections.ingredients);
		parts.push('');
		if (sections.instructions) parts.push(sections.instructions);
		parts.push('');
		if (sections.nutrition) {
			parts.push(sections.nutrition);
			parts.push('');
		}
		if (sections.custom) {
			parts.push(sections.custom);
		}

		return parts.join('\n');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
