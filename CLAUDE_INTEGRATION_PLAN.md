# Claude Code Integration Planning Document
## Multi-Provider PDF Filler Desktop App

### Executive Summary
This document provides a comprehensive plan to integrate Claude Code authentication and PDF processing capabilities into the existing multi-provider PDF Filler Desktop app, alongside Gemini and Codex (ChatGPT) integrations.

---

## Part 1: Architecture Analysis

### Current Gemini Implementation Breakdown

#### 1.1 Authentication Architecture
```typescript
// Terminal Auth Handler Pattern (terminal-auth-handler.ts)
├── checkAuthStatus()      // Checks ~/.gemini/oauth_creds.json
├── startAuth()             // Opens terminal window for OAuth
├── clearAuth()             // Removes credential files
└── getUserEmail()          // Extracts email from accounts.json
```

**Key Components:**
- **Local credential storage**: `gemini-cli-local/.gemini/`
- **OAuth flow**: Uses Google account authentication
- **Terminal window**: Custom Electron window (600x400px) with mono theme
- **Auto-detection**: Polls for credential file creation

#### 1.2 CLI Service Architecture
```typescript
// GeminiCLIService Pattern (gemini-cli.service.ts)
├── checkGeminiCLI()        // Verifies CLI binary exists
├── checkAuthStatus()       // Verifies user authenticated
├── callGemini()            // Core execution method
├── extractPDFData()        // PDF extraction operations
├── validatePDFForm()       // Form validation
└── generateFillInstructions() // Fill instructions generation
```

**Technical Details:**
- **Node binary resolution**: Electron's Node or system Node
- **Electron shim**: Normalizes argv for yargs compatibility
- **MCP filesystem server**: Direct PDF access via absolute paths
- **Environment isolation**: Custom HOME for credentials
- **Rate limiting**: 50 req/min, 900 req/day

#### 1.3 PDF Processing Flow
1. User selects PDF via native dialog → absolute path
2. Service passes path to CLI: `"Analyze the PDF at: /path/to/file.pdf"`
3. CLI uses MCP filesystem server to read PDF directly
4. Response parsed as JSON
5. Cleaned and returned to UI

---

## Part 2: Claude Code Research & Capabilities

### 2.1 Authentication Mechanism
**Claude Code Pro/Max Authentication:**
- Uses `claude.ai` account credentials (Pro/Max subscription)
- Command: `claude login` (interactive terminal)
- Storage: Authentication tokens (location TBD - needs investigation)
- Alternative: API key authentication (not suitable for consumer app)

### 2.2 CLI Capabilities
**Verified Working:**
- `claude --version`: Returns version (1.0.83)
- `claude -p "prompt"`: Print mode (non-interactive)
- Basic text responses work immediately

**Requires Testing:**
- `--output-format json`: JSON output mode (timed out in test)
- `--mcp-config`: MCP server configuration
- File reading capabilities
- PDF processing abilities

### 2.3 Key Differences from Gemini CLI

| Feature | Gemini CLI | Claude Code |
|---------|------------|-------------|
| Auth Method | OAuth (Google account) | claude.ai login |
| Free Tier | 60 req/min, 1000/day | Based on Pro/Max plan |
| MCP Support | Built-in filesystem server | Unknown - needs testing |
| Print Mode | `-p` flag | `-p` flag (confirmed) |
| JSON Output | Returns raw JSON | `--output-format json` |
| PDF Reading | Via MCP filesystem | TBD - needs testing |
| Rate Limits | Fixed free tier | Plan-based |

---

## Part 3: Integration Plan

### 3.1 File Structure
```
src/
├── claude-auth-handler.ts        # NEW: Claude authentication
├── services/
│   ├── claude-cli.service.ts     # NEW: Claude CLI wrapper
│   ├── gemini-cli.service.ts     # Existing
│   └── provider-manager.ts       # NEW: Unified provider interface
├── terminal-auth-handler.ts      # Existing (Gemini)
├── codex-auth-handler.ts         # Existing (ChatGPT)
└── electron.ts                   # Modified for Claude
```

### 3.2 Claude Auth Handler Implementation
```typescript
// claude-auth-handler.ts
export class ClaudeAuthHandler {
  private claudeBinaryPath: string;
  
  constructor() {
    // Detect Claude Code binary location
    this.claudeBinaryPath = this.findClaudeBinary();
  }
  
  async findClaudeBinary(): Promise<string> {
    // Check common locations:
    // - ~/.local/bin/claude
    // - /usr/local/bin/claude
    // - System PATH
  }
  
  async checkAuthStatus(): Promise<AuthStatus> {
    // Method 1: Try a simple command
    const result = await exec('claude -p "test" --timeout 2000');
    return { authenticated: result.success };
    
    // Method 2: Look for auth files (needs discovery)
    // Similar to ~/.anthropic/api_key but for claude.ai auth
  }
  
  async startAuth(): Promise<AuthResult> {
    // Open terminal window with "claude login"
    const terminalWindow = new TerminalWindow();
    await terminalWindow.create();
    
    const script = `#!/bin/bash
claude login
`;
    
    const success = await terminalWindow.runScript(script, {
      title: 'Claude Authentication'
    });
    
    // Poll for authentication success
    return this.pollForAuth();
  }
  
  async clearAuth(): Promise<void> {
    // Execute: claude logout
    await exec('claude logout');
  }
}
```

### 3.3 Claude CLI Service Implementation
```typescript
// claude-cli.service.ts
export class ClaudeCLIService {
  private rateLimiter: RateLimiter;
  
  async callClaude(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Use -p flag for print mode
      const args = ['-p', prompt];
      
      // Optional: Add JSON output format
      // args.push('--output-format', 'json');
      
      const claude = spawn('claude', args, {
        env: {
          ...process.env,
          // May need MCP config path
          MCP_CONFIG: this.getMCPConfigPath()
        }
      });
      
      let output = '';
      claude.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      claude.on('close', (code) => {
        if (code === 0) {
          resolve(this.cleanOutput(output));
        } else {
          reject(new Error('Claude CLI failed'));
        }
      });
    });
  }
  
  async extractPDFData(options: ExtractOptions): Promise<PDFExtractionResult> {
    const { pdfPath } = options;
    const absolutePath = path.resolve(pdfPath);
    
    // Test different prompt patterns
    const prompts = [
      // Direct file reference (if Claude has file reading)
      `Extract all data from the PDF at: ${absolutePath}\nReturn as JSON.`,
      
      // MCP-style reference
      `Read the file ${absolutePath} and extract all PDF data as JSON.`,
      
      // Alternative approach if direct reading fails
      `[File: ${absolutePath}]\nExtract all form data and return as JSON.`
    ];
    
    // Try each prompt pattern
    for (const prompt of prompts) {
      try {
        const response = await this.callClaude(prompt);
        return this.parseResponse(response);
      } catch (e) {
        continue;
      }
    }
    
    throw new Error('Failed to extract PDF data');
  }
}
```

### 3.4 Provider Manager Pattern
```typescript
// provider-manager.ts
interface PDFProvider {
  name: string;
  checkAuth(): Promise<boolean>;
  startAuth(): Promise<boolean>;
  extractPDF(path: string): Promise<PDFExtractionResult>;
  validatePDF(path: string): Promise<PDFValidationResult>;
}

class ProviderManager {
  private providers: Map<string, PDFProvider>;
  private activeProvider: string;
  
  constructor() {
    this.providers = new Map([
      ['gemini', new GeminiProvider()],
      ['claude', new ClaudeProvider()],
      ['codex', new CodexProvider()]
    ]);
  }
  
  async getAvailableProviders(): Promise<string[]> {
    const available = [];
    for (const [name, provider] of this.providers) {
      if (await provider.checkAuth()) {
        available.push(name);
      }
    }
    return available;
  }
  
  setActiveProvider(name: string) {
    this.activeProvider = name;
  }
  
  async extractPDF(path: string): Promise<PDFExtractionResult> {
    const provider = this.providers.get(this.activeProvider);
    return provider.extractPDF(path);
  }
}
```

---

## Part 4: Technical Challenges & Solutions

### 4.1 Challenge: Claude File Reading Capability
**Issue:** Unlike Gemini's MCP filesystem server, Claude's file reading method is unclear.

**Investigation Steps:**
1. Test if Claude Code has built-in file reading:
   ```bash
   claude -p "Read the file /path/to/test.txt"
   ```
2. Check if Claude respects MCP_CONFIG or similar:
   ```bash
   MCP_CONFIG=./mcp.json claude -p "Read file test.pdf"
   ```
3. Test if Claude can use the Read tool in print mode

**Fallback Solutions:**
- **Option A**: Base64 encode PDF and include in prompt (size limited)
- **Option B**: Extract text from PDF first, send text to Claude
- **Option C**: Use Claude for intelligence, not direct PDF reading

### 4.2 Challenge: Authentication State Detection
**Issue:** No documented credential file location for claude.ai auth.

**Solution Approach:**
1. **Active probe**: Execute `claude -p "test"` with short timeout
2. **File discovery**: Monitor filesystem during `claude login` to find credential location
3. **Process detection**: Check if `claude` process responds without hanging

### 4.3 Challenge: JSON Output Format
**Issue:** `--output-format json` timed out in testing.

**Solutions:**
1. Use text mode and parse JSON from response
2. Add explicit "Return only JSON" to prompts
3. Implement robust JSON extraction regex

### 4.4 Challenge: Rate Limiting
**Issue:** Claude Pro/Max limits differ from Gemini's free tier.

**Solution:**
```typescript
interface ProviderLimits {
  gemini: { rpm: 60, rpd: 1000 },
  claude: { rpm: null, rpd: null }, // Discover from testing
  codex: { rpm: null, rpd: null }
}
```

### 4.5 Challenge: Terminal Window Authentication
**Issue:** Each provider needs different terminal commands.

**Solution:** Unified terminal interface:
```typescript
class AuthTerminal {
  async authenticate(provider: string): Promise<boolean> {
    const commands = {
      gemini: 'echo "1" | gemini',
      claude: 'claude login',
      codex: 'codex login'
    };
    
    return this.runCommand(commands[provider]);
  }
}
```

---

## Part 5: Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Create `claude-auth-handler.ts`
- [ ] Implement Claude binary detection
- [ ] Test authentication flow with `claude login`
- [ ] Find and document credential storage location

### Phase 2: CLI Integration (Week 1-2)
- [ ] Create `claude-cli.service.ts`
- [ ] Implement basic `callClaude()` method
- [ ] Test print mode with simple prompts
- [ ] Verify JSON output capabilities

### Phase 3: PDF Processing (Week 2)
- [ ] Test Claude's file reading capabilities
- [ ] Implement PDF extraction method
- [ ] Handle multiple prompt strategies
- [ ] Add error handling and retries

### Phase 4: UI Integration (Week 2-3)
- [ ] Add Claude to provider selection UI
- [ ] Implement provider switching logic
- [ ] Update authentication status display
- [ ] Add Claude-specific settings

### Phase 5: Testing & Optimization (Week 3)
- [ ] Test with various PDF types
- [ ] Compare accuracy across providers
- [ ] Optimize prompt engineering
- [ ] Document rate limits

---

## Part 6: Testing Strategy

### 6.1 Authentication Testing
```bash
# Test 1: Binary detection
which claude

# Test 2: Login flow
claude login

# Test 3: Auth verification
echo "test" | claude -p

# Test 4: Logout
claude logout
```

### 6.2 PDF Processing Testing
```javascript
// Test suite for Claude PDF operations
const testCases = [
  {
    name: "Simple form extraction",
    pdf: "test-forms/simple.pdf",
    expected: { name: "John Doe", age: 30 }
  },
  {
    name: "Complex form with tables",
    pdf: "test-forms/complex.pdf",
    expected: { /* ... */ }
  }
];

async function testClaudeExtraction() {
  const service = new ClaudeCLIService();
  
  for (const test of testCases) {
    const result = await service.extractPDFData({
      pdfPath: test.pdf
    });
    
    console.log(`Test: ${test.name}`);
    console.log(`Result:`, result);
    console.log(`Match:`, deepEqual(result, test.expected));
  }
}
```

### 6.3 Comparison Testing
Create benchmark suite comparing:
- Extraction accuracy
- Processing speed
- Rate limit handling
- Error recovery
- Cost efficiency

---

## Part 7: Fallback Strategies

### 7.1 If Claude Can't Read PDFs Directly
```typescript
class ClaudeWithPreprocessing {
  async extractPDF(pdfPath: string) {
    // Step 1: Use pdf-parse to extract text
    const text = await extractTextFromPDF(pdfPath);
    
    // Step 2: Send text to Claude
    const prompt = `Given this PDF content, extract all form data:
${text}

Return as JSON.`;
    
    return await this.callClaude(prompt);
  }
}
```

### 7.2 If Authentication Detection Fails
```typescript
class ClaudeAuthWithCache {
  private authCache = new Map();
  
  async checkAuth(): Promise<boolean> {
    // Check cache first
    if (this.authCache.has('claude')) {
      const cached = this.authCache.get('claude');
      if (Date.now() - cached.time < 60000) {
        return cached.auth;
      }
    }
    
    // Active probe with timeout
    try {
      await execWithTimeout('claude -p "1"', 2000);
      this.authCache.set('claude', { auth: true, time: Date.now() });
      return true;
    } catch {
      this.authCache.set('claude', { auth: false, time: Date.now() });
      return false;
    }
  }
}
```

---

## Part 8: Documentation Updates

### 8.1 Update CLAUDE.md
Add section for Claude integration:
```markdown
## Provider: Claude (Anthropic)

### Authentication
- Uses claude.ai Pro/Max account
- Run `claude login` in terminal
- No API keys needed

### Capabilities
- PDF text extraction
- Form field analysis
- Intelligent data parsing
- JSON output

### Limitations
- Requires Pro/Max subscription
- Rate limits based on plan
- May not read PDFs directly (TBD)
```

### 8.2 Update README.md
Add Claude to provider list:
```markdown
## Supported AI Providers
- ✅ **Google Gemini** - Free tier (60 req/min)
- ✅ **ChatGPT (Codex)** - OpenAI account
- 🆕 **Claude** - Pro/Max account
```

---

## Part 9: Risk Assessment

### High Risk Items
1. **File reading capability** - Critical for PDF processing
2. **JSON output reliability** - Needed for structured data
3. **Rate limit discovery** - Unknown limits could break UX

### Medium Risk Items
1. **Authentication persistence** - How long do sessions last?
2. **Error message handling** - Different error formats
3. **Cross-platform compatibility** - Windows/Linux testing

### Low Risk Items
1. **UI integration** - Standard Electron patterns
2. **Provider switching** - Already implemented for others
3. **Basic CLI execution** - Proven pattern

---

## Part 10: Success Criteria

### Minimum Viable Integration
- [ ] Claude authentication works
- [ ] Basic text prompts execute
- [ ] PDF data extraction (any method)
- [ ] JSON parsing successful
- [ ] Provider switching works

### Full Integration
- [ ] Direct PDF file reading
- [ ] Accurate form extraction
- [ ] Comparable to Gemini accuracy
- [ ] Robust error handling
- [ ] Complete UI integration

---

## Appendix A: Code Snippets for Testing

### Test Claude File Reading
```bash
# Test 1: Direct path
echo "Read the file at /tmp/test.txt" | claude -p

# Test 2: With file prefix
echo "[File: /tmp/test.txt] What does this say?" | claude -p

# Test 3: With Read tool syntax
echo "Use the Read tool to read /tmp/test.txt" | claude -p
```

### Test MCP Configuration
```javascript
// Create test MCP config
const mcpConfig = {
  "filesystem": {
    "command": "node",
    "args": ["./mcp-filesystem/index.js", "/Users/silverbook"]
  }
};

fs.writeFileSync('./test-mcp.json', JSON.stringify(mcpConfig));

// Test with config
spawn('claude', ['-p', 'Read test.pdf', '--mcp-config', './test-mcp.json']);
```

---

## Appendix B: Alternative Architectures

### Option 1: Server-Side Processing
Instead of desktop CLI, use cloud API:
- Pro: Consistent behavior
- Con: Requires API keys, costs money

### Option 2: Hybrid Approach
- Use Claude for intelligence tasks
- Use Gemini for PDF reading
- Combine strengths of each provider

### Option 3: Extension-Based
- Build as Claude Desktop extension
- Leverage built-in Claude capabilities
- Limited to Claude Desktop users

---

## Next Steps

1. **Immediate Actions:**
   - Test Claude file reading capabilities
   - Find credential storage location
   - Verify JSON output format

2. **Prototype Development:**
   - Create minimal `claude-auth-handler.ts`
   - Test authentication flow
   - Implement basic CLI wrapper

3. **Validation:**
   - Process sample PDFs
   - Compare with Gemini results
   - Document limitations

This plan provides a comprehensive roadmap for integrating Claude Code into the PDF Filler Desktop application while maintaining compatibility with existing providers.