/**
 * Admin Management Portal JavaScript
 * First Class Writers Hub
 */

let currentAdminUser = null;
let allOrders = [];
let activeAdminChatOrderId = null;
let adminChatPollInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    initAdmin();
});

async function initAdmin() {
    setupAdminEventListeners();
    await checkAdminAuth();
}

async function checkAdminAuth() {
    try {
        const res = await fetch('api/auth.php?action=check');
        const data = await res.json();

        if (data.authenticated && data.user && data.user.role === 'admin') {
            currentAdminUser = data.user;
            document.getElementById('adminNameDisplay').textContent = data.user.name;
            document.getElementById('adminLoginView').style.display = 'none';
            document.getElementById('adminDashboardView').style.display = 'block';
            loadAdminOrders();
        } else {
            currentAdminUser = null;
            document.getElementById('adminLoginView').style.display = 'block';
            document.getElementById('adminDashboardView').style.display = 'none';
        }
    } catch (err) {
        console.error('Admin Auth Check Failed:', err);
    }
}

function setupAdminEventListeners() {
    const loginForm = document.getElementById('adminLoginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleAdminLoginSubmit);
    }

    const passForm = document.getElementById('adminPassForm');
    if (passForm) {
        passForm.addEventListener('submit', handleAdminChangePassSubmit);
    }

    const sendBtn = document.getElementById('adminSendChatBtn');
    if (sendBtn) {
        sendBtn.addEventListener('click', handleSendAdminChatMessage);
    }

    const input = document.getElementById('adminChatInput');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendAdminChatMessage();
            }
        });
    }
}

async function handleAdminLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const alertBox = document.getElementById('adminAlert');

    alertBox.style.display = 'none';

    try {
        const formData = new FormData();
        formData.append('email', email);
        formData.append('password', password);

        const res = await fetch('api/auth.php?action=login', {
            method: 'POST',
            body: formData
        });

        const data = await res.json();

        if (data.success && data.user.role === 'admin') {
            currentAdminUser = data.user;
            document.getElementById('adminNameDisplay').textContent = data.user.name;
            document.getElementById('adminLoginView').style.display = 'none';
            document.getElementById('adminDashboardView').style.display = 'block';
            loadAdminOrders();
        } else {
            alertBox.textContent = data.error || 'Login failed. Admin access required.';
            alertBox.style.display = 'block';
        }
    } catch (err) {
        alertBox.textContent = 'Connection error.';
        alertBox.style.display = 'block';
    }
}

async function handleAdminLogout() {
    await fetch('api/auth.php?action=logout', { method: 'POST' });
    window.location.reload();
}

async function loadAdminOrders() {
    try {
        const res = await fetch('api/orders.php?action=list');
        const data = await res.json();

        if (data.success) {
            allOrders = data.orders || [];
            updateStatsMetrics(allOrders);
            renderAdminOrdersTable(allOrders);
        }
    } catch (err) {
        console.error('Error loading orders for admin:', err);
    }
}

function updateStatsMetrics(orders) {
    document.getElementById('statTotalOrders').textContent = orders.length;
    document.getElementById('statPendingOrders').textContent = orders.filter(o => o.status === 'Pending').length;
    document.getElementById('statInProgressOrders').textContent = orders.filter(o => o.status === 'In Progress').length;
    document.getElementById('statCompletedOrders').textContent = orders.filter(o => o.status === 'Completed').length;
}

function filterAdminOrders() {
    const query = document.getElementById('adminSearchInput').value.toLowerCase().trim();
    const statusFilter = document.getElementById('adminStatusFilter').value;

    const filtered = allOrders.filter(o => {
        const matchesQuery = !query || 
            o.order_number.toLowerCase().includes(query) ||
            o.client_name.toLowerCase().includes(query) ||
            o.client_email.toLowerCase().includes(query) ||
            o.subject.toLowerCase().includes(query);

        const matchesStatus = (statusFilter === 'ALL' || o.status === statusFilter);

        return matchesQuery && matchesStatus;
    });

    renderAdminOrdersTable(filtered);
}

function renderAdminOrdersTable(orders) {
    const tbody = document.getElementById('adminOrdersTableBody');
    if (!tbody) return;

    if (!orders || orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: #64748b;">No matching orders found.</td></tr>`;
        return;
    }

    let html = '';
    orders.forEach(order => {
        const statusClass = order.status.toLowerCase().replace(' ', '-');
        const fileCount = order.attachments ? order.attachments.length : 0;
        const attachmentLabel = fileCount > 0 ? `${fileCount} File${fileCount > 1 ? 's' : ''}` : 'None';

        // Truncate instructions preview for clean table display
        const truncatedInstructions = order.instructions.length > 90 
            ? escapeHtml(order.instructions.substring(0, 90)) + '...' 
            : escapeHtml(order.instructions);

        const unreadBadge = order.unread_messages > 0 ? `<span class="status-badge status-pending" style="font-size:0.7rem; padding: 2px 6px;">${order.unread_messages} unread</span>` : '';

        html += `
            <tr>
                <td><strong>${order.order_number}</strong><br><small style="color:#64748b;">${order.created_at}</small></td>
                <td class="client-info">
                    <strong>${escapeHtml(order.client_name)}</strong>
                    <small><i class="fas fa-envelope"></i> ${escapeHtml(order.client_email)}</small><br>
                    <small><i class="fas fa-phone"></i> ${escapeHtml(order.client_phone || 'N/A')}</small>
                </td>
                <td><strong>${escapeHtml(order.subject)}</strong></td>
                <td>
                    <div style="font-size: 0.85rem; color: #334155; max-width: 220px; line-height: 1.4;">
                        ${truncatedInstructions}
                    </div>
                </td>
                <td>
                    <button class="btn-chat-open" style="background: #0284c7; padding: 5px 12px; font-size: 0.8rem;" onclick="openOrderDetailsModal(${order.id})">
                        <i class="fas fa-eye"></i> Details (${attachmentLabel})
                    </button>
                </td>
                <td>
                    <select class="status-select-inline status-${statusClass}" onchange="updateOrderStatus(${order.id}, this.value)">
                        <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>Pending</option>
                        <option value="In Progress" ${order.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                        <option value="Completed" ${order.status === 'Completed' ? 'selected' : ''}>Completed</option>
                        <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </td>
                <td>
                    <button class="btn-chat-open" onclick="openAdminChatDrawer(${order.id}, '${order.order_number}', '${escapeHtml(order.client_name)}')">
                        <i class="fas fa-comments"></i> Chat ${unreadBadge}
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

/**
 * Open Order Details Modal
 */
let activeModalOrderId = null;
let selectedAdminFile = null;

function openOrderDetailsModal(orderId) {
    const order = allOrders.find(o => o.id == orderId);
    if (!order) return;

    activeModalOrderId = order.id;
    document.getElementById('modalOrderNumber').innerHTML = `<i class="fas fa-file-alt" style="color: var(--primary-orange);"></i> Details for Order ${order.order_number}`;
    document.getElementById('modalOrderSubmitted').textContent = `Submitted: ${order.created_at}`;
    document.getElementById('modalClientName').textContent = order.client_name;
    document.getElementById('modalClientEmail').innerHTML = `<i class="fas fa-envelope"></i> ${escapeHtml(order.client_email)}`;
    document.getElementById('modalClientPhone').innerHTML = `<i class="fas fa-phone"></i> ${escapeHtml(order.client_phone || 'N/A')}`;

    const statusBadge = document.getElementById('modalOrderStatusBadge');
    statusBadge.className = `status-badge status-${order.status.toLowerCase().replace(' ', '-')}`;
    statusBadge.textContent = order.status;

    document.getElementById('modalOrderSubject').textContent = order.subject;
    document.getElementById('modalOrderInstructions').textContent = order.instructions;

    const attachmentsContainer = document.getElementById('modalOrderAttachments');
    if (order.attachments && order.attachments.length > 0) {
        attachmentsContainer.innerHTML = order.attachments.map(att => {
            const isSolution = att.original_name.startsWith('[SOLUTION]');
            const pillStyle = isSolution 
                ? 'background: #dcfce7; color: #15803d; border: 1px solid #86efac;'
                : 'background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;';
            const icon = isSolution ? 'fa-check-circle' : 'fa-download';
            return `<a href="api/download.php?id=${att.id}" target="_blank" class="attachment-pill" style="padding: 8px 14px; font-size: 0.85rem; font-weight: 600; ${pillStyle} border-radius: 8px;"><i class="fas ${icon}"></i> ${escapeHtml(att.original_name)}</a>`;
        }).join('');
    } else {
        attachmentsContainer.innerHTML = `<span style="font-size: 0.85rem; color: #94a3b8; font-style: italic;">No attachments uploaded for this order yet.</span>`;
    }

    const openChatBtn = document.getElementById('modalOpenChatBtn');
    if (openChatBtn) {
        openChatBtn.onclick = () => {
            closeOrderDetailsModal();
            openAdminChatDrawer(order.id, order.order_number, order.client_name);
        };
    }

    const modal = document.getElementById('orderDetailsModal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeOrderDetailsModal() {
    activeModalOrderId = null;
    const modal = document.getElementById('orderDetailsModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

async function handleModalDeliverWork(input) {
    if (!activeModalOrderId || !input.files || input.files.length === 0) return;
    const file = input.files[0];

    const formData = new FormData();
    formData.append('order_id', activeModalOrderId);
    formData.append('file', file);

    try {
        const res = await fetch('api/orders.php?action=upload_submission', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            alert(`Success: Solution file '${file.name}' delivered to client!`);
            input.value = '';
            closeOrderDetailsModal();
            loadAdminOrders();
        } else {
            alert(data.error || 'Failed to upload solution file.');
        }
    } catch (err) {
        console.error('Deliver solution error:', err);
        alert('Connection error occurred while uploading file.');
    }
}

async function handleAdminDeliverWork(input) {
    if (!activeAdminChatOrderId || !input.files || input.files.length === 0) return;
    const file = input.files[0];

    const formData = new FormData();
    formData.append('order_id', activeAdminChatOrderId);
    formData.append('file', file);

    try {
        const res = await fetch('api/orders.php?action=upload_submission', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            alert(`Success: Completed work '${file.name}' delivered to client!`);
            input.value = '';
            loadAdminChatMessages(activeAdminChatOrderId);
            loadAdminOrders();
        } else {
            alert(data.error || 'Failed to upload solution file.');
        }
    } catch (err) {
        console.error('Deliver solution error:', err);
        alert('Connection error occurred while uploading file.');
    }
}

function handleAdminFileSelected(input) {
    if (input.files && input.files.length > 0) {
        selectedAdminFile = input.files[0];
        const preview = document.getElementById('adminFilePreview');
        if (preview) {
            preview.innerHTML = `<i class="fas fa-paperclip"></i> Attached: <strong>${escapeHtml(selectedAdminFile.name)}</strong> <button onclick="clearAdminSelectedFile()" style="background:none; border:none; color:#ef4444; cursor:pointer; font-weight:bold; margin-left:8px;">&times;</button>`;
            preview.style.display = 'block';
        }
    }
}

function clearAdminSelectedFile() {
    selectedAdminFile = null;
    const input = document.getElementById('adminChatAttachment');
    if (input) input.value = '';
    const preview = document.getElementById('adminFilePreview');
    if (preview) preview.style.display = 'none';
}

async function updateOrderStatus(orderId, newStatus) {
    try {
        const formData = new FormData();
        formData.append('id', orderId);
        formData.append('status', newStatus);

        const res = await fetch('api/orders.php?action=update_status', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            loadAdminOrders();
        } else {
            alert(data.error || 'Failed to update status.');
        }
    } catch (err) {
        console.error('Status update error:', err);
    }
}

/**
 * Admin Chat Drawer
 */
function openAdminChatDrawer(orderId, orderNumber, clientName) {
    activeAdminChatOrderId = orderId;
    document.getElementById('drawerOrderTitle').textContent = `Order ${orderNumber}`;
    document.getElementById('drawerClientTitle').textContent = `Client: ${clientName}`;
    document.getElementById('adminChatDrawer').classList.add('show');

    loadAdminChatMessages(orderId);

    if (!adminChatPollInterval) {
        adminChatPollInterval = setInterval(() => {
            if (activeAdminChatOrderId) loadAdminChatMessages(activeAdminChatOrderId);
        }, 4000);
    }
}

function closeAdminChatDrawer() {
    activeAdminChatOrderId = null;
    clearAdminSelectedFile();
    document.getElementById('adminChatDrawer').classList.remove('show');
    if (adminChatPollInterval) {
        clearInterval(adminChatPollInterval);
        adminChatPollInterval = null;
    }
}

async function loadAdminChatMessages(orderId) {
    try {
        const res = await fetch(`api/orders.php?action=get_messages&order_id=${orderId}`);
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error('Admin Chat non-JSON response:', text);
            return;
        }

        if (data.success) {
            renderAdminChatBubbles(data.messages);
        }
    } catch (err) {
        console.error('Admin Chat Load Error:', err);
    }
}

function renderAdminChatBubbles(messages) {
    const container = document.getElementById('adminChatMessages');
    if (!container) return;

    if (!messages || messages.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:#64748b; margin-top:2rem;">No messages in this chat yet.</p>`;
        return;
    }

    let html = '';
    messages.forEach(msg => {
        const isSelf = (msg.sender_role === 'admin');
        const bubbleClass = isSelf ? 'msg-outgoing' : 'msg-incoming';
        const senderLabel = isSelf ? 'Admin (You)' : escapeHtml(msg.sender_name);

        let attachmentHtml = '';
        if (msg.attachment_name) {
            attachmentHtml = `<div class="msg-file-attachment" style="margin-top:6px;"><i class="fas fa-paperclip"></i> Attached: <strong>${escapeHtml(msg.attachment_name)}</strong></div>`;
        }

        html += `
            <div class="chat-bubble ${bubbleClass}">
                <div class="bubble-meta">
                    <strong>${senderLabel}</strong>
                    <small>${msg.created_at}</small>
                </div>
                <div class="bubble-text">${escapeHtml(msg.message)}</div>
                ${attachmentHtml}
            </div>
        `;
    });

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

async function handleSendAdminChatMessage() {
    if (!activeAdminChatOrderId) return;

    const input = document.getElementById('adminChatInput');
    const message = input.value.trim();
    if (!message && !selectedAdminFile) return;

    try {
        const formData = new FormData();
        formData.append('order_id', activeAdminChatOrderId);
        formData.append('message', message);
        if (selectedAdminFile) {
            formData.append('attachment', selectedAdminFile);
        }

        input.value = '';
        clearAdminSelectedFile();

        const res = await fetch('api/orders.php?action=send_message', {
            method: 'POST',
            body: formData
        });
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error('Admin Send Chat non-JSON response:', text);
            return;
        }

        if (data.success) {
            loadAdminChatMessages(activeAdminChatOrderId);
        } else {
            alert(data.error || 'Failed to send message.');
        }
    } catch (err) {
        console.error('Admin Send Error:', err);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function openAdminPassModal() {
    const alertBox = document.getElementById('adminPassAlert');
    if (alertBox) alertBox.style.display = 'none';
    const form = document.getElementById('adminPassForm');
    if (form) form.reset();
    document.getElementById('adminPassModal').classList.add('show');
}

function closeAdminPassModal() {
    document.getElementById('adminPassModal').classList.remove('show');
}

async function handleAdminChangePassSubmit(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('adminCurrentPass').value;
    const newPassword = document.getElementById('adminNewPass').value;
    const confirmPassword = document.getElementById('adminConfirmPass').value;
    const alertBox = document.getElementById('adminPassAlert');

    if (newPassword !== confirmPassword) {
        alertBox.className = 'alert alert-danger';
        alertBox.textContent = 'New password and confirmation do not match.';
        alertBox.style.display = 'block';
        return;
    }

    try {
        const formData = new FormData();
        formData.append('current_password', currentPassword);
        formData.append('new_password', newPassword);
        formData.append('confirm_password', confirmPassword);

        const res = await fetch('api/auth.php?action=change_password', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            alertBox.className = 'alert alert-success';
            alertBox.textContent = data.message || 'Password updated successfully!';
            alertBox.style.display = 'block';
            setTimeout(() => {
                closeAdminPassModal();
            }, 1500);
        } else {
            alertBox.className = 'alert alert-danger';
            alertBox.textContent = data.error || 'Failed to update password.';
            alertBox.style.display = 'block';
        }
    } catch (err) {
        alertBox.className = 'alert alert-danger';
        alertBox.textContent = 'Connection error.';
        alertBox.style.display = 'block';
    }
}
