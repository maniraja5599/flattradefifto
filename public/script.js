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
            
            // Listen for auth success message from popup
            const messageHandler = (event) => {
                if (event.data && event.data.type === 'auth_success') {
                    console.log('Auth success received:', event.data);
                    
                    // Store the new session ID
                    if (event.data.sessionId) {
                        localStorage.setItem('sessionId', event.data.sessionId);
                        document.cookie = `sessionId=${event.data.sessionId}; path=/; max-age=86400`;
                    }
                    
                    authStatus.innerHTML = `
                        <div class="alert alert-success">
                            <i class="fas fa-check-circle"></i>
                            <strong>Authentication Complete!</strong> - Loading dashboard...
                        </div>
                    `;
                    
                    // Check auth status after a brief delay
                    setTimeout(() => {
                        checkAuthStatus();
                        window.removeEventListener('message', messageHandler);
                    }, 1000);
                }
            };
            
            window.addEventListener('message', messageHandler);
            
            // Monitor auth window closure
            const checkInterval = setInterval(() => {
                if (authWindow.closed) {
                    clearInterval(checkInterval);
                    if (!isAuthenticated) {
                        authStatus.innerHTML = `
                            <div class="alert alert-info">
                                <i class="fas fa-sync fa-spin"></i>
                                <strong>Verifying...</strong> - Checking authentication
                            </div>
                        `;
                        setTimeout(() => {
                            checkAuthStatus();
                            window.removeEventListener('message', messageHandler);
                        }, 2000);
                    }
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
        // Include session ID from localStorage in cookies if needed
        const sessionId = localStorage.getItem('sessionId');
        if (sessionId) {
            document.cookie = `sessionId=${sessionId}; path=/; max-age=86400`;
        }
        
        const response = await fetch('/api/auth-status', { 
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        
        const authStatus = document.getElementById('authStatus');
        const authSection = document.getElementById('authSection');
        const tradingInterface = document.getElementById('tradingInterface');
        
        if (data.authenticated) {
            isAuthenticated = true;
            currentUser = data.user;
            
            authStatus.innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i>
                    <strong>Authenticated</strong> - User: ${data.user.actid || data.user.uname || 'User'}
                </div>
            `;
            authSection.style.display = 'none';
            tradingInterface.style.display = 'block';
            
            // Load user data
            loadUserInfo();
            refreshPrice();
            
        } else {
            isAuthenticated = false;
            currentUser = null;
            
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
        currentUser = null;
        
        const authStatus = document.getElementById('authStatus');
        const authSection = document.getElementById('authSection');
        const tradingInterface = document.getElementById('tradingInterface');
        
        authStatus.innerHTML = `
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>Connection Error</strong> - Unable to verify authentication
            </div>
        `;
        authSection.style.display = 'block';
        tradingInterface.style.display = 'none';
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
        
        // Load initial price data
        await refreshPrice();
        
    } catch (error) {
        console.error('Error loading user info:', error);
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
        
        console.log('Orders API response:', result);
        
        const container = document.getElementById('todaysOrders');
        
        if (response.ok && result.status === 'success' && result.data && result.data.length > 0) {
            container.innerHTML = result.data.slice(0, 5).map(order => `
                <div class="small border-bottom py-2 mb-2">
                    <strong class="text-primary">${order.tsym || order.tradingsymbol || 'N/A'}</strong><br>
                    <small class="text-muted">
                        <span class="badge ${order.trantype === 'B' ? 'bg-success' : 'bg-danger'} me-1">
                            ${order.trantype === 'B' ? 'BUY' : 'SELL'}
                        </span>
                        Qty: ${order.qty || order.quantity || 0} 
                        @ ₹${order.prc || order.price || 'Market'}
                        <br><small class="text-info">Status: ${order.status || 'N/A'}</small>
                    </small>
                </div>
            `).join('');
        } else if (result.error) {
            container.innerHTML = `
                <div class="text-center text-warning py-3">
                    <small><i class="fas fa-exclamation-triangle"></i> ${result.error}</small>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="text-center text-muted py-3">
                    <i class="fas fa-clock me-1"></i><small>No orders today</small>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading orders:', error);
        const container = document.getElementById('todaysOrders');
        container.innerHTML = `
            <div class="text-center text-danger py-3">
                <small><i class="fas fa-times"></i> Failed to load orders</small>
            </div>
        `;
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
    
    // Auto-refresh price every 30 seconds
    setInterval(refreshPrice, 30000);
});

// Price fetching functions
async function refreshPrice() {
    try {
        const symbol = document.getElementById('symbol')?.value || 'NIFTY';
        
        // Show loading state
        document.getElementById('niftyPrice').textContent = 'Loading...';
        
        const response = await fetch('/api/nifty-price', {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.status === 'success' || data.status === 'mock') {
            // Update price display
            document.getElementById('niftySymbol').textContent = data.symbol;
            document.getElementById('niftyPrice').textContent = `₹${data.price.toFixed(2)}`;
            
            // Update change with color coding
            const changeElement = document.getElementById('niftyChange');
            const changePercentElement = document.getElementById('niftyChangePercent');
            
            const change = parseFloat(data.change);
            const changePercent = parseFloat(data.changePercent);
            
            changeElement.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}`;
            changePercentElement.textContent = `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`;
            
            // Color coding
            const color = change >= 0 ? 'text-success' : 'text-danger';
            changeElement.className = `fw-bold ${color}`;
            changePercentElement.className = `fw-bold ${color}`;
            
            // Update high/low
            document.getElementById('niftyHigh').textContent = `₹${data.high.toFixed(2)}`;
            document.getElementById('niftyLow').textContent = `₹${data.low.toFixed(2)}`;
            
            // Update timestamp
            const timestamp = new Date(data.timestamp).toLocaleTimeString();
            document.getElementById('priceTimestamp').textContent = timestamp;
            
            if (data.status === 'mock') {
                showAlert('Using mock price data due to API limitations', 'warning');
            }
            
        } else {
            throw new Error(data.error || 'Failed to fetch price');
        }
        
    } catch (error) {
        console.error('Error fetching price:', error);
        document.getElementById('niftyPrice').textContent = 'Error';
        showAlert('Failed to fetch price data: ' + error.message, 'danger');
    }
}

async function loadATMOptions() {
    try {
        const symbol = document.getElementById('symbol')?.value || 'NIFTY';
        
        // Show loading
        const atmSection = document.getElementById('atmOptionsSection');
        const atmData = document.getElementById('atmOptionsData');
        atmData.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading ATM options...</div>';
        atmSection.style.display = 'block';
        
        const response = await fetch(`/api/atm-options/${symbol}`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.status === 'success') {
            // Display ATM options
            let html = `
                <div class="col-12 mb-3">
                    <div class="alert alert-info">
                        <strong>Spot Price:</strong> ₹${data.spotPrice.toFixed(2)} | 
                        <strong>ATM Strike:</strong> ₹${data.atmStrike}
                    </div>
                </div>
            `;
            
            data.options.forEach(option => {
                const cardClass = option.optionType === 'CE' ? 'border-success' : 'border-danger';
                const iconClass = option.optionType === 'CE' ? 'fa-arrow-up text-success' : 'fa-arrow-down text-danger';
                
                html += `
                    <div class="col-md-6 mb-3">
                        <div class="card bg-secondary text-light ${cardClass}">
                            <div class="card-body">
                                <h6 class="card-title">
                                    <i class="fas ${iconClass}"></i>
                                    ${data.atmStrike} ${option.optionType}
                                </h6>
                                <div class="row">
                                    <div class="col-6">
                                        <small class="text-muted">Last Price</small>
                                        <div class="fw-bold">₹${option.lastPrice.toFixed(2)}</div>
                                    </div>
                                    <div class="col-6">
                                        <small class="text-muted">Change</small>
                                        <div class="fw-bold ${option.change >= 0 ? 'text-success' : 'text-danger'}">
                                            ${option.change >= 0 ? '+' : ''}${option.change.toFixed(2)}
                                        </div>
                                    </div>
                                    <div class="col-6">
                                        <small class="text-muted">Volume</small>
                                        <div class="fw-bold">${option.volume.toLocaleString()}</div>
                                    </div>
                                    <div class="col-6">
                                        <small class="text-muted">OI</small>
                                        <div class="fw-bold">${option.openInterest.toLocaleString()}</div>
                                    </div>
                                </div>
                                <button class="btn btn-outline-light btn-sm mt-2 w-100" 
                                        onclick="fillOrderForm('${data.atmStrike}', '${option.optionType}', '${option.lastPrice}')">
                                    <i class="fas fa-plus"></i> Quick Order
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            atmData.innerHTML = html;
            
        } else {
            throw new Error(data.error || 'Failed to fetch ATM options');
        }
        
    } catch (error) {
        console.error('Error loading ATM options:', error);
        document.getElementById('atmOptionsData').innerHTML = `
            <div class="col-12">
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i>
                    Failed to load ATM options: ${error.message}
                </div>
            </div>
        `;
        showAlert('Failed to load ATM options', 'danger');
    }
}

async function loadOptionChain() {
    try {
        const symbol = document.getElementById('symbol')?.value || 'NIFTY';
        
        showAlert('Loading option chain data...', 'info');
        
        const response = await fetch(`/api/option-chain/${symbol}`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.status === 'success' || data.status === 'mock') {
            console.log('Option chain loaded:', data.options.length, 'options');
            showAlert(`Option chain loaded: ${data.options.length} options for ${symbol}`, 'success');
            
            if (data.status === 'mock') {
                showAlert('Using mock option data due to API limitations', 'warning');
            }
        } else {
            throw new Error(data.error || 'Failed to fetch option chain');
        }
        
    } catch (error) {
        console.error('Error loading option chain:', error);
        showAlert('Failed to load option chain: ' + error.message, 'danger');
    }
}

function fillOrderForm(strike, optionType, price) {
    // Fill the order form with selected option details
    document.getElementById('strikePrice').value = strike;
    document.getElementById('optionType').value = optionType;
    
    // Optionally set a limit price slightly above/below last price
    const limitPrice = optionType === 'CE' ? 
        (parseFloat(price) + 0.5).toFixed(2) : 
        (parseFloat(price) + 0.5).toFixed(2);
    
    // If there's a price field in the order form
    const priceField = document.getElementById('price');
    if (priceField) {
        priceField.value = limitPrice;
    }
    
    showAlert(`Order form filled with ${strike} ${optionType} @ ₹${price}`, 'success');
}
