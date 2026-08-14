<?php
/**
 * Authentication API Endpoint
 * Actions: register, login, check, logout
 */

require_once __DIR__ . '/../config.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';

switch ($action) {
    case 'register':
        handle_register();
        break;
    case 'login':
        handle_login();
        break;
    case 'check':
        handle_check();
        break;
    case 'logout':
        handle_logout();
        break;
    case 'change_password':
        handle_change_password();
        break;
    case 'forgot_password':
        handle_forgot_password();
        break;
    case 'reset_password':
        handle_reset_password();
        break;
    default:
        json_response(['error' => 'Invalid or missing authentication action.'], 400);
}

function handle_register() {
    $name = sanitize_input($_POST['name'] ?? '');
    $email = strtolower(sanitize_input($_POST['email'] ?? ''));
    $phone = sanitize_input($_POST['phone'] ?? '');
    $password = $_POST['password'] ?? '';

    if (empty($name) || empty($email) || empty($password)) {
        json_response(['error' => 'Please fill in all required fields (name, email, password).'], 400);
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_response(['error' => 'Invalid email address format.'], 400);
    }

    if (strlen($password) < 6) {
        json_response(['error' => 'Password must be at least 6 characters long.'], 400);
    }

    $db = get_db();

    // Check if email already registered
    $stmt = $db->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        json_response(['error' => 'An account with this email address already exists. Please log in.'], 409);
    }

    // Hash password securely
    $password_hash = password_hash($password, PASSWORD_DEFAULT);

    // Insert user
    $stmt = $db->prepare("INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'client')");
    $stmt->execute([$name, $email, $phone, $password_hash]);
    $user_id = $db->lastInsertId();

    // Send Welcome Email
    send_email_notification(
        $email,
        $name,
        "Welcome to First Class Writers Hub!",
        "Thank you for creating an account with First Class Writers Hub!\n\nYou can now place orders, track your assignment status, send attached files, and chat directly with our team from your dashboard."
    );

    json_response([
        'success' => true,
        'message' => 'Account created successfully! Please sign in with your email and password.',
        'user' => [
            'id' => $user_id,
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'role' => 'client'
        ]
    ]);
}

function handle_login() {
    $email = strtolower(sanitize_input($_POST['email'] ?? ''));
    $password = $_POST['password'] ?? '';

    if (empty($email) || empty($password)) {
        json_response(['error' => 'Please enter both your email address and password.'], 400);
    }

    $db = get_db();
    $stmt = $db->prepare("SELECT * FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        json_response(['error' => 'Invalid email or password. Please try again.'], 401);
    }

    // Set session
    session_regenerate_id(true);
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['user_name'] = $user['name'];
    $_SESSION['user_email'] = $user['email'];
    $_SESSION['user_role'] = $user['role'];
    $_SESSION['user_phone'] = $user['phone'] ?? '';

    json_response([
        'success' => true,
        'message' => 'Logged in successfully!',
        'user' => get_current_user_session()
    ]);
}

function handle_check() {
    $user = get_current_user_session();
    json_response([
        'authenticated' => ($user !== null),
        'user' => $user
    ]);
}

function handle_logout() {
    $_SESSION = [];
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]
        );
    }
    session_destroy();

    json_response([
        'success' => true,
        'message' => 'Logged out successfully.'
    ]);
}

function handle_change_password() {
    $user_session = require_login();
    $current_password = $_POST['current_password'] ?? '';
    $new_password = $_POST['new_password'] ?? '';
    $confirm_password = $_POST['confirm_password'] ?? '';

    if (empty($current_password) || empty($new_password)) {
        json_response(['error' => 'Please fill in both current and new password.'], 400);
    }

    if (strlen($new_password) < 6) {
        json_response(['error' => 'New password must be at least 6 characters long.'], 400);
    }

    if (!empty($confirm_password) && $new_password !== $confirm_password) {
        json_response(['error' => 'New password and confirmation do not match.'], 400);
    }

    $db = get_db();
    $stmt = $db->prepare("SELECT * FROM users WHERE id = ?");
    $stmt->execute([$user_session['id']]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($current_password, $user['password_hash'])) {
        json_response(['error' => 'Current password is incorrect. Please try again.'], 400);
    }

    $new_hash = password_hash($new_password, PASSWORD_DEFAULT);
    $update = $db->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
    $update->execute([$new_hash, $user_session['id']]);

    json_response([
        'success' => true,
        'message' => 'Password updated successfully!'
    ]);
}

function handle_forgot_password() {
    $email = strtolower(sanitize_input($_POST['email'] ?? ''));
    if (empty($email)) {
        json_response(['error' => 'Please enter your email address.'], 400);
    }

    $db = get_db();
    $stmt = $db->prepare("SELECT id, name, email FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user) {
        json_response(['error' => 'No registered account found with this email address.'], 404);
    }

    $reset_code = sprintf("%06d", mt_rand(100000, 999999));
    $expires = date('Y-m-d H:i:s', time() + 3600); // 1 hour validity

    $update = $db->prepare("UPDATE users SET reset_code = ?, reset_expires = ? WHERE id = ?");
    $update->execute([$reset_code, $expires, $user['id']]);

    // Send email notification with reset code
    send_email_notification(
        $user['email'],
        $user['name'],
        "Password Reset Code - First Class Writers Hub",
        "You requested to reset your password.\n\nYour 6-digit Password Reset Code is: " . $reset_code . "\n\nThis code will expire in 1 hour. Enter this code on the portal to set a new password."
    );

    json_response([
        'success' => true,
        'message' => 'A 6-digit reset code has been sent to your email address.',
        'code_demo' => $reset_code // Returned for convenience in local testing environment
    ]);
}

function handle_reset_password() {
    $email = strtolower(sanitize_input($_POST['email'] ?? ''));
    $reset_code = sanitize_input($_POST['reset_code'] ?? '');
    $new_password = $_POST['new_password'] ?? '';

    if (empty($email) || empty($reset_code) || empty($new_password)) {
        json_response(['error' => 'Please enter your email, reset code, and new password.'], 400);
    }

    if (strlen($new_password) < 6) {
        json_response(['error' => 'New password must be at least 6 characters long.'], 400);
    }

    $db = get_db();
    $stmt = $db->prepare("SELECT id, name, reset_code, reset_expires FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user) {
        json_response(['error' => 'Invalid email or reset code.'], 400);
    }

    if (empty($user['reset_code']) || $user['reset_code'] !== $reset_code) {
        json_response(['error' => 'Invalid or expired 6-digit reset code.'], 400);
    }

    if (!empty($user['reset_expires']) && strtotime($user['reset_expires']) < time()) {
        json_response(['error' => 'Reset code has expired. Please request a new one.'], 400);
    }

    $new_hash = password_hash($new_password, PASSWORD_DEFAULT);
    $update = $db->prepare("UPDATE users SET password_hash = ?, reset_code = NULL, reset_expires = NULL WHERE id = ?");
    $update->execute([$new_hash, $user['id']]);

    json_response([
        'success' => true,
        'message' => 'Password reset successfully! You can now log in with your new password.'
    ]);
}
