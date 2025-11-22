import { requestUrl } from 'obsidian';

export interface Ingredient {
	name: string;
	aisle: string;
	original: string;
}

export class SpoonacularService {
	apiKey: string;
	baseUrl = 'https://api.spoonacular.com/food/ingredients/map';
	debugMode: boolean;

	constructor(apiKey: string, debugMode: boolean = false) {
		this.apiKey = apiKey;
		this.debugMode = debugMode;
	}

	async categorizeIngredients(ingredients: string[]): Promise<Ingredient[]> {
		const cleanKey = this.apiKey ? this.apiKey.trim() : '';

		if (!cleanKey) {
			console.warn('Spoonacular API key is missing.');
			return ingredients.map(name => ({ name, aisle: 'Uncategorized', original: name }));
		}

		try {
			// Using Parse Ingredients endpoint
			const parseUrl = `https://api.spoonacular.com/recipes/parseIngredients`;
			const body = `ingredientList=${encodeURIComponent(ingredients.join('\n'))}&includeNutrition=false`;

			if (this.debugMode) {
				console.log(`[Recipe Plugin] Sending request to ${parseUrl}`);
				console.log(`[Recipe Plugin] API Key length: ${cleanKey.length}`);
				console.log(`[Recipe Plugin] Body: ${body}`);
			}

			const parseResponse = await requestUrl({
				url: parseUrl,
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'x-api-key': cleanKey // Try header auth
				},
				body: body
			});

			if (this.debugMode) {
				console.log(`[Recipe Plugin] Response Status: ${parseResponse.status}`);
				console.log(`[Recipe Plugin] Response Body:`, parseResponse.json);
			}

			if (parseResponse.status === 200) {
				const data = parseResponse.json;
				return data.map((item: any) => ({
					name: item.name,
					aisle: item.aisle || 'Uncategorized',
					original: item.original
				}));
			} else {
				console.error(`[Recipe Plugin] Spoonacular API error: ${parseResponse.status}`);
				if (this.debugMode) console.error(parseResponse.text);
				return ingredients.map(name => ({ name, aisle: 'Uncategorized', original: name }));
			}

		} catch (error) {
			console.error('[Recipe Plugin] Failed to call Spoonacular API:', error);
			if (this.debugMode) console.error(error);
			return ingredients.map(name => ({ name, aisle: 'Uncategorized', original: name }));
		}
	}
}
