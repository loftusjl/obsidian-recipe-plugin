import { requestUrl } from 'obsidian';
import * as cheerio from 'cheerio';
import Fraction from 'fraction.js';
import { parseIngredient, parseInstruction } from '@jlucaspains/sharp-recipe-parser';

export interface ScrapedRecipe {
	title: string;
	url: string;
	image?: string;
	ingredients: string[];
	instructions: string[];
	description?: string;
	prepTime?: string;
	cookTime?: string;
	totalTime?: string;
	recipeYield?: string;
	calories?: string;
	nutrition?: Record<string, string>;
	cuisine?: string[];
	category?: string[];
	imageData?: ArrayBuffer;
}

/**
 * Handles scraping of recipes from URLs.
 * Extracts metadata, ingredients, instructions, and nutrition info.
 */
export class RecipeScraper {
	/**
	 * Scrapes a recipe from a given URL.
	 * Tries to parse JSON-LD first, then falls back to meta tags.
	 * @param url - The URL of the recipe to scrape.
	 * @returns A promise resolving to the scraped recipe data.
	 */
	async scrapeRecipe(url: string): Promise<ScrapedRecipe> {
		try {
			const response = await requestUrl({
				url,
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
				}
			});
			const html = response.text;
			const $ = cheerio.load(html);

			// 1. Try JSON-LD
			const jsonLd = this.extractJsonLd($);
			if (jsonLd) {
				return {
					title: this.cleanTitle(jsonLd.name || 'Untitled Recipe'),
					url: url,
					image: this.extractImage(jsonLd.image),
					ingredients: this.normalizeList(jsonLd.recipeIngredient),
					instructions: this.normalizeInstructions(jsonLd.recipeInstructions),
					description: jsonLd.description,
					prepTime: this.formatDuration(jsonLd.prepTime),
					cookTime: this.formatDuration(jsonLd.cookTime),
					totalTime: this.formatDuration(jsonLd.totalTime),
					recipeYield: this.formatYield(jsonLd.recipeYield),
					calories: jsonLd.nutrition?.calories,
					nutrition: this.extractNutrition(jsonLd.nutrition),
					cuisine: this.normalizeStringArray(jsonLd.recipeCuisine),
					category: this.normalizeStringArray(jsonLd.recipeCategory)
				};
			}

			// 2. Fallback to meta tags for title/image
			const rawTitle = $('meta[property="og:title"]').attr('content') || $('head > title').text() || 'Untitled Recipe';
			const title = this.cleanTitle(rawTitle);
			const image = $('meta[property="og:image"]').attr('content');
			const description = $('meta[property="og:description"]').attr('content');

			// 3. Fallback parsing (HTML structure)
			let fallbackData = this.fallbackScraping($);

			// 4. If fallback scraping failed to find lists, try content analysis (scanning all lists)
			if (fallbackData.ingredients.length === 0 || fallbackData.instructions.length === 0) {
				const analyzedLists = this.analyzeLists($);
				if (fallbackData.ingredients.length === 0 && analyzedLists.ingredients.length > 0) {
					fallbackData.ingredients = analyzedLists.ingredients;
				}
				if (fallbackData.instructions.length === 0 && analyzedLists.instructions.length > 0) {
					fallbackData.instructions = analyzedLists.instructions;
				}
			}

			return {
				title,
				url,
				image,
				description,
				ingredients: fallbackData.ingredients,
				instructions: fallbackData.instructions
			};
		} catch (error) {
			console.error("Recipe scraping failed:", error);
			throw error;
		}
	}

	/**
	 * Cleans up the recipe title by removing common separators and site names.
	 * @param title - The raw title string.
	 * @returns The cleaned title.
	 */
	private cleanTitle(title: string): string {
		// Remove common separators and text following them (often site name)
		// e.g. "Recipe Name | Site Name" -> "Recipe Name"
		// e.g. "Recipe Name - Site Name" -> "Recipe Name"
		return title.replace(/\s+[|\-–—:•]\s+.*$/, '').trim();
	}

	/**
	 * Fallback scraping method for sites without JSON-LD.
	 * Looks for headers containing "Ingredients" and "Instructions".
	 * Also looks for elements with class/id containing these keywords.
	 * @param $ - The cheerio instance.
	 * @returns Object containing ingredients and instructions.
	 */
	private fallbackScraping($: cheerio.CheerioAPI): { ingredients: string[], instructions: string[] } {
		const ingredients: string[] = [];
		const instructions: string[] = [];

		// Helper to extract list items from a container
		const extractListItems = (container: cheerio.Cheerio<any>, targetArray: string[], formatter?: (s: string) => string) => {
			// Try ul/ol first
			const lists = container.find('ul, ol');
			if (lists.length > 0) {
				lists.each((i: number, list: any) => {
					$(list).find('li').each((j: number, li: any) => {
						const text = $(li).text().trim();
						if (text) targetArray.push(formatter ? formatter(text) : text);
					});
				});
				return true;
			}

			// Try paragraphs or divs if they look like list items (simple heuristic)
			// Only if we found nothing else?
			return false;
		};

		// Strategy A: Find by Header
		const findByHeader = (regex: RegExp, targetArray: string[], formatter?: (s: string) => string) => {
			const headers = $('h1, h2, h3, h4, h5, h6').filter((i: number, el: any) => regex.test($(el).text()));
			let found = false;
			headers.each((i: number, el: any) => {
				if (found) return;
				let next = $(el).next();
				for (let k = 0; k < 5; k++) {
					if (next.is('ul') || next.is('ol')) {
						next.find('li').each((j: number, li: any) => {
							const text = $(li).text().trim();
							if (text) targetArray.push(formatter ? formatter(text) : text);
						});
						if (targetArray.length > 0) {
							found = true;
							return false;
						}
					}
					// Check if div contains ul/ol
					if (next.find('ul, ol').length > 0) {
						if (extractListItems(next, targetArray, formatter)) {
							found = true;
							return false;
						}
					}
					next = next.next();
				}
			});
			return found;
		};

		// Strategy B: Find by Class/ID
		const findByClassId = (regex: RegExp, targetArray: string[], formatter?: (s: string) => string) => {
			// Select all divs, sections, asides that might contain the list
			const containers = $('div, section, aside').filter((i: number, el: any) => {
				const id = $(el).attr('id') || '';
				const cls = $(el).attr('class') || '';
				return regex.test(id) || regex.test(cls);
			});

			let found = false;
			containers.each((i: number, el: any) => {
				if (found) return;
				// Avoid huge containers like "main" or "content" unless they are specific
				// The regex should be specific enough (e.g. "ingredients")
				if (extractListItems($(el), targetArray, formatter)) {
					found = true;
				}
			});
			return found;
		};

		// 1. Ingredients
		if (!findByHeader(/ingredients/i, ingredients, this.formatIngredient.bind(this))) {
			findByClassId(/ingredient/i, ingredients, this.formatIngredient.bind(this));
		}

		// 2. Instructions
		if (!findByHeader(/instructions|method|directions|preparation/i, instructions)) {
			findByClassId(/instruction|method|direction|preparation/i, instructions);
		}

		return { ingredients, instructions };
	}

	/**
	 * Analyzes all lists on the page to identify potential ingredient and instruction lists
	 * based on content heuristics (units, numbers, length).
	 */
	private analyzeLists($: cheerio.CheerioAPI): { ingredients: string[], instructions: string[] } {
		const candidates: { element: cheerio.Cheerio<any>, score: number, type: 'ingredients' | 'instructions' | 'unknown' }[] = [];
		const commonUnits = ['g', 'kg', 'ml', 'l', 'oz', 'lb', 'tsp', 'tbsp', 'cup', 'pinch', 'clove', 'slice', 'piece'];

		$('ul, ol').each((i: number, el: any) => {
			const list = $(el);
			const items = list.find('li');
			if (items.length < 2) return; // Skip tiny lists

			let ingredientScore = 0;
			let instructionScore = 0;
			let totalTextLength = 0;

			items.each((j: number, li: any) => {
				const text = $(li).text().trim();
				totalTextLength += text.length;

				// Ingredient heuristics
				const hasNumber = /\d/.test(text);
				const hasUnit = commonUnits.some(u => new RegExp(`\\b${u}\\b`, 'i').test(text));
				if (hasNumber && hasUnit) ingredientScore += 2;
				else if (hasNumber || hasUnit) ingredientScore += 1;

				// Instruction heuristics
				if (text.length > 50) instructionScore += 1;
				if (/^(Preheat|Mix|Stir|Bake|Cook|Fry|Boil|Chop|Cut|Slice|Place|Pour)/i.test(text)) instructionScore += 2;
			});

			const avgLength = totalTextLength / items.length;
			const normalizedIngScore = ingredientScore / items.length;
			const normalizedInstScore = instructionScore / items.length;

			if (normalizedIngScore > 0.5 && avgLength < 100) {
				candidates.push({ element: list, score: normalizedIngScore, type: 'ingredients' });
			} else if (normalizedInstScore > 0.3 || (avgLength > 50 && normalizedIngScore < 0.2)) {
				candidates.push({ element: list, score: normalizedInstScore, type: 'instructions' });
			}
		});

		// Select best candidates
		const bestIngredients = candidates
			.filter(c => c.type === 'ingredients')
			.sort((a, b) => b.score - a.score)[0];

		const bestInstructions = candidates
			.filter(c => c.type === 'instructions')
			.sort((a, b) => b.score - a.score)[0];

		const ingredients: string[] = [];
		if (bestIngredients) {
			bestIngredients.element.find('li').each((i, el) => {
				ingredients.push(this.formatIngredient($(el).text().trim()));
			});
		}

		const instructions: string[] = [];
		if (bestInstructions) {
			bestInstructions.element.find('li').each((i, el) => {
				instructions.push($(el).text().trim());
			});
		}

		return { ingredients, instructions };
	}

	/**
	 * Extracts JSON-LD data from the cheerio instance.
	 * Looks for 'Recipe' type objects.
	 * @param $ - The cheerio instance loaded with HTML.
	 * @returns The extracted JSON-LD object or null if not found.
	 */
	private extractJsonLd($: cheerio.CheerioAPI): any | null {
		let recipeData = null;
		$('script[type="application/ld+json"]').each((i, el) => {
			try {
				const data = JSON.parse($(el).html() || '{}');

				const findRecipe = (items: any[]) => {
					return items.find(item => {
						const type = item['@type'];
						if (Array.isArray(type)) {
							return type.includes('Recipe') || type.includes('http://schema.org/Recipe');
						}
						return type === 'Recipe' || type === 'http://schema.org/Recipe';
					});
				};

				if (Array.isArray(data)) {
					const recipe = findRecipe(data);
					if (recipe) recipeData = recipe;
				} else {
					const type = data['@type'];
					let isRecipe = false;
					if (Array.isArray(type)) {
						isRecipe = type.includes('Recipe') || type.includes('http://schema.org/Recipe');
					} else {
						isRecipe = type === 'Recipe' || type === 'http://schema.org/Recipe';
					}

					if (isRecipe) {
						recipeData = data;
					} else if (data['@graph']) {
						const recipe = findRecipe(data['@graph']);
						if (recipe) recipeData = recipe;
					}
				}
			} catch (e) {
				console.error('Failed to parse JSON-LD', e);
			}
		});
		return recipeData;
	}

	/**
	 * Extracts the image URL from the JSON-LD image field.
	 * Handles string, array, or object formats.
	 * @param image - The image field from JSON-LD.
	 * @returns The image URL or undefined.
	 */
	private extractImage(image: any): string | undefined {
		if (!image) return undefined;
		if (typeof image === 'string') return image;
		if (Array.isArray(image)) return image[0];
		if (image.url) return image.url;
		return undefined;
	}

	/**
	 * Normalizes a list of ingredients or strings.
	 * Formats decimal amounts to fractions.
	 * @param list - The list to normalize.
	 * @returns An array of formatted strings.
	 */
	private normalizeList(list: any): string[] {
		if (!list) return [];
		if (typeof list === 'string') return [this.formatIngredient(list)];
		if (Array.isArray(list)) return list.map(item => this.formatIngredient(item.toString()));
		return [];
	}

	/**
	 * Formats an ingredient string, converting decimals to fractions.
	 * @param ingredient - The ingredient string.
	 * @returns The formatted ingredient string.
	 */
	public formatIngredient(ingredient: string): string {
		// Regex to find decimal numbers (e.g., 0.33, 1.5, .5)
		return ingredient.replace(/(\d*\.\d+)/g, (match) => {
			try {
				const frac = new Fraction(match);
				// Simplify to reasonable fractions (e.g. 1/3 instead of 3333/10000)
				// We can use string matching for common cooking fractions or just                // If it's a whole number, return it
				if (frac.mod(1).equals(0)) return frac.toFraction(true);

				// Simplify to reasonable fractions (e.g. 1/3 instead of 3333/10000)
				// Limit the denominator to common cooking denominators: 2, 3, 4, 8, 16
				const commonDenominators = [2, 3, 4, 8, 16];
				let bestDiff = Number.MAX_VALUE;
				let bestFrac = frac;

				// Check if it's close to a whole number
				if (Math.abs(frac.valueOf() - Math.round(frac.valueOf())) < 0.01) {
					return Math.round(frac.valueOf()).toString();
				}

				for (const d of commonDenominators) {
					const n = Math.round(frac.valueOf() * d);
					const diff = Math.abs(frac.valueOf() - n / d);
					if (diff < bestDiff) {
						bestDiff = diff;
						bestFrac = new Fraction(n, d);
					}
				}

				// If the best approximation is close enough (e.g. within 5%), use it
				if (bestDiff < 0.05) {
					return bestFrac.toFraction(true); // true for mixed numbers (1 1/2)
				}

				// Otherwise return original rounded to 2 decimals
				return parseFloat(match).toFixed(2);

			} catch (e) {
				return match;
			}
		});
	}

	/**
	 * Normalizes a list of strings without fraction formatting.
	 * Used for cuisines and categories.
	 * @param list - The list to normalize.
	 * @returns An array of strings.
	 */
	private normalizeStringArray(list: any): string[] {
		if (!list) return [];
		if (typeof list === 'string') return [list];
		if (Array.isArray(list)) return list.map(item => item.toString());
		return [];
	}

	/**
	 * Normalizes recipe instructions.
	 * Handles string, array of strings, or array of objects (HowToStep).
	 * @param instructions - The instructions field from JSON-LD.
	 * @returns An array of instruction strings.
	 */
	private normalizeInstructions(instructions: any): string[] {
		if (!instructions) return [];
		if (typeof instructions === 'string') return [instructions];
		if (Array.isArray(instructions)) {
			return instructions.map(item => {
				if (typeof item === 'string') return item;
				if (item.text) return item.text;
				if (item.name) return item.name;
				return '';
			}).filter(s => s.length > 0);
		}
		return [];
	}

	/**
	 * Formats an ISO 8601 duration string to a human-readable format.
	 * @param duration - The ISO 8601 duration string (e.g., PT1H30M).
	 * @returns The formatted duration string (e.g., 1h 30m).
	 */
	private formatDuration(duration: string): string | undefined {
		if (!duration) return undefined;
		// Simple ISO 8601 duration parser (PT1H30M -> 1h 30m)
		// This is a basic implementation, could be improved with a library if needed
		if (!duration.startsWith('PT')) return duration;

		let output = '';
		const hoursMatch = duration.match(/(\d+)H/);
		const minsMatch = duration.match(/(\d+)M/);

		if (hoursMatch) output += `${hoursMatch[1]}h `;
		if (minsMatch) output += `${minsMatch[1]}m`;

		return output.trim() || undefined;
	}

	/**
	 * Formats the recipe yield.
	 * @param recipeYield - The yield field from JSON-LD.
	 * @returns The formatted yield string.
	 */
	private formatYield(recipeYield: any): string | undefined {
		if (!recipeYield) return undefined;
		if (typeof recipeYield === 'string') return recipeYield;
		if (Array.isArray(recipeYield)) return recipeYield[0]; // Often comes as ["4 servings"]
		return undefined;
	}

	/**
	 * Extracts nutrition information from the JSON-LD nutrition object.
	 * Selects specific fields and formats keys.
	 * @param nutrition - The nutrition object from JSON-LD.
	 * @returns A record of nutrition labels and values.
	 */
	private extractNutrition(nutrition: any): Record<string, string> | undefined {
		if (!nutrition) return undefined;
		const result: Record<string, string> = {};
		const keys = ['calories', 'proteinContent', 'fatContent', 'carbohydrateContent', 'fiberContent', 'sugarContent', 'sodiumContent'];

		keys.forEach(key => {
			if (nutrition[key]) {
				// Clean up key name for display (proteinContent -> Protein)
				const displayKey = key.replace('Content', '');
				const capitalized = displayKey.charAt(0).toUpperCase() + displayKey.slice(1);
				result[capitalized] = nutrition[key];
			}
		});

		return Object.keys(result).length > 0 ? result : undefined;
	}
}
