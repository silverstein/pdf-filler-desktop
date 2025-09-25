const ClaudeCLIService = require('./dist/services/claude-cli.service').default;
const { GeminiCLIService } = require('./dist/services/gemini-cli.service');
const CodexCLIService = require('./dist/services/codex-cli.service').default;

async function testLogout() {
  console.log('Testing logout functionality...\n');

  try {
    // Test Claude logout
    const claude = new ClaudeCLIService();
    console.log('Testing Claude logout...');
    if (typeof claude.clearAuth === 'function') {
      await claude.clearAuth();
      console.log('✓ Claude logout successful\n');
    } else {
      console.log('✗ Claude clearAuth method not found\n');
    }

    // Test Gemini logout
    const gemini = new GeminiCLIService();
    console.log('Testing Gemini logout...');
    if (typeof gemini.clearAuth === 'function') {
      await gemini.clearAuth();
      console.log('✓ Gemini logout successful\n');
    } else {
      console.log('✗ Gemini clearAuth method not found\n');
    }

    // Test Codex logout
    const codex = new CodexCLIService();
    console.log('Testing Codex logout...');
    if (typeof codex.clearAuth === 'function') {
      await codex.clearAuth();
      console.log('✓ Codex logout successful\n');
    } else {
      console.log('✗ Codex clearAuth method not found\n');
    }

    console.log('All logout tests completed!');
  } catch (error) {
    console.error('Error during logout tests:', error);
  }
}

testLogout();