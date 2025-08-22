// Wrapper to handle ESM module in CommonJS context
export async function createGeminiProvider(options: any) {
  // Dynamically import the ESM module
  const { createGeminiProvider: createProvider } = await import('ai-sdk-provider-gemini-cli');
  return createProvider(options);
}