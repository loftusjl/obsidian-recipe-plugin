# Obsidian Recipe Plugin

A powerful Obsidian plugin to manage your recipes and grocery lists. Scrape recipes from the web, calculate nutrition facts, and automatically organize ingredients into categorized grocery lists.

## Features

### Recipe Management
- **Recipe Scraping**: Scrape recipes from URLs with automatic metadata extraction (ingredients, instructions, nutrition, cooking times)
- **Manual Recipe Creation**: Create recipes from scratch with image paste support
- **Edit/Fill Recipe**: Update existing recipes, add missing information, or replace images
- **Pixel Banner Support**: Automatically downloads and embeds recipe images with banner display

### Nutrition Analysis
- **Calculate Nutrition Facts**: Automatically analyze recipe ingredients using USDA FoodData Central and Open Food Facts APIs
- **Dual API Integration**: Primary USDA database with crowd-sourced Open Food Facts fallback
- **Smart Parsing**: Intelligently extracts quantities, units, and ingredient names from complex recipe formats
- **Per-Serving Calculations**: Shows both total recipe and per-serving nutrition in one table

### Grocery List Management
- **Smart Categorization**: Uses the [Spoonacular API](https://spoonacular.com/food-api) to categorize ingredients by grocery aisle
- **Ingredient Selection**: Review and select specific ingredients from a recipe before adding
- **Manual Entry**: Quickly add items to your grocery list with auto-categorization

## Installation

### Manual Installation
1. Download the latest release (main.js, manifest.json, styles.css).
2. Create a folder named `obsidian-recipe-plugin` in your vault's `.obsidian/plugins/` directory.
3. Copy the files into that folder.
4. Reload Obsidian.
5. Enable "Recipe Plugin" in **Settings > Community Plugins**.

## Setup

### Required
- **Obsidian**: Version 0.15.0 or higher

### Optional API Keys
1. **USDA FoodData Central** (for nutrition facts):
   - Get a free API key at [api.data.gov/signup](https://api.data.gov/signup)
   - Enter in **Settings > Recipe Plugin > USDA API Key**
   - If not provided, nutrition calculator uses only Open Food Facts (still works great!)

2. **Spoonacular** (for grocery categorization):
   - Sign up at [Spoonacular](https://spoonacular.com/food-api)
   - Enter in **Settings > Recipe Plugin > Spoonacular API Key**

### Plugin Configuration
- **Grocery List Path**: Where to save your grocery list (default: `Grocery List.md`)
- **Recipe Inbox Path**: Where new recipes are saved (default: `Recipe Inbox`)
- **Debug Mode**: Enable detailed logging for troubleshooting

## Usage

### Scraping Recipes from URLs
1. Open the Command Palette (`Ctrl/Cmd + P`)
2. Run: `Recipe Plugin: Scrape Recipe from URL`
3. Enter the recipe URL
4. The plugin will create a formatted note with:
   - Recipe title, description, and source URL
   - Downloaded image with banner display
   - Complete ingredients and instructions
   - Nutrition data (if available from source)
   - Cooking times and yield information
   - Auto-generated tags from cuisine and category

### Creating Manual Recipes
1. Run: `Recipe Plugin: Create Manual Recipe`
2. Fill in the recipe details:
   - Title (required)
   - URL, Description, Ingredients, Instructions
   - Nutrition facts (optional)
   - Paste an image directly (Ctrl+V)
3. Click **Create Recipe**

### Editing Existing Recipes
1. Open a recipe note
2. Run: `Recipe Plugin: Edit/Fill Recipe`
3. The modal pre-populates with existing data
4. Update any fields (leave unchanged fields as-is)
5. Paste a new image to replace the existing one
6. Click **Update Recipe**

**Note**: Only works with recipes created by this plugin (contains `recipe-plugin: true` in frontmatter)

### Calculating Nutrition Facts
1. Open a recipe note
2. Run: `Recipe Plugin: Calculate Nutrition Facts`
3. Click **Calculate Nutrition**
4. Review the results:
   - Real-time progress for each ingredient
   - Total recipe nutrition
   - Per-serving nutrition (if yield is specified)
5. Click **Save to Recipe** to add nutrition table

**Example Output**:
```markdown
## Nutrition
Servings: 8

| Nutrient | Total Recipe | Per Serving |
| :--- | ---: | ---: |
| **Calories** | 2450 kcal | 306 kcal |
| **Protein** | 65.3g | 8.2g |
| **Fat** | 120.5g | 15.1g |
| **Carbohydrates** | 280.1g | 35.0g |
```

### Adding Ingredients to Grocery List
1. Open a recipe note
2. Run: `Recipe Plugin: Add ingredients to Grocery List`
3. Uncheck any items you already have
4. Click **Add to Grocery List**
5. Ingredients are auto-categorized by aisle

### Manual Grocery Items
1. Run: `Recipe Plugin: Add manual item to Grocery List`
2. Enter items one per line (e.g., `1 gallon milk`)
3. Click **Add to Grocery List**

## Features in Detail

### Smart Ingredient Parsing
The nutrition calculator intelligently handles complex ingredient formats:
- Extracts quantities from parentheses: `1 (2-1/2 to 3 lb) salmon` → `2.5 lb salmon`
- Removes descriptive text: `freshly ground black pepper` → `black pepper`
- Handles fractions and mixed numbers: `1 1/2 cups` → `1.5 cups`
- Strips preparation instructions: `2 cups flour, sifted` → `2 cups flour`

### Custom Section Preservation
The Edit Recipe modal preserves any custom sections you add to recipes (like "Notes", "Tips", "Variations"), only updating the fields you change.

### Nutrition Data Sources
- **USDA FoodData Central**: Authoritative government database (1000 requests/hour)
- **Open Food Facts**: Crowd-sourced global database (unlimited)

## Debugging

Enable **Debug Mode** in plugin settings for detailed logging to the Developer Console (`Ctrl+Shift+I`). Useful for:
- API request/response inspection
- Ingredient parsing troubleshooting
- Recipe scraping issues

## Development

```bash
# Clone repository
git clone https://github.com/loftusjl/obsidian-recipe-plugin.git

# Install dependencies
npm install

# Development mode (watch)
npm run dev

# Production build
npm run build
```

## License

GPL-3.0
