// Test script to verify AI SDK works with dynamic imports
const path = require('path');

async function testAISDK() {
  console.log('Testing Vercel AI SDK with Gemini CLI provider...\n');
  
  // Dynamic imports for ESM modules
  const { generateText } = await import('ai');
  const { createGeminiProvider } = await import('ai-sdk-provider-gemini-cli');
  
  // Create the provider - explicitly use consumer OAuth, not Vertex AI
  const gemini = createGeminiProvider({
    authType: 'oauth-personal',
    // Don't use Vertex AI - use consumer Gemini
    useVertexAI: false
  });
  
  try {
    // Test with a simple prompt
    console.log('Sending test prompt...');
    const { text } = await generateText({
      model: gemini('gemini-2.5-flash'),
      prompt: 'Say "AI SDK is working with Gemini!" in exactly 10 words.',
      temperature: 0
    });
    
    console.log('✅ Response:', text);
    
    // Test with PDF if available
    const pdfPath = path.join(__dirname, 'uploads/1755291805044-1755280421774-f1065sk1_MarkCuban_filled_corrected.pdf');
    console.log('\nTesting PDF analysis...');
    
    const { text: pdfResult } = await generateText({
      model: gemini('gemini-2.5-flash'),
      prompt: `Look at the PDF at: ${pdfPath}\n\nWhat type of document is this? Answer in one sentence.`,
      temperature: 0
    });
    
    console.log('✅ PDF Analysis:', pdfResult);
    
    console.log('\n🎉 SUCCESS! The AI SDK with Gemini CLI provider is working!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAISDK().catch(console.error);