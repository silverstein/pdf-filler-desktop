# Logout Functionality Documentation

## Overview
The PDF Filler Desktop app supports logout functionality for all three AI providers (Claude, Gemini, and Codex). The logout process clears stored authentication credentials and requires re-authentication to use the services again.

## Implementation Details

### Backend Implementation

#### 1. Service Layer
Each AI service has a `clearAuth()` method:

- **GeminiCLIService** (`src/services/gemini-cli.service.ts`):
  - Removes OAuth credentials from `gemini-cli-local/.gemini/oauth_creds.json`
  - Removes Google accounts from `gemini-cli-local/.gemini/google_accounts.json`
  - Fully clears authentication, requiring new Google sign-in

- **ClaudeCLIService** (`src/services/claude-cli.service.ts`):
  - Delegates to `ClaudeAuthHandler.clearAuth()`
  - Clears local cache but notes that OAuth tokens remain in system keychain
  - Full logout requires using Claude Code app directly

- **CodexCLIService** (`src/services/codex-cli.service.ts`):
  - Currently logs the action but doesn't clear credentials
  - May use system authentication that persists

#### 2. API Endpoint
The server exposes a `/api/logout` endpoint (`src/server.ts`):
```typescript
POST /api/logout
```
- Calls `clearAuth()` on all three services
- Returns success status for each provider
- Overall success if at least one provider was logged out

### Frontend Implementation

#### 1. UI Elements
The app has logout buttons in the account menu:
```html
<button onclick="handleLogout()">Sign Out</button>
```

#### 2. JavaScript Functions
The `public/js/app.js` file contains the logout logic:

```javascript
async function handleLogout() {
    // Confirm with user
    if (!confirm('Are you sure you want to sign out from all providers?')) {
        return;
    }

    // Call logout API
    const response = await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });

    const result = await response.json();

    // Handle success/failure
    if (result.success) {
        // Reload page to show login screen
        window.location.reload();
    }
}
```

## How to Use Logout

### From the UI
1. Click on the account button in the top-right corner
2. Select "Sign Out" from the dropdown menu
3. Confirm the logout action
4. The app will clear credentials and reload

### Via API
```bash
# Call the logout endpoint directly
curl -X POST http://localhost:3456/api/logout \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "success": true,
  "message": "Logout successful",
  "providers": {
    "claude": {
      "success": true,
      "message": "Claude logout successful"
    },
    "gemini": {
      "success": true,
      "message": "Gemini logout successful"
    },
    "codex": {
      "success": true,
      "message": "Codex logout successful"
    }
  }
}
```

### Testing
Run the test script to verify logout functionality:
```bash
node test-logout.js
```

## Important Notes

### Provider-Specific Behaviors

1. **Gemini**:
   - Fully clears OAuth credentials
   - Requires complete re-authentication with Google
   - Most complete logout implementation

2. **Claude**:
   - Clears local cache
   - OAuth tokens remain in system keychain
   - For complete logout, use Claude Code app directly
   - May still work if Claude Code app remains authenticated

3. **Codex**:
   - Currently doesn't clear credentials
   - May use system-level authentication
   - Logout may not fully disconnect the service

### Security Considerations

- Logout doesn't affect system keychain entries (especially for Claude)
- Sensitive data in memory is cleared but may persist in system caches
- For maximum security, restart the application after logout
- Consider clearing browser cookies if using web-based authentication flows

### After Logout

After logging out:
1. The app will return to the authentication screen
2. Users must re-authenticate with their chosen provider
3. Previous settings and preferences are preserved
4. Recent files list is maintained (not cleared on logout)

## Troubleshooting

### Logout Not Working
If logout doesn't seem to work:
1. Check if the server is running (`http://localhost:3456/api/health`)
2. Manually delete credential files:
   ```bash
   # Gemini
   rm -rf gemini-cli-local/.gemini/oauth_creds.json
   rm -rf gemini-cli-local/.gemini/google_accounts.json

   # Claude (limited effect)
   rm -rf ~/.claude/
   ```
3. Restart the application

### Still Authenticated After Logout
This can happen with Claude if:
- Claude Code app is still authenticated
- System keychain still has OAuth tokens
- Solution: Use Claude Code app to logout directly

## Future Improvements

1. Add individual provider logout buttons
2. Implement complete keychain clearing for Claude
3. Add logout confirmation with provider details
4. Show which providers are currently authenticated
5. Add "logout from all devices" option
6. Implement session timeout for automatic logout