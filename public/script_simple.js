// Global variables
let basketOrders = [];
let currentPrice = 24500;
let isAuthenticated = false;

// Show alerts
function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alertContainer');
    const alertId = 'alert_' + Date.now();
    
    const alertHTML = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert" id="${alertId}">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'danger' ? 'times-circle' : 'info-circle'}"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    alertContainer.innerHTML = alertHTML;
    
    // Auto dismiss after 5 seconds
    setTimeout(() => {
        const alert = document.getElementById(alertId);
        if (alert) {
            alert.remove();
        }
    }, 5000);
}

// Quick login function (no session persistence)
async function quickLogin() {
    const loginBtn = document.getElementById('loginBtn');
    const authStatus = document.getElementById('authStatus');
    
    try {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Opening Login...';
        
        authStatus.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-external-link-alt"></i>
                <strong>Opening Login Window</strong> - Please complete authentication
            </div>
        `;
        
        // Generate OAuth URL and open window
        const response = await fetch('/api/generate-manual-auth-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Open OAuth window
            const authWindow = window.open(result.authUrl, 'FlattradeAuth', 'width=600,height=700');
            
            if (!authWindow) {
                throw new Error('Please allow popups for this site');
            }
            
            authStatus.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-window-restore"></i>
                    <strong>Complete Login</strong> - Login in the opened window
                </div>
            `;
            
            // Monitor auth window
            const checkInterval = setInterval(() => {
                if (authWindow.closed) {
                    clearInterval(checkInterval);
                    authStatus.innerHTML = `
                        <div class="alert alert-info">
                            <i class="fas fa-sync fa-spin"></i>
                            <strong>Verifying...</strong> - Checking authentication
                        </div>
                    `;
                    setTimeout(checkAuthStatus, 2000);
                    loginBtn.disabled = false;
                    loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login to Flattrade';
                }
            }, 1000);
            
        } else {
            throw new Error(result.error || 'Failed to generate login URL');
        }
        
    } catch (error) {
        console.error('Login error:', error);
        authStatus.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-times"></i>
                <strong>Login Error</strong> - ${error.message}
            </div>
        `;
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login to Flattrade';
        showAlert('Login failed: ' + error.message, 'danger');
    }
}

// Check authentication status
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/user-status', { credentials: 'include' });
        const data = await response.json();
        
        const authStatus = document.getElementById('authStatus');
        const authSection = document.getElementById('authSection');
        const tradingInterface = document.getElementById('tradingInterface');
        
        if (data.authenticated) {
            isAuthenticated = true;
            authStatus.innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i>
                    <strong>Authenticated</strong> - User: ${data.userId}
                </div>
            `;
            authSection.style.display = 'none';
            tradingInterface.style.display = 'block';
            
            // Load user data
            loadUserInfo();
            refreshPrice();
            
        } else {
            isAuthenticated = false;
            authStatus.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Not Authenticated</strong> - Please login to start trading
                </div>
            `;
            authSection.style.display = 'block';
            tradingInterface.style.display = 'none';
        }
    } catch (error) {
        console.error('Auth check error:', error);
        isAuthenticated = false;
    }
}

// Load user info
async function loadUserInfo() {
    try {
        // Get margin info
        const marginResponse = await fetch('/api/limits', { credentials: 'include' });
        const marginData = await marginResponse.json();
        
        if (marginData.stat === 'Ok') {
            document.getElementById('availableMargin').textContent = `₹${parseFloat(marginData.cash || 0).toFixed(0)}`;
            document.getElementById('usedMargin').textContent = `₹${parseFloat(marginData.marginused || 0).toFixed(0)}`;
        }
        
        // Get user details
        const userResponse = await fetch('/api/user-details', { credentials: 'include' });
        const userData = await userResponse.json();
        
        if (userData.stat === 'Ok') {
            document.getElementById('userInfo').textContent = userData.uname || userData.actid || 'User';
        }
        
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

// Refresh current price
async function refreshPrice() {
    const symbol = document.getElementById('symbol').value;
    const priceDisplay = document.getElementById('currentPrice');
    
    try {
        const response = await fetch('/api/quotes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                exchange: 'NSE',
                token: symbol === 'NIFTY' ? '26000' : symbol === 'BANKNIFTY' ? '26009' : '26037'
            })
        });
        
        const data = await response.json();
        
        if (data.stat === 'Ok') {
            currentPrice = parseFloat(data.lp);
            priceDisplay.textContent = currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 });
            showAlert('Price updated', 'success');
        }
    } catch (error) {
        console.error('Error refreshing price:', error);
        showAlert('Failed to refresh price', 'danger');
    }
}

// Select quick strike
function selectQuickStrike(offset) {
    const atmStrike = Math.round(currentPrice / 50) * 50; // Round to nearest 50
    const selectedStrike = atmStrike + offset;
    document.getElementById('strikePrice').value = selectedStrike;
    
    const label = offset === 0 ? 'ATM' : (offset > 0 ? `+${offset}` : `${offset}`);
    showAlert(`Selected ${label}: ${selectedStrike}`, 'info');
}

// Toggle price field based on order type
function togglePriceField() {
    const orderType = document.getElementById('orderType').value;
    const priceSection = document.getElementById('priceSection');
    const priceInput = document.getElementById('price');
    
    if (orderType === 'MARKET') {
        priceSection.style.display = 'none';
        priceInput.required = false;
    } else {
        priceSection.style.display = 'block';
        priceInput.required = true;
    }
}

// Create order object from form
function createOrderFromForm() {
    const symbol = document.getElementById('symbol').value;
    const expiry = document.getElementById('expiry').value;
    const strike = document.getElementById('strikePrice').value;
    const optionType = document.getElementById('optionType').value;
    const action = document.getElementById('action').value;
    const quantity = document.getElementById('quantity').value;
    const orderType = document.getElementById('orderType').value;
    const price = document.getElementById('price').value;
    
    if (!strike || !quantity) {
        showAlert('Please enter strike price and quantity', 'warning');
        return null;
    }
    
    if (orderType !== 'MARKET' && !price) {
        showAlert('Please enter price for limit orders', 'warning');
        return null;
    }
    
    const tradingSymbol = `${symbol}${expiry}${strike}${optionType}`;
    
    return {
        symbol,
        tradingSymbol,
        strikePrice: strike,
        optionType,
        expiry,
        trantype: action === 'BUY' ? 'B' : 'S',
        quantity: parseInt(quantity),
        orderType,
        price: orderType === 'MARKET' ? null : parseFloat(price),
        product: 'MIS',
        validity: 'DAY',
        exchange: 'NFO'
    };
}

// Add to basket
function addToBasket() {
    const order = createOrderFromForm();
    if (!order) return;
    
    basketOrders.push({
        ...order,
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString()
    });
    
    updateBasketDisplay();
    showAlert(`Added to basket: ${order.tradingSymbol}`, 'success');
    clearForm();
}

// Place order now
async function placeOrderNow() {
    const order = createOrderFromForm();
    if (!order) return;
    
    if (!confirm(`Place order: ${order.tradingSymbol} ${order.trantype} ${order.quantity}?`)) {
        return;
    }
    
    try {
        showAlert('Placing order...', 'info');
        
        const response = await fetch('/api/place-single-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ order })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert(`Order placed: ${order.tradingSymbol}`, 'success');
            clearForm();
            loadTodaysOrders();
        } else {
            showAlert(`Order failed: ${result.error}`, 'danger');
        }
    } catch (error) {
        console.error('Error placing order:', error);
        showAlert('Error placing order: ' + error.message, 'danger');
    }
}

// Update basket display
function updateBasketDisplay() {
    const container = document.getElementById('basketContainer');
    const placeAllBtn = document.getElementById('placeAllBtn');
    
    if (basketOrders.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="fas fa-shopping-basket fa-3x mb-3 opacity-50"></i>
                <p>No orders in basket<br><small>Add orders using the form</small></p>
            </div>
        `;
        placeAllBtn.disabled = true;
        return;
    }
    
    container.innerHTML = basketOrders.map(order => `
        <div class="basket-item">
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <strong>${order.tradingSymbol}</strong><br>
                    <small>${order.trantype} ${order.quantity} @ ${order.orderType} ${order.price ? '₹' + order.price : 'Market'}</small>
                </div>
                <button class="btn btn-sm btn-outline-light" onclick="removeFromBasket(${order.id})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `).join('');
    
    placeAllBtn.disabled = false;
}

// Remove from basket
function removeFromBasket(orderId) {
    basketOrders = basketOrders.filter(order => order.id !== orderId);
    updateBasketDisplay();
    showAlert('Order removed from basket', 'info');
}

// Clear basket
function clearBasket() {
    if (basketOrders.length === 0) return;
    
    if (confirm(`Clear all ${basketOrders.length} orders from basket?`)) {
        basketOrders = [];
        updateBasketDisplay();
        showAlert('Basket cleared', 'success');
    }
}

// Place all orders
async function placeAllOrders() {
    if (basketOrders.length === 0) return;
    
    if (!confirm(`Place all ${basketOrders.length} orders?`)) return;
    
    showAlert(`Placing ${basketOrders.length} orders...`, 'info');
    
    let success = 0, failed = 0;
    
    for (const order of basketOrders) {
        try {
            const response = await fetch('/api/place-single-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ order })
            });
            
            const result = await response.json();
            
            if (result.success) {
                success++;
            } else {
                failed++;
            }
            
            // Small delay between orders
            await new Promise(resolve => setTimeout(resolve, 300));
            
        } catch (error) {
            failed++;
            console.error('Order error:', error);
        }
    }
    
    basketOrders = [];
    updateBasketDisplay();
    
    if (success > 0) {
        showAlert(`${success} orders placed successfully!`, 'success');
        loadTodaysOrders();
    }
    if (failed > 0) {
        showAlert(`${failed} orders failed`, 'danger');
    }
}

// Load today's orders
async function loadTodaysOrders() {
    try {
        const response = await fetch('/api/orders', { credentials: 'include' });
        const result = await response.json();
        
        const container = document.getElementById('todaysOrders');
        
        if (result.status === 'success' && result.data && result.data.length > 0) {
            container.innerHTML = result.data.slice(0, 5).map(order => `
                <div class="small border-bottom py-2">
                    <strong>${order.tsym || 'N/A'}</strong><br>
                    <small class="text-muted">${order.trantype === 'B' ? 'BUY' : 'SELL'} ${order.qty} @ ₹${order.prc || 'Market'}</small>
                </div>
            `).join('');
        } else {
            container.innerHTML = `
                <div class="text-center text-muted py-3">
                    <small>No orders today</small>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

// Clear form
function clearForm() {
    document.getElementById('strikePrice').value = '';
    document.getElementById('quantity').value = '25';
    document.getElementById('price').value = '';
    document.getElementById('orderType').value = 'MARKET';
    togglePriceField();
}

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    
    // Symbol change handler
    document.getElementById('symbol').addEventListener('change', refreshPrice);
    
    // Auto-refresh auth status every 30 seconds
    setInterval(checkAuthStatus, 30000);
});
