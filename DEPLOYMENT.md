# Deployment Guide for Connect Dating App (Beta)

## Recommended: Railway.app Deployment (Easiest)

### Prerequisites
- GitHub account
- Railway account (free at railway.app)

### Step 1: Initialize Git Repository
```bash
git init
git add .
git commit -m "Initial commit for beta deployment"
```

### Step 2: Create GitHub Repository
1. Go to https://github.com/new
2. Create a repository named `connect-dating-app`
3. Push your code:
```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/connect-dating-app.git
git push -u origin main
```

### Step 3: Deploy on Railway
1. Go to https://railway.app
2. Click "Create New Project"
3. Select "Deploy from GitHub repo"
4. Connect your GitHub account
5. Select your `connect-dating-app` repository
6. Railway will auto-detect Node.js app

### Step 4: Add PostgreSQL Database
1. In Railway project, click "Add Service"
2. Select "PostgreSQL"
3. Railway will create a database automatically

### Step 5: Configure Environment Variables
1. Go to your app settings in Railway
2. Add these variables:
   - `DB_HOST`: Get from PostgreSQL service variables
   - `DB_PORT`: Get from PostgreSQL service variables  
   - `DB_NAME`: `railway` (default)
   - `DB_USER`: `postgres` (default)
   - `DB_PASSWORD`: Get from PostgreSQL service variables
   - `NODE_ENV`: `production`

### Step 6: Run Database Schema
After deployment:
1. Connect to your Railway PostgreSQL database
2. Run the contents of `schema.sql` to create tables

### Step 7: Deploy!
Railway automatically deploys when you push to main branch. Your app will be live at:
```
https://your-project-name.up.railway.app
```

---

## Alternative Options

### Render.com
1. Go to https://render.com
2. Click "New +" → "Web Service"
3. Connect GitHub
4. Select your repository
5. Set Build Command: `npm install`
6. Set Start Command: `npm start`
7. Add PostgreSQL database
8. Add environment variables
9. Deploy!

### Fly.io
```bash
# Install Fly CLI
# Run:
fly auth login
fly launch
fly deploy
```

---

## Production Checklist

- [ ] All environment variables set in hosting provider
- [ ] Database schema created in production database
- [ ] Test login/registration
- [ ] Test file uploads (may need AWS S3 setup)
- [ ] Test conversations
- [ ] Monitor logs for errors
- [ ] Set up custom domain (optional)
- [ ] Enable HTTPS (auto-enabled on all platforms)

---

## Important Notes

**File Uploads:**
Currently using local `uploads/` folder. For production, consider:
- AWS S3
- Cloudinary  
- DigitalOcean Spaces

Update `multer` destination in `app.js` to use cloud storage.

**Email Notifications (Optional):**
Add `nodemailer` for password reset, verification emails.

**Session Storage (Optional):**
Currently using memory storage. For multiple instances, use:
- Redis
- PostgreSQL session store
- Memcached

---

## Post-Deployment

### Domain Setup (Optional)
1. Buy domain (Namecheap, GoDaddy, etc.)
2. Update DNS records to point to your hosting provider
3. Enable SSL/HTTPS

### Monitoring
- Check logs regularly for errors
- Monitor database usage
- Set up error tracking (Sentry.io)

### Scaling
As users grow:
- Upgrade database tier
- Add caching layer (Redis)
- Move file storage to cloud
- Consider load balancing

---

## Support

For issues:
1. Check Railway/Render logs
2. Verify environment variables
3. Test database connection
4. Check Node.js version compatibility

Happy launching! 🚀
