# First Class Writers Hub 🎓

A modern, responsive, and full-featured academic writing client portal and order management system built with **PHP** (Backend API), **Vanilla JavaScript**, and **Custom CSS**. 

The system features real-time cost calculation, file uploads, client assignment dashboard, interactive order support chat, admin control panel, and secure authentication with email password reset.

---

## ✨ Features

- **Client Order Portal**: Easy order submission with dynamic page/word count calculator and pricing tier selection (Rewriting vs Writing).
- **File Uploads**: Supports attached assignment files (PDF, DOCX, XLSX, images, ZIP) up to 25MB per file.
- **Client Dashboard**: Track active orders, view delivered solutions, upload additional instructions/files, and request revisions.
- **Support Chat**: Direct 2-way messaging per order between clients and admin support team.
- **Admin Management Panel (`admin.html`)**: View all orders, update status (Pending, In Progress, Completed, Cancelled), deliver completed solution files, and reply to client inquiries.
- **Secure Authentication**: Session management, `password_hash()` encryption, and email-based password reset with 6-digit verification codes.
- **Dual Database Engine**:
  - **Local Development**: Automatic fallback to SQLite (`writers_hub.sqlite`) — zero database setup required locally!
  - **Production**: Full MySQL / MariaDB support (compatible with InfinityFree, cPanel, Shared Hosting, VPS).
- **Built-in Socket SMTP Mailer**: Pure PHP socket mailer that works on hosts where standard PHP `mail()` is disabled (e.g., InfinityFree), supporting Gmail SMTP App Passwords, Brevo, SendGrid, etc.

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- PHP 7.4 or higher installed on your computer.

### Running Locally
1. Clone or download this repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/freelance.git
   cd freelance
   ```

2. Start the PHP built-in web server:
   ```bash
   php -S localhost:8080
   ```

3. Open your browser and navigate to:
   - **Client Portal**: `http://localhost:8080`
   - **Admin Portal**: `http://localhost:8080/admin.html`

4. **Default Admin Credentials**:
   - **Email**: `firstclasswritersk@gmail.com`
   - **Password**: `admin123` *(Change this password after your initial login!)*

> 💡 *Note: In local development, the app automatically creates and uses `writers_hub.sqlite`. You do not need to configure MySQL locally.*

---

## 🌐 Deployment Guide: InfinityFree (Free Web Hosting)

This guide walks you step-by-step through deploying **First Class Writers Hub** to [InfinityFree](https://www.infinityfree.com/) (free PHP & MySQL web hosting).

### Step 1: Create an Account on InfinityFree
1. Go to [InfinityFree.com](https://www.infinityfree.com/) and create a free account.
2. Go to **Accounts** > **Create Account**.
3. Choose a domain name (e.g. `yourname.infinityfreeapp.com`) or point your custom domain.
4. Click **Create Account** and wait a few seconds for the account to be provisioned.

---

### Step 2: Create a MySQL Database
1. Inside your InfinityFree account dashboard, click **Control Panel** (VPanel).
2. Scroll down to the **Databases** section and click **MySQL Databases**.
3. Under **Create a New Database**, enter a database name (e.g., `writers_hub`) and click **Create Database**.
4. Take note of your MySQL database credentials displayed on the page:
   - **MySQL Hostname**: *(e.g., `sql306.infinityfree.com`)*
   - **MySQL Database Name**: *(e.g., `if0_38274619_writers_hub`)*
   - **MySQL Username**: *(e.g., `if0_38274619`)*
   - **MySQL Password**: *(Your InfinityFree VPanel Password)*

---

### Step 3: Import `database.sql` into phpMyAdmin
1. In the **MySQL Databases** page on InfinityFree, click the **phpMyAdmin** button next to your newly created database.
2. In phpMyAdmin, click your database name on the left sidebar to select it.
3. Click the **Import** tab at the top of the page.
4. Click **Choose File** / **Browse** and select `database.sql` from your project folder.
5. Scroll to the bottom and click **Import** (or **Go**).
6. You should see a green success banner stating that the SQL queries executed successfully and tables (`users`, `orders`, `order_attachments`, `chat_messages`) have been created.

> 🛠️ *Alternative Method*: Click the **SQL** tab in phpMyAdmin, open `database.sql` in a text editor, copy all text, paste it into the query window, and click **Go**.

---

### Step 4: Upload Project Files to `htdocs`
1. In your InfinityFree Control Panel, click **File Manager** (or connect via an FTP client like FileZilla using your FTP credentials from InfinityFree).
2. Open the **`htdocs`** directory. *(Delete any default files like `index2.html` if present).*
3. Upload all files and folders from this repository into `htdocs`:
   ```text
   htdocs/
   ├── api/
   ├── css/
   ├── js/
   ├── uploads/
   ├── admin.html
   ├── config.php
   ├── database.sql
   └── index.html
   ```
4. Ensure the `uploads/` directory exists inside `htdocs` to store assignment attachments.

---

### Step 5: Update `config.php` Settings
Open `config.php` (either on your server using File Manager or locally before uploading) and update the credentials:

#### 1. Database Configuration
Update lines 28–31 with your InfinityFree MySQL details from Step 2:
```php
define('DB_HOST', 'sql306.infinityfree.com');      // Your MySQL Hostname
define('DB_NAME', 'if0_38274619_writers_hub');     // Your Database Name
define('DB_USER', 'if0_38274619');                 // Your MySQL Username
define('DB_PASS', 'YOUR_INFINITYFREE_PASSWORD');   // Your VPanel Password
```

#### 2. SMTP Email Configuration
InfinityFree disables the PHP `mail()` function on free accounts. To enable password reset emails, registration welcome emails, and order notifications, configure SMTP settings (lines 37–44):

If using **Gmail**:
1. Enable **2-Step Verification** on your Gmail account.
2. Generate an **App Password** (Google Account > Security > App passwords).
3. Enter your details in `config.php`:
```php
define('SMTP_ENABLED', true);
define('SMTP_HOST', 'smtp.gmail.com');
define('SMTP_PORT', 587);
define('SMTP_USER', 'yourname@gmail.com');
define('SMTP_PASS', 'xxxx xxxx xxxx xxxx'); // 16-character Gmail App Password
define('SMTP_SECURE', 'tls');
define('SMTP_FROM_EMAIL', 'yourname@gmail.com');
define('SMTP_FROM_NAME', SITE_NAME);
```

*(You can also use other SMTP services like Brevo, SendGrid, or Mailgun).*

---

### Step 6: Test Your Live Website
1. Visit your domain (e.g. `https://yourname.infinityfreeapp.com`).
2. **Client Portal Test**:
   - Register a new client account.
   - Click "Reset Password" on the login modal to test receiving the 6-digit reset code via email.
   - Place a test assignment order with file attachments.
3. **Admin Panel Test**:
   - Visit `https://yourname.infinityfreeapp.com/admin.html`.
   - Log in with `firstclasswritersk@gmail.com` / `admin123`.
   - View your test order, reply in chat, and upload a solution file.

---

## 📁 Directory Structure

```text
├── api/
│   ├── auth.php         # Authentication API (login, register, reset password, session)
│   ├── download.php     # Secure attachment file download handler
│   └── orders.php       # Orders management, submissions, chat messaging API
├── css/
│   ├── admin.css        # Admin panel styling
│   └── style.css        # Main portal CSS theme & design system
├── js/
│   ├── admin.js         # Admin dashboard functionality & event handlers
│   └── app.js           # Client portal logic, price calculator, auth modals, chat
├── uploads/             # Directory where client & solution attachments are stored
├── admin.html           # Admin control panel page
├── config.php           # Core site configuration, database connection, SMTP engine
├── database.sql         # Production MySQL database schema
├── index.html           # Main client landing page & order dashboard
└── README.md            # Documentation & deployment guide
```

---

## 🔐 Security Best Practices
- **Admin Password**: Immediately change the default admin password after first login via the Admin dashboard or user setting.
- **SMTP Password**: Never commit production passwords or Gmail App Passwords publicly to GitHub. Keep them in `config.php` or use environment variables.

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
