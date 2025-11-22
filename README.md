# Obsidian Recipe Plugin

A powerful Obsidian plugin to manage your recipes and grocery lists. Automatically parse ingredients from your recipe notes, categorize them by aisle using the Spoonacular API, and compile them into a centralized grocery list.

## Features

- **Recipe Parsing**: Automatically extracts ingredients from your recipe notes (looks for an "Ingredients" header).
- **Smart Categorization**: Uses the [Spoonacular API](https://spoonacular.com/food-api) to categorize ingredients by grocery aisle (e.g., "Produce", "Meat", "Pantry").
- **Grocery List Management**: Adds ingredients to a master `Grocery List.md` file, organized by aisle.
- **Manual Entry**: Quickly add items to your grocery list manually, which are also auto-categorized.
- **Ingredient Selection**: Review and select specific ingredients from a recipe before adding them.

## Installation

### Manual Installation
1.  Download the latest release (main.js, manifest.json, styles.css).
2.  Create a folder named `obsidian-recipe-plugin` in your vault's `.obsidian/plugins/` directory.
3.  Copy the files into that folder.
4.  Reload Obsidian.
5.  Enable "Recipe Plugin" in **Settings > Community Plugins**.

## Setup

1.  **Get an API Key**:
    - Sign up for a free account at [Spoonacular](https://spoonacular.com/food-api).
    - Copy your API Key from the console.
2.  **Configure Plugin**:
    - Open **Settings > Recipe Plugin** in Obsidian.
    - Paste your **Spoonacular API Key**.
    - (Optional) Set the **Grocery List Path** (defaults to `Grocery List.md` in the root of your vault).

## Usage

### Adding Ingredients from a Recipe
1.  Open a recipe note in Obsidian.
2.  Open the Command Palette (`Ctrl/Cmd + P`) and run:
    `Recipe Plugin: Add ingredients to Grocery List`
3.  A modal will appear with the detected ingredients.
4.  Uncheck any items you already have.
5.  Click **Add to Grocery List**.

### Adding Manual Items
1.  Open the Command Palette and run:
    `Recipe Plugin: Add manual item to Grocery List`
2.  Enter your items in the text area, one per line (e.g., `1 gallon milk`, `2 lbs ground beef`).
3.  Click **Add to Grocery List**.

### Debugging
If you encounter issues (e.g., ingredients not categorizing), enable **Debug Mode** in the plugin settings. This will log detailed API request and response information to the Obsidian Developer Console (`Ctrl+Shift+I`).

## Development

1.  Clone this repository.
2.  Run `npm install` to install dependencies.
3.  Run `npm run dev` to start compilation in watch mode.

## License

MIT
