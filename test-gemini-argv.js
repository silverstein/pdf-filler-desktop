// Monkey-patch to see what Gemini CLI receives
const origArgv = process.argv;
process.argv = process.argv.filter(arg => !arg.includes('test-gemini-argv.js'));
console.log('Filtered argv:', process.argv);
console.log('Original argv:', origArgv);

// Now require the actual Gemini CLI
require('/Users/silverbook/Sites/gemini-pdf-filler/gemini-cli-local/node_modules/@google/gemini-cli/dist/index.js');
