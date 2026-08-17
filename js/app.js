/**
 * Client Portal Application JavaScript
 * First Class Writers Hub
 */

let currentUser = null;
let activeChatOrderId = null;
let chatPollInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    setupEventListeners();
    await checkAuthSession();
}

/**
 * Check Active User Session
 */
async function checkAuthSession() {
    try {
        const res = await fetch('api/auth.php?action=check', {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        const data = await res.json();
        if (data.authenticated && data.user) {
            currentUser = data.user;
            updateUserNavUI();
            prefillOrderFormWithCurrentUser();
            if (currentUser.role === 'client') {
                const savedView = sessionStorage.getItem('activeView');
                if (savedView === 'landing') {
                    showLandingView();
                } else if (savedView === 'form') {
                    showFormView();
                } else {
                    showDashboardView();
                }
            }
        } else {
            currentUser = null;
            updateUserNavUI();
        }
    } catch (err) {
        console.error('Session check failed:', err);
    }
}

/**
 * Prefill Order Form fields with current logged-in user details
 */
function prefillOrderFormWithCurrentUser() {
    if (!currentUser) return;
    const clientNameInput = document.getElementById('clientName');
    const emailInput = document.getElementById('email');
    const phoneInput = document.getElementById('phone');

    if (clientNameInput && (!clientNameInput.value || clientNameInput.dataset.autoPrefilled === 'true')) {
        clientNameInput.value = currentUser.name || '';
        clientNameInput.dataset.autoPrefilled = 'true';
    }
    if (emailInput && (!emailInput.value || emailInput.dataset.autoPrefilled === 'true')) {
        emailInput.value = currentUser.email || '';
        emailInput.dataset.autoPrefilled = 'true';
    }
    if (phoneInput && currentUser.phone && (!phoneInput.value || phoneInput.dataset.autoPrefilled === 'true')) {
        phoneInput.value = currentUser.phone || '';
        phoneInput.dataset.autoPrefilled = 'true';
    }
}

/**
 * Update UI Navbar based on Auth State
 */
function updateUserNavUI() {
    const userArea = document.getElementById('navUserArea');
    if (!userArea) return;

    if (currentUser) {
        userArea.innerHTML = `
            <div class="user-profile-badge">
                <span class="user-avatar"><i class="fas fa-user-circle"></i></span>
                <span class="user-name">${escapeHtml(currentUser.name)}</span>
                <button onclick="showDashboardView()" class="btn-dashboard-nav"><i class="fas fa-columns"></i> Dashboard</button>
                <button onclick="openClientPassModal()" class="btn-dashboard-nav" style="background: rgba(247,148,30,0.15); color: #f7941e; border: 1px solid rgba(247,148,30,0.3);" title="Change Password"><i class="fas fa-key"></i></button>
                <button onclick="handleLogout()" class="btn-logout-nav" title="Log Out"><i class="fas fa-sign-out-alt"></i></button>
            </div>
        `;
    } else {
        userArea.innerHTML = `
            <a href="#" onclick="openAuthModal('login'); return false;" class="nav-auth-btn"><i class="fas fa-user-lock"></i> Login / Register</a>
        `;
    }
}

function handleOrderNowClick(e) {
    if (e) e.preventDefault();
    if (currentUser) {
        showFormView();
    } else {
        window.redirectAfterLogin = 'make_order';
        openAuthModal('login');
    }
}
window.handleOrderNowClick = handleOrderNowClick;

/**
 * Event Listener Binding
 */
function setupEventListeners() {
    // Order Now buttons
    document.querySelectorAll('#orderNowBtn, #heroOrderBtn, #aboutOrderBtn, .btn-showcase-cta').forEach(btn => {
        btn.addEventListener('click', (e) => {
            handleOrderNowClick(e);
        });
    });

    // Assignment Form Submit
    const assignmentForm = document.getElementById('assignmentForm');
    if (assignmentForm) {
        assignmentForm.addEventListener('submit', handleOrderSubmit);
    }

    // Auth Form Submits
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLoginSubmit);
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegisterSubmit);
    }

    const forgotForm = document.getElementById('forgotForm');
    if (forgotForm) {
        forgotForm.addEventListener('submit', handleForgotSubmit);
    }

    const resetForm = document.getElementById('resetForm');
    if (resetForm) {
        resetForm.addEventListener('submit', handleResetSubmit);
    }

    const clientPassForm = document.getElementById('clientPassForm');
    if (clientPassForm) {
        clientPassForm.addEventListener('submit', handleClientChangePassSubmit);
    }

    // Chat Send Button
    const sendChatBtn = document.getElementById('sendChatBtn');
    if (sendChatBtn) {
        sendChatBtn.addEventListener('click', handleSendChatMessage);
    }

    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendChatMessage();
            }
        });
    }
}

/**
 * Handle Assignment / Order Placement
 */
async function handleOrderSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.innerHTML : 'Submit Order';

    const clientName = document.getElementById('clientName')?.value.trim();
    const email = document.getElementById('email')?.value.trim();
    const phoneInput = document.getElementById('phone')?.value.trim();
    const countryCode = document.getElementById('countryCode')?.value || '+254';
    const subject = document.getElementById('subject')?.value.trim();
    const instructions = document.getElementById('instructions')?.value.trim();
    const fileInput = document.getElementById('attachments');

    if (!subject || !instructions) {
        alert('Please enter assignment subject and requirements.');
        return;
    }

    if (!currentUser && (!clientName || !email)) {
        alert('Please fill in your name and email address.');
        return;
    }

    let phone = phoneInput;
    if (phoneInput && !phoneInput.startsWith('+')) {
        phone = countryCode + ' ' + phoneInput;
    }

    const formData = new FormData();
    formData.append('clientName', clientName);
    formData.append('email', email);
    formData.append('phone', phone);
    formData.append('subject', subject);
    formData.append('instructions', instructions);

    if (fileInput && fileInput.files.length > 0) {
        for (let i = 0; i < fileInput.files.length; i++) {
            formData.append('attachments[]', fileInput.files[i]);
        }
    }

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting Order...';
        }

        const res = await fetch('api/orders.php?action=create', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: formData
        });

        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            // InfinityFree sometimes appends HTML to the response.
            // Try to extract JSON from within the text.
            const match = text.match(/\{.*\}/s);
            if (match) {
                try { data = JSON.parse(match[0]); } catch (_) {}
            }
        }

        if (data && data.success) {
            form.reset();
            document.getElementById('fileList').innerHTML = '';
            await checkAuthSession();
            openSuccessModal(data.order);
        } else if (data && data.error) {
            alert(data.error);
        } else {
            // Fallback: the order may have been created even if response was garbled.
            // Check by reloading auth & showing a soft success.
            await checkAuthSession();
            alert('Your order was submitted successfully! You can view it in your dashboard.');
        }
    } catch (err) {
        console.error('Order submission error:', err);
        alert('Your order may have been submitted. Please check your dashboard or try again.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }
}

/**
 * Handle Auth Forms
 */
async function handleLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const alertBox = document.getElementById('authAlert');

    alertBox.style.display = 'none';

    try {
        const formData = new FormData();
        formData.append('email', email);
        formData.append('password', password);

        const res = await fetch('api/auth.php?action=login', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            currentUser = data.user;
            updateUserNavUI();
            prefillOrderFormWithCurrentUser();
            closeAuthModal();
            if (currentUser.role === 'admin') {
                window.location.href = 'admin.html';
            } else if (window.redirectAfterLogin === 'make_order') {
                window.redirectAfterLogin = null;
                showFormView();
            } else {
                showDashboardView();
            }
        } else {
            alertBox.className = 'alert alert-danger';
            alertBox.textContent = data.error || 'Login failed.';
            alertBox.style.display = 'block';
        }
    } catch (err) {
        alertBox.className = 'alert alert-danger';
        alertBox.textContent = 'Connection error.';
        alertBox.style.display = 'block';
    }
}

async function handleRegisterSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value;
    const alertBox = document.getElementById('authAlert');

    alertBox.style.display = 'none';

    try {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('email', email);
        formData.append('phone', phone);
        formData.append('password', password);

        const res = await fetch('api/auth.php?action=register', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            // Fill login email field with registered email
            const loginEmailInput = document.getElementById('loginEmail');
            if (loginEmailInput) loginEmailInput.value = email;

            // Switch to Login Tab
            switchAuthTab('login');

            // Display success message on login form
            const postAlert = document.getElementById('authAlert');
            if (postAlert) {
                postAlert.className = 'alert alert-success';
                postAlert.textContent = data.message || 'Account created successfully! Please sign in with your email and password.';
                postAlert.style.display = 'block';
            }
        } else {
            alertBox.className = 'alert alert-danger';
            alertBox.textContent = data.error || 'Registration failed.';
            alertBox.style.display = 'block';
        }
    } catch (err) {
        alertBox.className = 'alert alert-danger';
        alertBox.textContent = 'Connection error.';
        alertBox.style.display = 'block';
    }
}

async function handleLogout() {
    try {
        await fetch('api/auth.php?action=logout', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        currentUser = null;
        updateUserNavUI();
        showLandingView();
    } catch (err) {
        console.error('Logout error:', err);
    }
}

let allClientOrders = [];

/**
 * Load Client Orders
 */
async function loadClientOrders() {
    const ordersContainer = document.getElementById('ordersList');
    if (!ordersContainer) return;

    try {
        const res = await fetch('api/orders.php?action=list', {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        const data = await res.json();

        if (data.success) {
            allClientOrders = data.orders || [];
            renderOrdersList(allClientOrders);
        } else {
            ordersContainer.innerHTML = `<p style="color: var(--text-gray); padding: 1rem;">No orders placed yet.</p>`;
        }
    } catch (err) {
        console.error('Error fetching client orders:', err);
    }
}

function renderOrdersList(orders) {
    const container = document.getElementById('ordersList');
    if (!container) return;

    if (!orders || orders.length === 0) {
        container.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:#64748b;"><i class="fas fa-folder-open" style="font-size:2rem; margin-bottom:8px; display:block; color:#cbd5e1;"></i>You have no active orders. Click "New Order" to place your first assignment!</td></tr>`;
        return;
    }

    document.getElementById('displayClientName').textContent = currentUser ? currentUser.name : 'Client';
    document.getElementById('displayClientEmail').textContent = currentUser ? currentUser.email : '';

    let html = '';
    orders.forEach(order => {
        const statusClass = order.status.toLowerCase().replace(' ', '-');
        const attachments    = order.attachments || [];
        const clientFiles    = attachments.filter(a => !a.original_name.startsWith('[SOLUTION]'));
        const solutionFiles  = attachments.filter(a =>  a.original_name.startsWith('[SOLUTION]'));
        const unreadBadge    = order.unread_messages > 0 ? `<span style="background:#ef4444; color:white; font-size:0.7rem; border-radius:12px; padding:1px 7px; font-weight:700; margin-left:4px;">${order.unread_messages}</span>` : '';

        const filesLabel = `<span style="font-size:0.8rem; color:#475569;">${clientFiles.length} attached</span>` +
            (solutionFiles.length > 0 ? `<br><span style="font-size:0.8rem; color:#15803d; font-weight:600;"><i class="fas fa-check-circle"></i> ${solutionFiles.length} delivered</span>` : '');

        const truncatedInstructions = order.instructions.length > 80
            ? escapeHtml(order.instructions.substring(0, 80)) + '...'
            : escapeHtml(order.instructions);

        html += `
            <tr style="border-bottom:1px solid #e2e8f0;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
                <td style="padding:14px 16px; font-size:0.9rem; vertical-align:middle;">
                    <strong style="color:#003b6f;">${order.order_number}</strong><br>
                    <small style="color:#64748b;">${order.created_at}</small>
                </td>
                <td style="padding:14px 16px; font-size:0.9rem; vertical-align:middle;">
                    <strong style="color:#1e293b;">${escapeHtml(order.subject)}</strong>
                </td>
                <td style="padding:14px 16px; font-size:0.88rem; color:#334155; vertical-align:middle; max-width:200px;">
                    ${truncatedInstructions}
                </td>
                <td style="padding:14px 16px; font-size:0.88rem; vertical-align:middle;">
                    ${filesLabel}
                </td>
                <td style="padding:14px 16px; vertical-align:middle;">
                    <span class="status-badge status-${statusClass}">${order.status}</span>
                </td>
                <td style="padding:14px 16px; vertical-align:middle;">
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button onclick="openClientOrderDetails(${order.id})" style="background:#0284c7; color:white; border:none; padding:5px 12px; border-radius:7px; font-size:0.8rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px;"><i class="fas fa-eye"></i> Details</button>
                        <button onclick="openClientChatDrawer(${order.id}, '${escapeHtml(order.order_number)}', '${escapeHtml(order.status)}')" style="background:#003b6f; color:white; border:none; padding:5px 12px; border-radius:7px; font-size:0.8rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px;"><i class="fas fa-comments"></i> Chat${unreadBadge}</button>
                    </div>
                </td>
            </tr>
        `;
    });

    container.innerHTML = html;
}

/**
 * Client Chat Drawer
 */
function openClientChatDrawer(orderId, orderNumber, orderStatus) {
    activeChatOrderId = orderId;

    document.getElementById('clientDrawerOrderTitle').textContent = `Order ${orderNumber}`;
    document.getElementById('clientDrawerOrderStatus').textContent = `Status: ${orderStatus}`;

    const drawer = document.getElementById('clientChatDrawer');
    drawer.style.display = 'flex';
    document.body.classList.add('chat-drawer-open');

    // Render action buttons inside drawer
    const order = allClientOrders.find(o => o.id == orderId);
    const actionsBar = document.getElementById('clientChatActionsBar');
    if (actionsBar && order) {
        let actionsHtml = '';
        if (order.status !== 'Completed' && order.status !== 'Cancelled') {
            actionsHtml += `<button onclick="updateClientOrderStatus(${order.id}, 'Completed')" style="padding:5px 12px; font-size:0.78rem; background:#10b981; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;"><i class="fas fa-check-circle"></i> Mark as Completed</button>`;
            actionsHtml += `<button onclick="confirmCancelOrder(${order.id})" style="padding:5px 12px; font-size:0.78rem; background:#ef4444; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;"><i class="fas fa-ban"></i> Cancel</button>`;
        } else if (order.status === 'Completed') {
            actionsHtml += `<button onclick="updateClientOrderStatus(${order.id}, 'In Progress')" style="padding:5px 12px; font-size:0.78rem; background:#f59e0b; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;"><i class="fas fa-redo"></i> Request Revision</button>`;
        }
        actionsBar.innerHTML = actionsHtml;
    }

    loadChatMessages(orderId);

    if (!chatPollInterval) {
        chatPollInterval = setInterval(() => {
            if (activeChatOrderId) loadChatMessages(activeChatOrderId);
        }, 6000);
    }
}

function closeClientChatDrawer() {
    const drawer = document.getElementById('clientChatDrawer');
    if (drawer) drawer.style.display = 'none';
    document.body.classList.remove('chat-drawer-open');
    if (chatPollInterval) {
        clearInterval(chatPollInterval);
        chatPollInterval = null;
    }
    activeChatOrderId = null;
}

/**
 * Load and Poll Chat Messages
 */
async function loadChatMessages(orderId) {
    if (!orderId) return;

    try {
        const formData = new FormData();
        formData.append('order_id', orderId);
        const res = await fetch('api/orders.php?action=get_messages', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: formData
        });
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error('Client Chat non-JSON response:', text);
            return;
        }

        if (data && data.success) {
            renderChatBubbleList(data.messages);
        }
    } catch (err) {
        console.error('Error loading chat:', err);
    }
}

let activeClientModalOrderId = null;
let stagedClientAttachments = [];

function handleClientAttachmentSelected(input) {
    if (!input.files || input.files.length === 0) return;
    stagedClientAttachments = Array.from(input.files);

    const preview = document.getElementById('clientAttachmentStagedPreview');
    const listEl = document.getElementById('clientAttachmentStagedFileList');
    if (preview && listEl) {
        listEl.innerHTML = stagedClientAttachments.map(f =>
            `<div><i class="fas fa-file"></i> <strong>${escapeHtml(f.name)}</strong> (${(f.size/1024).toFixed(1)} KB)</div>`
        ).join('');
        preview.style.display = 'block';
    }
}

function clearClientStagedAttachments() {
    stagedClientAttachments = [];
    const input = document.getElementById('clientAddAttachmentInput');
    if (input) input.value = '';
    const preview = document.getElementById('clientAttachmentStagedPreview');
    if (preview) preview.style.display = 'none';
}

async function confirmClientAddAttachment() {
    if (!activeClientModalOrderId || stagedClientAttachments.length === 0) {
        alert('Please select files to upload.');
        return;
    }

    const formData = new FormData();
    formData.append('order_id', activeClientModalOrderId);
    stagedClientAttachments.forEach(file => {
        formData.append('files[]', file);
    });

    try {
        const res = await fetch('api/orders.php?action=upload_client_attachment', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            alert(`Success: ${stagedClientAttachments.length} file(s) attached to order!`);
            clearClientStagedAttachments();
            await loadClientOrders();
            openClientOrderDetails(activeClientModalOrderId);
        } else {
            alert(data.error || 'Failed to upload attachments.');
        }
    } catch (err) {
        console.error('Client upload attachment error:', err);
        alert('Connection error occurred while uploading attachments.');
    }
}

/**
 * Client Order Details Modal
 */
function openClientOrderDetails(orderId) {
    const order = allClientOrders.find(o => o.id == orderId);
    if (!order) return;
    activeClientModalOrderId = orderId;

    document.getElementById('clientModalOrderTitle').innerHTML = `<i class="fas fa-file-alt" style="color:#f7941e;"></i> Details for Order ${order.order_number}`;
    document.getElementById('clientModalOrderDate').textContent = `Submitted: ${order.created_at}`;
    document.getElementById('clientModalSubject').textContent = order.subject;
    document.getElementById('clientModalInstructions').textContent = order.instructions;

    const badge = document.getElementById('clientModalStatusBadge');
    badge.className = `status-badge status-${order.status.toLowerCase().replace(' ', '-')}`;
    badge.textContent = order.status;

    const attachments   = order.attachments || [];
    const clientFiles   = attachments.filter(a => !a.original_name.startsWith('[SOLUTION]'));
    const solutionFiles = attachments.filter(a =>  a.original_name.startsWith('[SOLUTION]'));

    const submittedEl = document.getElementById('clientModalSubmittedFiles');
    const solutionEl  = document.getElementById('clientModalSolutionFiles');

    submittedEl.innerHTML = clientFiles.length > 0
        ? clientFiles.map(att =>
            `<a href="api/download.php?id=${att.id}" target="_blank" style="display:inline-flex; align-items:center; gap:5px; font-size:0.82rem; color:#1d4ed8; text-decoration:none; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:4px 9px; font-weight:600; word-break:break-all;"><i class="fas fa-file-download"></i> ${escapeHtml(att.original_name)}</a>`
          ).join('')
        : `<span style="font-size:0.82rem;color:#94a3b8;font-style:italic;">No files attached</span>`;

    solutionEl.innerHTML = solutionFiles.length > 0
        ? solutionFiles.map(att => {
            const displayName = att.original_name.replace('[SOLUTION] ', '');
            return `<a href="api/download.php?id=${att.id}" target="_blank" style="display:inline-flex; align-items:center; gap:5px; font-size:0.82rem; color:#15803d; text-decoration:none; background:#dcfce7; border:1px solid #86efac; border-radius:6px; padding:4px 9px; font-weight:600; word-break:break-all;"><i class="fas fa-check-circle"></i> ${escapeHtml(displayName)}</a>`;
          }).join('')
        : `<span style="font-size:0.82rem;color:#94a3b8;font-style:italic;">No solution uploaded yet</span>`;

    const openChatBtn = document.getElementById('clientModalOpenChatBtn');
    if (openChatBtn) {
        openChatBtn.onclick = () => {
            closeClientOrderDetails();
            openClientChatDrawer(order.id, order.order_number, order.status);
        };
    }

    const modal = document.getElementById('clientOrderDetailsModal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeClientOrderDetails() {
    const modal = document.getElementById('clientOrderDetailsModal');
    if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
}

function confirmCancelOrder(orderId) {
    if (confirm('Are you sure you want to cancel this order?')) {
        updateClientOrderStatus(orderId, 'Cancelled');
    }
}

async function updateClientOrderStatus(orderId, newStatus) {
    try {
        const formData = new FormData();
        formData.append('id', orderId);
        formData.append('status', newStatus);

        const res = await fetch('api/orders.php?action=update_status', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            closeClientChatDrawer();
            await loadClientOrders();
        } else {
            alert(data.error || 'Failed to update status.');
        }
    } catch (err) {
        console.error('Status update error:', err);
    }
}

function renderChatBubbleList(messages) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    if (!messages || messages.length === 0) {
        container.innerHTML = `<div class="chat-placeholder"><p>No messages yet. Send a message below to chat with our writers!</p></div>`;
        return;
    }

    let html = '';
    messages.forEach(msg => {
        const isSelf = currentUser && (msg.sender_id == currentUser.id || (currentUser.role === 'client' && msg.sender_role === 'client'));
        const bubbleClass = isSelf ? 'msg-outgoing' : 'msg-incoming';
        const senderLabel = isSelf ? 'You' : (msg.sender_role === 'admin' ? 'Support' : escapeHtml(msg.sender_name));

        let fileAttachmentHtml = '';
        if (msg.attachment_name) {
            fileAttachmentHtml = `<div class="msg-file-attachment"><i class="fas fa-paperclip"></i> Attached: ${escapeHtml(msg.attachment_name)}</div>`;
        }

        html += `
            <div class="chat-bubble ${bubbleClass}">
                <div class="bubble-meta">
                    <strong style="margin-right: 12px;">${senderLabel}</strong>
                    <small>${msg.created_at}</small>
                </div>
                <div class="bubble-text">${escapeHtml(msg.message)}</div>
                ${fileAttachmentHtml}
            </div>
        `;
    });

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

/**
 * Send Chat Message
 */
async function handleSendChatMessage() {
    if (!activeChatOrderId) {
        alert('Please select an order to send a message.');
        return;
    }

    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;

    try {
        const formData = new FormData();
        formData.append('order_id', activeChatOrderId);
        formData.append('message', message);

        input.value = '';

        const res = await fetch('api/orders.php?action=send_message', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: formData
        });
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error('Client Send Chat non-JSON response:', text);
            return;
        }

        if (data.success) {
            await loadChatMessages(activeChatOrderId);
        } else {
            alert(data.error || 'Failed to send message.');
        }
    } catch (err) {
        console.error('Error sending message:', err);
    }
}

/**
 * View Toggles & Modals
 */
function showDashboardView() {
    if (!currentUser) {
        openAuthModal('login');
        return;
    }
    sessionStorage.setItem('activeView', 'dashboard');
    const landingPage = document.getElementById('landingPage');
    const formPage = document.getElementById('formPage');
    const clientDashboard = document.getElementById('clientDashboard');

    if (landingPage) landingPage.classList.add('hidden');
    if (formPage) {
        formPage.classList.remove('active');
        formPage.classList.add('hidden');
    }
    if (clientDashboard) {
        clientDashboard.classList.add('active');
        clientDashboard.classList.remove('hidden');
    }
    document.body.style.background = '#f5f7fa';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    loadClientOrders();
}

function showLandingView() {
    sessionStorage.setItem('activeView', 'landing');
    const landingPage = document.getElementById('landingPage');
    const formPage = document.getElementById('formPage');
    const clientDashboard = document.getElementById('clientDashboard');

    if (landingPage) landingPage.classList.remove('hidden');
    if (formPage) {
        formPage.classList.remove('active');
        formPage.classList.add('hidden');
    }
    if (clientDashboard) {
        clientDashboard.classList.remove('active');
        clientDashboard.classList.add('hidden');
    }
    document.body.style.background = '';
}

function showFormView() {
    sessionStorage.setItem('activeView', 'form');
    const landingPage = document.getElementById('landingPage');
    const formPage = document.getElementById('formPage');
    const clientDashboard = document.getElementById('clientDashboard');

    if (landingPage) landingPage.classList.add('hidden');
    if (formPage) {
        formPage.classList.add('active');
        formPage.classList.remove('hidden');
    }
    if (clientDashboard) {
        clientDashboard.classList.remove('active');
        clientDashboard.classList.add('hidden');
    }
    document.body.style.background = '#f5f7fa';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.showFormPage = showFormView;
window.showFormView = showFormView;

function openAuthModal(tab = 'login') {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    switchAuthTab(tab);
    modal.classList.add('show');
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.remove('show');
}

function switchAuthTab(tab) {
    const loginTab = document.getElementById('tabLoginBtn');
    const regTab = document.getElementById('tabRegBtn');
    const forgotTab = document.getElementById('tabForgotBtn');
    
    const loginForm = document.getElementById('loginForm');
    const regForm = document.getElementById('registerForm');
    const forgotForm = document.getElementById('forgotForm');
    const resetForm = document.getElementById('resetForm');
    const alertBox = document.getElementById('authAlert');

    if (alertBox) alertBox.style.display = 'none';

    if (loginForm) loginForm.style.display = 'none';
    if (regForm) regForm.style.display = 'none';
    if (forgotForm) forgotForm.style.display = 'none';
    if (resetForm) resetForm.style.display = 'none';

    loginTab?.classList.remove('active');
    regTab?.classList.remove('active');
    if (forgotTab) forgotTab.classList.remove('active');

    if (tab === 'login') {
        loginTab?.classList.add('active');
        if (loginForm) loginForm.style.display = 'block';
    } else if (tab === 'register') {
        regTab?.classList.add('active');
        if (regForm) regForm.style.display = 'block';
    } else if (tab === 'forgot') {
        if (forgotTab) {
            forgotTab.style.display = 'inline-block';
            forgotTab.classList.add('active');
        }
        if (forgotForm) forgotForm.style.display = 'block';
    } else if (tab === 'reset') {
        if (forgotTab) {
            forgotTab.style.display = 'inline-block';
            forgotTab.classList.add('active');
        }
        if (resetForm) resetForm.style.display = 'block';
    }
}

async function handleForgotSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('forgotEmail').value.trim();
    const alertBox = document.getElementById('authAlert');

    if (alertBox) alertBox.style.display = 'none';

    try {
        const formData = new FormData();
        formData.append('email', email);

        const res = await fetch('api/auth.php?action=forgot_password', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById('resetEmail').value = email;
            alertBox.className = 'alert alert-success';
            alertBox.textContent = data.message;
            if (data.code_demo) {
                alertBox.textContent += ` (Reset Code: ${data.code_demo})`;
            }
            alertBox.style.display = 'block';
            setTimeout(() => {
                switchAuthTab('reset');
            }, 1800);
        } else {
            alertBox.className = 'alert alert-danger';
            alertBox.textContent = data.error || 'Failed to send reset code.';
            alertBox.style.display = 'block';
        }
    } catch (err) {
        alertBox.className = 'alert alert-danger';
        alertBox.textContent = 'Connection error.';
        alertBox.style.display = 'block';
    }
}

async function handleResetSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('resetEmail').value.trim();
    const resetCode = document.getElementById('resetCode').value.trim();
    const newPassword = document.getElementById('resetNewPass').value;
    const alertBox = document.getElementById('authAlert');

    if (alertBox) alertBox.style.display = 'none';

    try {
        const formData = new FormData();
        formData.append('email', email);
        formData.append('reset_code', resetCode);
        formData.append('new_password', newPassword);

        const res = await fetch('api/auth.php?action=reset_password', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            alertBox.className = 'alert alert-success';
            alertBox.textContent = data.message;
            alertBox.style.display = 'block';
            setTimeout(() => {
                switchAuthTab('login');
                document.getElementById('loginEmail').value = email;
            }, 1800);
        } else {
            alertBox.className = 'alert alert-danger';
            alertBox.textContent = data.error || 'Password reset failed.';
            alertBox.style.display = 'block';
        }
    } catch (err) {
        alertBox.className = 'alert alert-danger';
        alertBox.textContent = 'Connection error.';
        alertBox.style.display = 'block';
    }
}

function openClientPassModal() {
    const alertBox = document.getElementById('clientPassAlert');
    if (alertBox) alertBox.style.display = 'none';
    const form = document.getElementById('clientPassForm');
    if (form) form.reset();
    document.getElementById('clientPassModal').classList.add('show');
}

function closeClientPassModal() {
    document.getElementById('clientPassModal').classList.remove('show');
}

async function handleClientChangePassSubmit(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('clientCurrentPass').value;
    const newPassword = document.getElementById('clientNewPass').value;
    const confirmPassword = document.getElementById('clientConfirmPass').value;
    const alertBox = document.getElementById('clientPassAlert');

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
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            alertBox.className = 'alert alert-success';
            alertBox.textContent = data.message || 'Password updated successfully!';
            alertBox.style.display = 'block';
            setTimeout(() => {
                closeClientPassModal();
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

function escapeHtml(text) {
    if (!text) return '';
    return text.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
