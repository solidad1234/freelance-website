<?php
/**
 * Chat Messaging API Endpoint
 * Actions: get_messages, send_message
 */

require_once __DIR__ . '/../config.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';

switch ($action) {
    case 'get_messages':
        handle_get_messages();
        break;
    case 'send_message':
        handle_send_message();
        break;
    default:
        json_response(['error' => 'Invalid or missing chat action.'], 400);
}

function handle_get_messages() {
    $user = require_login();
    $order_id = (int)($_GET['order_id'] ?? $_POST['order_id'] ?? 0);

    if ($order_id <= 0) {
        json_response(['error' => 'Invalid order ID.'], 400);
    }

    $db = get_db();

    // Verify access to order
    $stmt_ord = $db->prepare("SELECT id, user_id, order_number, subject FROM orders WHERE id = ?");
    $stmt_ord->execute([$order_id]);
    $order = $stmt_ord->fetch();

    if (!$order) {
        json_response(['error' => 'Order not found.'], 404);
    }

    if ($user['role'] !== 'admin' && $order['user_id'] != $user['id']) {
        json_response(['error' => 'Access denied.'], 403);
    }

    // Fetch messages
    $stmt_msgs = $db->prepare("
        SELECT cm.*, u.name as sender_name
        FROM chat_messages cm
        JOIN users u ON cm.sender_id = u.id
        WHERE cm.order_id = ?
        ORDER BY cm.created_at ASC
    ");
    $stmt_msgs->execute([$order_id]);
    $messages = $stmt_msgs->fetchAll();

    // Mark unread messages as read
    $stmt_read = $db->prepare("UPDATE chat_messages SET is_read = 1 WHERE order_id = ? AND sender_role != ?");
    $stmt_read->execute([$order_id, $user['role']]);

    json_response([
        'success' => true,
        'order_number' => $order['order_number'],
        'messages' => $messages
    ]);
}

function handle_send_message() {
    $user = require_login();
    $order_id = (int)($_POST['order_id'] ?? 0);
    $message = sanitize_input($_POST['message'] ?? '');

    if ($order_id <= 0 || empty($message)) {
        json_response(['error' => 'Message text cannot be empty.'], 400);
    }

    $db = get_db();

    // Verify order access
    $stmt_ord = $db->prepare("
        SELECT o.*, u.name as client_name, u.email as client_email
        FROM orders o
        JOIN users u ON o.user_id = u.id
        WHERE o.id = ?
    ");
    $stmt_ord->execute([$order_id]);
    $order = $stmt_ord->fetch();

    if (!$order) {
        json_response(['error' => 'Order not found.'], 404);
    }

    if ($user['role'] !== 'admin' && $order['user_id'] != $user['id']) {
        json_response(['error' => 'Access denied.'], 403);
    }

    // Optional attachment upload in chat
    $attachment_name = null;
    if (isset($_FILES['attachment']) && $_FILES['attachment']['error'] === UPLOAD_ERR_OK) {
        $orig_name = basename($_FILES['attachment']['name']);
        $file_size = $_FILES['attachment']['size'];
        $tmp_path  = $_FILES['attachment']['tmp_name'];
        $ext       = strtolower(pathinfo($orig_name, PATHINFO_EXTENSION));

        $allowed_extensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'zip', 'png', 'jpg', 'jpeg'];
        if (in_array($ext, $allowed_extensions) && $file_size <= MAX_FILE_SIZE) {
            $stored_name = 'chat_' . $order_id . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
            $dest_path   = UPLOAD_DIR . $stored_name;
            if (move_uploaded_file($tmp_path, $dest_path)) {
                $mime_type = mime_content_type($dest_path) ?: 'application/octet-stream';
                $stmt_file = $db->prepare("INSERT INTO order_attachments (order_id, uploaded_by_user_id, original_name, stored_name, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?)");
                $stmt_file->execute([$order_id, $user['id'], $orig_name, $stored_name, $file_size, $mime_type]);
                $attachment_name = $orig_name;
            }
        }
    }

    // Insert Chat Message
    $stmt = $db->prepare("INSERT INTO chat_messages (order_id, sender_id, sender_role, message, attachment_name) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([$order_id, $user['id'], $user['role'], $message, $attachment_name]);
    $msg_id = $db->lastInsertId();

    // Send Email Notification to Recipient
    if ($user['role'] === 'admin') {
        // Admin sent message -> Email Client
        $email_subject = "New Message on Order {$order['order_number']}";
        $email_body    = "You received a new message from First Class Writers Hub regarding order {$order['order_number']} ('{$order['subject']}'):\n\n" .
                         "\"{$message}\"\n\n" .
                         "Log in to your portal dashboard to reply.";
        send_email_notification($order['client_email'], $order['client_name'], $email_subject, $email_body);
    } else {
        // Client sent message -> Email Admin
        $email_subject = "Client Message on Order {$order['order_number']}";
        $email_body    = "Client {$user['name']} sent a message regarding order {$order['order_number']}:\n\n" .
                         "\"{$message}\"\n\n" .
                         "Check Admin Dashboard to reply.";
        send_email_notification(ADMIN_EMAIL, "Admin", $email_subject, $email_body);
    }

    json_response([
        'success' => true,
        'message_id' => $msg_id,
        'message' => [
            'id' => $msg_id,
            'order_id' => $order_id,
            'sender_id' => $user['id'],
            'sender_name' => $user['name'],
            'sender_role' => $user['role'],
            'message' => $message,
            'attachment_name' => $attachment_name,
            'created_at' => date('Y-m-d H:i:s')
        ]
    ]);
}
