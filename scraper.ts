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
		const response = await requestUrl({ url });
		const html = response.text;
		const $ = cheerio.load(html);

		// 1. Try JSON-LD
		const jsonLd = this.extractJsonLd($);
		if (jsonLd) {
			return {
				title: jsonLd.name || 'Untitled Recipe',
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
		const title = $('meta[property="og:title"]').attr('content') || $('title').text() || 'Untitled Recipe';
		const image = $('meta[property="og:image"]').attr('content');
		const description = $('meta[property="og:description"]').attr('content');

		// 3. Fallback parsing (naive) - this is hard to do generically without JSON-LD
		// We will return empty lists and let the user fill them in, or try to find lists with specific keywords.
		// For now, let's rely on JSON-LD as it's standard for recipe sites.
		// If we really need to, we can look for elements with class "ingredient" or "instruction".

		return {
			title,
			url,
			image,
			description,
			ingredients: [],
			instructions: []
		};
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
	private formatIngredient(ingredient: string): string {
		// Regex to find decimal numbers (e.g., 0.33, 1.5, .5)
		return ingredient.replace(/(\d*\.\d+)/g, (match) => {
			try {
				const frac = new Fraction(match);
				// Simplify to reasonable fractions (e.g. 1/3 instead of 3333/10000)
				// We can use string matching for common cooking fractions or just                // If it's a whole number, return it
				if (frac.mod(1).equals(0)) return frac.toFraction(true);

				// If it's close to a common fraction, use that
				// This is a bit heuristic. Let's try to simplify with a tolerance.
				// Actually, Fraction.js simplifies automatically. 
				// But 0.33333334326744 might become something weird.
				// Let's limit the denominator to common cooking denominators: 2, 3, 4, 8, 16

				// Custom simplification for cooking:
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
