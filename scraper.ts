import { requestUrl } from 'obsidian';
import * as cheerio from 'cheerio';
import { parseIngredient, parseInstruction } from '@jlucaspains/sharp-recipe-parser';

export interface ScrapedRecipe {
	title: string;
	url: string;
	image?: string;
	ingredients: string[];
	instructions: string[];
}

export class RecipeScraper {
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
				instructions: this.normalizeInstructions(jsonLd.recipeInstructions)
			};
		}

		// 2. Fallback to meta tags for title/image
		const title = $('meta[property="og:title"]').attr('content') || $('title').text() || 'Untitled Recipe';
		const image = $('meta[property="og:image"]').attr('content');

		// 3. Fallback parsing (naive) - this is hard to do generically without JSON-LD
		// We will return empty lists and let the user fill them in, or try to find lists with specific keywords.
		// For now, let's rely on JSON-LD as it's standard for recipe sites.
		// If we really need to, we can look for elements with class "ingredient" or "instruction".

		return {
			title,
			url,
			image,
			ingredients: [],
			instructions: []
		};
	}

	private extractJsonLd($: cheerio.CheerioAPI): any | null {
		let recipeData = null;
		$('script[type="application/ld+json"]').each((i, el) => {
			try {
				const data = JSON.parse($(el).html() || '{}');
				if (Array.isArray(data)) {
					const recipe = data.find(item => item['@type'] === 'Recipe' || item['@type'] === 'http://schema.org/Recipe');
					if (recipe) recipeData = recipe;
				} else if (data['@type'] === 'Recipe' || data['@type'] === 'http://schema.org/Recipe') {
					recipeData = data;
				} else if (data['@graph']) {
					const recipe = data['@graph'].find((item: any) => item['@type'] === 'Recipe' || item['@type'] === 'http://schema.org/Recipe');
					if (recipe) recipeData = recipe;
				}
			} catch (e) {
				console.error('Failed to parse JSON-LD', e);
			}
		});
		return recipeData;
	}

	private extractImage(image: any): string | undefined {
		if (!image) return undefined;
		if (typeof image === 'string') return image;
		if (Array.isArray(image)) return image[0];
		if (image.url) return image.url;
		return undefined;
	}

	private normalizeList(list: any): string[] {
		if (!list) return [];
		if (typeof list === 'string') return [list];
		if (Array.isArray(list)) return list.map(item => item.toString());
		return [];
	}

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
}
