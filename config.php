<?php
/**
 * Configuration & Core Helper Library
 * First Class Writers Hub Backend
 */

// Start session securely if not already started
if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.cookie_httponly', 1);
    ini_set('session.use_only_cookies', 1);
    session_start();
}

// System Constants & Settings
define('SITE_NAME', 'First Class Writers Hub');
define('ADMIN_EMAIL', 'firstclasswritersk@gmail.com');
define('ADMIN_PHONE', '+254 746 357 646');
define('UPLOAD_DIR', __DIR__ . '/uploads/');
define('MAX_FILE_SIZE', 25 * 1024 * 1024); // 25 MB

// Database Credentials (Update these with your hosting MySQL details)
define('DB_HOST', 'localhost');
define('DB_NAME', 'writers_hub');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_CHARSET', 'utf8mb4');

/**
 * Get PDO Database Connection
 * Automatically creates database tables if running in SQLite fallback mode or PDO MySQL.
 */
function get_db() {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    try {
        $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);

        // Ensure default Admin user exists in MySQL
        try {
            $stmt = $pdo->prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
            $stmt->execute();
            if (!$stmt->fetch()) {
                $hash = password_hash('admin123', PASSWORD_DEFAULT);
                $seed = $pdo->prepare("INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'admin')");
                $seed->execute(['Admin', 'firstclasswritersk@gmail.com', '+254746357646', $hash]);
            }
        } catch (Exception $e) {
            // Ignore if tables not imported yet
        }

        return $pdo;
    } catch (PDOException $e) {
        // Attempt SQLite fallback (for local development)
        try {
            $sqlite_file = __DIR__ . '/writers_hub.sqlite';
            $pdo = new PDO("sqlite:" . $sqlite_file);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

            // Create SQLite tables if missing
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE,
                    phone TEXT,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'client',
                    reset_code TEXT,
                    reset_expires DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_number TEXT NOT NULL UNIQUE,
                    user_id INTEGER NOT NULL,
                    subject TEXT NOT NULL,
                    instructions TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'Pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS order_attachments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id INTEGER NOT NULL,
                    uploaded_by_user_id INTEGER NOT NULL,
                    original_name TEXT NOT NULL,
                    stored_name TEXT NOT NULL,
                    file_size INTEGER DEFAULT 0,
                    mime_type TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id INTEGER NOT NULL,
                    sender_id INTEGER NOT NULL,
                    sender_role TEXT NOT NULL,
                    message TEXT NOT NULL,
                    attachment_name TEXT,
                    is_read INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            ");
            
            // Seed Admin in SQLite if missing
            $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ? OR role = 'admin'");
            $stmt->execute(['firstclasswritersk@gmail.com']);
            $existing_admin = $stmt->fetch();
            if (!$existing_admin) {
                $hash = password_hash('admin123', PASSWORD_DEFAULT);
                $seed = $pdo->prepare("INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)");
                $seed->execute(['Admin', 'firstclasswritersk@gmail.com', '+254746357646', $hash, 'admin']);
            }

            return $pdo;
        } catch (Exception $sqliteErr) {
            json_response([
                'error' => 'Database connection failed. Please check MySQL credentials in config.php (Host, DB Name, User, Password). Details: ' . $e->getMessage()
            ], 500);
            exit();
        }
    }

    return $pdo;
}

/**
 * Output JSON API Response and terminate script
 */
function json_response($data, $status_code = 200) {
    header('Content-Type: application/json; charset=utf-8');
    // On shared hosts like InfinityFree, 401/403/404 HTTP codes trigger HTML error page intercepts.
    // Setting 200 ensures client receives valid JSON payload.
    if ($status_code >= 400 && $status_code <= 404) {
        $status_code = 200;
    }
    http_response_code($status_code);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Check if current session is authenticated
 */
function get_current_user_session() {
    if (isset($_SESSION['user_id'])) {
        return [
            'id' => $_SESSION['user_id'],
            'name' => $_SESSION['user_name'] ?? '',
            'email' => $_SESSION['user_email'] ?? '',
            'role' => $_SESSION['user_role'] ?? 'client',
            'phone' => $_SESSION['user_phone'] ?? ''
        ];
    }
    return null;
}

/**
 * Enforce Login Requirement
 */
function require_login() {
    $user = get_current_user_session();
    if (!$user) {
        json_response(['error' => 'Authentication required. Please log in.'], 401);
    }
    return $user;
}

/**
 * Enforce Admin Role Requirement
 */
function require_admin() {
    $user = require_login();
    if ($user['role'] !== 'admin') {
        json_response(['error' => 'Access denied. Admin privileges required.'], 403);
    }
    return $user;
}

/**
 * Sanitize User Input Strings
 */
function sanitize_input($data) {
    return htmlspecialchars(trim($data), ENT_QUOTES, 'UTF-8');
}

/**
 * Send Email Notifications using PHP mail() or configured SMTP
 */
function send_email_notification($to_email, $to_name, $subject, $message_text) {
    $headers = [];
    $headers[] = 'MIME-Version: 1.0';
    $headers[] = 'Content-type: text/html; charset=utf-8';
    $headers[] = 'From: ' . SITE_NAME . ' <' . ADMIN_EMAIL . '>';
    $headers[] = 'Reply-To: ' . ADMIN_EMAIL;
    $headers[] = 'X-Mailer: PHP/' . phpversion();

    $html_content = '
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px; color: #333; }
        .container { max-width: 600px; background: #ffffff; margin: 0 auto; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background-color: #003b6f; color: #ffffff; padding: 20px; text-align: center; }
        .header h2 { margin: 0; font-size: 20px; }
        .content { padding: 25px; line-height: 1.6; }
        .footer { background-color: #eef2f5; text-align: center; padding: 15px; font-size: 12px; color: #777; }
        .badge { background: #f7941e; color: white; padding: 4px 10px; border-radius: 20px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>' . SITE_NAME . '</h2>
        </div>
        <div class="content">
          <p>Hello <strong>' . htmlspecialchars($to_name) . '</strong>,</p>
          <div>' . nl2br(htmlspecialchars($message_text)) . '</div>
          <br>
          <p>If you have any questions, reply to this email or chat with us on your portal dashboard.</p>
          <p>Best regards,<br><strong>First Class Writers Hub Team</strong></p>
        </div>
        <div class="footer">
          &copy; ' . date('Y') . ' First Class Writers Hub. All rights reserved.<br>
          Phone/WhatsApp: ' . ADMIN_PHONE . '
        </div>
      </div>
    </body>
    </html>
    ';

    // Attempt mail send (returns true on success)
    @mail($to_email, $subject, $html_content, implode("\r\n", $headers));
    return true;
}
