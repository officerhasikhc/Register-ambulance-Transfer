# Ambulance Activity Log System
## نظام سجل نشاط الإسعاف

### 📋 Project Overview | نظرة عامة على المشروع

A bilingual (English/Arabic) web-based ambulance activity tracking system for Hasik Health Center, Ministry of Health, Sultanate of Oman. **Powered by Google Apps Script & Google Sheets**.

نظام إلكتروني ثنائي اللغة (إنجليزي/عربي) لتتبع نشاط الإسعاف في مركز حاسك الصحي، وزارة الصحة، سلطنة عمان. **يعمل بواسطة Google Apps Script و Google Sheets**.

---

### ✨ Features | المميزات

#### Nurse Interface | واجهة الممرضات
- ✅ Bilingual interface with easy language switching (E/ع)
- ✅ واجهة ثنائية اللغة مع إمكانية التبديل السهل
- ✅ Complete ambulance case registration form
- ✅ نموذج تسجيل كامل لحالات الإسعاف
- ✅ **Automatic save to Google Sheets**
- ✅ **حفظ تلقائي في Google Sheets**
- ✅ **Automatic email notifications**
- ✅ **إشعارات بريد إلكتروني تلقائية**
- ✅ View, edit, and delete previous records
- ✅ عرض وتعديل وحذف السجلات السابقة
- ✅ Filter by year and month
- ✅ التصفية حسب السنة والشهر
- ✅ Total case count display
- ✅ عرض إجمالي عدد الحالات

#### Admin Interface | واجهة الإدارة
- ✅ Comprehensive dashboard with statistics
- ✅ لوحة معلومات شاملة مع الإحصائيات
- ✅ Real-time notifications for new cases
- ✅ إشعارات فورية للحالات الجديدة
- ✅ Advanced filtering and search
- ✅ تصفية وبحث متقدم
- ✅ Detailed case view modal
- ✅ نافذة عرض تفاصيل الحالة
- ✅ Print individual records
- ✅ طباعة السجلات الفردية
- ✅ Export to Excel/CSV
- ✅ التصدير إلى Excel/CSV
- ✅ Automatic data refresh
- ✅ تحديث تلقائي للبيانات

#### **Google Integration | التكامل مع Google**
- ✅ **Data stored in Google Sheets**
- ✅ **البيانات محفوظة في Google Sheets**
- ✅ **Automatic email to nurses** (officerhasikhc@gmail.com)
- ✅ **إيميل تلقائي للممرضات**
- ✅ **Automatic email to admin** (superabdoo@gmail.com)
- ✅ **إيميل تلقائي للإدارة**
- ✅ **No server required - 100% free!**
- ✅ **لا يحتاج خادم - مجاني 100%!**

---

### 📁 Project Structure | هيكل المشروع

```
ambulance-log-system/
│
├── nurse-interface.html          # Nurse registration page | صفحة تسجيل الممرضات
├── admin-interface.html          # Admin dashboard | لوحة الإدارة
├── google-apps-script.js         # Backend code for Google Apps Script
├── GOOGLE-SETUP-GUIDE.md         # Complete setup instructions
├── README.md                     # Project documentation
└── INSTALLATION.md               # Alternative deployment options
```

---

### 🚀 Quick Start | البدء السريع

#### **Method 1: Google Apps Script (Recommended)**

**5-Minute Setup:**

1. **Create Google Sheet**
   - Go to Google Drive → New → Google Sheets
   - Name it: "Ambulance Activity Log"

2. **Add Apps Script**
   - Extensions → Apps Script
   - Delete default code
   - Copy & paste code from `google-apps-script.js`
   - Save as "Ambulance Log Backend"

3. **Run Setup**
   - Select function: `setupSheet`
   - Click Run → Allow permissions

4. **Deploy Web App**
   - Deploy → New deployment → Web app
   - Execute as: Me
   - Who has access: Anyone
   - Deploy → **Copy Web App URL**

5. **Update HTML Files**
   - Open `nurse-interface.html`
   - Replace: `const WEB_APP_URL = 'YOUR_URL_HERE';`
   - Paste your Web App URL
   - Repeat for `admin-interface.html`

6. **Test!**
   - Open HTML files in browser
   - Register a test case
   - Check Google Sheet
   - Check emails!

📖 **Detailed Guide:** See `GOOGLE-SETUP-GUIDE.md`

---

#### **Method 2: Local Testing (No Email)**

1. Open `nurse-interface.html` directly in browser
2. Open `admin-interface.html` directly in browser
3. Data saved in browser localStorage only
4. No email notifications

---

### 📧 Email Notifications | إشعارات البريد الإلكتروني

When a case is registered | عند تسجيل حالة:

**To Nurses** (English):
- **Email:** officerhasikhc@gmail.com
- **Subject:** New Ambulance Case - Vehicle [Number]
- **Content:** All case details in English
- **Also:** Automatically added to Google Sheet

**To Admin** (Arabic Subject, English Data):
- **Email:** superabdoo@gmail.com
- **Subject:** طلب جديد - سجل نشاط الإسعاف
- **Content:** All case details in English

---

### 🎨 Design Specifications | مواصفات التصميم

#### Color Scheme | نظام الألوان
- **Primary Blue**: #1e40af (Headers, buttons)
- **Light Blue**: #3b82f6 (Accents)
- **Background**: Linear gradient blue (#dbeafe → #eff6ff)
- **White**: #ffffff (Cards, forms)

#### Typography | الخطوط
- **English**: IBM Plex Sans
- **Arabic**: Cairo, IBM Plex Sans Arabic

#### Responsive Design | التصميم المتجاوب
- Mobile-first approach
- Touch-friendly interface
- Optimized for all screen sizes

---

### 📊 Data Fields | حقول البيانات

| Field | Type | Required | Description AR | Description EN |
|-------|------|----------|----------------|----------------|
| vehicleNumber | text | ✓ | رقم السيارة | Vehicle Number |
| driverName | text | ✓ | اسم السائق | Driver Name |
| staffNumber | text | ✓ | الرقم الوظيفي | Staff Number |
| departureDate | date | ✓ | تاريخ المغادرة | Departure Date |
| departureTime | time | ✓ | ساعة المغادرة | Departure Time |
| returnDate | date | ✓ | تاريخ العودة | Return Date |
| returnTime | time | ✓ | ساعة العودة | Return Time |
| destination | text | ✓ | الجهة المحول إليها | Transfer Destination |
| diagnosis | textarea | ✓ | حالة المريض | Patient Condition |
| nurseName | text | ✓ | اسم الممرضة | Nurse Name |

---

### 💡 Why Google Apps Script? | لماذا Google Apps Script؟

#### ✅ Advantages | المميزات:
- **100% Free** - No hosting costs
- **100% مجاني** - بدون تكاليف استضافة
- **Automatic Backups** - Google handles it
- **نسخ احتياطي تلقائي** - Google تديرها
- **Email Integration** - Built-in
- **تكامل البريد** - مدمج
- **No Server Setup** - Zero configuration
- **بدون إعداد خادم** - لا يحتاج ضبط
- **Secure** - Google's infrastructure
- **آمن** - بنية Google التحتية
- **Scalable** - Handles thousands of records
- **قابل للتوسع** - يتعامل مع آلاف السجلات

#### 📊 Limits | الحدود:
- Email: 100/day (free account)
- البريد: 100/يوم (حساب مجاني)
- Storage: Unlimited
- التخزين: غير محدود
- Perfect for health centers!
- مثالي للمراكز الصحية!

---

### 🌐 Deployment Options | خيارات النشر

#### 1. **GitHub Pages** (Recommended for frontend)
```bash
git init
git add .
git commit -m "Initial commit"
git branch gh-pages
git checkout gh-pages
git push origin gh-pages
```
URL: `https://username.github.io/repo-name/nurse-interface.html`

#### 2. **Google Sites**
- Create new Google Site
- Add HTML as embed
- Publish

#### 3. **Netlify / Vercel**
- Connect GitHub repo
- Auto-deploy

---

### 🔒 Security | الأمان

**Current Setup:**
- ✅ Data in Google Sheets (Google's security)
- ✅ Email via Google's servers
- ⚠️ Web App is public (anyone with URL can access)

**For Production:**
- Consider adding API key authentication
- Restrict Web App access by domain
- Implement user login system

---

### 📞 Support | الدعم

**Health Center Email:** officerhasikhc@gmail.com
**Admin Email:** superabdoo@gmail.com

---

### 🎯 Roadmap | خارطة الطريق

- [ ] User authentication system
- [ ] نظام مصادقة المستخدمين
- [ ] Mobile app (PWA)
- [ ] تطبيق الهاتف المحمول
- [ ] Advanced analytics dashboard
- [ ] لوحة تحليلات متقدمة
- [ ] PDF report generation
- [ ] إنشاء تقارير PDF
- [ ] SMS notifications
- [ ] إشعارات SMS
- [ ] Multi-language support (add more languages)
- [ ] دعم لغات إضافية

---

### 📝 License | الترخيص

This project is developed for Hasik Health Center, Ministry of Health, Sultanate of Oman.
تم تطوير هذا المشروع لمركز حاسك الصحي، وزارة الصحة، سلطنة عمان.

All rights reserved. | جميع الحقوق محفوظة.

---

**Version**: 2.0.0 (Google Apps Script Edition)
**Last Updated**: February 2025
**آخر تحديث**: فبراير 2025

---

### ✨ Features | المميزات

#### Nurse Interface | واجهة الممرضات
- ✅ Bilingual interface with easy language switching (E/ع)
- ✅ واجهة ثنائية اللغة مع إمكانية التبديل السهل
- ✅ Complete ambulance case registration form
- ✅ نموذج تسجيل كامل لحالات الإسعاف
- ✅ Real-time validation and auto-save
- ✅ التحقق الفوري والحفظ التلقائي
- ✅ Success notification after submission
- ✅ إشعار النجاح بعد الإرسال
- ✅ View, edit, and delete previous records
- ✅ عرض وتعديل وحذف السجلات السابقة
- ✅ Filter by year and month
- ✅ التصفية حسب السنة والشهر
- ✅ Total case count display
- ✅ عرض إجمالي عدد الحالات

#### Admin Interface | واجهة الإدارة
- ✅ Comprehensive dashboard with statistics
- ✅ لوحة معلومات شاملة مع الإحصائيات
- ✅ Real-time notifications for new cases
- ✅ إشعارات فورية للحالات الجديدة
- ✅ Advanced filtering and search
- ✅ تصفية وبحث متقدم
- ✅ Detailed case view modal
- ✅ نافذة عرض تفاصيل الحالة
- ✅ Print individual records
- ✅ طباعة السجلات الفردية
- ✅ Export to Excel/CSV
- ✅ التصدير إلى Excel/CSV
- ✅ Automatic data refresh
- ✅ تحديث تلقائي للبيانات

---

### 📁 Project Structure | هيكل المشروع

```
ambulance-log-system/
│
├── nurse-interface.html       # Nurse registration page | صفحة تسجيل الممرضات
├── admin-interface.html       # Admin dashboard | لوحة الإدارة
├── README.md                  # Project documentation | توثيق المشروع
└── server-integration.js      # Future server integration | التكامل المستقبلي مع الخادم
```

---

### 🚀 Getting Started | البدء

#### Local Testing | الاختبار المحلي

1. **Open the files directly in your browser:**
   ```
   - For nurses: Open nurse-interface.html
   - For admin: Open admin-interface.html
   ```

2. **افتح الملفات مباشرة في المتصفح:**
   ```
   - للممرضات: افتح nurse-interface.html
   - للإدارة: افتح admin-interface.html
   ```

#### Data Storage | تخزين البيانات

The system uses **localStorage** for data persistence in the browser. This means:
- Data is stored locally on each device
- No server required for testing
- Data persists between sessions
- Each browser has its own data

يستخدم النظام **localStorage** لحفظ البيانات في المتصفح. هذا يعني:
- يتم تخزين البيانات محليًا على كل جهاز
- لا يتطلب خادم للاختبار
- تبقى البيانات بين الجلسات
- كل متصفح لديه بياناته الخاصة

---

### 🔧 Future Server Integration | التكامل المستقبلي مع الخادم

#### Email Notifications | إشعارات البريد الإلكتروني

When deployed with a server, the system will send automatic emails:

عند النشر مع خادم، سيرسل النظام رسائل بريد إلكتروني تلقائية:

1. **To Nurses Email** (English data):
   - officerhasikhc@gmail.com
   - Updates Google Sheets: "Ambulance Activity Log"
   - Contains all case details in English

2. **To Admin Email** (Arabic notification):
   - superabdoo@gmail.com
   - Subject: "طلب جديد" (New Request)
   - Contains case details in English

#### Required Backend Setup | إعداد الخادم المطلوب

```javascript
// Example server endpoint
POST /api/ambulance-case
{
  "vehicleNumber": "122-23",
  "driverName": "Mohammed Al Rashdi",
  "staffNumber": "39634",
  // ... other fields
}

// Response
{
  "success": true,
  "message": "Case registered successfully",
  "id": 12345,
  "emailSent": true
}
```

---

### 🎨 Design Specifications | مواصفات التصميم

#### Color Scheme | نظام الألوان
- **Primary Blue**: #1e40af (Headers, buttons)
- **Light Blue**: #3b82f6 (Accents)
- **Background**: Linear gradient blue (#dbeafe → #eff6ff)
- **White**: #ffffff (Cards, forms)
- **Success Green**: #10b981
- **Warning Orange**: #f59e0b
- **Error Red**: #ef4444

#### Typography | الخطوط
- **English**: IBM Plex Sans
- **Arabic**: Cairo, IBM Plex Sans Arabic
- **Monospace**: IBM Plex Mono (for codes)

#### Responsive Design | التصميم المتجاوب
- Mobile-first approach
- Breakpoint: 768px
- Touch-friendly interface
- Optimized for all screen sizes

---

### 📊 Data Fields | حقول البيانات

| Field | Type | Required | Description AR | Description EN |
|-------|------|----------|----------------|----------------|
| vehicleNumber | text | ✓ | رقم السيارة | Vehicle Number |
| driverName | text | ✓ | اسم السائق | Driver Name |
| staffNumber | text | ✓ | الرقم الوظيفي | Staff Number |
| departureDate | date | ✓ | تاريخ المغادرة | Departure Date |
| departureTime | time | ✓ | ساعة المغادرة | Departure Time |
| returnDate | date | ✓ | تاريخ العودة | Return Date |
| returnTime | time | ✓ | ساعة العودة | Return Time |
| destination | text | ✓ | الجهة المحول إليها | Transfer Destination |
| diagnosis | textarea | ✓ | حالة المريض | Patient Condition |
| nurseName | text | ✓ | اسم الممرضة | Nurse Name |

---

### 🔐 Security Considerations | اعتبارات الأمان

⚠️ **Important for Production Deployment:**

1. **Authentication Required**
   - Implement user login system
   - Role-based access control (Nurse/Admin)
   - Session management

2. **Data Protection**
   - Use HTTPS only
   - Encrypt sensitive data
   - Implement HIPAA-compliant storage

3. **API Security**
   - Add authentication tokens
   - Rate limiting
   - Input validation and sanitization

4. **Audit Trail**
   - Log all data modifications
   - Track user actions
   - Maintain change history

---

### 📱 Browser Compatibility | التوافق مع المتصفحات

✅ Chrome/Edge (Recommended)
✅ Firefox
✅ Safari
✅ Mobile browsers (iOS/Android)

---

### 🛠️ Customization Guide | دليل التخصيص

#### Changing Colors | تغيير الألوان
Edit CSS variables in the `<style>` section:
```css
:root {
    --primary-blue: #1e40af;  /* Change this */
    --light-blue: #3b82f6;    /* And this */
}
```

#### Adding Fields | إضافة حقول
1. Add to HTML form
2. Update JavaScript form submission
3. Update table display
4. Update modal detail view

---

### 🚨 Troubleshooting | استكشاف الأخطاء

#### Data Not Saving?
- Check browser localStorage is enabled
- Clear browser cache
- Try different browser

#### البيانات لا تُحفظ؟
- تحقق من تمكين localStorage في المتصفح
- امسح ذاكرة التخزين المؤقت
- جرب متصفحًا آخر

#### Language Not Switching?
- Refresh the page
- Check browser console for errors

#### اللغة لا تتبدل؟
- حدّث الصفحة
- تحقق من وحدة التحكم في المتصفح

---

### 📞 Contact & Support | التواصل والدعم

**Health Center Email**: officerhasikhc@gmail.com
**Admin Email**: superabdoo@gmail.com

---

### 📝 License | الترخيص

This project is developed for Hasik Health Center, Ministry of Health, Sultanate of Oman.
All rights reserved.

تم تطوير هذا المشروع لمركز حاسك الصحي، وزارة الصحة، سلطنة عمان.
جميع الحقوق محفوظة.

---

### 🎯 Future Enhancements | التحسينات المستقبلية

- [ ] Mobile app (iOS/Android)
- [ ] تطبيق الهاتف المحمول
- [ ] Real-time synchronization
- [ ] المزامنة الفورية
- [ ] Advanced analytics dashboard
- [ ] لوحة تحليلات متقدمة
- [ ] PDF report generation
- [ ] إنشاء تقارير PDF
- [ ] SMS notifications
- [ ] إشعارات SMS
- [ ] Integration with hospital systems
- [ ] التكامل مع أنظمة المستشفى
- [ ] Barcode/QR scanning
- [ ] مسح الباركود/QR
- [ ] Voice input support
- [ ] دعم الإدخال الصوتي

---

**Version**: 1.0.0
**Last Updated**: February 2025
**آخر تحديث**: فبراير 2025
