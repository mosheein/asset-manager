# Local Development with Google Authentication

You can test Google authentication on your local machine before deploying to production.

## Quick Setup Steps

### 1. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing one)
3. Enable Google+ API:
   - Go to "APIs & Services" → "Library"
   - Search for "Google+ API" and click "Enable"
4. Create OAuth 2.0 Credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: **Web application**
   - Name: "Asset Manager (Local Dev)"
   - **Authorized JavaScript origins**:
     - `http://localhost:3001`
     - `http://localhost:5173` (for Vite dev server)
   - **Authorized redirect URIs**:
     - `http://localhost:3001/api/auth/google/callback`
   - Click "Create"
5. **Copy the Client ID and Client Secret** - you'll need these

### 2. Create Local .env File

Create a `.env` file in the project root:

```env
# Local Development Configuration
NODE_ENV=development
PORT=3001
BASE_URL=http://localhost:3001

# Database (local)
DB_PATH=./portfolio.db

# Authentication (from Google Cloud Console)
SESSION_SECRET=local-dev-secret-change-in-production
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173
```

**Generate SESSION_SECRET for local dev** (you can use a simple string, but better to use a random one):
```bash
openssl rand -base64 32
```

### 3. Install Dependencies

Make sure you've installed the new authentication packages:

```bash
npm install
```

This will install:
- `passport`
- `passport-google-oauth20`
- `express-session`

### 4. Start Development Servers

```bash
npm run dev
```

This starts both:
- Backend server on `http://localhost:3001`
- Frontend dev server on `http://localhost:5173`

### 5. Test Authentication

1. Open `http://localhost:5173` in your browser
2. You should be redirected to `/login`
3. Click "Sign in with Google"
4. You'll be redirected to Google's login page
5. Sign in with your Google account
6. You'll be redirected back to the app, now authenticated

## How It Works Locally

- **Frontend**: Runs on `http://localhost:5173` (Vite dev server)
- **Backend**: Runs on `http://localhost:3001` (Express server)
- **OAuth Callback**: `http://localhost:3001/api/auth/google/callback`
- **Sessions**: Stored in memory (development mode)
- **CORS**: Configured to allow `http://localhost:5173`

## Troubleshooting

### "Redirect URI mismatch" Error

This means the redirect URI in your Google OAuth settings doesn't match. Make sure:
- In Google Cloud Console, the redirect URI is exactly: `http://localhost:3001/api/auth/google/callback`
- Your `.env` has: `GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback`

### "Invalid client" Error

- Check that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in your `.env` match what's in Google Cloud Console
- Make sure there are no extra spaces or quotes

### Session Not Persisting

- Make sure cookies are enabled in your browser
- Check browser console for CORS errors
- Verify `credentials: true` is set in axios (already done in `main.tsx`)

### Can't Access After Login

- Check that the frontend is making requests to `/api/*` (which Vite proxies to `http://localhost:3001`)
- Verify the session cookie is being set (check browser DevTools → Application → Cookies)

## Testing Different Users

You can test with multiple Google accounts:
1. Logout (click ⚙️ → Logout)
2. Sign in with a different Google account
3. The session will be replaced with the new user

## Next Steps

Once local authentication works:
1. Test all features while authenticated
2. Verify logout works
3. Then proceed with production deployment
4. Use the same Google OAuth credentials, but update:
   - `BASE_URL` to your production URL
   - `GOOGLE_CALLBACK_URL` to your production callback URL
   - Add production URLs to Google Cloud Console authorized origins/redirects
