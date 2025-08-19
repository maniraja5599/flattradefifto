// DOM elements
let userStatus;
let alertContainer;
let loginForm;
let authUrlBtn;
let optionChainContainer;

// Global variables
let basketOrders = [];

document.addEventListener('DOMContentLoaded', function() {
    userStatus = document.getElementById('userStatus');
    alertContainer = document.getElementById('alertContainer');
    loginForm = document.getElementById('loginForm');
    authUrlBtn = document.getElementById('authUrlBtn');
    optionChainContainer = document.getElementById('optionChainContainer');
    
    // Check if user is already authenticated on page load
    checkAuthStatus();
    
    // Auto-refresh user status every 3 seconds
    setInterval(checkAuthStatus, 3000);
    
    // Listen for authentication success message from popup
    window.addEventListener('message', function(event) {
        if (event.data === 'auth_success') {
            setTimeout(() => {
                checkAuthStatus();
                showAlert('Authentication successful! You can now access trading features.', 'success');
            }, 1000);
        }
    });
    
    // Check URL parameters for auth status
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'success') {
        showAlert('Authentication successful! You can now access trading features.', 'success');
        checkAuthStatus();
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get('auth') === 'error') {
        const message = urlParams.get('message') || 'Authentication failed';
        showAlert(`Authentication failed: ${message}`, 'danger');
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    // Add order form submit handler
    const orderForm = document.getElementById('orderForm');
    if (orderForm) {
        orderForm.addEventListener('submit', function(e) {
            e.preventDefault();
            placeOrder();
        });
    }
    
    // Add symbol change handler
    const symbolSelect = document.getElementById('symbol');
    if (symbolSelect) {
        symbolSelect.addEventListener('change', function() {
            showAlert('Symbol changed, refreshing spot price...', 'info');
            refreshSpotPrice();
        });
    }
    
    // Add strike range/interval change handlers
    const strikeRange = document.getElementById('strikeRange');
    const strikeInterval = document.getElementById('strikeInterval');
    if (strikeRange && strikeInterval) {
        strikeRange.addEventListener('change', function() {
            if (document.getElementById('spotPrice').value) {
                generateStrikes();
            }
        });
        strikeInterval.addEventListener('change', function() {
            if (document.getElementById('spotPrice').value) {
                generateStrikes();
            }
        });
    }
});

function showAlert(message, type = 'info') {
    alertContainer.innerHTML = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
}

async function checkAuthStatus() {
    try {
        console.log('Checking authentication status...');
        const response = await fetch('/api/user-status', {
            credentials: 'include'
        });
        const data = await response.json();
        console.log('Auth status response:', data);
        
        const statusElement = document.getElementById('authStatus');
        const authUrlBtn = document.getElementById('authUrlBtn');
        const tradingInterface = document.getElementById('tradingInterface');
        
        console.log('Trading interface element:', tradingInterface);
        
        if (data.authenticated) {
            console.log('User is authenticated, showing trading interface');
            statusElement.innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i> 
                    <strong>Authenticated</strong> - User: ${data.userId} | Client: ${data.clientId || 'N/A'}
                </div>
            `;
            authUrlBtn.style.display = 'none';
            tradingInterface.style.display = 'block';
            
            // Load initial data
            loadUserInfo();
            loadOrders();
            refreshPositions();
            
            // Auto-load spot price and strikes
            setTimeout(() => {
                refreshSpotPrice();
            }, 1000);
            
        } else {
            console.log('User not authenticated, hiding trading interface');
            statusElement.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle"></i> 
                    <strong>Not Authenticated</strong> - ${data.message || 'Please complete OAuth flow'}
                </div>
            `;
            authUrlBtn.style.display = data.userId ? 'block' : 'none';
            tradingInterface.style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
        document.getElementById('authStatus').innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-times-circle"></i> 
                <strong>Error</strong> - Cannot check authentication status
            </div>
        `;
    }
}

async function login() {
    const formData = new FormData(loginForm);
    const loginData = Object.fromEntries(formData);
    
    try {
        showAlert('Logging in...', 'info');
        
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(loginData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Login successful! Please click "Generate Auth URL" to complete authentication.', 'success');
            checkAuthStatus();
        } else {
            showAlert(result.error || 'Login failed', 'danger');
        }
    } catch (error) {
        console.error('Login error:', error);
        showAlert('Login failed: ' + error.message, 'danger');
    }
}

async function generateAuthUrl() {
    try {
        showAlert('Generating authentication URL...', 'info');
        
        const response = await fetch('/api/generate-auth-url', {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Opening authentication window. Please complete the authentication in the new window.', 'info');
            
            // Open auth URL in a new window
            const authWindow = window.open(result.authUrl, 'flattrade_auth', 'width=600,height=700,scrollbars=yes,resizable=yes');
            
            // Check if the window was closed manually
            const checkClosed = setInterval(() => {
                if (authWindow.closed) {
                    clearInterval(checkClosed);
                    setTimeout(() => {
                        checkAuthStatus();
                    }, 1000);
                }
            }, 1000);
            
        } else {
            showAlert(result.error || 'Failed to generate auth URL', 'danger');
        }
    } catch (error) {
        console.error('Auth URL generation error:', error);
        showAlert('Failed to generate auth URL: ' + error.message, 'danger');
    }
}

async function getOptionChain() {
    try {
        showAlert('Loading manual option entry interface...', 'info');
        
        // Show manual option entry interface instead of fetching from API
        displayManualOptionEntry();
        showAlert('Manual option entry loaded. Enter strike prices and build your basket.', 'success');
        
    } catch (error) {
        console.error('Option interface error:', error);
        showAlert('Failed to load option interface: ' + error.message, 'danger');
    }
}

function displayManualOptionEntry() {
    let html = `
        <div class="row mb-4">
            <div class="col-md-10 mx-auto">
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">Manual Option Entry - NIFTY</h5>
                    </div>
                    <div class="card-body">
                        <form id="optionEntryForm">
                            <div class="row">
                                <div class="col-md-2 mb-3">
                                    <label for="trantype" class="form-label">Action</label>
                                    <select class="form-control" id="trantype" required>
                                        <option value="B">BUY</option>
                                        <option value="S">SELL</option>
                                    </select>
                                </div>
                                <div class="col-md-2 mb-3">
                                    <label for="strikePrice" class="form-label">Strike Price</label>
                                    <input type="number" class="form-control" id="strikePrice" placeholder="19500" step="50" required>
                                </div>
                                <div class="col-md-2 mb-3">
                                    <label for="optionType" class="form-label">Type</label>
                                    <select class="form-control" id="optionType" required>
                                        <option value="CE">CE (Call)</option>
                                        <option value="PE">PE (Put)</option>
                                    </select>
                                </div>
                                <div class="col-md-2 mb-3">
                                    <label for="quantity" class="form-label">Quantity</label>
                                    <input type="number" class="form-control" id="quantity" value="25" step="25" required>
                                </div>
                                <div class="col-md-2 mb-3">
                                    <label for="price" class="form-label">Price (₹)</label>
                                    <input type="number" class="form-control" id="price" placeholder="100.50" step="0.05">
                                </div>
                                <div class="col-md-2 mb-3">
                                    <label class="form-label">&nbsp;</label>
                                    <button type="button" class="btn btn-success d-block w-100" onclick="addToBasket()">
                                        <i class="fas fa-plus"></i> Add to Basket
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="row">
            <div class="col-12">
                <div class="card">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="mb-0">Basket Orders</h5>
                        <div>
                            <button class="btn btn-primary" onclick="placeBasketOrder()" disabled id="placeOrderBtn">
                                <i class="fas fa-shopping-cart"></i> Place Basket Order
                            </button>
                            <button class="btn btn-outline-secondary ms-2" onclick="clearBasket()">
                                <i class="fas fa-trash"></i> Clear All
                            </button>
                        </div>
                    </div>
                    <div class="card-body">
                        <div id="basketContainer">
                            <div class="alert alert-info text-center">
                                <i class="fas fa-shopping-basket fa-2x mb-2"></i><br>
                                No options in basket. Add options using the form above.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    optionChainContainer.innerHTML = html;
}

// Global variables
let activeTab = 'orders';

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    
    // Initialize manual order type toggle
    const manualOrderType = document.getElementById('manualOrderType');
    if (manualOrderType) {
        manualOrderType.addEventListener('change', toggleManualPriceFields);
        // Set initial state
        setTimeout(toggleManualPriceFields, 100);
    }
});

// Manual login function with session persistence
async function manualLogin() {
    try {
        const loginBtn = document.getElementById('manualLoginBtn');
        const loginStatus = document.getElementById('loginStatus');
        
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking Session...';
        
        loginStatus.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-search fa-spin"></i> Checking for existing session...
            </div>
        `;
        
        // First check if we have a valid saved session
        const sessionResponse = await fetch('/api/check-session', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const sessionResult = await sessionResponse.json();
        
        if (sessionResult.success && sessionResult.hasValidSession) {
            // We have a valid session
            loginStatus.innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i> Welcome back! You're already logged in.
                    <br><small>Using saved session from previous login</small>
                </div>
            `;
            
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<i class="fas fa-check"></i> Already Logged In';
            
            // Update authentication status
            setTimeout(() => {
                checkAuthStatus();
            }, 1000);
            
            return;
        }
        
        // No valid session, need to login manually
        loginStatus.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-external-link-alt"></i> Opening Flattrade OAuth login...
                <br><small>Please complete the login in the new window</small>
            </div>
        `;
        
        loginBtn.innerHTML = '<i class="fas fa-external-link-alt"></i> Login Window Opened';
        
        // Generate OAuth URL and open window
        const response = await fetch('/api/generate-manual-auth-url', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Open OAuth window
            const authWindow = window.open(result.authUrl, 'FlattradeManualOAuth', 'width=600,height=700,scrollbars=yes,resizable=yes');
            
            if (!authWindow) {
                throw new Error('Unable to open authentication window. Please allow popups for this site.');
            }
            
            loginStatus.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-window-restore"></i> Please complete login in the opened window
                    <br><small>After successful login, this page will update automatically</small>
                </div>
            `;
            
            // Monitor the auth window
            const authCheckInterval = setInterval(() => {
                try {
                    if (authWindow.closed) {
                        clearInterval(authCheckInterval);
                        loginStatus.innerHTML = `
                            <div class="alert alert-info">
                                <i class="fas fa-sync fa-spin"></i> Verifying authentication...
                            </div>
                        `;
                        setTimeout(() => {
                            checkAuthStatus();
                            loginBtn.disabled = false;
                            loginBtn.innerHTML = '<i class="fas fa-external-link-alt"></i> Open Flattrade Login';
                        }, 3000);
                    }
                } catch (e) {
                    // Cross-origin error, continue checking
                }
            }, 1000);
            
            // Listen for authentication success message
            window.addEventListener('message', function(event) {
                if (event.data === 'auth_success') {
                    clearInterval(authCheckInterval);
                    loginStatus.innerHTML = `
                        <div class="alert alert-success">
                            <i class="fas fa-check-circle"></i> Login successful! Session saved for the day.
                            <br><small>You won't need to login again until tomorrow</small>
                        </div>
                    `;
                    setTimeout(() => {
                        checkAuthStatus();
                    }, 2000);
                }
            });
            
        } else {
            throw new Error(result.error || 'Failed to generate OAuth URL');
        }
        
    } catch (error) {
        console.error('Manual login error:', error);
        document.getElementById('loginStatus').innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-times"></i> Login error: ${error.message}
            </div>
        `;
        const loginBtn = document.getElementById('manualLoginBtn');
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fas fa-external-link-alt"></i> Open Flattrade Login';
    }
}

// Fully automated OAuth using server-side automation (DEPRECATED)
async function startFullyAutomatedOAuth() {
    // This function is deprecated - now using manual login with session persistence
    console.log('Automated OAuth is deprecated, using manual login instead');
}

// Complete automatic OAuth processing - handles everything in background
async function startCompleteAutoOAuth() {
    // This function is deprecated - now using manual login with session persistence
    console.log('Auto OAuth is deprecated, using manual login instead');
}

// Auto-fill OAuth form in the popup window
async function autoFillOAuthForm(authWindow) {
    try {
        // Get credentials for auto-fill
        const response = await fetch('/api/auto-oauth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success && authWindow && !authWindow.closed) {
            const credentials = result.credentials;
            
            // Inject script to auto-fill and submit form
            const script = `
                (function() {
                    try {
                        // Wait for form to be available
                        function fillForm() {
                            const userIdField = document.querySelector('input[name="userid"], input[name="UserId"], input[id*="userid"], input[id*="UserId"]');
                            const passwordField = document.querySelector('input[name="password"], input[name="Password"], input[type="password"]');
                            const totpField = document.querySelector('input[name="totp"], input[name="TOTP"], input[id*="totp"], input[id*="TOTP"]');
                            const submitBtn = document.querySelector('input[type="submit"], button[type="submit"], .btn-primary, .login-btn');
                            
                            if (userIdField && passwordField && totpField) {
                                userIdField.value = '${credentials.userId}';
                                passwordField.value = '${credentials.password}';
                                totpField.value = '${credentials.totp}';
                                
                                // Trigger change events
                                [userIdField, passwordField, totpField].forEach(field => {
                                    field.dispatchEvent(new Event('change', { bubbles: true }));
                                    field.dispatchEvent(new Event('input', { bubbles: true }));
                                });
                                
                                // Submit form after a short delay
                                setTimeout(() => {
                                    if (submitBtn) {
                                        submitBtn.click();
                                    } else {
                                        // Try to find and submit the form
                                        const form = document.querySelector('form');
                                        if (form) {
                                            form.submit();
                                        }
                                    }
                                }, 1000);
                                
                                return true;
                            }
                            return false;
                        }
                        
                        // Try to fill form immediately
                        if (!fillForm()) {
                            // Wait for page to load and try again
                            setTimeout(fillForm, 2000);
                            setTimeout(fillForm, 4000);
                            setTimeout(fillForm, 6000);
                        }
                    } catch (e) {
                        console.error('Auto-fill error:', e);
                    }
                })();
            `;
            
            // Execute script in the popup window
            try {
                authWindow.eval(script);
            } catch (e) {
                console.log('Could not auto-fill form due to cross-origin restrictions');
                // This is expected due to security restrictions
            }
        }
        
    } catch (error) {
        console.error('Auto-fill OAuth error:', error);
    }
}

// Toggle price field based on order type
function togglePriceFields() {
    const orderType = document.getElementById('orderType').value;
    const priceField = document.getElementById('priceField');
    const triggerPriceField = document.getElementById('triggerPriceField');
    
    if (orderType === 'LIMIT') {
        priceField.style.display = 'block';
        triggerPriceField.style.display = 'none';
        document.getElementById('price').required = true;
        document.getElementById('triggerPrice').required = false;
    } else if (orderType === 'GTT') {
        priceField.style.display = 'block';
        triggerPriceField.style.display = 'block';
        document.getElementById('price').required = true;
        document.getElementById('triggerPrice').required = true;
    } else {
        priceField.style.display = 'none';
        triggerPriceField.style.display = 'none';
        document.getElementById('price').required = false;
        document.getElementById('triggerPrice').required = false;
    }
}

// Function to generate strikes based on current spot price and settings
function generateStrikes() {
    const symbol = document.getElementById('symbol').value;
    const spotPrice = parseFloat(document.getElementById('spotPrice').value);
    const strikeRange = parseInt(document.getElementById('strikeRange').value);
    const strikeInterval = parseInt(document.getElementById('strikeInterval').value);
    
    const strikeSelect = document.getElementById('selectedStrike');
    const strikeGrid = document.getElementById('strikeGrid');
    const strikeListDisplay = document.getElementById('strikeListDisplay');
    
    // Clear existing options and grid
    strikeSelect.innerHTML = '<option value="">Select Strike</option>';
    strikeGrid.innerHTML = '';
    
    // Generate strikes around spot price
    const strikes = [];
    for (let i = -strikeRange; i <= strikeRange; i++) {
        const strike = Math.round((spotPrice + (i * strikeInterval)) / strikeInterval) * strikeInterval;
        strikes.push(strike);
        
        // Add to dropdown
        const option = document.createElement('option');
        option.value = strike;
        option.textContent = strike;
        
        // Highlight ATM strike
        if (Math.abs(strike - spotPrice) < strikeInterval / 2) {
            option.textContent += ' (ATM)';
            option.style.fontWeight = 'bold';
        }
        
        strikeSelect.appendChild(option);
    }
    
    // Create strike grid with buttons
    strikes.forEach((strike, index) => {
        const isATM = Math.abs(strike - spotPrice) < strikeInterval / 2;
        const isOTM = strike > spotPrice;
        const isITM = strike < spotPrice;
        
        const colDiv = document.createElement('div');
        colDiv.className = 'col-6 col-md-4 col-lg-3 mb-2';
        
        let buttonClass = 'strike-btn btn-sm w-100';
        let additionalClass = '';
        let label = '';
        
        if (isATM) {
            additionalClass = 'atm-strike';
            label = 'ATM';
        } else if (isOTM) {
            additionalClass = 'otm-call';
            label = 'OTM';
        } else {
            additionalClass = 'itm-call';
            label = 'ITM';
        }
        
        colDiv.innerHTML = `
            <button type="button" class="btn ${buttonClass} ${additionalClass}" onclick="selectStrike(${strike})">
                <strong>${strike}</strong><br>
                <small>${label}</small>
            </button>
        `;
        
        strikeGrid.appendChild(colDiv);
    });
    
    // Show the strike list
    strikeListDisplay.style.display = 'block';
    
    showAlert(`Generated ${strikes.length} strikes around spot price ${spotPrice}`, 'success');
}

// Function to select a strike from the grid
function selectStrike(strike) {
    document.getElementById('selectedStrike').value = strike;
    
    // Update visual selection
    document.querySelectorAll('#strikeGrid .btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Find and highlight the selected button
    const selectedBtn = Array.from(document.querySelectorAll('#strikeGrid .btn')).find(btn => 
        btn.textContent.includes(strike.toString())
    );
    if (selectedBtn) {
        selectedBtn.classList.add('active');
    }
    
    showAlert(`Selected strike: ${strike}`, 'info');
}

// Function for quick ATM strike selection
function quickSelectATM(offset) {
    const spotPrice = parseFloat(document.getElementById('spotPrice').value);
    if (!spotPrice) {
        showAlert('Please refresh spot price first', 'warning');
        return;
    }
    
    const atmStrike = Math.round(spotPrice / 100) * 100; // Round to nearest 100
    const selectedStrike = atmStrike + offset;
    
    // Set the strike in dropdown
    document.getElementById('selectedStrike').value = selectedStrike;
    
    // Add option if it doesn't exist
    const strikeSelect = document.getElementById('selectedStrike');
    const existingOption = Array.from(strikeSelect.options).find(option => option.value == selectedStrike);
    if (!existingOption) {
        const option = document.createElement('option');
        option.value = selectedStrike;
        option.textContent = selectedStrike;
        strikeSelect.appendChild(option);
        strikeSelect.value = selectedStrike;
    }
    
    // Update visual selection in grid if visible
    if (document.getElementById('strikeListDisplay').style.display !== 'none') {
        document.querySelectorAll('#strikeGrid .btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const selectedBtn = Array.from(document.querySelectorAll('#strikeGrid .btn')).find(btn => 
            btn.textContent.includes(selectedStrike.toString())
        );
        if (selectedBtn) {
            selectedBtn.classList.add('active');
        }
    }
    
    const label = offset === 0 ? 'ATM' : (offset > 0 ? `ATM+${offset}` : `ATM${offset}`);
    showAlert(`Quick selected ${label} strike: ${selectedStrike}`, 'success');
}

// Function to toggle manual price field based on order type
function toggleManualPriceFields() {
    const orderType = document.getElementById('manualOrderType').value;
    const priceField = document.getElementById('manualPrice');
    const priceLabel = document.getElementById('manualPriceLabel');
    
    if (orderType === 'MARKET') {
        priceField.style.display = 'none';
        priceLabel.style.display = 'block';
        priceLabel.textContent = 'Market Price';
        priceField.required = false;
    } else {
        priceField.style.display = 'block';
        priceLabel.style.display = 'none';
        priceField.required = true;
        priceField.placeholder = orderType === 'LIMIT' ? 'Limit Price' : 'Trigger Price';
    }
}

// Function to add manual strike to dropdown (legacy function)
function addManualStrike() {
    const manualStrike = document.getElementById('manualStrike').value;
    const optionType = document.getElementById('manualOptionType').value;
    
    if (!manualStrike) {
        showAlert('Please enter a strike price', 'warning');
        return;
    }
    
    const strike = parseInt(manualStrike);
    const strikeSelect = document.getElementById('selectedStrike');
    
    // Check if option already exists
    const existingOption = Array.from(strikeSelect.options).find(option => option.value == strike);
    if (!existingOption) {
        const option = document.createElement('option');
        option.value = strike;
        option.textContent = `${strike} (Manual)`;
        strikeSelect.appendChild(option);
    }
    
    // Set as selected
    strikeSelect.value = strike;
    document.getElementById('optionType').value = optionType;
    
    // Clear manual input
    document.getElementById('manualStrike').value = '';
    
    showAlert(`Added manual strike: ${strike} ${optionType}`, 'success');
}

// Function to create manual order object
function createManualOrder() {
    const symbol = document.getElementById('manualSymbol').value;
    const expiry = document.getElementById('manualExpiry').value;
    const strike = document.getElementById('manualStrike').value;
    const optionType = document.getElementById('manualOptionType').value;
    const action = document.getElementById('manualAction').value;
    const quantity = document.getElementById('manualQuantity').value;
    const orderType = document.getElementById('manualOrderType').value;
    const price = document.getElementById('manualPrice').value;
    
    // Validate required fields
    if (!strike || !quantity) {
        showAlert('Please fill in strike price and quantity', 'warning');
        return null;
    }
    
    if (orderType !== 'MARKET' && !price) {
        showAlert('Please enter price for limit/GTT orders', 'warning');
        return null;
    }
    
    // Create trading symbol
    const tradingSymbol = `${symbol}${expiry}${strike}${optionType}`;
    
    return {
        symbol: symbol,
        tradingSymbol: tradingSymbol,
        strikePrice: strike,
        optionType: optionType,
        expiry: expiry,
        trantype: action === 'BUY' ? 'B' : 'S',
        quantity: quantity,
        orderType: orderType,
        price: orderType === 'MARKET' ? null : price,
        triggerPrice: orderType === 'GTT' ? price : null,
        product: 'MIS',
        validity: 'DAY',
        exchange: 'NFO'
    };
}

// Function to add manual order to basket
function addManualOrder() {
    const orderData = createManualOrder();
    if (!orderData) return;
    
    // Add to basket
    basketOrders.push({
        ...orderData,
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        source: 'manual'
    });
    
    updateBasketDisplay();
    showAlert(`Added to basket: ${orderData.tradingSymbol} ${orderData.trantype} ${orderData.quantity}`, 'success');
    
    // Clear manual form
    clearManualForm();
}

// Function to place manual order directly
async function placeManualOrderDirect() {
    const orderData = createManualOrder();
    if (!orderData) return;
    
    if (!confirm(`Place order: ${orderData.tradingSymbol} ${orderData.trantype} ${orderData.quantity}?`)) {
        return;
    }
    
    try {
        showAlert('Placing manual order...', 'info');
        
        const response = await fetch('/api/place-single-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // Include cookies for session
            body: JSON.stringify({ order: orderData })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert(`Order placed successfully: ${orderData.tradingSymbol}`, 'success');
            clearManualForm();
            refreshOrders(); // Refresh order book
        } else {
            showAlert(`Order failed: ${result.error}`, 'danger');
        }
    } catch (error) {
        console.error('Error placing manual order:', error);
        showAlert('Error placing order: ' + error.message, 'danger');
    }
}

// Function to clear manual form
function clearManualForm() {
    document.getElementById('manualStrike').value = '';
    document.getElementById('manualQuantity').value = '75';
    document.getElementById('manualPrice').value = '';
    document.getElementById('manualOrderType').value = 'MARKET';
    toggleManualPriceFields();
}

// Function to add current order to basket
function addToBasket() {
    const orderData = getOrderDataFromForm();
    
    // Validate required fields
    if (!orderData.tradingSymbol || !orderData.quantity || !orderData.trantype) {
        showAlert('Please fill all required fields before adding to basket', 'warning');
        return;
    }
    
    // Add to basket
    basketOrders.push({
        ...orderData,
        id: Date.now(), // Simple ID for tracking
        timestamp: new Date().toLocaleTimeString()
    });
    
    updateBasketDisplay();
    showAlert(`Added to basket: ${orderData.tradingSymbol} ${orderData.trantype} ${orderData.quantity}`, 'info');
}

// Function to update basket display
function updateBasketDisplay() {
    const basketDisplay = document.getElementById('basketOrdersDisplay');
    
    if (basketOrders.length === 0) {
        basketDisplay.innerHTML = '<small class="text-muted">No orders in basket. Add orders using "Add to Basket" button.</small>';
        return;
    }
    
    basketDisplay.innerHTML = basketOrders.map((order, index) => `
        <div class="basket-item border-bottom pb-2 mb-2" data-id="${order.id}">
            <div class="d-flex justify-content-between align-items-start">
                <div class="flex-grow-1">
                    <strong>${order.tradingSymbol}</strong>
                    <br>
                    <small class="text-muted">
                        ${order.trantype} ${order.quantity} @ ${order.orderType}
                        ${order.price ? `₹${order.price}` : 'Market'}
                        <br>
                        Added: ${order.timestamp}
                    </small>
                </div>
                <button type="button" class="btn btn-outline-danger btn-sm" onclick="removeFromBasket(${order.id})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Function to remove order from basket
function removeFromBasket(orderId) {
    basketOrders = basketOrders.filter(order => order.id !== orderId);
    updateBasketDisplay();
    showAlert('Order removed from basket', 'info');
}

// Function to clear entire basket
function clearBasket() {
    if (basketOrders.length === 0) {
        showAlert('Basket is already empty', 'info');
        return;
    }
    
    if (confirm(`Are you sure you want to clear all ${basketOrders.length} orders from basket?`)) {
        basketOrders = [];
        updateBasketDisplay();
        showAlert('Basket cleared', 'success');
    }
}

// Function to place all basket orders
async function placeBasketOrders() {
    if (basketOrders.length === 0) {
        showAlert('No orders in basket to place', 'warning');
        return;
    }
    
    if (!confirm(`Are you sure you want to place all ${basketOrders.length} orders?`)) {
        return;
    }
    
    showAlert(`Placing ${basketOrders.length} orders from basket...`, 'info');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const order of basketOrders) {
        try {
            const response = await fetch('/api/place-single-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include', // Include cookies for session
                body: JSON.stringify({ order: order })
            });
            
            const result = await response.json();
            
            if (result.success) {
                successCount++;
                console.log(`Order placed successfully: ${order.tradingSymbol}`);
            } else {
                failCount++;
                console.error(`Order failed: ${order.tradingSymbol} - ${result.error}`);
            }
            
            // Small delay between orders
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            failCount++;
            console.error(`Order error: ${order.tradingSymbol}`, error);
        }
    }
    
    // Clear basket after placing orders
    basketOrders = [];
    updateBasketDisplay();
    
    // Show results
    if (successCount > 0 && failCount === 0) {
        showAlert(`All ${successCount} orders placed successfully!`, 'success');
    } else if (successCount > 0 && failCount > 0) {
        showAlert(`${successCount} orders placed, ${failCount} failed. Check order book.`, 'warning');
    } else {
        showAlert(`All ${failCount} orders failed. Please check your connection and try again.`, 'danger');
    }
    
    // Refresh orders display
    refreshOrders();
}

// Function to refresh spot price
function refreshSpotPrice() {
    const symbol = document.getElementById('symbol').value;
    
    fetch('/api/quotes', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            exchange: 'NSE',
            token: symbol === 'NIFTY' ? '26000' : symbol === 'BANKNIFTY' ? '26009' : '26037'
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.stat === 'Ok') {
            const spotPrice = parseFloat(data.lp);
            document.getElementById('spotPrice').value = spotPrice;
            document.getElementById('spotPriceDisplay').textContent = spotPrice.toFixed(2);
            showAlert('Spot price updated', 'success');
            
            // Auto-generate strikes after spot price update
            setTimeout(() => {
                generateStrikes();
            }, 500);
        } else {
            showAlert('Failed to refresh spot price: ' + data.emsg, 'error');
        }
    })
    .catch(error => {
        console.error('Error refreshing spot price:', error);
        showAlert('Error refreshing spot price', 'error');
    });
}

// Function to load user info and margin details
function loadUserInfo() {
    // Get user limits/margin
    fetch('/api/limits')
        .then(response => response.json())
        .then(data => {
            if (data.stat === 'Ok') {
                const availableMargin = parseFloat(data.cash || 0).toFixed(2);
                const usedMargin = parseFloat(data.marginused || 0).toFixed(2);
                const totalMargin = parseFloat(availableMargin) + parseFloat(usedMargin);
                const utilization = totalMargin > 0 ? ((parseFloat(usedMargin) / totalMargin) * 100).toFixed(1) : '0.0';
                
                document.getElementById('availableMargin').innerHTML = `₹${availableMargin}`;
                document.getElementById('usedMargin').innerHTML = `₹${usedMargin}`;
                document.getElementById('marginUtilization').innerHTML = `${utilization}%`;
                
                // Color code utilization
                const utilizationElement = document.getElementById('marginUtilization');
                if (parseFloat(utilization) > 80) {
                    utilizationElement.className = 'text-danger';
                } else if (parseFloat(utilization) > 60) {
                    utilizationElement.className = 'text-warning';
                } else {
                    utilizationElement.className = 'text-success';
                }
            }
        })
        .catch(error => console.error('Error loading margin info:', error));
    
    // Get user info
    fetch('/api/user-details')
        .then(response => response.json())
        .then(data => {
            if (data.stat === 'Ok') {
                document.getElementById('userInfo').innerHTML = `
                    <strong>${data.uname || 'User'}</strong><br>
                    <small class="text-light">ID: ${data.actid || 'N/A'}</small>
                `;
            }
        })
        .catch(error => console.error('Error loading user info:', error));
}

// Function to refresh holdings
function refreshHoldings() {
    fetch('/api/holdings')
        .then(response => response.json())
        .then(data => {
            const tbody = document.getElementById('holdingsTableBody');
            if (data.stat === 'Ok' && data.values && data.values.length > 0) {
                tbody.innerHTML = data.values.map(holding => `
                    <tr>
                        <td>${holding.tsym}</td>
                        <td>${holding.holdqty}</td>
                        <td>₹${parseFloat(holding.upldprc || 0).toFixed(2)}</td>
                        <td>₹${parseFloat(holding.lp || 0).toFixed(2)}</td>
                        <td class="${parseFloat(holding.pnl || 0) >= 0 ? 'text-success' : 'text-danger'}">
                            ₹${parseFloat(holding.pnl || 0).toFixed(2)}
                        </td>
                        <td class="${parseFloat(holding.daychg || 0) >= 0 ? 'text-success' : 'text-danger'}">
                            ₹${parseFloat(holding.daychg || 0).toFixed(2)}
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No holdings found</td></tr>';
            }
        })
        .catch(error => {
            console.error('Error loading holdings:', error);
            document.getElementById('holdingsTableBody').innerHTML = 
                '<tr><td colspan="6" class="text-center text-danger">Error loading holdings</td></tr>';
        });
}

// Function to refresh trade history
function refreshHistory() {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    
    fetch('/api/trade-book', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ date: today })
    })
        .then(response => response.json())
        .then(data => {
            const tbody = document.getElementById('historyTableBody');
            if (data.stat === 'Ok' && data.values && data.values.length > 0) {
                tbody.innerHTML = data.values.map(trade => `
                    <tr>
                        <td>${trade.fldt}</td>
                        <td>${trade.tsym}</td>
                        <td><span class="badge bg-${trade.trantype === 'B' ? 'success' : 'danger'}">${trade.trantype === 'B' ? 'BUY' : 'SELL'}</span></td>
                        <td>${trade.qty}</td>
                        <td>₹${parseFloat(trade.prc || 0).toFixed(2)}</td>
                        <td class="${parseFloat(trade.pnl || 0) >= 0 ? 'text-success' : 'text-danger'}">
                            ₹${parseFloat(trade.pnl || 0).toFixed(2)}
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No trade history found</td></tr>';
            }
        })
        .catch(error => {
            console.error('Error loading trade history:', error);
            document.getElementById('historyTableBody').innerHTML = 
                '<tr><td colspan="6" class="text-center text-danger">Error loading trade history</td></tr>';
        });
}

// Show different tabs
function showTab(tabName) {
    activeTab = tabName;
    
    // Hide all tabs
    document.getElementById('ordersTab').style.display = 'none';
    document.getElementById('positionsTab').style.display = 'none';
    document.getElementById('holdingsTab').style.display = 'none';
    
    // Show selected tab
    document.getElementById(tabName + 'Tab').style.display = 'block';
    
    // Update button states
    document.querySelectorAll('.btn-group .btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Load data for the selected tab
    if (tabName === 'orders') {
        loadOrders();
    } else if (tabName === 'positions') {
        loadPositions();
    } else if (tabName === 'holdings') {
        loadHoldings();
    }
}

// Place individual order
async function placeOrder() {
    try {
        const orderData = getOrderDataFromForm();
        
        const response = await fetch('/api/place-single-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ order: orderData })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Order placed successfully! Order ID: ' + result.orderId, 'success');
            refreshOrders();
            clearOrderForm();
        } else {
            showAlert('Order placement failed: ' + result.error, 'danger');
        }
    } catch (error) {
        showAlert('Error placing order: ' + error.message, 'danger');
    }
}

// Get order data from form
function getOrderDataFromForm() {
    const symbol = document.getElementById('symbol').value;
    const strikePrice = document.getElementById('selectedStrike').value;
    const optionType = document.getElementById('optionType').value;
    const expiryDate = document.getElementById('expiryDate').value;
    
    // Create trading symbol
    const tradingSymbol = `${symbol}${expiryDate}${strikePrice}${optionType}`;
    
    return {
        symbol: symbol,
        tradingSymbol: tradingSymbol,
        strikePrice: strikePrice,
        optionType: optionType,
        trantype: document.getElementById('orderAction').value === 'BUY' ? 'B' : 'S',
        quantity: document.getElementById('quantity').value,
        orderType: document.getElementById('orderType').value,
        price: document.getElementById('price').value || null,
        triggerPrice: document.getElementById('triggerPrice').value || null,
        product: 'MIS', // Default to MIS
        validity: 'DAY' // Default to DAY
    };
}

// Add order to basket from form
function addToBasketFromForm() {
    const orderData = getOrderDataFromForm();
    basketOrders.push(orderData);
    updateBasketDisplay();
    showAlert('Order added to basket', 'info');
    clearOrderForm();
}

// Clear order form
function clearOrderForm() {
    document.getElementById('orderForm').reset();
    togglePriceFields(); // Reset price field visibility
}

// Get margins for order
async function getMargins() {
    try {
        const orderData = getOrderDataFromForm();
        
        const response = await fetch('/api/get-margins', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ order: orderData })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showMarginInfo(result.data);
        } else {
            showAlert('Failed to get margin info: ' + result.error, 'warning');
        }
    } catch (error) {
        showAlert('Error getting margins: ' + error.message, 'danger');
    }
}

// Show margin information
function showMarginInfo(marginData) {
    let marginHtml = `
        <div class="alert alert-info">
            <h6>Margin Information</h6>
            <p><strong>Required Margin:</strong> ₹${marginData.requiredMargin || 'N/A'}</p>
            <p><strong>Available Margin:</strong> ₹${marginData.availableMargin || 'N/A'}</p>
            <p><strong>Exposure Margin:</strong> ₹${marginData.exposureMargin || 'N/A'}</p>
        </div>
    `;
    
    // You can display this in a modal or dedicated section
    alert('Margin Info:\n' + JSON.stringify(marginData, null, 2));
}

// Load orders
async function loadOrders() {
    try {
        const response = await fetch('/api/orders');
        const result = await response.json();
        
        if (result.status === 'success') {
            displayOrders(result.data);
        } else {
            document.getElementById('ordersList').innerHTML = `
                <div class="text-center text-muted">
                    <i class="fas fa-exclamation-triangle fa-2x mb-2"></i><br>
                    ${result.message}
                </div>
            `;
        }
    } catch (error) {
        document.getElementById('ordersList').innerHTML = `
            <div class="text-center text-danger">
                <i class="fas fa-times-circle fa-2x mb-2"></i><br>
                Error loading orders
            </div>
        `;
    }
}

// Display orders
function displayOrders(orders) {
    const container = document.getElementById('ordersList');
    
    if (!orders || orders.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-list-alt fa-2x mb-2"></i><br>
                No orders found
            </div>
        `;
        return;
    }
    
    let html = '';
    orders.forEach(order => {
        html += `
            <div class="order-item mb-2 p-2 border rounded">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <strong>${order.tsym || order.symbol}</strong><br>
                        <small class="text-muted">
                            ${order.trantype === 'B' ? 'BUY' : 'SELL'} | 
                            Qty: ${order.qty} | 
                            Price: ₹${order.prc || 'Market'}
                        </small>
                    </div>
                    <div class="text-end">
                        <span class="badge bg-${getStatusColor(order.status || order.stat)}">${order.status || order.stat}</span><br>
                        <button class="btn btn-sm btn-outline-danger mt-1" onclick="cancelOrder('${order.norenordno || order.orderId}')">
                            <i class="fas fa-times"></i> Cancel
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Get status color
function getStatusColor(status) {
    switch (status?.toLowerCase()) {
        case 'complete': case 'filled': return 'success';
        case 'open': case 'pending': return 'primary';
        case 'cancelled': case 'rejected': return 'danger';
        default: return 'secondary';
    }
}

// Cancel order
async function cancelOrder(orderId) {
    if (!confirm('Are you sure you want to cancel this order?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/cancel-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ orderId: orderId })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('Order cancelled successfully', 'success');
            refreshOrders();
        } else {
            showAlert('Failed to cancel order: ' + result.error, 'danger');
        }
    } catch (error) {
        showAlert('Error cancelling order: ' + error.message, 'danger');
    }
}

// Load positions
async function loadPositions() {
    try {
        const response = await fetch('/api/positions');
        const result = await response.json();
        
        if (result.status === 'success') {
            displayPositions(result.data);
        } else {
            document.getElementById('positionsList').innerHTML = `
                <div class="text-center text-muted">
                    <i class="fas fa-chart-line fa-2x mb-2"></i><br>
                    No positions found
                </div>
            `;
        }
    } catch (error) {
        document.getElementById('positionsList').innerHTML = `
            <div class="text-center text-danger">
                <i class="fas fa-times-circle fa-2x mb-2"></i><br>
                Error loading positions
            </div>
        `;
    }
}

// Display positions
function displayPositions(positions) {
    const container = document.getElementById('positionsList');
    
    if (!positions || positions.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-chart-line fa-2x mb-2"></i><br>
                No positions found
            </div>
        `;
        return;
    }
    
    let html = '';
    positions.forEach(position => {
        const pnl = parseFloat(position.rpnl || 0);
        const pnlColor = pnl >= 0 ? 'success' : 'danger';
        
        html += `
            <div class="order-item mb-2 p-2 border rounded">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <strong>${position.tsym || position.symbol}</strong><br>
                        <small class="text-muted">
                            Qty: ${position.netqty || position.quantity} | 
                            Avg: ₹${position.netavgprc || position.avgPrice}
                        </small>
                    </div>
                    <div class="text-end">
                        <span class="badge bg-${pnlColor}">₹${pnl.toFixed(2)}</span><br>
                        <small class="text-muted">P&L</small>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Load holdings
async function loadHoldings() {
    // Holdings endpoint would be similar to positions
    document.getElementById('holdingsList').innerHTML = `
        <div class="text-center text-muted">
            <i class="fas fa-wallet fa-2x mb-2"></i><br>
            Holdings feature coming soon
        </div>
    `;
}

// Refresh orders
function refreshOrders() {
    if (activeTab === 'orders') {
        loadOrders();
    } else if (activeTab === 'positions') {
        loadPositions();
    } else if (activeTab === 'holdings') {
        loadHoldings();
    }
}

function addToBasket() {
    const trantype = document.getElementById('trantype').value;
    const strikePrice = document.getElementById('strikePrice').value;
    const optionType = document.getElementById('optionType').value;
    const quantity = document.getElementById('quantity').value;
    const price = document.getElementById('price').value;
    
    if (!strikePrice || !quantity) {
        showAlert('Please enter strike price and quantity', 'warning');
        return;
    }
    
    const option = {
        id: Date.now(),
        symbol: `NIFTY${strikePrice}${optionType}`,
        strikePrice: strikePrice,
        optionType: optionType,
        trantype: trantype,
        quantity: quantity,
        price: price || '0',
        orderType: price ? 'LIMIT' : 'MARKET'
    };
    
    basketOrders.push(option);
    updateBasketDisplay();
    
    // Clear form
    document.getElementById('strikePrice').value = '';
    document.getElementById('price').value = '';
    
    showAlert(`Added ${trantype === 'B' ? 'BUY' : 'SELL'} ${option.symbol} to basket`, 'success');
}

function updateBasketDisplay() {
    const basketContainer = document.getElementById('basketContainer');
    const placeOrderBtn = document.getElementById('placeOrderBtn');
    
    if (basketOrders.length === 0) {
        basketContainer.innerHTML = `
            <div class="alert alert-info text-center">
                <i class="fas fa-shopping-basket fa-2x mb-2"></i><br>
                No options in basket. Add options using the form above.
            </div>
        `;
        placeOrderBtn.disabled = true;
        return;
    }
    
    let totalValue = 0;
    let html = `
        <div class="table-responsive">
            <table class="table table-striped">
                <thead>
                    <tr>
                        <th>Action</th>
                        <th>Symbol</th>
                        <th>Strike</th>
                        <th>Type</th>
                        <th>Quantity</th>
                        <th>Price</th>
                        <th>Value</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    basketOrders.forEach((order, index) => {
        const value = order.price ? (parseInt(order.quantity) * parseFloat(order.price)).toFixed(2) : 'Market';
        if (order.price) totalValue += parseInt(order.quantity) * parseFloat(order.price);
        
        html += `
            <tr>
                <td><span class="badge ${order.trantype === 'B' ? 'bg-success' : 'bg-danger'}">${order.trantype === 'B' ? 'BUY' : 'SELL'}</span></td>
                <td><strong>${order.symbol}</strong></td>
                <td>${order.strikePrice}</td>
                <td><span class="badge ${order.optionType === 'CE' ? 'bg-info' : 'bg-warning'}">${order.optionType}</span></td>
                <td>${order.quantity}</td>
                <td>${order.price ? '₹' + order.price : 'Market'}</td>
                <td>${value === 'Market' ? 'Market' : '₹' + value}</td>
                <td>
                    <button class="btn btn-sm btn-outline-danger" onclick="removeFromBasket(${index})">
                        <i class="fas fa-times"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
        <div class="mt-3">
            <div class="row">
                <div class="col-md-6">
                    <strong>Total Orders: ${basketOrders.length}</strong>
                </div>
                <div class="col-md-6 text-end">
                    <strong>Estimated Value: ₹${totalValue.toFixed(2)}</strong>
                </div>
            </div>
        </div>
    `;
    
    basketContainer.innerHTML = html;
    placeOrderBtn.disabled = false;
}

function removeFromBasket(index) {
    const removedOrder = basketOrders.splice(index, 1)[0];
    updateBasketDisplay();
    showAlert(`Removed ${removedOrder.symbol} from basket`, 'info');
}

// Search for valid trading symbols
async function searchSymbols() {
    try {
        const searchText = prompt('Enter search text (e.g., NIFTY):') || 'NIFTY';
        
        const response = await fetch(`/api/search-symbols?text=${encodeURIComponent(searchText)}`);
        const result = await response.json();
        
        if (result.status === 'success' && result.data && result.data.values) {
            console.log('Found symbols:', result.data.values);
            
            // Display symbols in a more readable format
            let symbolsHtml = '<h4>Found Symbols (NIFTY Options):</h4><ul>';
            result.data.values.forEach(symbol => {
                if (symbol.tsym && symbol.tsym.includes('NIFTY') && (symbol.tsym.includes('CE') || symbol.tsym.includes('PE'))) {
                    symbolsHtml += `<li><strong>${symbol.tsym}</strong> - ${symbol.dname || ''} (${symbol.exch || ''})</li>`;
                }
            });
            symbolsHtml += '</ul>';
            
            // Show in basket info section
            document.getElementById('basketInfo').innerHTML = symbolsHtml;
        } else {
            console.error('Search symbols failed:', result);
            alert('Failed to search symbols: ' + (result.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error searching symbols:', error);
        alert('Error searching symbols: ' + error.message);
    }
}

function clearBasket() {
    basketOrders = [];
    updateBasketDisplay();
    showAlert('Basket cleared', 'info');
}

function displayOptionChain(optionData) {
    const strikes = optionData.strikes;
    
    let html = `
        <div class="table-responsive">
            <table class="table table-striped table-hover">
                <thead class="table-dark">
                    <tr>
                        <th colspan="5" class="text-center text-success">CALL OPTIONS</th>
                        <th class="text-center">STRIKE</th>
                        <th colspan="5" class="text-center text-danger">PUT OPTIONS</th>
                    </tr>
                    <tr>
                        <th>LTP</th>
                        <th>Volume</th>
                        <th>OI</th>
                        <th>IV</th>
                        <th>Action</th>
                        <th class="fw-bold">Price</th>
                        <th>Action</th>
                        <th>IV</th>
                        <th>OI</th>
                        <th>Volume</th>
                        <th>LTP</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    strikes.forEach(strike => {
        html += `
            <tr>
                <td class="text-success">${strike.call.ltp}</td>
                <td class="text-success">${strike.call.volume}</td>
                <td class="text-success">${strike.call.oi}</td>
                <td class="text-success">${strike.call.iv}%</td>
                <td>
                    <button class="btn btn-sm btn-outline-success" onclick="selectOption('${strike.call.symbol}', '${strike.strikePrice}', 'CE', ${strike.call.ltp})">
                        + CE
                    </button>
                </td>
                <td class="fw-bold text-center">${strike.strikePrice}</td>
                <td>
                    <button class="btn btn-sm btn-outline-danger" onclick="selectOption('${strike.put.symbol}', '${strike.strikePrice}', 'PE', ${strike.put.ltp})">
                        + PE
                    </button>
                </td>
                <td class="text-danger">${strike.put.iv}%</td>
                <td class="text-danger">${strike.put.oi}</td>
                <td class="text-danger">${strike.put.volume}</td>
                <td class="text-danger">${strike.put.ltp}</td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
        
        <div class="mt-4">
            <h5>Selected Options</h5>
            <div id="selectedOptions" class="mb-3">
                <p class="text-muted">No options selected yet.</p>
            </div>
            <button class="btn btn-primary" onclick="placeBasketOrder()" disabled id="placeOrderBtn">
                Place Basket Order
            </button>
        </div>
    `;
    
    optionChainContainer.innerHTML = html;
}

let selectedOptions = [];

function selectOption(symbol, strike, type, ltp) {
    const option = {
        symbol: symbol,
        strike: strike,
        type: type,
        ltp: ltp,
        quantity: 25 // Default quantity
    };
    
    selectedOptions.push(option);
    updateSelectedOptionsDisplay();
}

function updateSelectedOptionsDisplay() {
    const container = document.getElementById('selectedOptions');
    const placeOrderBtn = document.getElementById('placeOrderBtn');
    
    if (selectedOptions.length === 0) {
        container.innerHTML = '<p class="text-muted">No options selected yet.</p>';
        placeOrderBtn.disabled = true;
        return;
    }
    
    let html = '<div class="row">';
    selectedOptions.forEach((option, index) => {
        html += `
            <div class="col-md-6 col-lg-4 mb-2">
                <div class="card">
                    <div class="card-body py-2">
                        <h6 class="card-title mb-1">${option.strike} ${option.type}</h6>
                        <p class="card-text mb-1">
                            <small>LTP: ₹${option.ltp}</small><br>
                            <small>Qty: ${option.quantity}</small>
                        </p>
                        <button class="btn btn-sm btn-outline-danger" onclick="removeOption(${index})">
                            Remove
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
    placeOrderBtn.disabled = false;
}

function removeOption(index) {
    selectedOptions.splice(index, 1);
    updateSelectedOptionsDisplay();
}

async function placeBasketOrder() {
    if (basketOrders.length === 0) {
        showAlert('Please add at least one option to the basket', 'warning');
        return;
    }
    
    try {
        const placeBtn = document.getElementById('placeOrderBtn');
        placeBtn.disabled = true;
        placeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Placing Orders...';
        
        showAlert('Placing basket order...', 'info');
        
        // Format orders for the server
        const formattedOrders = basketOrders.map(order => ({
            symbol: order.symbol,
            strikePrice: order.strikePrice,
            optionType: order.optionType,
            trantype: order.trantype, // B for Buy, S for Sell
            quantity: order.quantity,
            price: order.price,
            orderType: order.price ? 'LIMIT' : 'MARKET'
        }));
        
        const response = await fetch('/api/place-basket-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                orders: formattedOrders
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert(result.message || `Basket order placed successfully! ${result.orderIds ? result.orderIds.length : basketOrders.length} orders processed`, 'success');
            
            // Show detailed order results
            if (result.orders) {
                console.log('Order details:', result.orders);
                
                // Display order status
                let statusHtml = '<div class="mt-3"><h6>Order Status:</h6><div class="table-responsive"><table class="table table-sm"><thead><tr><th>Symbol</th><th>Action</th><th>Status</th><th>Message</th><th>Order ID</th></tr></thead><tbody>';
                
                result.orders.forEach(order => {
                    const statusClass = order.status === 'SUCCESS' ? 'text-success' : 'text-danger';
                    statusHtml += `
                        <tr>
                            <td>${order.symbol}</td>
                            <td><span class="badge ${order.trantype === 'B' ? 'bg-success' : 'bg-danger'}">${order.trantype === 'B' ? 'BUY' : 'SELL'}</span></td>
                            <td class="${statusClass}">${order.status}</td>
                            <td><small>${order.message}</small></td>
                            <td><small>${order.orderId || 'N/A'}</small></td>
                        </tr>
                    `;
                });
                
                statusHtml += '</tbody></table></div></div>';
                
                // Add status display to alerts
                setTimeout(() => {
                    const alertDiv = document.querySelector('.alert');
                    if (alertDiv) {
                        alertDiv.innerHTML += statusHtml;
                    }
                }, 500);
            }
            
            // Clear basket after successful order
            basketOrders = [];
            updateBasketDisplay();
            
        } else {
            showAlert(result.error || 'Failed to place basket order', 'danger');
        }
        
    } catch (error) {
        console.error('Basket order error:', error);
        showAlert('Failed to place basket order: ' + error.message, 'danger');
    } finally {
        // Re-enable button
        const placeBtn = document.getElementById('placeOrderBtn');
        if (placeBtn) {
            placeBtn.disabled = false;
            placeBtn.innerHTML = '<i class="fas fa-shopping-cart"></i> Place Basket Order';
        }
    }
}
