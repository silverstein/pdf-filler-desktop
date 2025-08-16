# Merger Proposal: Unified PDF Filler Project

## Recommended Structure: Monorepo with Multiple Outputs

### Why Monorepo?
1. **Code Reuse**: Share PDF manipulation logic across all platforms
2. **Feature Parity**: Easier to maintain consistent features
3. **Single Issue Tracker**: Community can contribute once, benefit all platforms
4. **Brand Strength**: "PDF Filler" becomes the universal solution

### Proposed Repository Structure

```
pdf-filler/
├── README.md                    # Main docs explaining all options
├── packages/
│   ├── core/                   # Shared business logic
│   │   ├── src/
│   │   │   ├── pdf-operations.js    # pdf-lib operations
│   │   │   ├── csv-handler.js       # CSV parsing/generation
│   │   │   ├── profile-manager.js   # Profile save/load
│   │   │   └── validators.js        # Form validation
│   │   └── package.json
│   │
│   ├── mcp-server/             # MCP server for IDEs
│   │   ├── src/
│   │   │   └── index.js       # MCP protocol implementation
│   │   └── package.json
│   │
│   ├── desktop-app/            # Electron desktop app
│   │   ├── src/
│   │   │   ├── electron.js
│   │   │   ├── preload.js
│   │   │   └── server.js
│   │   ├── public/
│   │   │   └── index.html     # UI with themes
│   │   └── package.json
│   │
│   └── ai-providers/          # AI backend abstractions
│       ├── src/
│       │   ├── base-provider.js
│       │   ├── claude-provider.js
│       │   ├── gemini-provider.js
│       │   └── openai-provider.js
│       └── package.json
│
├── extensions/
│   └── claude-desktop/        # DXT packaging
│       ├── manifest.json
│       └── build.js
│
├── installers/                # Platform-specific installers
│   ├── mac/
│   ├── windows/
│   └── linux/
│
├── scripts/                   # Build and release scripts
│   ├── build-all.js
│   ├── package-mcp.js
│   ├── package-dxt.js
│   └── package-desktop.js
│
├── lerna.json                # Monorepo management
└── package.json             # Root package.json
```

### Implementation Plan

#### Phase 1: Set Up Monorepo (Week 1)
1. Create new `pdf-filler` repo (or rename existing)
2. Set up Lerna or npm workspaces
3. Move existing code into appropriate packages
4. Set up shared dependencies

#### Phase 2: Extract Shared Logic (Week 2)
1. Create `@pdf-filler/core` package with:
   - PDF operations (using pdf-lib)
   - CSV handling
   - Profile management
   - Validation logic
2. Update both MCP server and desktop app to use core

#### Phase 3: Create Provider Abstraction (Week 3)
1. Build `@pdf-filler/ai-providers` package
2. Implement providers:
   - Claude (for MCP/DXT)
   - Gemini (for free desktop)
   - OpenAI (future)
   - Local LLM (future)

#### Phase 4: Unified Features (Week 4)
1. Ensure feature parity across all platforms
2. Implement missing features using shared core
3. Standardize configuration

### Benefits for Users

#### For Developers
- **Choose your IDE**: Works in Cursor, VSCode, any MCP-compatible editor
- **Choose your AI**: Use Claude, Gemini, or others
- **Contribute once**: Fix benefits all platforms

#### For End Users  
- **Free option**: Desktop app with Gemini
- **Power option**: Claude Desktop extension
- **No confusion**: Clear branding and options

### Marketing Positioning

```
PDF Filler - The Universal PDF Solution
├── For Developers: MCP server for your favorite IDE
├── For Claude Users: Native desktop extension
├── For Everyone: Free desktop app with AI
└── Open Source: MIT licensed, community driven
```

### Migration Path

1. **Keep existing repos during transition**
2. **Announce deprecation plan** with 3-month window
3. **Provide migration tools** for existing users
4. **Redirect old repos** to new unified repo

### Technical Decisions

#### Package Manager
- **Recommended**: pnpm with workspaces (fast, efficient)
- **Alternative**: npm workspaces (simpler, built-in)

#### Build System
- **Recommended**: Turborepo (fast, smart caching)
- **Alternative**: Lerna (mature, well-documented)

#### Testing Strategy
- Shared test suite in core
- Platform-specific integration tests
- E2E tests for each output format

### Release Strategy

#### Versioning
- Independent versioning per package
- Coordinated major releases
- Automated changelog generation

#### Distribution
- **npm**: Core packages and MCP server
- **GitHub Releases**: Desktop app, DXT file
- **Package managers**: Homebrew, Chocolatey, etc.

### Documentation Structure

```
docs/
├── getting-started/
│   ├── desktop-app.md
│   ├── claude-extension.md
│   └── ide-integration.md
├── api/
│   ├── core-api.md
│   └── provider-api.md
├── contributing/
│   ├── setup.md
│   ├── architecture.md
│   └── adding-providers.md
└── examples/
```

## Immediate Next Steps

If you agree with this approach:

1. **Create new repo** or decide to transform existing
2. **Set up basic monorepo structure**
3. **Move existing code** without refactoring first
4. **Get everything working** in new structure
5. **Then refactor** to share code

## Alternative: Start with Provider Abstraction

If monorepo feels too complex initially:

1. **Add Gemini provider** to existing pdf-filler-simple
2. **Add Electron wrapper** as another output format
3. **Gradually refactor** to share more code
4. **Eventually move** to monorepo when it makes sense

## Questions to Consider

1. **Naming**: Keep "pdf-filler" or rebrand?
2. **Primary repo**: New repo or evolve existing?
3. **Community**: How to manage contributions across platforms?
4. **Sponsorship**: How does Lumin sponsorship work with unified project?
5. **Feature flags**: Should desktop app enable/disable features based on provider?

## Example Migration Commit

```bash
# Initial monorepo setup
git init pdf-filler-unified
cd pdf-filler-unified

# Set up workspaces
npm init -y
npm i -D lerna

# Create package structure
mkdir -p packages/{core,mcp-server,desktop-app,ai-providers}

# Copy existing code
cp -r ../pdf-filler-simple/server/* packages/mcp-server/
cp -r ../gemini-pdf-filler/src/* packages/desktop-app/

# Set up package.json files
echo '{
  "name": "@pdf-filler/core",
  "version": "1.0.0",
  "main": "src/index.js"
}' > packages/core/package.json

# Link packages
npx lerna bootstrap
```

## Success Metrics

- [ ] All platforms share 70%+ code
- [ ] Single `npm install` sets up everything
- [ ] Features ship simultaneously across platforms
- [ ] Community contributions benefit all users
- [ ] Clear documentation for each use case