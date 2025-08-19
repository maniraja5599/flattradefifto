// DOM elements
let userStatus;
let alertContainer;
let loginForm;
let authUrlBtn;
let optionChainContainer;

document.addEventListener('DOMContentLoaded', function() {
    userStatus = document.getElementById('userStatus');
    alertContainer = document.getElementById('alertContainer');
    loginForm = document.getElementById('loginForm');
    authUrlBtn = document.getElementById('authUrlBtn');
    optionChainContainer = document.getElementById('optionChainContainer');
    
    // Check if user is already authenticated on page load
    checkUserStatus();
    
    // Listen for authentication success message from popup
    window.addEventListener('message', function(event) {
        if (event.data === 'auth_success') {
            setTimeout(() => {
                checkUserStatus();
                showAlert('Authentication successful! You can now access trading features.', 'success');
            }, 1000);
        }
    });
    
    // Check URL parameters for auth status
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'success') {
        showAlert('Authentication successful! You can now access trading features.', 'success');
        checkUserStatus();
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get('auth') === 'error') {
        const message = urlParams.get('message') || 'Authentication failed';
        showAlert(`Authentication failed: ${message}`, 'danger');
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
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

async function checkUserStatus() {
    try {
        const response = await fetch('/api/user-status');
        const data = await response.json();
        
        if (data.authenticated) {
            userStatus.innerHTML = `
                <div class="alert alert-success">
                    <strong>✓ Authenticated</strong><br>
                    User: ${data.userId}<br>
                    Client: ${data.clientId}
                </div>
            `;
            authUrlBtn.disabled = false;
            authUrlBtn.textContent = 'Get Option Chain';
            authUrlBtn.onclick = getOptionChain;
        } else {
            userStatus.innerHTML = `
                <div class="alert alert-warning">
                    <strong>⚠ Not Authenticated</strong><br>
                    Please login first to access trading features.
                </div>
            `;
            authUrlBtn.disabled = false;
            authUrlBtn.textContent = 'Generate Auth URL';
            authUrlBtn.onclick = generateAuthUrl;
        }
    } catch (error) {
        console.error('Error checking user status:', error);
        userStatus.innerHTML = `
            <div class="alert alert-danger">
                Error checking authentication status
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
            checkUserStatus();
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
                        checkUserStatus();
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
        showAlert('Fetching option chain...', 'info');
        
        const response = await fetch('/api/option-chain?symbol=NIFTY&expiry=2024-01-25');
        const result = await response.json();
        
        if (result.success) {
            showAlert('Option chain loaded successfully!', 'success');
            displayOptionChain(result.data);
        } else {
            showAlert(result.error || 'Failed to fetch option chain', 'danger');
        }
    } catch (error) {
        console.error('Option chain error:', error);
        showAlert('Failed to fetch option chain: ' + error.message, 'danger');
    }
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
    if (selectedOptions.length === 0) {
        showAlert('Please select at least one option', 'warning');
        return;
    }
    
    try {
        showAlert('Placing basket order...', 'info');
        
        const response = await fetch('/api/place-basket-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                orders: selectedOptions
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert(`Basket order placed successfully! Orders: ${result.orderIds.length}`, 'success');
            selectedOptions = [];
            updateSelectedOptionsDisplay();
        } else {
            showAlert(result.error || 'Failed to place basket order', 'danger');
        }
    } catch (error) {
        console.error('Basket order error:', error);
        showAlert('Failed to place basket order: ' + error.message, 'danger');
    }
}
