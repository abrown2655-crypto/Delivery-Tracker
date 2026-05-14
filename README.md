# 📦 Delivery Tracker

Auto-updates on every page load by scanning your Gmail for shipping emails using Claude AI.

## Setup (15–20 min)

### 1. Deploy to Netlify
1. Push this repo to GitHub
2. Go to [netlify.com](https://netlify.com) → "Add new site" → "Import from GitHub"
3. Select your repo, leave build settings as-is, click **Deploy**

### 2. Get a Google OAuth Client
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Go to **APIs & Services → OAuth consent screen**
   - Set User Type: **External**
   - Fill in App name, support email → Save
   - Add scope: `https://www.googleapis.com/auth/gmail.readonly`
   - Add your email as a test user
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: `https://YOUR-SITE.netlify.app/auth/callback`
   - Copy the **Client ID** and **Client Secret**
5. Go to **APIs & Services → Library** → Enable **Gmail API**

### 3. Get an Anthropic API Key
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key and copy it

### 4. Set Environment Variables in Netlify
Go to **Site Settings → Environment Variables** and add:

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | Your Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Your Google OAuth Client Secret |
| `GOOGLE_REDIRECT_URI` | `https://YOUR-SITE.netlify.app/auth/callback` |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |

Then go to **Deploys → Trigger deploy** to redeploy with the new variables.

### 5. Done!
Visit your Netlify URL, click **Connect Gmail**, authorize, and your packages will auto-load. Each visit rescans your inbox automatically.

## How it works
- On page load, it checks for a cached scan (< 30 min old)
- If stale, it calls the Netlify function which reads Gmail + runs Claude to extract shipments
- Results are shown instantly from cache, then refreshed in the background
- Your Gmail token is stored in your browser's localStorage only — never on any server
