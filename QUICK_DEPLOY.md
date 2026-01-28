# Quick Start: Deploy to Web in 5 Minutes

## Option 1: Railway (Recommended - Easiest)

### 1. Create GitHub Account (if you don't have one)
Go to https://github.com/signup

### 2. Initialize Git & Push Code
```powershell
cd "c:\Users\Ananta3011\Documents\dating_poc"
git config --global user.name "Your Name"
git config --global user.email "your.email@gmail.com"
git init
git add .
git commit -m "Connect dating app - beta launch"
```

### 3. Create GitHub Repository
- Go to https://github.com/new
- Name: `connect-dating-app`
- Click "Create repository"

### 4. Push to GitHub
```powershell
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/connect-dating-app.git
git push -u origin main
```

### 5. Deploy on Railway
1. Visit https://railway.app
2. Sign up with GitHub
3. Click "Create New Project"
4. Select "Deploy from GitHub repo"
5. Select `connect-dating-app`
6. Add PostgreSQL service (Click "Add Service")
7. Go to project settings and add environment variables:
   ```
   DB_HOST=<from PostgreSQL>
   DB_PORT=<from PostgreSQL>
   DB_NAME=railway
   DB_USER=postgres
   DB_PASSWORD=<from PostgreSQL>
   NODE_ENV=production
   ```
8. Click "Deploy"

### 6. Set Up Database
- Get PostgreSQL connection string from Railway
- Run schema.sql on the production database
- Your app is LIVE! 🎉

---

## Check Your Live App
Your app will be at: `https://your-project-name.up.railway.app`

Test it by:
- Register new account
- Send messages
- Check conversations

---

## Common Issues & Fixes

### "Cannot connect to database"
- Verify environment variables match Railway PostgreSQL values
- Check if database exists
- Run schema.sql to create tables

### "Port already in use"
- Railway assigns PORT automatically via environment variable
- Your app.js already handles this: `process.env.PORT || 3000`

### "File uploads not working"
- Local file system won't persist on web
- TODO: Set up AWS S3 or Cloudinary for production

---

## Next Steps
- [ ] Push code to GitHub
- [ ] Deploy on Railway  
- [ ] Test all features
- [ ] Share beta link with friends
- [ ] Collect feedback
- [ ] Plan improvements

Estimated time: 10-15 minutes from zero to live!
