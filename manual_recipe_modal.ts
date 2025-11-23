import { App, Modal, Notice, Setting } from 'obsidian';
import RecipePlugin from './main';
import { ScrapedRecipe } from './scraper';

export class ManualRecipeModal extends Modal {
	plugin: RecipePlugin;
	title: string = '';
	url: string = '';
	description: string = '';
	video: string = '';
	ingredients: string = '';
	instructions: string = '';
	nutrition: string = '';
	imageData: ArrayBuffer | null = null;

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
			.setName('Video URL')
			.setDesc('Link to recipe video (YouTube, Vimeo, etc)')
			.addText(text => text
				.setPlaceholder('https://www.youtube.com/watch?v=...')
				.onChange(value => this.video = value));

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

		const imageSection = contentEl.createDiv({ cls: 'image-section', attr: { style: 'margin-top: 20px; border: 1px solid var(--background-modifier-border); padding: 10px; border-radius: 5px;' } });
		imageSection.createEl('h3', { text: 'Image' });

		const imagePreviewContainer = imageSection.createDiv({ cls: 'image-preview-container', attr: { style: 'text-align: center; margin-bottom: 10px;' } });

		const pasteArea = imageSection.createDiv({
			cls: 'image-paste-area',
			text: 'Click here and Paste (Ctrl+V) Image',
			attr: {
				style: 'border: 2px dashed var(--text-muted); padding: 20px; text-align: center; cursor: pointer; border-radius: 5px; color: var(--text-muted);',
				tabindex: '0' // Make focusable
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

		const clearButton = imageSection.createEl('button', { text: 'Clear Image', attr: { style: 'margin-top: 10px; width: 100%;' } });
		clearButton.onclick = () => {
			if (this.imageData) {
				this.imageData = null;
				imagePreviewContainer.empty();
				pasteArea.setText('Click here and Paste (Ctrl+V) Image');
				new Notice('Image cleared.');
			} else {
				new Notice('No image to clear.');
			}
		};

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

				const recipe: ScrapedRecipe = {
					title: this.title,
					url: this.url || '',
					description: this.description,
					video: this.video || undefined,
					ingredients: ingredientsList,
					instructions: instructionsList,
					nutrition: Object.keys(nutritionObj).length > 0 ? nutritionObj : undefined,
					cuisine: [],
					category: [],
					image: undefined,
					imageData: this.imageData || undefined,
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
