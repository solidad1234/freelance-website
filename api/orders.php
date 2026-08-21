<?php
/**
 * Orders Management API Endpoint
 * Actions: create, list, get_order, update_status
 */

require_once __DIR__ . '/../config.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';

switch ($action) {
    case 'create':
        handle_create_order();
        break;
    case 'list':
        handle_list_orders();
        break;
    case 'get_order':
        handle_get_order();
        break;
    case 'update_status':
        handle_update_status();
        break;
    case 'upload_submission':
        handle_upload_submission();
        break;
    case 'upload_client_attachment':
        handle_upload_client_attachment();
        break;
    case 'get_messages':
        handle_get_messages();
        break;
    case 'send_message':
        handle_send_message();
        break;
    default:
        json_response(['error' => 'Invalid or missing orders action.'], 400);
}

function handle_create_order() {
    $db = get_db();
    $current_user = get_current_user_session();

    // If not logged in, attempt auto-registration/login from form input
    if (!$current_user) {
        $client_name = sanitize_input($_POST['clientName'] ?? '');
        $email = strtolower(sanitize_input($_POST['email'] ?? ''));
        $phone = sanitize_input($_POST['phone'] ?? '');
        $password = $_POST['password'] ?? 'ClientPass123!';

        if (empty($client_name) || empty($email)) {
            json_response(['error' => 'Please provide your name and email address to submit an order.'], 400);
        }

        // Check if user already exists
        $stmt = $db->prepare("SELECT * FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $existing = $stmt->fetch();

        if ($existing) {
            $user_id = $existing['id'];
            $client_name = $existing['name'];
        } else {
            $password_hash = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $db->prepare("INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'client')");
            $stmt->execute([$client_name, $email, $phone, $password_hash]);
            $user_id = $db->lastInsertId();
        }

        // Set session
        session_regenerate_id(true);
        $_SESSION['user_id'] = $user_id;
        $_SESSION['user_name'] = $client_name;
        $_SESSION['user_email'] = $email;
        $_SESSION['user_role'] = 'client';
        $_SESSION['user_phone'] = $phone;
        $current_user = get_current_user_session();
    }

    $subject = sanitize_input($_POST['subject'] ?? '');
    $instructions = sanitize_input($_POST['instructions'] ?? '');
    $service_type_raw = sanitize_input($_POST['service_type'] ?? '');
    
    if (strtolower($service_type_raw) === 'rewriting') {
        $service_type = 'Rewriting';
        $price_per_page = 4.00;
    } else {
        $service_type = 'Writing / Other';
        $price_per_page = 5.00;
    }

    $pages = max(1, (int)($_POST['pages'] ?? 1));
    $total_price = (float)($pages * $price_per_page);

    if (empty($subject) || empty($instructions)) {
        json_response(['error' => 'Please fill in both the assignment subject and requirements.'], 400);
    }

    // Generate unique order number (e.g. #2001, #2002)
    $stmt = $db->query("SELECT MAX(id) as max_id FROM orders");
    $row = $stmt->fetch();
    $next_id = ($row['max_id'] ?? 0) + 1;
    $order_number = '#' . (2000 + $next_id);

    // Insert Order into DB
    $stmt = $db->prepare("INSERT INTO orders (order_number, user_id, subject, instructions, service_type, price_per_page, pages, total_price, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')");
    $stmt->execute([$order_number, $current_user['id'], $subject, $instructions, $service_type, $price_per_page, $pages, $total_price]);
    $order_id = $db->lastInsertId();

    // Process File Attachments
    $uploaded_files = [];
    $allowed_extensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'zip', 'png', 'jpg', 'jpeg'];

    if (!file_exists(UPLOAD_DIR)) {
        @mkdir(UPLOAD_DIR, 0755, true);
    }

    if (isset($_FILES['attachments']) && !empty($_FILES['attachments']['name'][0])) {
        $files = $_FILES['attachments'];
        $count = count($files['name']);

        for ($i = 0; $i < $count; $i++) {
            if ($files['error'][$i] === UPLOAD_ERR_OK) {
                $orig_name = basename($files['name'][$i]);
                $file_size = $files['size'][$i];
                $tmp_path  = $files['tmp_name'][$i];
                $ext       = strtolower(pathinfo($orig_name, PATHINFO_EXTENSION));

                if (!in_array($ext, $allowed_extensions)) {
                    continue; // Skip invalid extensions
                }

                if ($file_size > MAX_FILE_SIZE) {
                    continue; // Skip oversized files
                }

                $stored_name = 'order_' . $order_id . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
                $dest_path   = UPLOAD_DIR . $stored_name;

                if (move_uploaded_file($tmp_path, $dest_path)) {
                    $mime_type = mime_content_type($dest_path) ?: 'application/octet-stream';
                    $stmt_file = $db->prepare("INSERT INTO order_attachments (order_id, uploaded_by_user_id, original_name, stored_name, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?)");
                    $stmt_file->execute([$order_id, $current_user['id'], $orig_name, $stored_name, $file_size, $mime_type]);
                    $uploaded_files[] = $orig_name;
                }
            }
        }
    }

    // Insert Initial System Welcome Chat Message
    $initial_msg = "\xF0\x9F\x93\xA2 Order {$order_number} has been created successfully! Our team will review your requirements and respond shortly. Feel free to send further details or questions in this chat.";
    $stmt_msg = $db->prepare("INSERT INTO chat_messages (order_id, sender_id, sender_role, message) VALUES (?, ?, 'admin', ?)");
    $stmt_msg->execute([$order_id, $current_user['id'], $initial_msg]);

    // Send Email Notifications — wrapped in try/catch so mail() failures on
    // shared hosts (InfinityFree blocks mail()) never abort order creation.
    try {
        $formatted_price = number_format($total_price, 2);
        $client_email_body = "Your order {$order_number} ('{$subject}') has been submitted successfully.\n\n" .
                             "Service Tier: {$service_type} (\${$price_per_page}/page)\n" .
                             "Pages: {$pages}\n" .
                             "Total Estimated Cost: \${$formatted_price} USD\n\n" .
                             "Requirements: {$instructions}\n" .
                             "Attachments: " . (count($uploaded_files) > 0 ? implode(', ', $uploaded_files) : 'None') . "\n\n" .
                             "Our writers are reviewing your order and will contact you within 15 minutes.";
        send_email_notification($current_user['email'], $current_user['name'], "Order Received: {$order_number}", $client_email_body);
    } catch (Exception $e) { /* silent — email failure must not block order */ }

    try {
        $formatted_price = number_format($total_price, 2);
        $admin_email_body = "New order {$order_number} submitted by {$current_user['name']} ({$current_user['email']}, Phone: {$current_user['phone']}).\n\n" .
                            "Subject: {$subject}\n" .
                            "Service Tier: {$service_type}\n" .
                            "Rate: \${$price_per_page}/page\n" .
                            "Pages: {$pages}\n" .
                            "Total Cost: \${$formatted_price} USD\n\n" .
                            "Instructions: {$instructions}\n" .
                            "Attachments: " . (count($uploaded_files) > 0 ? implode(', ', $uploaded_files) : 'None');
        send_email_notification(ADMIN_EMAIL, "Admin", "NEW ORDER: {$order_number} from {$current_user['name']}", $admin_email_body);
    } catch (Exception $e) { /* silent */ }

    json_response([
        'success' => true,
        'message' => "Order {$order_number} created successfully!",
        'order' => [
            'id' => $order_id,
            'order_number' => $order_number,
            'subject' => $subject,
            'service_type' => $service_type,
            'price_per_page' => $price_per_page,
            'pages' => $pages,
            'total_price' => $total_price,
            'status' => 'Pending',
            'attachments' => $uploaded_files
        ]
    ]);
}

function handle_list_orders() {
    $user = require_login();
    $db = get_db();

    if ($user['role'] === 'admin') {
        // Admin sees all orders with client user details
        $stmt = $db->query("
            SELECT o.*, u.name as client_name, u.email as client_email, u.phone as client_phone
            FROM orders o
            JOIN users u ON o.user_id = u.id
            ORDER BY o.created_at DESC
        ");
    } else {
        // Client sees only their own orders
        $stmt = $db->prepare("
            SELECT o.*, u.name as client_name, u.email as client_email, u.phone as client_phone
            FROM orders o
            JOIN users u ON o.user_id = u.id
            WHERE o.user_id = ?
            ORDER BY o.created_at DESC
        ");
        $stmt->execute([$user['id']]);
    }

    $orders = $stmt->fetchAll();

    // Attach file list and unread count to each order
    foreach ($orders as &$order) {
        $stmt_att = $db->prepare("SELECT id, original_name, stored_name, file_size, created_at FROM order_attachments WHERE order_id = ?");
        $stmt_att->execute([$order['id']]);
        $order['attachments'] = $stmt_att->fetchAll();

        // Unread message count
        $stmt_unread = $db->prepare("SELECT COUNT(*) as unread FROM chat_messages WHERE order_id = ? AND sender_role != ? AND is_read = 0");
        $stmt_unread->execute([$order['id'], $user['role']]);
        $order['unread_messages'] = (int) $stmt_unread->fetch()['unread'];
    }

    json_response([
        'success' => true,
        'orders' => $orders
    ]);
}

function handle_get_order() {
    $user = require_login();
    $order_id = (int)($_GET['id'] ?? $_POST['id'] ?? 0);

    if ($order_id <= 0) {
        json_response(['error' => 'Invalid order ID.'], 400);
    }

    $db = get_db();
    $stmt = $db->prepare("
        SELECT o.*, u.name as client_name, u.email as client_email, u.phone as client_phone
        FROM orders o
        JOIN users u ON o.user_id = u.id
        WHERE o.id = ?
    ");
    $stmt->execute([$order_id]);
    $order = $stmt->fetch();

    if (!$order) {
        json_response(['error' => 'Order not found.'], 404);
    }

    // Access control: client can only view own order
    if ($user['role'] !== 'admin' && $order['user_id'] != $user['id']) {
        json_response(['error' => 'Access denied.'], 403);
    }

    // Attachments
    $stmt_att = $db->prepare("SELECT id, original_name, stored_name, file_size, mime_type, created_at FROM order_attachments WHERE order_id = ?");
    $stmt_att->execute([$order_id]);
    $order['attachments'] = $stmt_att->fetchAll();

    json_response([
        'success' => true,
        'order' => $order
    ]);
}

function handle_update_status() {
    $user = require_login();
    $order_id = (int)($_POST['id'] ?? 0);
    $new_status = sanitize_input($_POST['status'] ?? '');

    $valid_statuses = ['Pending', 'In Progress', 'Completed', 'Cancelled'];
    if ($order_id <= 0 || !in_array($new_status, $valid_statuses)) {
        json_response(['error' => 'Invalid order ID or status value.'], 400);
    }

    $db = get_db();
    $stmt = $db->prepare("SELECT o.*, u.name as client_name, u.email as client_email FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?");
    $stmt->execute([$order_id]);
    $order = $stmt->fetch();

    if (!$order) {
        json_response(['error' => 'Order not found.'], 404);
    }

    // Access control: client can only update their own order
    if ($user['role'] !== 'admin' && $order['user_id'] != $user['id']) {
        json_response(['error' => 'Access denied.'], 403);
    }

    $stmt_update = $db->prepare("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    $stmt_update->execute([$new_status, $order_id]);

    $sender_role = $user['role'];
    $status_msg = "ℹ️ Order status updated to: **{$new_status}** by " . ($user['role'] === 'admin' ? 'Admin' : 'Client');
    $stmt_msg = $db->prepare("INSERT INTO chat_messages (order_id, sender_id, sender_role, message) VALUES (?, ?, ?, ?)");
    $stmt_msg->execute([$order_id, $user['id'], $sender_role, $status_msg]);

    // Send email notification to counterpart — non-fatal on InfinityFree
    try {
        if ($user['role'] === 'admin') {
            $email_body = "The status of your order {$order['order_number']} ('{$order['subject']}') has been updated to: {$new_status}.\n\nLog in to your portal dashboard to check progress and chat with our team.";
            send_email_notification($order['client_email'], $order['client_name'], "Order Status Update: {$order['order_number']}", $email_body);
        } else {
            $email_body = "Client {$order['client_name']} ({$order['client_email']}) updated status of order {$order['order_number']} to: {$new_status}.";
            send_email_notification(ADMIN_EMAIL, "Admin", "Client Order Status Update: {$order['order_number']}", $email_body);
        }
    } catch (Exception $e) { /* silent */ }

    json_response([
        'success' => true,
        'message' => "Order status updated to {$new_status}.",
        'new_status' => $new_status
    ]);
}

function handle_upload_submission() {
    $user = require_admin();
    $raw_order_id = $_POST['order_id'] ?? 0;

    if (empty($raw_order_id)) {
        json_response(['error' => 'Invalid order ID.'], 400);
    }

    // Collect files from $_FILES['files'] or $_FILES['file']
    $files_to_process = [];
    if (isset($_FILES['files']) && is_array($_FILES['files']['name'])) {
        for ($i = 0; $i < count($_FILES['files']['name']); $i++) {
            if ($_FILES['files']['error'][$i] === UPLOAD_ERR_OK) {
                $files_to_process[] = [
                    'name' => $_FILES['files']['name'][$i],
                    'tmp_name' => $_FILES['files']['tmp_name'][$i],
                    'size' => $_FILES['files']['size'][$i]
                ];
            }
        }
    } elseif (isset($_FILES['file'])) {
        if (is_array($_FILES['file']['name'])) {
            for ($i = 0; $i < count($_FILES['file']['name']); $i++) {
                if ($_FILES['file']['error'][$i] === UPLOAD_ERR_OK) {
                    $files_to_process[] = [
                        'name' => $_FILES['file']['name'][$i],
                        'tmp_name' => $_FILES['file']['tmp_name'][$i],
                        'size' => $_FILES['file']['size'][$i]
                    ];
                }
            }
        } elseif ($_FILES['file']['error'] === UPLOAD_ERR_OK) {
            $files_to_process[] = [
                'name' => $_FILES['file']['name'],
                'tmp_name' => $_FILES['file']['tmp_name'],
                'size' => $_FILES['file']['size']
            ];
        }
    }

    if (empty($files_to_process)) {
        json_response(['error' => 'Please select at least one valid file to upload.'], 400);
    }

    $db = get_db();
    $stmt = $db->prepare("SELECT o.*, u.name as client_name, u.email as client_email FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ? OR o.order_number = ?");
    $stmt->execute([(int)$raw_order_id, (string)$raw_order_id]);
    $order = $stmt->fetch();

    if (!$order) {
        json_response(['error' => 'Order not found.'], 404);
    }

    $real_order_id = $order['id'];
    $allowed_extensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'zip', 'png', 'jpg', 'jpeg', 'ppt', 'pptx'];
    $uploaded_names = [];

    foreach ($files_to_process as $file_info) {
        $orig_name = basename($file_info['name']);
        $file_size = $file_info['size'];
        $tmp_path  = $file_info['tmp_name'];
        $ext       = strtolower(pathinfo($orig_name, PATHINFO_EXTENSION));

        if (!in_array($ext, $allowed_extensions) || $file_size > MAX_FILE_SIZE) {
            continue; // Skip invalid or oversized files
        }

        $stored_name = 'solution_' . $real_order_id . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
        $dest_path   = UPLOAD_DIR . $stored_name;

        if (move_uploaded_file($tmp_path, $dest_path)) {
            $mime_type = mime_content_type($dest_path) ?: 'application/octet-stream';
            $stmt_file = $db->prepare("INSERT INTO order_attachments (order_id, uploaded_by_user_id, original_name, stored_name, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt_file->execute([$real_order_id, $user['id'], "[SOLUTION] " . $orig_name, $stored_name, $file_size, $mime_type]);
            $uploaded_names[] = $orig_name;
        }
    }

    if (empty($uploaded_names)) {
        json_response(['error' => 'Failed to upload selected files. Please check file format and size limit (25MB).'], 400);
    }

    // Mark order as Completed upon uploading solution files by admin
    $new_status = 'Completed';
    try {
        $stmt_update = $db->prepare("UPDATE orders SET status = 'Completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt_update->execute([$real_order_id]);
    } catch (Exception $e) {
        $stmt_update = $db->prepare("UPDATE orders SET status = 'Completed' WHERE id = ?");
        $stmt_update->execute([$real_order_id]);
    }

    // Insert Chat notification message
    $file_list_str = implode(', ', $uploaded_names);
    $msg_text = "📄 **Solution / Deliverable Uploaded!**\nFiles: `{$file_list_str}`\nAdmin has uploaded solution file(s) for your assignment. The order status is now marked as Completed. You can download your files and continue chatting if you need any follow-up!";
    $stmt_msg = $db->prepare("INSERT INTO chat_messages (order_id, sender_id, sender_role, message, attachment_name) VALUES (?, ?, 'admin', ?, ?)");
    $stmt_msg->execute([$real_order_id, $user['id'], $msg_text, $uploaded_names[0]]);

    // Send Email to Client — non-fatal
    try {
        $email_subject = "Completed Work Uploaded - Order {$order['order_number']}";
        $email_body    = "Hello {$order['client_name']},\n\nGreat news! The solution file(s) for your order {$order['order_number']} ('{$order['subject']}') have been uploaded by our admin team.\n\nUploaded Files: {$file_list_str}\n\nYour order is now marked as Completed. Please log in to your portal dashboard to download your files:\nhttp://firstclasswritershub.free.nf/\n\nThank you for choosing First Class Writers Hub!";
        send_email_notification($order['client_email'], $order['client_name'], $email_subject, $email_body);
    } catch (Exception $e) { /* silent */ }

    json_response([
        'success' => true,
        'message' => count($uploaded_names) . " file(s) uploaded successfully! Order marked as Completed.",
        'uploaded_files' => $uploaded_names,
        'new_status' => 'Completed'
    ]);
}

function handle_get_messages() {
    $user = require_login();
    $raw_order_id = $_GET['order_id'] ?? $_POST['order_id'] ?? '';

    if (empty($raw_order_id)) {
        json_response(['error' => 'Invalid order ID.'], 400);
    }

    $db = get_db();

    // Verify access to order by integer ID or Order Number string
    $stmt_ord = $db->prepare("SELECT id, user_id, order_number, subject FROM orders WHERE id = ? OR order_number = ?");
    $stmt_ord->execute([(int)$raw_order_id, (string)$raw_order_id]);
    $order = $stmt_ord->fetch();

    if (!$order) {
        json_response(['error' => 'Order not found.'], 404);
    }

    if ($user['role'] !== 'admin' && $order['user_id'] != $user['id']) {
        json_response(['error' => 'Access denied.'], 403);
    }

    $real_order_id = $order['id'];

    // Fetch messages
    $stmt_msgs = $db->prepare("
        SELECT cm.*, u.name as sender_name
        FROM chat_messages cm
        JOIN users u ON cm.sender_id = u.id
        WHERE cm.order_id = ?
        ORDER BY cm.created_at ASC
    ");
    $stmt_msgs->execute([$real_order_id]);
    $messages = $stmt_msgs->fetchAll();

    // Mark unread messages as read
    $stmt_read = $db->prepare("UPDATE chat_messages SET is_read = 1 WHERE order_id = ? AND sender_role != ?");
    $stmt_read->execute([$real_order_id, $user['role']]);

    json_response([
        'success' => true,
        'order_id' => $real_order_id,
        'order_number' => $order['order_number'],
        'messages' => $messages
    ]);
}

function handle_send_message() {
    $user = require_login();
    $raw_order_id = $_POST['order_id'] ?? '';
    $message = sanitize_input($_POST['message'] ?? '');

    $has_file = (isset($_FILES['attachment']) && $_FILES['attachment']['error'] === UPLOAD_ERR_OK);

    if (empty($raw_order_id) || (empty($message) && !$has_file)) {
        json_response(['error' => 'Please type a message or select a file to send.'], 400);
    }

    $db = get_db();

    // Verify order access
    $stmt_ord = $db->prepare("
        SELECT o.*, u.name as client_name, u.email as client_email
        FROM orders o
        JOIN users u ON o.user_id = u.id
        WHERE o.id = ? OR o.order_number = ?
    ");
    $stmt_ord->execute([(int)$raw_order_id, (string)$raw_order_id]);
    $order = $stmt_ord->fetch();

    if (!$order) {
        json_response(['error' => 'Order not found.'], 404);
    }

    if ($user['role'] !== 'admin' && $order['user_id'] != $user['id']) {
        json_response(['error' => 'Access denied.'], 403);
    }

    $real_order_id = $order['id'];

    // Optional attachment upload in chat
    $attachment_name = null;
    $attachment_id = null;
    if ($has_file) {
        $orig_name = basename($_FILES['attachment']['name']);
        $file_size = $_FILES['attachment']['size'];
        $tmp_path  = $_FILES['attachment']['tmp_name'];
        $ext       = strtolower(pathinfo($orig_name, PATHINFO_EXTENSION));

        $allowed_extensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'zip', 'png', 'jpg', 'jpeg', 'ppt', 'pptx'];
        if (in_array($ext, $allowed_extensions) && $file_size <= MAX_FILE_SIZE) {
            $stored_name = 'chat_' . $real_order_id . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
            $dest_path   = UPLOAD_DIR . $stored_name;
            if (move_uploaded_file($tmp_path, $dest_path)) {
                $mime_type = mime_content_type($dest_path) ?: 'application/octet-stream';
                $stmt_file = $db->prepare("INSERT INTO order_attachments (order_id, uploaded_by_user_id, original_name, stored_name, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?)");
                $stmt_file->execute([$real_order_id, $user['id'], $orig_name, $stored_name, $file_size, $mime_type]);
                $attachment_id = $db->lastInsertId();
                $attachment_name = $orig_name;
            }
        }
    }

    if (empty($message)) {
        $message = "Attached file: " . $attachment_name;
    }

    // Insert Chat Message
    $stmt = $db->prepare("INSERT INTO chat_messages (order_id, sender_id, sender_role, message, attachment_name) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([$real_order_id, $user['id'], $user['role'], $message, $attachment_name]);
    $msg_id = $db->lastInsertId();

    // Send Email Notification to Recipient — non-fatal
    try {
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
    } catch (Exception $e) { /* silent */ }

    json_response([
        'success' => true,
        'message_id' => $msg_id,
        'message' => [
            'id' => $msg_id,
            'order_id' => $real_order_id,
            'sender_id' => $user['id'],
            'sender_name' => $user['name'],
            'sender_role' => $user['role'],
            'message' => $message,
            'attachment_name' => $attachment_name,
            'created_at' => date('Y-m-d H:i:s')
        ]
    ]);
}

function handle_upload_client_attachment() {
    $user = require_login();
    $raw_order_id = $_POST['order_id'] ?? 0;

    if (empty($raw_order_id)) {
        json_response(['error' => 'Invalid order ID.'], 400);
    }

    $db = get_db();
    $stmt = $db->prepare("SELECT o.*, u.name as client_name, u.email as client_email FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ? OR o.order_number = ?");
    $stmt->execute([(int)$raw_order_id, (string)$raw_order_id]);
    $order = $stmt->fetch();

    if (!$order) {
        json_response(['error' => 'Order not found.'], 404);
    }

    if ($user['role'] !== 'admin' && $order['user_id'] != $user['id']) {
        json_response(['error' => 'Access denied.'], 403);
    }

    $real_order_id = $order['id'];

    // Collect files
    $files_to_process = [];
    if (isset($_FILES['files']) && is_array($_FILES['files']['name'])) {
        for ($i = 0; $i < count($_FILES['files']['name']); $i++) {
            if ($_FILES['files']['error'][$i] === UPLOAD_ERR_OK) {
                $files_to_process[] = [
                    'name' => $_FILES['files']['name'][$i],
                    'tmp_name' => $_FILES['files']['tmp_name'][$i],
                    'size' => $_FILES['files']['size'][$i]
                ];
            }
        }
    } elseif (isset($_FILES['file'])) {
        if (is_array($_FILES['file']['name'])) {
            for ($i = 0; $i < count($_FILES['file']['name']); $i++) {
                if ($_FILES['file']['error'][$i] === UPLOAD_ERR_OK) {
                    $files_to_process[] = [
                        'name' => $_FILES['file']['name'][$i],
                        'tmp_name' => $_FILES['file']['tmp_name'][$i],
                        'size' => $_FILES['file']['size'][$i]
                    ];
                }
            }
        } elseif ($_FILES['file']['error'] === UPLOAD_ERR_OK) {
            $files_to_process[] = [
                'name' => $_FILES['file']['name'],
                'tmp_name' => $_FILES['file']['tmp_name'],
                'size' => $_FILES['file']['size']
            ];
        }
    }

    if (empty($files_to_process)) {
        json_response(['error' => 'Please select at least one valid file to upload.'], 400);
    }

    $allowed_extensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'zip', 'png', 'jpg', 'jpeg', 'ppt', 'pptx'];
    $uploaded_names = [];

    foreach ($files_to_process as $file_info) {
        $orig_name = basename($file_info['name']);
        $file_size = $file_info['size'];
        $tmp_path  = $file_info['tmp_name'];
        $ext       = strtolower(pathinfo($orig_name, PATHINFO_EXTENSION));

        if (!in_array($ext, $allowed_extensions) || $file_size > MAX_FILE_SIZE) {
            continue;
        }

        $stored_name = 'att_' . $real_order_id . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
        $dest_path   = UPLOAD_DIR . $stored_name;

        if (move_uploaded_file($tmp_path, $dest_path)) {
            $mime_type = mime_content_type($dest_path) ?: 'application/octet-stream';
            $stmt_file = $db->prepare("INSERT INTO order_attachments (order_id, uploaded_by_user_id, original_name, stored_name, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt_file->execute([$real_order_id, $user['id'], $orig_name, $stored_name, $file_size, $mime_type]);
            $uploaded_names[] = $orig_name;
        }
    }

    if (empty($uploaded_names)) {
        json_response(['error' => 'Failed to upload selected files. Please check file format and size limit (25MB).'], 400);
    }

    // Insert Chat notification message
    $file_list_str = implode(', ', $uploaded_names);
    $msg_text = "📎 **Client attached additional file(s):** `{$file_list_str}`";
    $stmt_msg = $db->prepare("INSERT INTO chat_messages (order_id, sender_id, sender_role, message, attachment_name) VALUES (?, ?, ?, ?, ?)");
    $stmt_msg->execute([$real_order_id, $user['id'], $user['role'], $msg_text, $uploaded_names[0]]);

    // Send Email to Admin — non-fatal
    try {
        $email_subject = "New Attachment on Order {$order['order_number']}";
        $email_body    = "Client {$user['name']} has uploaded additional file(s) for order {$order['order_number']} ('{$order['subject']}'):\n\n" .
                         "Files: {$file_list_str}\n\n" .
                         "Check Admin Dashboard to view.";
        send_email_notification(ADMIN_EMAIL, "Admin", $email_subject, $email_body);
    } catch (Exception $e) { /* silent */ }

    json_response([
        'success' => true,
        'message' => count($uploaded_names) . " attachment(s) uploaded successfully!",
        'uploaded_files' => $uploaded_names
    ]);
}
