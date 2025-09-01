# Release Process for PDF Filler Desktop

This document outlines the process for releasing new versions of PDF Filler Desktop with auto-update support.

## Prerequisites

1. **GitHub Personal Access Token**
   - Create a token at https://github.com/settings/tokens
   - Required scopes: `repo` (full control of private repositories)
   - Set as environment variable: `export GH_TOKEN=your_token_here`

2. **Code Signing (macOS)**
   - Required for auto-updates to work on macOS
   - Without signing, users will get security warnings
   - Set up Apple Developer ID certificate

## Version Management

The app version is managed in `package.json`:
```json
{
  "version": "1.0.0"
}
```

Follow semantic versioning:
- **Major** (1.0.0 → 2.0.0): Breaking changes
- **Minor** (1.0.0 → 1.1.0): New features
- **Patch** (1.0.0 → 1.0.1): Bug fixes

## Release Steps

### 1. Update Version

```bash
# Update version in package.json
npm version patch  # for bug fixes
npm version minor  # for new features  
npm version major  # for breaking changes
```

### 2. Update Changelog

Create or update `CHANGELOG.md`:
```markdown
## [1.0.1] - 2025-01-15

### Added
- Auto-update functionality

### Fixed
- Bug fixes

### Changed
- Performance improvements
```

### 3. Commit Changes

```bash
git add .
git commit -m "Release v1.0.1"
git push origin main
```

### 4. Create Git Tag

```bash
git tag v1.0.1
git push origin v1.0.1
```

### 5. Build and Publish

```bash
# Make sure GH_TOKEN is set
export GH_TOKEN=your_github_token

# Build and publish to GitHub
npm run release
```

This will:
- Build the app for all platforms
- Create a draft GitHub release
- Upload build artifacts
- Generate `latest.yml` files for auto-updater

### 6. Finalize GitHub Release

1. Go to https://github.com/silverstein/pdf-filler-desktop/releases
2. Find the draft release
3. Add release notes
4. Publish the release

## Auto-Update Flow

Once published, the auto-update works as follows:

1. **App checks for updates** on startup (after 3 seconds)
2. **If update available**, user is prompted to download
3. **Download happens in background** with progress indicator
4. **When complete**, user is prompted to restart
5. **Update installs** on app quit/restart

## Testing Updates Locally

### Method 1: Dev Configuration

1. Create `dev-app-update.yml` in project root
2. Modify version to simulate update
3. Run the app in development mode

### Method 2: Local Update Server

```bash
# Start a local update server
npx http-server ./dist -p 8080

# Point app to local server (in dev-app-update.yml)
url: http://localhost:8080
```

## Platform-Specific Notes

### macOS
- Requires code signing for auto-updates
- DMG format recommended
- Updates install to `/Applications`

### Windows
- NSIS installer format
- Admin rights may be required
- Updates replace existing installation

### Linux
- AppImage format
- No special permissions needed
- Updates replace AppImage file

## Rollback Process

If a release has issues:

1. **Delete the GitHub release** (if critical issues)
2. **Create a new release** with higher version number
3. **Users on broken version** will auto-update to fixed version

⚠️ **Important**: Never re-use version numbers. Always increment.

## CI/CD Integration (Future)

For automated releases, consider:
- GitHub Actions workflow
- Automatic version bumping
- Automated testing before release
- Automatic draft release creation

## Common Issues

### "Update not found"
- Check GitHub release is published (not draft)
- Verify `latest.yml` files exist in release
- Check version number is higher than current

### "Cannot verify signature" (macOS)
- App needs to be code-signed
- Check certificate is valid
- Ensure signing identity is correct

### "Permission denied" (Linux)
- AppImage needs executable permissions
- Run: `chmod +x PDF-Filler-*.AppImage`

## Build Commands Reference

```bash
# Development build
npm run build

# Production build with publish
npm run build:publish

# Release (build and publish to GitHub)
npm run release

# Build for specific platform
npm run build -- --mac
npm run build -- --win
npm run build -- --linux
```

## Environment Variables

- `GH_TOKEN`: GitHub personal access token (required for publishing)
- `CSC_LINK`: Path to code signing certificate (macOS)
- `CSC_KEY_PASSWORD`: Certificate password (macOS)
- `DEBUG`: Set to `electron-builder` for detailed build logs

## Support

For issues with the release process:
- Check electron-builder docs: https://www.electron.build/
- Check electron-updater docs: https://www.electron.build/auto-update
- File issues at: https://github.com/silverstein/pdf-filler-desktop/issues