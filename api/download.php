<?php
/**
 * Secure File Download Endpoint
 * Validates permissions before streaming attached files
 */

require_once __DIR__ . '/../config.php';

$user = require_login();
$attachment_id = (int)($_GET['id'] ?? 0);

if ($attachment_id <= 0) {
    json_response(['error' => 'Invalid attachment ID.'], 400);
}

$db = get_db();
$stmt = $db->prepare("
    SELECT oa.*, o.user_id as order_owner_id
    FROM order_attachments oa
    JOIN orders o ON oa.order_id = o.id
    WHERE oa.id = ?
");
$stmt->execute([$attachment_id]);
$file = $stmt->fetch();

if (!$file) {
    json_response(['error' => 'Attachment file record not found.'], 404);
}

// Access Control Check
if ($user['role'] !== 'admin' && $file['order_owner_id'] != $user['id']) {
    json_response(['error' => 'Access denied. You do not have permission to download this file.'], 403);
}

$file_path = UPLOAD_DIR . $file['stored_name'];

if (!file_exists($file_path)) {
    json_response(['error' => 'File does not exist on disk server.'], 404);
}

// Set Headers for Download
$mime = $file['mime_type'] ?: 'application/octet-stream';
$orig_name = $file['original_name'];

header('Content-Description: File Transfer');
header('Content-Type: ' . $mime);
header('Content-Disposition: attachment; filename="' . addslashes($orig_name) . '"');
header('Content-Transfer-Encoding: binary');
header('Expires: 0');
header('Cache-Control: must-revalidate');
header('Pragma: public');
header('Content-Length: ' . filesize($file_path));

// Stream file
readfile($file_path);
exit;
