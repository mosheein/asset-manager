# Deployment Guide

This guide covers deploying the Asset Manager application to production.

## Architecture

- **Backend**: Node.js/Express API server (port 3001)
- **Frontend**: React/Vite SPA (served by Express in production)
- **Database**: SQLite (file-based, suitable for single-instance deployments)

## Pre-Deployment Checklist

1. ✅ Build scripts are configured (`npm run build`)
2. ✅ Production server serves static files
3. ✅ Environment variables are used for configuration
4. ✅ Database path is configurable via `DB_PATH`

## Deployment Options

### Option 1: Railway (Recommended for Personal Use)

**Pros**: Easy setup, automatic HTTPS, persistent storage, free tier available
**Best for**: Personal projects, single-user deployments

**Steps**:
1. Sign up at [railway.app](https://railway.app)
2. Create new project → "Deploy from GitHub repo"
3. Connect your GitHub repository
4. Railway will auto-detect Node.js and run `npm start`
5. Add environment variables:
   - `NODE_ENV=production`
   - `PORT` (auto-set by Railway)
   - `DB_PATH=/data/portfolio.db` (use persistent volume)
6. Add a volume mount for `/data` to persist the database
7. Deploy!

**Railway Configuration**:
- Build Command: `npm run build`
- Start Command: `npm start`
- Root Directory: `.`

### Option 2: Render

**Pros**: Free tier, easy setup, automatic HTTPS
**Best for**: Personal projects

**Steps**:
1. Sign up at [render.com](https://render.com)
2. Create new "Web Service"
3. Connect GitHub repository
4. Configure:
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Node
5. Add environment variables:
   - `NODE_ENV=production`
   - `PORT` (auto-set by Render)
   - `DB_PATH=/opt/render/project/src/portfolio.db`
6. Deploy!

**Note**: Render's free tier spins down after inactivity. Consider upgrading for always-on service.

### Option 3: Fly.io

**Pros**: Global edge deployment, persistent volumes, good free tier
**Best for**: Personal projects with global access needs

**Steps**:
1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Sign up: `fly auth signup`
3. Initialize: `fly launch` (in project root)
4. Create `fly.toml` (see below)
5. Deploy: `fly deploy`

**fly.toml**:
```toml
app = "your-app-name"
primary_region = "iad"

[build]
  builder = "paketobuildpacks/builder:base"

[env]
  NODE_ENV = "production"
  DB_PATH = "/data/portfolio.db"

[[mounts]]
  source = "data"
  destination = "/data"
```

### Option 4: DigitalOcean App Platform

**Pros**: Reliable, good documentation, managed database option
**Best for**: Production deployments, when you need managed PostgreSQL later

**Steps**:
1. Sign up at [digitalocean.com](https://digitalocean.com)
2. Create new App → GitHub
3. Configure:
   - Build Command: `npm run build`
   - Run Command: `npm start`
   - Environment Variables:
     - `NODE_ENV=production`
     - `DB_PATH=/app/data/portfolio.db`
4. Add persistent storage component for `/app/data`
5. Deploy!

### Option 5: Self-Hosted (VPS)

**Pros**: Full control, cost-effective for long-term
**Best for**: When you want full control, or already have a VPS

**Recommended Providers**: DigitalOcean Droplet, Linode, Vultr, Hetzner

**Steps**:
1. Create Ubuntu 22.04 VPS (minimum 1GB RAM, 1 vCPU)
2. SSH into server
3. Install Node.js 20+:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
4. Install PM2 for process management:
   ```bash
   sudo npm install -g pm2
   ```
5. Clone repository:
   ```bash
   git clone <your-repo-url> /opt/asset-manager
   cd /opt/asset-manager
   npm install
   npm run build
   ```
6. Create `.env` file:
   ```bash
   NODE_ENV=production
   PORT=3001
   DB_PATH=/opt/asset-manager/data/portfolio.db
   ```
7. Create data directory:
   ```bash
   mkdir -p /opt/asset-manager/data
   ```
8. Start with PM2:
   ```bash
   pm2 start dist/server.js --name asset-manager
   pm2 save
   pm2 startup  # Follow instructions to enable auto-start
   ```
9. Set up Nginx reverse proxy (see Nginx config below)
10. Set up SSL with Let's Encrypt:
    ```bash
    sudo apt install certbot python3-certbot-nginx
    sudo certbot --nginx -d yourdomain.com
    ```

**Nginx Configuration** (`/etc/nginx/sites-available/asset-manager`):
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Increase timeouts for file uploads
        client_max_body_size 50M;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }
}
```

## Environment Variables

Create a `.env` file (or set in your deployment platform):

```env
# Server Configuration
NODE_ENV=production
PORT=3001
BASE_URL=https://your-domain.com  # Your production URL (for OAuth callback)

# Database Configuration
DB_PATH=./portfolio.db

# Authentication (REQUIRED)
SESSION_SECRET=your-random-secret-key-min-32-characters  # Generate a strong random string
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=https://your-domain.com/api/auth/google/callback

# Frontend URL (for CORS)
FRONTEND_URL=https://your-domain.com

# Optional: API Keys (if you add external services later)
# OPENFIGI_API_KEY=your_key_here
```

**Important**: Never commit `.env` to git! It's already in `.gitignore`.

### Setting Up Google OAuth

1. **Go to [Google Cloud Console](https://console.cloud.google.com/)**
2. **Create a new project** (or select existing)
3. **Enable Google+ API**:
   - Go to "APIs & Services" → "Library"
   - Search for "Google+ API" and enable it
4. **Create OAuth 2.0 Credentials**:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: "Web application"
   - Name: "Asset Manager"
   - **Authorized JavaScript origins**:
     - `http://localhost:3001` (for development)
     - `https://your-domain.com` (for production)
   - **Authorized redirect URIs**:
     - `http://localhost:3001/api/auth/google/callback` (for development)
     - `https://your-domain.com/api/auth/google/callback` (for production)
5. **Copy the Client ID and Client Secret** to your `.env` file

**Generate SESSION_SECRET**:
```bash
# On Linux/Mac:
openssl rand -base64 32

# Or use Node.js:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Database Considerations

### Current Setup (SQLite)
- ✅ Works great for single-user, single-instance deployments
- ✅ No database server needed
- ✅ File-based, easy backups (just copy the `.db` file)
- ❌ Not suitable for multi-instance deployments (multiple servers)

### Future: PostgreSQL Migration (Optional)
If you need to scale to multiple instances or want a more robust database:

1. Install PostgreSQL adapter: `npm install pg @types/pg`
2. Update `src/db/database.ts` to use PostgreSQL instead of SQLite
3. Update all SQL queries to use PostgreSQL syntax
4. Use a managed PostgreSQL service (Railway, Render, Supabase, etc.)

**When to migrate**:
- Multiple users accessing simultaneously
- Need for database backups/restores
- Scaling to multiple server instances
- Advanced querying needs

## Build & Deploy Process

### Local Build Test
Before deploying, test the production build locally:

```bash
# Build both server and client
npm run build

# Test production server
NODE_ENV=production npm start

# Visit http://localhost:3001
```

### Deployment Steps
1. **Build**: `npm run build` (compiles TypeScript and builds React app)
2. **Start**: `npm start` (runs `node dist/server.js`)
3. **Verify**: Check `/api/health` endpoint returns `{"status":"ok"}`

## File Upload Limits

The app handles file uploads (PDF statements, Excel/CSV targets). Ensure your deployment platform allows:
- **File size**: At least 50MB upload limit
- **Timeout**: At least 5 minutes for large file processing

## Monitoring & Maintenance

### Health Checks
- Endpoint: `GET /api/health`
- Returns: `{"status":"ok"}`

### Database Backups
For SQLite, backup is simple:
```bash
# Copy the database file
cp portfolio.db portfolio.db.backup-$(date +%Y%m%d)
```

**Automated Backup Script** (for VPS):
```bash
#!/bin/bash
# /opt/asset-manager/backup.sh
BACKUP_DIR="/opt/asset-manager/backups"
mkdir -p $BACKUP_DIR
cp /opt/asset-manager/data/portfolio.db "$BACKUP_DIR/portfolio-$(date +%Y%m%d-%H%M%S).db"
# Keep only last 30 days
find $BACKUP_DIR -name "portfolio-*.db" -mtime +30 -delete
```

Add to crontab: `0 2 * * * /opt/asset-manager/backup.sh`

### Logs
- **Railway/Render**: View logs in dashboard
- **Fly.io**: `fly logs`
- **PM2**: `pm2 logs asset-manager`
- **Docker**: `docker logs <container>`

## Troubleshooting

### Database Locked Errors
- Ensure only one instance is running
- Check file permissions on database file
- For SQLite, ensure write access to directory

### Build Failures
- Check Node.js version (requires 18+)
- Verify all dependencies install: `npm ci`
- Check TypeScript compilation: `npm run build:server`

### Static Files Not Serving
- Verify `client/dist` exists after build
- Check `NODE_ENV=production` is set
- Verify path in `server.ts` matches your deployment structure

## Security Considerations

1. **Authentication**: Google OAuth is required - all API routes are protected
2. **Environment Variables**: Never commit secrets (especially SESSION_SECRET, GOOGLE_CLIENT_SECRET)
3. **HTTPS**: Always use HTTPS in production (required for secure cookies)
4. **Session Security**: 
   - SESSION_SECRET must be a strong random string (32+ characters)
   - Cookies are httpOnly and secure in production
5. **CORS**: Configured to allow only your domain in production
6. **File Uploads**: Validate file types and sizes server-side (already implemented)
7. **Database**: SQLite file should have restricted permissions (600 or 640)

### Authentication Flow

1. User visits app → Redirected to `/login` if not authenticated
2. User clicks "Sign in with Google" → Redirected to Google OAuth
3. User authorizes → Redirected back to app with session cookie
4. All API requests include session cookie automatically
5. Session expires after 30 days of inactivity

## Cost Estimates

- **Railway**: Free tier (500 hours/month), then ~$5-20/month
- **Render**: Free tier (spins down), then ~$7/month for always-on
- **Fly.io**: Free tier (3 shared VMs), then ~$2-5/month
- **DigitalOcean**: $5-12/month for basic droplet
- **VPS (Hetzner)**: €4-6/month for basic VPS

## Recommended: Railway for Quick Start

For the fastest deployment with minimal configuration:

1. **Set up Google OAuth** (see "Setting Up Google OAuth" above)
2. Push code to GitHub
3. Connect Railway to your repo
4. Add volume for `/data`
5. **Set environment variables**:
   - `NODE_ENV=production`
   - `DB_PATH=/data/portfolio.db`
   - `BASE_URL=https://your-app.railway.app` (Railway provides this)
   - `SESSION_SECRET=<generate-random-32-char-string>`
   - `GOOGLE_CLIENT_ID=<from-google-console>`
   - `GOOGLE_CLIENT_SECRET=<from-google-console>`
   - `GOOGLE_CALLBACK_URL=https://your-app.railway.app/api/auth/google/callback`
   - `FRONTEND_URL=https://your-app.railway.app`
6. **Update Google OAuth redirect URI** to match your Railway URL
7. Deploy!

Railway handles:
- ✅ Automatic HTTPS
- ✅ Environment variables
- ✅ Persistent storage
- ✅ Auto-deploy on git push
- ✅ Logs and monitoring

**Note**: After deployment, Railway will give you a URL like `https://your-app.up.railway.app`. Make sure to:
- Update `BASE_URL` and `FRONTEND_URL` in Railway environment variables
- Update the redirect URI in Google Cloud Console to match

## Next Steps After Deployment

1. **Test authentication**: Verify Google login works
2. Test all features (upload statements, set targets, view rebalancing)
3. Set up automated database backups
4. Monitor logs for errors
5. Set up custom domain name (optional, but recommended)
6. **Share access**: Family members can sign in with their Google accounts

## Authentication Notes

- **Who can access**: Anyone with a Google account can sign in
- **To restrict access**: You can add email whitelist in `src/routes/auth.ts` if needed
- **Session duration**: 30 days (configurable in `src/server.ts`)
- **Logout**: Available in Settings menu (⚙️ icon)
