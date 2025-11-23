import { Notice } from 'obsidian';

/**
 * Handles API errors and shows user-friendly error messages
 * @param error - The error object from the API call
 * @param apiName - Name of the API (e.g., "USDA", "Spoonacular")
 * @param debugMode - Whether to log detailed error information
 * @returns User-friendly error message
 */
export function handleApiError(error: any, apiName: string, debugMode: boolean = false): string {
	let userMessage = '';
	let detailedMessage = '';

	// Network/Connection errors
	if (error.message && (
		error.message.includes('fetch') ||
		error.message.includes('network') ||
		error.message.includes('ENOTFOUND') ||
		error.message.includes('ECONNREFUSED') ||
		error.message.includes('timeout')
	)) {
		userMessage = `Network error: Unable to connect to ${apiName} API. Please check your internet connection.`;
		detailedMessage = `Network/Connection Error: ${error.message}`;
	}
	// HTTP Status errors
	else if (error.status) {
		switch (error.status) {
			case 401:
			case 403:
				userMessage = `${apiName} API authentication failed. Please check your API key in settings.`;
				detailedMessage = `HTTP ${error.status}: Invalid or missing API key`;
				break;
			case 404:
				userMessage = `${apiName} API endpoint not found. The API may have changed.`;
				detailedMessage = `HTTP 404: Endpoint not found`;
				break;
			case 429:
				userMessage = `${apiName} API rate limit exceeded. Please try again later.`;
				detailedMessage = `HTTP 429: Rate limit exceeded`;
				break;
			case 500:
			case 502:
			case 503:
			case 504:
				userMessage = `${apiName} API is experiencing issues. Please try again later.`;
				detailedMessage = `HTTP ${error.status}: Server error`;
				break;
			default:
				userMessage = `${apiName} API error (${error.status}). Please try again.`;
				detailedMessage = `HTTP ${error.status}: ${error.message || 'Unknown error'}`;
		}
	}
	// JSON parsing errors
	else if (error instanceof SyntaxError || error.message?.includes('JSON')) {
		userMessage = `${apiName} API returned invalid data. The service may be experiencing issues.`;
		detailedMessage = `JSON Parse Error: ${error.message}`;
	}
	// Generic errors
	else {
		userMessage = `${apiName} API error: ${error.message || 'Unknown error'}. Please try again.`;
		detailedMessage = error.message || 'Unknown error';
	}

	// Show notice to user
	new Notice(userMessage);

	// Log detailed error in debug mode
	if (debugMode) {
		console.error(`[${apiName} API Error]`, detailedMessage);
		console.error('Full error object:', error);
	}

	return userMessage;
}

/**
 * Wraps an API call with timeout handling
 * @param apiCall - Promise from the API call
 * @param timeoutMs - Timeout in milliseconds (default: 30s)
 * @param apiName - Name of the API for error messages
 * @returns Promise that rejects on timeout
 */
export async function withTimeout<T>(
	apiCall: Promise<T>,
	timeoutMs: number = 30000,
	apiName: string
): Promise<T> {
	const timeout = new Promise<T>((_, reject) => {
		setTimeout(() => {
			reject(new Error(`${apiName} API request timed out after ${timeoutMs / 1000}s`));
		}, timeoutMs);
	});

	return Promise.race([apiCall, timeout]);
}
