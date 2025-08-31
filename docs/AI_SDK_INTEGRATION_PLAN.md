# AI SDK Integration Plan for Multi-Provider Support

## Vision
Transform PDF Filler into a universal PDF processing app that works with ANY AI account users already have:
- Google Account → Gemini CLI (currently implemented)
- ChatGPT Account → Codex CLI (planned)
- Claude Account → Claude Code CLI (planned)

## Why AI SDK?

### Current Architecture (Single Provider)
```typescript
// Direct CLI spawning - works but not scalable
spawn('gemini', ['-p', prompt]);
```

### Target Architecture (Multi-Provider)
```typescript
// AI SDK abstraction - works with any provider
const provider = createProvider(userConfig);
const result = await generateText({ model: provider, prompt });
```

## Implementation Strategy

### Phase 1: Foundation ✅ COMPLETED
**Goal**: Integrate AI SDK with existing Gemini CLI while maintaining free tier

**Status**: This phase has been successfully implemented and is in production.

1. **Install AI SDK Core** ✅
   ```bash
   npm install ai @ai-sdk/openai
   ```

2. **Integrate Gemini CLI Provider** ✅
   - Using community provider by Ben Vargas: https://github.com/ben-vargas/ai-sdk-provider-gemini-cli
   - Successfully maintains OAuth authentication (no API keys required)
   - Wraps our existing local gemini-cli installation (`gemini-cli-local/`)
   - The provider integrates seamlessly with our custom OAuth flow

3. **Refactor gemini-cli.service.ts** ✅
   ```typescript
   // Before: Direct CLI calls (still available in gemini-simple.js)
   class GeminiCLIService {
     callGemini(prompt: string) {
       spawn(this.geminiPath, ['-p', prompt]);
     }
   }
   
   // After: AI SDK abstraction (implemented in ai-service.ts)
   class AIService {
     async generateContent(prompt: string) {
       const provider = this.getActiveProvider();
       return generateText({ model: provider, prompt });
     }
   }
   ```

4. **Update Existing Features** ✅
   - PDF extraction: Now uses AI SDK via `ai-service.ts`
   - PDF intelligence: Same prompts, new standardized interface
   - Backward compatibility maintained with fallback to direct CLI if needed

### Phase 2: Provider Abstraction Layer
**Goal**: Support provider switching without changing business logic

1. **Create Provider Manager**
   ```typescript
   interface ProviderConfig {
     type: 'gemini-cli' | 'codex-cli' | 'claude-cli';
     authMethod: 'oauth' | 'api-key' | 'browser-auth';
     settings: Record<string, any>;
   }
   
   class ProviderManager {
     async initialize(config: ProviderConfig) {
       switch(config.type) {
         case 'gemini-cli':
           return createGeminiCLIProvider(config);
         case 'codex-cli':
           return createCodexCLIProvider(config);
         // etc...
       }
     }
   }
   ```

2. **Update Authentication Flow**
   ```typescript
   // Unified auth interface
   interface AuthProvider {
     checkAuth(): Promise<boolean>;
     startAuth(): Promise<AuthResult>;
     getUserInfo(): Promise<UserInfo>;
   }
   ```

3. **Settings UI for Provider Selection**
   - Dropdown to choose AI provider
   - Provider-specific auth UI
   - Store selection in user preferences

### Phase 3: Add Codex CLI Support
**Goal**: Enable ChatGPT users to use their existing account

1. **Integrate Codex CLI Provider**
   - Use: https://github.com/ben-vargas/ai-sdk-provider-codex-cli
   - Handle Codex-specific auth flow
   - Map to AI SDK interface

2. **Update UI**
   - Add "Sign in with ChatGPT" option
   - Show Codex-specific features
   - Handle provider switching

### Phase 4: Add Claude CLI Support
**Goal**: Enable Claude users to use their existing account

1. **Create Claude CLI Provider**
   - May need to build this if community version doesn't exist
   - Handle Claude Code CLI authentication
   - Map to AI SDK interface

2. **Feature Parity**
   - Ensure all features work across providers
   - Handle provider-specific capabilities
   - Graceful degradation for unsupported features

## Technical Architecture

```
┌─────────────────────────────────────────┐
│            PDF Filler UI                │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│         AI Service Layer                │
│  (Unified interface for all operations) │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│            AI SDK Core                  │
│    (Vercel AI SDK - standardization)    │
└────────────────┬────────────────────────┘
                 │
     ┌───────────┼───────────┬─────────────┐
     │           │           │             │
┌────▼────┐ ┌───▼────┐ ┌───▼────┐   ┌────▼────┐
│ Gemini  │ │ Codex  │ │ Claude │   │  OpenAI │
│   CLI   │ │  CLI   │ │  CLI   │   │   API   │
│Provider │ │Provider│ │Provider│   │ Provider│
└─────────┘ └────────┘ └────────┘   └─────────┘
     │           │           │             │
┌────▼────┐ ┌───▼────┐ ┌───▼────┐   ┌────▼────┐
│ Google  │ │ChatGPT │ │ Claude │   │ API Key │
│  OAuth  │ │ Login  │ │  Login │   │  Entry  │
└─────────┘ └────────┘ └────────┘   └─────────┘
```

## Migration Path

### Step 1: Parallel Implementation
- Keep existing `gemini-cli.service.ts` working
- Build new `ai.service.ts` alongside
- Feature flag to switch between them

### Step 2: Gradual Migration
- Migrate one feature at a time
- Start with simple operations (extract)
- Move to complex operations (intelligence)

### Step 3: Provider Addition
- Add new providers one at a time
- Test thoroughly with each provider
- Ensure feature parity

### Step 4: Deprecation
- Once stable, remove old direct CLI code
- Fully commit to AI SDK architecture

## Benefits of This Approach

1. **User Choice**: Let users pick their preferred AI
2. **No Vendor Lock-in**: Easy to add new providers
3. **Cost Flexibility**: Users use their existing subscriptions
4. **Feature Consistency**: Same features work everywhere
5. **Future Proof**: New AI providers easy to add
6. **Maintainable**: Single interface to maintain

## Testing Strategy

1. **Unit Tests**: Mock AI SDK responses
2. **Integration Tests**: Test each provider
3. **E2E Tests**: Full flow with each auth method
4. **Performance Tests**: Ensure no degradation
5. **User Acceptance**: Beta test with real users

## Success Metrics

- ✅ All existing features work with AI SDK
- ✅ At least 2 providers fully integrated
- ✅ Provider switching without data loss
- ✅ No performance degradation
- ✅ User satisfaction maintained/improved

## Risk Mitigation

1. **Risk**: Breaking existing functionality
   - **Mitigation**: Parallel implementation, extensive testing

2. **Risk**: Provider APIs change
   - **Mitigation**: Version lock providers, monitoring

3. **Risk**: Authentication complexity
   - **Mitigation**: Provider-specific auth handlers

4. **Risk**: Performance degradation
   - **Mitigation**: Benchmark before/after, optimization

## Timeline Estimate

- **Week 1**: AI SDK integration with Gemini CLI
- **Week 2**: Provider abstraction layer
- **Week 3**: Codex CLI integration
- **Week 4**: Claude CLI integration
- **Week 5**: Testing and optimization
- **Week 6**: Documentation and release

## Next Immediate Steps

1. Install AI SDK packages
2. Install gemini-cli provider
3. Create `ai.service.ts` with AI SDK
4. Test with simple prompt
5. Gradually migrate features

## Code Examples

### Current (Direct CLI)
```typescript
async extractPDFData(pdfPath: string): Promise<any> {
  const prompt = `Extract data from PDF at: ${pdfPath}`;
  return this.callGemini(prompt);
}
```

### Future (AI SDK)
```typescript
async extractPDFData(pdfPath: string): Promise<any> {
  const { text } = await generateText({
    model: this.activeProvider,
    prompt: `Extract data from PDF at: ${pdfPath}`,
    maxTokens: 2000,
  });
  return JSON.parse(text);
}
```

## Current Implementation Status

### What's Working Now
- ✅ **AI SDK Integration**: Vercel AI SDK is fully integrated via `ai-service.ts`
- ✅ **Ben Vargas Provider**: `ai-sdk-provider-gemini-cli` package successfully wraps our local Gemini CLI
- ✅ **OAuth Authentication**: Our custom OAuth flow (`simple-auth-handler.js`) works seamlessly with the AI SDK provider
- ✅ **Hybrid Architecture**: Both direct CLI (`gemini-simple.js`) and AI SDK (`ai-service.ts`) are available

### Architecture Notes
The app uses a hybrid approach:
1. **Foundation Layer**: Local Gemini CLI installation in `gemini-cli-local/` with OAuth credentials
2. **Provider Layer**: Ben Vargas's `ai-sdk-provider-gemini-cli` wraps the CLI for AI SDK compatibility
3. **Service Layer**: `ai-service.ts` uses the AI SDK for standardized operations
4. **Legacy Layer**: `gemini-simple.js` still available for direct CLI operations if needed

## Notes for Future Claude Sessions

- Current state: Phase 1 complete, Gemini working through AI SDK
- Next goal: Add more providers (ChatGPT, Claude) for multi-provider support
- Priority: Maintain free tier for all providers (OAuth-based, no API keys)
- Key files: `ai-service.ts` (AI SDK), `gemini-simple.js` (direct CLI), `simple-auth-handler.js` (OAuth)
- Dependencies: `ai-sdk-provider-gemini-cli` by Ben Vargas is critical for Gemini integration

## References

- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [Gemini CLI Provider](https://github.com/ben-vargas/ai-sdk-provider-gemini-cli)
- [Codex CLI Provider](https://github.com/ben-vargas/ai-sdk-provider-codex-cli)
- [AI SDK Provider Protocol](https://sdk.vercel.ai/docs/ai-sdk-providers/community-providers)