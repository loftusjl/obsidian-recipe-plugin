# Obsidian Recipe Plugin

A powerful Obsidian plugin to manage your recipes and grocery lists. Scrape recipes from the web, calculate nutrition facts, and automatically organize ingredients into categorized grocery lists.

## Features

### Recipe Management
- **Recipe Scraping**: Scrape recipes from URLs with automatic metadata extraction (ingredients, instructions, nutrition, cooking times)
- **Manual Recipe Creation**: Create recipes from scratch with image paste support
- **Edit/Fill Recipe**: Update existing recipes, add missing information, or replace images
- **Recipe Videos**: Add video links (YouTube, Vimeo, etc.) that appear in recipes and cooking notes
- **Cook this Recipe**: Create temporary interactive cooking notes with checkboxes to track progress while cooking
- **Add Cooking Note**: Add timestamped observations and adjustments that sync between recipe and cooking note
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
- **Checkbox Lists**: All grocery items use checkboxes for tracking purchases

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
- **Grocery List Path**: Where to save your grocery list (default: `00-Grocery-Lists/Grocery List.md`)
- **Recipe Inbox Path**: Where new recipes are saved (default: `10-Recipe-Inbox`)
- **Cooking Notes Folder**: Where temporary cooking notes are saved (default: `20-Cooking-Now`)
- **Debug Mode**: Enable detailed logging for troubleshooting

> [!TIP]
> The default folder structure uses prefixes (00-, 10-, 20-) to organize your content by usage frequency, making frequently accessed items appear first in your file explorer.

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

### Using Cook this Recipe
1. Open a recipe note
2. Run: `Recipe Plugin: Cook this Recipe`
3. A temporary cooking note opens with:
   - Checkboxes for each ingredient
   - Checkboxes for each instruction step
   - Link back to original recipe
4. Check off items as you cook
5. When done, run: `Recipe Plugin: Clear Cooking Notes` to remove all temporary notes

**Benefits:**
- Track your progress while cooking
- Never lose your place in a recipe
- Temporary notes auto-deleted when finished
- Safe: only deletes notes with special marker

### Adding Cooking Notes
1. While cooking or viewing a recipe
2. Run: `Recipe Plugin: Add Cooking Note`
3. Enter your observation (e.g., "Used brown sugar - chewier!")
4. Note is added with timestamp to both recipe and cooking note
5. Future cooking sessions will show past notes

**Benefits:**
- Observations persist across cooking sessions
- Notes appear in future cooking notes automatically
- Quick anchor link navigation to notes section

### Adding Recipe Videos
**When Creating/Editing:**
- Add video URL in "Video URL" field
- Supports YouTube, Vimeo, direct video files
- Simple links for mobile compatibility

**In Recipes:**
- Quick link in description: `[Video](#video)`
- Video appears after instructions

**In Cooking Notes:**
- Quick links: `[Video](#video) | [Cooking Notes](#cooking-notes)`
- Video available while cooking

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

### Cook this Recipe Safety
Temporary cooking notes are protected by multiple safety mechanisms:
- Only notes with `temp-cooking-note: true` frontmatter are deleted
- Cannot set cooking folder to root vault (`/`)
- Path validation prevents empty or invalid folder paths
- Recipe validation ensures only valid recipes create cooking notes

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

## Changelog

### v1.1.0 (2025-11-23)

**New Features:**
- **Cook this Recipe**: Create temporary interactive cooking notes with checkboxes for ingredients and steps
- **Add Cooking Note**: Add timestamped observations that sync between recipe and active cooking note
- **Recipe Videos**: Add video URLs (YouTube, Vimeo, etc.) with quick link navigation
- **Calculate Nutrition Facts**: Analyze recipes using USDA FoodData Central and Open Food Facts APIs
- **Edit/Fill Recipe Modal**: Update existing recipes with improved image paste support
- **API Error Handling**: Comprehensive error handling with user-friendly messages for all API calls
- **Request Timeouts**: Prevent hanging on slow/unresponsive APIs

**Improvements:**
- Quick links navigation in recipes and cooking notes
- Ingredient parsing improvements for complex formats
- Per-serving nutrition calculations
- Checkbox grocery lists for tracking purchases
- All cooking notes include previous sessions' observations

### v1.0.0 (2025-11-22)

**Initial Release:**
- Recipe scraping from URLs with JSON-LD extraction
- Manual recipe creation with image paste support
- Grocery list management with aisle categorization
- Spoonacular API integration for ingredient categorization
- Pixel banner support for recipe images
- Automatic tag generation from cuisine and category

