// Compare direct Gemini CLI Core vs AI SDK provider
const path = require('path');
const { spawn } = require('child_process');

async function testDirectCLI() {
  console.log('1. Testing DIRECT CLI approach (what works now):\n');
  
  const geminiPath = path.join(__dirname, 'gemini-cli-local/node_modules/.bin/gemini');
  const localHome = path.join(__dirname, 'gemini-cli-local');
  
  return new Promise((resolve) => {
    const gemini = spawn(geminiPath, ['-p', 'Say "Direct CLI works"'], {
      env: {
        ...process.env,
        HOME: localHome,
        GOOGLE_CLOUD_PROJECT: 'pdf-filler-desktop'
      }
    });
    
    let output = '';
    gemini.stdout.on('data', (data) => output += data.toString());
    gemini.on('close', () => {
      console.log('✅ Direct CLI:', output.trim());
      resolve();
    });
  });
}

async function testGeminiCLICore() {
  console.log('\n2. Testing Gemini CLI Core directly:\n');
  
  try {
    // Import the core library that both use
    const { AuthType, createContentGeneratorConfig } = await import('@google/gemini-cli-core');
    
    // Try to create a config like the provider would
    const config = createContentGeneratorConfig({
      authType: AuthType.LOGIN_WITH_GOOGLE
    });
    
    console.log('✅ Core library imported successfully');
    console.log('Config created:', config ? 'yes' : 'no');
    
  } catch (error) {
    console.log('❌ Core library error:', error.message);
  }
}

async function testAISDKProvider() {
  console.log('\n3. Testing AI SDK Provider approach:\n');
  
  // Set HOME to our local gemini directory
  process.env.HOME = path.join(__dirname, 'gemini-cli-local');
  
  const { generateText } = await import('ai');
  const { createGeminiProvider } = await import('ai-sdk-provider-gemini-cli');
  
  const gemini = createGeminiProvider({
    authType: 'oauth-personal'
  });
  
  try {
    const { text } = await generateText({
      model: gemini('gemini-2.5-flash'),
      prompt: 'Say "AI SDK works"',
      temperature: 0
    });
    console.log('✅ AI SDK:', text);
  } catch (error) {
    console.log('❌ AI SDK error:', error.message);
  }
}

(async () => {
  await testDirectCLI();
  await testGeminiCLICore();
  await testAISDKProvider();
})();