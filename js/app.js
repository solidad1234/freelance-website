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
        const res = await fetch('api/auth.php?action=check');
        const data = await res.json();
        if (data.authenticated && data.user) {
            currentUser = data.user;
            updateUserNavUI();
            prefillOrderFormWithCurrentUser();
            if (currentUser.role === 'client') {
                loadClientOrders();
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

/**
 * Event Listener Binding
 */
function setupEventListeners() {
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
            body: formData
        });

        const data = await res.json();

        if (data.success) {
            form.reset();
            document.getElementById('fileList').innerHTML = '';
            await checkAuthSession();
            openSuccessModal(data.order);
        } else {
            alert(data.error || 'Failed to place order. Please try again.');
        }
    } catch (err) {
        console.error('Order submission error:', err);
        alert('Connection error occurred while submitting order.');
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
        await fetch('api/auth.php?action=logout', { method: 'POST' });
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
        const res = await fetch('api/orders.php?action=list');
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
        container.innerHTML = `<div class="empty-state"><i class="fas fa-folder-open"></i><p>You have no active orders. Click "Order Now" to place your first assignment!</p></div>`;
        return;
    }

    document.getElementById('displayClientName').textContent = currentUser ? currentUser.name : 'Client';
    document.getElementById('displayClientEmail').textContent = currentUser ? currentUser.email : '';

    let html = '';
    orders.forEach((order, index) => {
        const isSelected = (activeChatOrderId === order.id || (activeChatOrderId === null && index === 0));
        if (isSelected && activeChatOrderId === null) {
            activeChatOrderId = order.id;
        }

        const statusClass = order.status.toLowerCase().replace(' ', '-');
        const filesCount = order.attachments ? order.attachments.length : 0;
        const unreadBadge = order.unread_messages > 0 ? `<span class="badge-unread">${order.unread_messages}</span>` : '';

        html += `
            <div class="order-card ${isSelected ? 'active' : ''}" onclick="selectOrderChat(${order.id}, '${escapeHtml(order.order_number)}')">
                <div class="order-header">
                    <span class="order-number">${order.order_number}</span>
                    <span class="status-badge status-${statusClass}">${order.status}</span>
                </div>
                <h4 class="order-title">${escapeHtml(order.subject)}</h4>
                <div class="order-meta">
                    <span><i class="far fa-calendar-alt"></i> ${order.created_at}</span>
                    <span><i class="fas fa-paperclip"></i> ${filesCount} files</span>
                    ${unreadBadge}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    if (activeChatOrderId) {
        loadChatMessages(activeChatOrderId);
    }
}

function selectOrderChat(orderId, orderNumber) {
    activeChatOrderId = orderId;

    // Highlight selected card
    document.querySelectorAll('.order-card').forEach(card => card.classList.remove('active'));
    event.currentTarget?.classList.add('active');

    loadChatMessages(orderId);
}

/**
 * Load and Poll Chat Messages
 */
async function loadChatMessages(orderId) {
    if (!orderId) return;

    const currentOrder = allClientOrders.find(o => o.id == orderId);
    if (currentOrder) {
        renderClientOrderHeader(currentOrder);
    }

    try {
        const res = await fetch(`api/orders.php?action=get_messages&order_id=${orderId}`);
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error('Client Chat non-JSON response:', text);
            return;
        }

        if (data.success) {
            renderChatBubbleList(data.messages);
        }
    } catch (err) {
        console.error('Error loading chat:', err);
    }

    // Start auto polling if not running
    if (!chatPollInterval) {
        chatPollInterval = setInterval(() => {
            if (activeChatOrderId) loadChatMessages(activeChatOrderId);
        }, 4000);
    }
}

function renderClientOrderHeader(order) {
    const header = document.getElementById('clientChatHeaderTitle');
    if (!header) return;

    let actionsHtml = '';
    if (order.status !== 'Completed' && order.status !== 'Cancelled') {
        actionsHtml += `<button onclick="updateClientOrderStatus(${order.id}, 'Completed')" class="btn-complete-order" style="padding: 0.35rem 0.85rem; font-size: 0.8rem; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s; margin-right: 6px;"><i class="fas fa-check-circle"></i> Mark as Completed</button>`;
        actionsHtml += `<button onclick="confirmCancelOrder(${order.id})" class="btn-cancel-order" style="padding: 0.35rem 0.85rem; font-size: 0.8rem; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;"><i class="fas fa-ban"></i> Cancel Order</button>`;
    } else if (order.status === 'Completed') {
        actionsHtml += `<button onclick="updateClientOrderStatus(${order.id}, 'In Progress')" class="btn-revision-order" style="padding: 0.35rem 0.85rem; font-size: 0.8rem; background: #f59e0b; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;"><i class="fas fa-redo"></i> Request Revision / Complaint</button>`;
    }

    let filePills = '';
    if (order.attachments && order.attachments.length > 0) {
        filePills = '<div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px;">';
        order.attachments.forEach(att => {
            const isSolution = att.original_name.startsWith('[SOLUTION]');
            const style = isSolution
                ? 'background: #dcfce7; color: #15803d; border: 1px solid #86efac;'
                : 'background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;';
            const label = isSolution ? `⭐ Solution: ${escapeHtml(att.original_name.replace('[SOLUTION] ', ''))}` : escapeHtml(att.original_name);
            filePills += `<a href="api/download.php?id=${att.id}" target="_blank" style="padding: 4px 10px; font-size: 0.78rem; font-weight: 600; ${style} border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-download"></i> ${label}</a>`;
        });
        filePills += '</div>';
    }

    header.innerHTML = `
        <div style="width: 100%;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span><i class="fas fa-comments" style="color: var(--primary-orange);"></i> Order <strong>${order.order_number}</strong> (${escapeHtml(order.status)})</span>
                <div>${actionsHtml}</div>
            </div>
            ${filePills}
        </div>
    `;
}

function confirmCancelOrder(orderId) {
    if (confirm("Are you sure you want to cancel this order?")) {
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
            body: formData
        });
        const data = await res.json();

        if (data.success) {
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
        const senderLabel = isSelf ? 'You' : (msg.sender_role === 'admin' ? 'Support / Writer' : escapeHtml(msg.sender_name));

        let fileAttachmentHtml = '';
        if (msg.attachment_name) {
            fileAttachmentHtml = `<div class="msg-file-attachment"><i class="fas fa-paperclip"></i> Attached: ${escapeHtml(msg.attachment_name)}</div>`;
        }

        html += `
            <div class="chat-bubble ${bubbleClass}">
                <div class="bubble-meta">
                    <strong>${senderLabel}</strong>
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
    document.getElementById('landingPage').classList.add('hidden');
    document.getElementById('formPage').classList.add('hidden');
    document.getElementById('clientDashboard').classList.remove('hidden');
    loadClientOrders();
}

function showLandingView() {
    document.getElementById('landingPage').classList.remove('hidden');
    document.getElementById('formPage').classList.add('hidden');
    document.getElementById('clientDashboard').classList.add('hidden');
}

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
