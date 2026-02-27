# Installation & Deployment Guide
# دليل التثبيت والنشر

## 📋 Table of Contents | جدول المحتويات

1. [Local Testing](#local-testing) | [الاختبار المحلي](#الاختبار-المحلي)
2. [Server Setup](#server-setup) | [إعداد الخادم](#إعداد-الخادم)
3. [Database Setup](#database-setup) | [إعداد قاعدة البيانات](#إعداد-قاعدة-البيانات)
4. [Email Configuration](#email-configuration) | [إعداد البريد الإلكتروني](#إعداد-البريد-الإلكتروني)
5. [Google Sheets Setup](#google-sheets-setup) | [إعداد Google Sheets](#إعداد-google-sheets)
6. [Production Deployment](#production-deployment) | [النشر للإنتاج](#النشر-للإنتاج)
7. [GitHub Pages Deployment](#github-pages-deployment) | [النشر على GitHub Pages](#النشر-على-github-pages)

---

## 🚀 Local Testing | الاختبار المحلي

### Option 1: Direct Browser Testing | الخيار 1: الاختبار المباشر في المتصفح

No installation needed! Simply open the HTML files:

لا يلزم تثبيت! افتح ملفات HTML مباشرة:

```bash
# For nurses | للممرضات
Open: nurse-interface.html

# For admin | للإدارة
Open: admin-interface.html
```

**Features Available:**
- ✅ Full form functionality
- ✅ Data saved in browser (localStorage)
- ✅ Filter and search
- ✅ Print records
- ❌ Email notifications (requires server)
- ❌ Google Sheets sync (requires server)

### Option 2: Local Web Server | الخيار 2: خادم محلي

Using Python (already installed on most systems):

```bash
# Navigate to project folder
cd ambulance-log-system

# Start server
python -m http.server 8000

# Access at:
# Nurses: http://localhost:8000/nurse-interface.html
# Admin:  http://localhost:8000/admin-interface.html
```

Or using Node.js:

```bash
npx http-server -p 8000
```

---

## 🖥️ Server Setup | إعداد الخادم

### Prerequisites | المتطلبات الأساسية

- Node.js 16+ and npm
- PostgreSQL 13+ (or MySQL)
- Git

### Installation Steps | خطوات التثبيت

```bash
# 1. Clone or download the project
git clone https://github.com/your-repo/ambulance-log.git
cd ambulance-log

# 2. Install dependencies
npm install

# 3. Copy environment template
cp .env.example .env

# 4. Edit .env with your credentials
nano .env  # or use any text editor

# 5. Setup database (see Database Setup section)

# 6. Start the server
npm start

# For development with auto-reload:
npm run dev
```

---

## 🗄️ Database Setup | إعداد قاعدة البيانات

### PostgreSQL Setup

```bash
# 1. Install PostgreSQL
# Ubuntu/Debian:
sudo apt update
sudo apt install postgresql postgresql-contrib

# macOS:
brew install postgresql
brew services start postgresql

# Windows: Download from postgresql.org

# 2. Create database and user
sudo -u postgres psql

CREATE DATABASE ambulance_db;
CREATE USER ambulance_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE ambulance_db TO ambulance_user;
\q

# 3. Create tables
psql -U ambulance_user -d ambulance_db -f database_schema.sql
```

### Database Schema | مخطط قاعدة البيانات

Create a file `database_schema.sql`:

```sql
CREATE TABLE ambulance_cases (
    id SERIAL PRIMARY KEY,
    vehicle_number VARCHAR(50) NOT NULL,
    driver_name VARCHAR(100) NOT NULL,
    staff_number VARCHAR(50) NOT NULL,
    departure_date DATE NOT NULL,
    departure_time TIME NOT NULL,
    return_date DATE NOT NULL,
    return_time TIME NOT NULL,
    destination VARCHAR(200) NOT NULL,
    diagnosis TEXT NOT NULL,
    nurse_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_departure_date ON ambulance_cases(departure_date);
CREATE INDEX idx_vehicle_number ON ambulance_cases(vehicle_number);
CREATE INDEX idx_created_at ON ambulance_cases(created_at);

-- Optional: Users table for authentication
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL, -- 'nurse' or 'admin'
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 📧 Email Configuration | إعداد البريد الإلكتروني

### Gmail Setup | إعداد Gmail

1. **Enable 2-Factor Authentication**
   - Go to: https://myaccount.google.com/security
   - Enable 2-Step Verification

2. **Create App Password**
   - Go to: https://myaccount.google.com/apppasswords
   - Select app: "Mail"
   - Select device: "Other" → "Ambulance System"
   - Copy the generated password

3. **Update .env file**

```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-16-char-app-password

NURSE_EMAIL=officerhasikhc@gmail.com
ADMIN_EMAIL=superabdoo@gmail.com
```

### Testing Email | اختبار البريد

```bash
# Run test script
node test-email.js
```

Create `test-email.js`:

```javascript
require('dotenv').config();
const { sendNurseEmail, sendAdminEmail } = require('./server-integration');

const testData = {
    vehicleNumber: "122-23",
    driverName: "Test Driver",
    staffNumber: "39634",
    departureDate: "2025-02-07",
    departureTime: "10:00",
    returnDate: "2025-02-07",
    returnTime: "14:00",
    destination: "Test Hospital",
    diagnosis: "Test case",
    nurseName: "Test Nurse"
};

(async () => {
    console.log('Sending test emails...');
    await sendNurseEmail(testData);
    await sendAdminEmail(testData);
    console.log('Test emails sent!');
})();
```

---

## 📊 Google Sheets Setup | إعداد Google Sheets

### Step 1: Create Google Cloud Project

1. Go to: https://console.cloud.google.com
2. Create new project: "Ambulance Log System"
3. Enable Google Sheets API

### Step 2: Create Service Account

1. Go to: IAM & Admin → Service Accounts
2. Create service account
3. Grant role: "Editor"
4. Create key (JSON format)
5. Download as `credentials.json`
6. Place in project root folder

### Step 3: Share Spreadsheet

1. Create spreadsheet titled "Ambulance Activity Log"
2. Share with service account email (from credentials.json)
3. Grant "Editor" permission
4. Copy spreadsheet ID from URL
5. Add to .env:

```env
GOOGLE_SHEET_ID=your-spreadsheet-id-here
```

### Step 4: Setup Sheet Headers

In your spreadsheet, add these headers in row 1:

```
Timestamp | Vehicle Number | Driver Name | Staff Number | Departure Date | 
Departure Time | Return Date | Return Time | Destination | Diagnosis | Nurse Name
```

---

## 🌐 Production Deployment | النشر للإنتاج

### Option 1: VPS Deployment (DigitalOcean, Linode, etc.)

```bash
# 1. SSH into your server
ssh root@your-server-ip

# 2. Install Node.js and PostgreSQL
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install nodejs postgresql postgresql-contrib nginx

# 3. Clone project
cd /var/www
git clone https://github.com/your-repo/ambulance-log.git
cd ambulance-log

# 4. Install dependencies
npm install --production

# 5. Setup environment
cp .env.example .env
nano .env  # Configure your settings

# 6. Setup database
sudo -u postgres psql
CREATE DATABASE ambulance_db;
# ... (create tables as shown above)

# 7. Install PM2 (Process Manager)
npm install -g pm2

# 8. Start application
pm2 start server-integration.js --name ambulance-system

# 9. Setup PM2 to start on boot
pm2 startup
pm2 save

# 10. Configure Nginx
sudo nano /etc/nginx/sites-available/ambulance
```

Nginx configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        root /var/www/ambulance-log;
        index nurse-interface.html;
        try_files $uri $uri/ =404;
    }

    location /admin {
        alias /var/www/ambulance-log;
        index admin-interface.html;
    }

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable site and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/ambulance /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Setup SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

### Option 2: Heroku Deployment

```bash
# 1. Install Heroku CLI
# Download from: https://devcenter.heroku.com/articles/heroku-cli

# 2. Login to Heroku
heroku login

# 3. Create app
heroku create ambulance-log-hasik

# 4. Add PostgreSQL
heroku addons:create heroku-postgresql:mini

# 5. Set environment variables
heroku config:set EMAIL_USER=your-email@gmail.com
heroku config:set EMAIL_PASS=your-app-password
# ... set all other variables

# 6. Deploy
git push heroku main

# 7. Initialize database
heroku pg:psql < database_schema.sql

# 8. Open app
heroku open
```

---

### Option 3: Railway Deployment

1. Go to: https://railway.app
2. Sign up with GitHub
3. Click "New Project"
4. Select your repository
5. Add PostgreSQL database
6. Configure environment variables
7. Deploy automatically

---

## 📄 GitHub Pages Deployment (Frontend Only)

For testing the frontend without backend:

```bash
# 1. Create gh-pages branch
git checkout -b gh-pages

# 2. Push to GitHub
git push origin gh-pages

# 3. Enable in GitHub settings
# Go to: Repository → Settings → Pages
# Source: gh-pages branch
# Save

# 4. Access at:
# https://your-username.github.io/ambulance-log/nurse-interface.html
```

**Note:** GitHub Pages only hosts static files. Email and database features won't work without a backend server.

---

## 🔒 Security Checklist | قائمة الأمان

Before production deployment:

- [ ] Change all default passwords
- [ ] Use strong JWT secret
- [ ] Enable HTTPS/SSL
- [ ] Setup firewall
- [ ] Enable rate limiting
- [ ] Implement authentication
- [ ] Regular backups
- [ ] Update dependencies
- [ ] Monitor logs
- [ ] Setup error tracking (Sentry)

---

## 📞 Support | الدعم

For issues or questions:
- Email: officerhasikhc@gmail.com
- Admin: superabdoo@gmail.com

---

## 🎉 Success!

Your ambulance log system should now be running!

نظام سجل الإسعاف الخاص بك يعمل الآن!

Test URLs:
- Nurses: http://your-domain.com/nurse-interface.html
- Admin: http://your-domain.com/admin-interface.html
- API: http://your-domain.com/api/ambulance-cases
