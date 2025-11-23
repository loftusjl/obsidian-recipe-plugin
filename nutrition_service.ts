import { requestUrl } from 'obsidian';
import { handleApiError, withTimeout } from './error_handler';

/**
 * Represents parsed ingredient with quantity, unit, and food name
 */
export interface ParsedIngredient {
	/** Original ingredient text */
	original: string;
	/** Parsed quantity (e.g., 2, 1.5) */
	quantity: number;
	/** Unit of measurement (e.g., "cup", "tbsp", "g") */
	unit: string;
	/** Name of the food item (e.g., "flour", "sugar") */
	foodName: string;
}

/**
 * Nutrition data per 100g of food
 */
export interface NutritionData {
	/** Name of the food item */
	foodName: string;
	/** Source of the data (USDA or Open Food Facts) */
	source: 'USDA' | 'OpenFoodFacts';
	/** Calories (kcal) per 100g */
	calories?: number;
	/** Protein (g) per 100g */
	protein?: number;
	/** Fat (g) per 100g */
	fat?: number;
	/** Carbohydrates (g) per 100g */
	carbohydrates?: number;
	/** Fiber (g) per 100g */
	fiber?: number;
	/** Sugar (g) per 100g */
	sugar?: number;
	/** Sodium (mg) per 100g */
	sodium?: number;
}

/**
 * Total nutrition values for entire recipe
 */
export interface NutritionTotals {
	/** Total calories (kcal) */
	calories: number;
	/** Total protein (g) */
	protein: number;
	/** Total fat (g) */
	fat: number;
	/** Total carbohydrates (g) */
	carbohydrates: number;
	/** Total fiber (g) */
	fiber: number;
	/** Total sugar (g) */
	sugar: number;
	/** Total sodium (mg) */
	sodium: number;
}

/**
 * Service for fetching and calculating nutrition facts from USDA and Open Food Facts APIs
 */
export class NutritionService {
	private usdaApiKey: string;
	private debugMode: boolean;

	/**
	 * Creates a new NutritionService instance
	 * @param usdaApiKey - Optional USDA FoodData Central API key. If not provided, only Open Food Facts will be used.
	 * @param debugMode - Enable verbose logging to console
	 */
	constructor(usdaApiKey: string = '', debugMode: boolean = false) {
		this.usdaApiKey = usdaApiKey;
		this.debugMode = debugMode;
	}

	/**
	 * Parses ingredient text to extract quantity, unit, and food name
	 * @param ingredientText - Raw ingredient text (e.g., "2 cups all-purpose flour")
	 * @returns Parsed ingredient object with quantity, unit, and food name
	 * @example
	 * parseIngredientText("2 cups flour") 
	 * // Returns: { original: "2 cups flour", quantity: 2, unit: "cup", foodName: "flour" }
	 * @example
	 * parseIngredientText("1 (2-1/2 to 3 lb) salmon fillet")
	 * // Returns: { original: "...", quantity: 2.5, unit: "lb", foodName: "salmon" }
	 */
	parseIngredientText(ingredientText: string): ParsedIngredient {
		const original = ingredientText;

		// Step 1: Remove parenthetical information and extract weight/quantity info from it
		let cleaned = ingredientText;
		const parenMatch = cleaned.match(/\(([^)]+)\)/);
		if (parenMatch) {
			// Check if parentheses contain weight info like "(2-1/2 to 3 lb)"
			const parenContent = parenMatch[1];
			const weightMatch = parenContent.match(/([\d\s\-\/\.]+)\s*(lb|oz|g|kg|pound|ounce)/i);
			if (weightMatch) {
				// Extract the first number from the range (e.g., "2-1/2" from "2-1/2 to 3 lb")
				const weightNum = weightMatch[1].trim().split(/\s+to\s+|[\s\-]+/)[0];
				// Replace original with just the weight info
				cleaned = weightNum + ' ' + weightMatch[2] + ' ' + cleaned.replace(/\([^)]+\)/, '').trim();
			} else {
				// Just remove parentheses if no weight info
				cleaned = cleaned.replace(/\([^)]+\)/g, '').trim();
			}
		}

		// Step 2: Remove commas and everything after them (e.g., ", firmly packed")
		cleaned = cleaned.replace(/,.*$/, '').trim();

		// Step 3: Parse quantity, unit, and food name
		// Match: [quantity] [unit] [descriptors] [food name]
		// Quantity: number, fraction, or mixed number
		// Unit: common cooking units
		// Descriptors: words like "freshly ground", "all-purpose", etc.
		const unitPattern = '(cup|cups|tablespoon|tablespoons|tbsp|teaspoon|teaspoons|tsp|pound|pounds|lb|ounce|ounces|oz|gram|grams|g|kilogram|kilograms|kg|ml|l|liter|liters)';
		const quantityPattern = '(\\d+(?:\\s+\\d+/\\d+)?|\\d+/\\d+|\\d+\\.?\\d*)';

		// Try to match: quantity + unit + rest
		const pattern = new RegExp(`^${quantityPattern}\\s*${unitPattern}\\s+(.+)$`, 'i');
		const match = cleaned.match(pattern);

		if (!match) {
			// No standard pattern matched, treat entire text as food name
			// But try to extract just the main ingredient (first 1-2 significant words)
			const foodName = this.extractMainIngredient(cleaned);
			return {
				original,
				quantity: 1,
				unit: '',
				foodName
			};
		}

		// Parse quantity
		let quantity = 1;
		const quantityStr = match[1];

		if (quantityStr.includes('/')) {
			const parts = quantityStr.trim().split(/\s+/);
			if (parts.length === 2) {
				// Mixed number like "1 1/2"
				const whole = parseInt(parts[0]);
				const [num, denom] = parts[1].split('/').map(Number);
				quantity = whole + (num / denom);
			} else {
				// Simple fraction like "1/2"
				const [num, denom] = quantityStr.split('/').map(Number);
				quantity = num / denom;
			}
		} else {
			quantity = parseFloat(quantityStr);
		}

		const unit = match[2].toLowerCase();
		let foodName = match[3].trim();

		// Step 4: Extract main ingredient from descriptive text
		// Remove common descriptors and get core ingredient
		foodName = this.extractMainIngredient(foodName);

		return { original, quantity, unit, foodName };
	}

	/**
	 * Extracts the main ingredient name from descriptive text
	 * Removes common descriptors like "freshly ground", "all-purpose", etc.
	 * @param text - Descriptive ingredient text
	 * @returns Cleaned main ingredient name
	 * @private
	 * @example
	 * extractMainIngredient("freshly ground black pepper") // "black pepper"
	 * extractMainIngredient("all-purpose flour") // "flour"
	 */
	private extractMainIngredient(text: string): string {
		// Common descriptors to remove (but keep the actual ingredient)
		const descriptors = [
			'freshly ground', 'fresh', 'frozen', 'raw', 'cooked',
			'all-purpose', 'whole wheat', 'self-rising',
			'kosher', 'sea', 'table',
			'packed', 'firmly packed', 'lightly packed',
			'chopped', 'diced', 'minced', 'sliced',
			'peeled', 'skinless', 'boneless',
			'extra virgin', 'virgin', 'light', 'dark',
			'unsalted', 'salted',
			'organic', 'free-range',
			'finely', 'coarsely', 'roughly'
		];

		let cleaned = text.toLowerCase();

		// Remove descriptors
		for (const descriptor of descriptors) {
			cleaned = cleaned.replace(new RegExp(`\\b${descriptor}\\b`, 'g'), '');
		}

		// Clean up extra spaces
		cleaned = cleaned.replace(/\s+/g, ' ').trim();

		// If we're left with just 1-2 words, that's probably the ingredient
		const words = cleaned.split(' ').filter(w => w.length > 0);

		// Keep last 1-2 significant words (the actual ingredient)
		if (words.length > 2) {
			cleaned = words.slice(-2).join(' ');
		}

		return cleaned || text; // Fallback to original if cleaning removed everything
	}

	/**
	 * Searches for food nutrition data using USDA API (if key available) or Open Food Facts
	 * @param foodName - Name of the food to search for
	 * @returns Nutrition data per 100g or null if not found
	 */
	async searchFood(foodName: string): Promise<NutritionData | null> {
		if (this.debugMode) {
			console.log(`[NutritionService] Searching for: ${foodName}`);
		}

		// Try USDA first if API key is available
		if (this.usdaApiKey) {
			const usdaData = await this.searchUSDA(foodName);
			if (usdaData) return usdaData;

			if (this.debugMode) {
				console.log(`[NutritionService] Not found in USDA, trying Open Food Facts`);
			}
		}

		// Fallback to Open Food Facts
		return await this.searchOpenFoodFacts(foodName);
	}

	/**
	 * Searches USDA FoodData Central API for nutrition data
	 * @param foodName - Name of the food to search for
	 * @returns Nutrition data from USDA or null if not found
	 * @private
	 */
	private async searchUSDA(foodName: string): Promise<NutritionData | null> {
		try {
			const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(foodName)}&api_key=${this.usdaApiKey}`;

			// Add timeout wrapper to prevent hanging requests
			const response = await withTimeout(
				requestUrl({
					url,
					method: 'GET',
					headers: {
						'User-Agent': 'ObsidianRecipePlugin/1.0'
					}
				}),
				15000, // 15 second timeout
				'USDA'
			);

			const data = response.json;

			if (!data.foods || data.foods.length === 0) {
				if (this.debugMode) {
					console.log(`[NutritionService] No results found in USDA for: ${foodName}`);
				}
				return null;
			}

			// Take the first result
			const food = data.foods[0];
			const nutrients = food.foodNutrients || [];

			// Extract key nutrients (nutrient IDs from USDA)
			const getNutrient = (id: number) => {
				const nutrient = nutrients.find((n: any) => n.nutrientId === id);
				return nutrient ? parseFloat(nutrient.value) : undefined;
			};

			return {
				foodName: food.description,
				source: 'USDA',
				calories: getNutrient(1008), // Energy (kcal)
				protein: getNutrient(1003), // Protein
				fat: getNutrient(1004), // Total fat
				carbohydrates: getNutrient(1005), // Carbohydrates
				fiber: getNutrient(1079), // Fiber
				sugar: getNutrient(2000), // Sugars
				sodium: getNutrient(1093) // Sodium (mg)
			};
		} catch (error) {
			handleApiError(error, 'USDA FoodData Central', this.debugMode);
			return null;
		}
	}

	/**
	 * Searches Open Food Facts API for nutrition data
	 * @param foodName - Name of the food to search for
	 * @returns Nutrition data from Open Food Facts or null if not found
	 * @private
	 */
	private async searchOpenFoodFacts(foodName: string): Promise<NutritionData | null> {
		try {
			const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(foodName)}&json=1&page_size=1`;

			// Add timeout wrapper to prevent hanging requests
			const response = await withTimeout(
				requestUrl({
					url,
					method: 'GET',
					headers: {
						'User-Agent': 'ObsidianRecipePlugin/1.0 (obsidian-recipe-plugin@github.com)'
					}
				}),
				15000, // 15 second timeout
				'Open Food Facts'
			);

			const data = response.json;

			if (!data.products || data.products.length === 0) {
				if (this.debugMode) {
					console.log(`[NutritionService] No results found in Open Food Facts for: ${foodName}`);
				}
				return null;
			}

			const product = data.products[0];
			const nutriments = product.nutriments || {};

			return {
				foodName: product.product_name || foodName,
				source: 'OpenFoodFacts',
				calories: nutriments.energy_100g ? nutriments.energy_100g / 4.184 : undefined, // Convert kJ to kcal
				protein: nutriments.proteins_100g,
				fat: nutriments.fat_100g,
				carbohydrates: nutriments.carbohydrates_100g,
				fiber: nutriments.fiber_100g,
				sugar: nutriments.sugars_100g,
				sodium: nutriments.sodium_100g ? nutriments.sodium_100g * 1000 : undefined // Convert g to mg
			};
		} catch (error) {
			handleApiError(error, 'Open Food Facts', this.debugMode);
			return null;
		}
	}

	/**
	 * Converts ingredient quantity and unit to grams for nutrition calculation
	 * Uses common conversion factors for cooking ingredients
	 * @param quantity - Numeric quantity
	 * @param unit - Unit of measurement
	 * @param foodName - Name of the food (used for density-specific conversions)
	 * @returns Estimated weight in grams
	 * @remarks
	 * Volume-to-weight conversions are approximate and based on common ingredient densities.
	 * For more accurate results, users should provide weights in grams when possible.
	 */
	convertToGrams(quantity: number, unit: string, foodName: string): number {
		unit = unit.toLowerCase();

		// Common weight units
		const weightConversions: Record<string, number> = {
			'g': 1,
			'gram': 1,
			'grams': 1,
			'kg': 1000,
			'kilogram': 1000,
			'kilograms': 1000,
			'oz': 28.35,
			'ounce': 28.35,
			'ounces': 28.35,
			'lb': 453.59,
			'pound': 453.59,
			'pounds': 453.59
		};

		if (unit in weightConversions) {
			return quantity * weightConversions[unit];
		}

		// Volume conversions (approximate, food-dependent)
		// Format: { unit: ml }
		const volumeConversions: Record<string, number> = {
			'cup': 240,
			'cups': 240,
			'tbsp': 15,
			'tablespoon': 15,
			'tablespoons': 15,
			'tsp': 5,
			'teaspoon': 5,
			'teaspoons': 5,
			'ml': 1,
			'milliliter': 1,
			'milliliters': 1,
			'l': 1000,
			'liter': 1000,
			'liters': 1000
		};

		if (unit in volumeConversions) {
			const ml = quantity * volumeConversions[unit];
			// Convert ml to grams using approximate density
			// Most liquids and soft solids ≈ 1 g/ml
			// Special cases for common ingredients
			const densities: Record<string, number> = {
				'flour': 0.5, // 1 ml flour ≈ 0.5g
				'sugar': 0.85,
				'butter': 0.95,
				'oil': 0.92,
				'honey': 1.4,
				'milk': 1.03,
				'water': 1.0
			};

			// Check if food name contains any known ingredient
			for (const [ingredient, density] of Object.entries(densities)) {
				if (foodName.toLowerCase().includes(ingredient)) {
					return ml * density;
				}
			}

			// Default: assume 1 g/ml
			return ml;
		}

		// If no unit or unknown unit, assume it's already in grams or treat as 100g per unit
		return quantity * 100;
	}

	/**
	 * Calculates total nutrition for a list of ingredients
	 * @param ingredients - Array of parsed ingredients with nutrition data
	 * @returns Total nutrition values for all ingredients combined
	 */
	async calculateRecipeNutrition(ingredients: ParsedIngredient[]): Promise<NutritionTotals> {
		const totals: NutritionTotals = {
			calories: 0,
			protein: 0,
			fat: 0,
			carbohydrates: 0,
			fiber: 0,
			sugar: 0,
			sodium: 0
		};

		for (const ingredient of ingredients) {
			const nutritionData = await this.searchFood(ingredient.foodName);

			if (!nutritionData) {
				if (this.debugMode) {
					console.warn(`[NutritionService] No nutrition data found for: ${ingredient.foodName}`);
				}
				continue;
			}

			// Convert ingredient quantity to grams
			const grams = this.convertToGrams(ingredient.quantity, ingredient.unit, ingredient.foodName);

			// Calculate nutrition values (nutrition data is per 100g)
			const factor = grams / 100;

			if (nutritionData.calories) totals.calories += nutritionData.calories * factor;
			if (nutritionData.protein) totals.protein += nutritionData.protein * factor;
			if (nutritionData.fat) totals.fat += nutritionData.fat * factor;
			if (nutritionData.carbohydrates) totals.carbohydrates += nutritionData.carbohydrates * factor;
			if (nutritionData.fiber) totals.fiber += nutritionData.fiber * factor;
			if (nutritionData.sugar) totals.sugar += nutritionData.sugar * factor;
			if (nutritionData.sodium) totals.sodium += nutritionData.sodium * factor;
		}

		// Round to 1 decimal place
		Object.keys(totals).forEach(key => {
			totals[key as keyof NutritionTotals] = Math.round(totals[key as keyof NutritionTotals] * 10) / 10;
		});

		return totals;
	}
}
