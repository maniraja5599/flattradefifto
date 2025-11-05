// Global variables
let basketOrders = [];
let currentPrice = 24500;
let isAuthenticated = false;
let currentUser = null;
let marginData = {
    total: 0,
    available: 0,
    used: 0,
    mcx: 0
};

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
    try {
        console.log('🚀 Starting login process...');
        showAlert('Opening login window...', 'info');
        
        // Generate OAuth URL and open window
        const response = await fetch('/api/generate-manual-auth-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('📡 Login API response:', result);
        
        if (result.success && result.authUrl) {
            // Open OAuth window
            const authWindow = window.open(result.authUrl, 'FlattradeAuth', 'width=600,height=700');
            
            if (!authWindow) {
                throw new Error('Please allow popups for this site');
            }
            
            showAlert('Complete login in the popup window', 'warning');
            
            // Monitor auth window
            const checkInterval = setInterval(() => {
                if (authWindow.closed) {
                    clearInterval(checkInterval);
                    showAlert('Verifying authentication...', 'info');
                    // Check auth status multiple times to ensure it works
                    setTimeout(() => {
                        checkAuthStatus();
                        setTimeout(checkAuthStatus, 2000);
                        setTimeout(checkAuthStatus, 5000);
                    }, 1000);
                }
            }, 1000);
            
            // Also check auth status periodically even if window is open
            const authCheckInterval = setInterval(() => {
                if (authWindow.closed) {
                    clearInterval(authCheckInterval);
                } else {
                    checkAuthStatus().then(() => {
                        if (isAuthenticated) {
                            authWindow.close();
                            clearInterval(authCheckInterval);
                            if (checkInterval) clearInterval(checkInterval);
                        }
                    });
                }
            }, 3000);
            
        } else {
            throw new Error(result.error || result.emsg || 'Failed to generate login URL');
        }
        
    } catch (error) {
        console.error('❌ Login error:', error);
        showAlert('Login failed: ' + error.message, 'danger');
    }
}

// Logout function
async function logout() {
    try {
        if (!confirm('Are you sure you want to logout?')) {
            return;
        }
        
        const response = await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include'
        });
        
        const result = await response.json();
        console.log('📡 Logout response:', result);
        
        // Check if logout was successful (handle various response formats)
        const logoutSuccess = result.stat === 'Ok' || 
                            result.success === true ||
                            result.status === 'success' ||
                            result.status === 'ok' ||
                            result.message?.toLowerCase().includes('logout') ||
                            result.message?.toLowerCase().includes('success') ||
                            response.status === 200;
        
        if (logoutSuccess) {
            isAuthenticated = false;
            currentUser = null;
            console.log('✅ Logout successful');
            
            // Clear basket
            basketOrders = [];
            updateBasketDisplay();
            
            // Update UI
            const userStatusEl = document.getElementById('userStatus');
            const userStatusBtn = document.getElementById('userStatusBtn');
            const authAlert = document.getElementById('authAlert');
            
            if (userStatusEl) {
                userStatusEl.textContent = 'Not Logged In';
            }
            
            // Hide profile dropdown
            const profileDropdown = document.getElementById('profileDropdown');
            if (profileDropdown) {
                profileDropdown.style.display = 'none';
            }
            
            // Hide margin balance display
            const marginBalanceDisplay = document.getElementById('marginBalanceDisplay');
            if (marginBalanceDisplay) {
                marginBalanceDisplay.style.display = 'none';
            }
            
            // Show auth alert
            if (authAlert) {
                authAlert.style.display = 'flex';
                authAlert.classList.add('d-flex');
            }
            
            // Show warning alert
            showAlert('⚠️ You have been logged out. Refreshing page...', 'warning');
            
            // Clear today's orders display
            const todaysOrdersContainer = document.getElementById('todaysOrders');
            if (todaysOrdersContainer) {
                todaysOrdersContainer.innerHTML = `
                    <div class="empty-state" style="padding:40px 20px;">
                        <i class="fas fa-clipboard-list"></i>
                        <div style="font-size:14px; color:#64748b;">No orders today</div>
                    </div>
                `;
            }
            
            // Hide chevron when logged out
            const profileChevron = document.getElementById('profileChevron');
            if (profileChevron) {
                profileChevron.style.display = 'none';
            }
            
            // Refresh page after logout - use shorter delay and force reload
            setTimeout(() => {
                console.log('🔄 Refreshing page after logout...');
                // Use location.href for more reliable refresh
                window.location.href = window.location.href;
            }, 800);
            
        } else {
            // Even if response format is unexpected, proceed with logout if we got here
            console.warn('⚠️ Unexpected logout response format, proceeding with logout anyway');
            isAuthenticated = false;
            currentUser = null;
            
            // Still refresh the page
            setTimeout(() => {
                console.log('🔄 Refreshing page after logout...');
                window.location.href = window.location.href;
            }, 800);
        }
    } catch (error) {
        console.error('❌ Logout error:', error);
        // Even on error, try to logout locally and refresh
        isAuthenticated = false;
        currentUser = null;
        showAlert('Logging out and refreshing...', 'warning');
        
        setTimeout(() => {
            console.log('🔄 Refreshing page after logout error...');
            window.location.href = window.location.href;
        }, 800);
    }
}

// Toggle user dropdown
function toggleUserDropdown() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('userDropdown');
    const btn = document.getElementById('userMenuBtn');
    
    if (dropdown && btn && !btn.contains(event.target) && !dropdown.contains(event.target)) {
        dropdown.style.display = 'none';
    }
});

// Check authentication status
async function checkAuthStatus() {
    try {
        console.log('🔍 Checking authentication status...');
        const response = await fetch('/api/user-status', { credentials: 'include' });
        const data = await response.json();
        console.log('📡 Auth response:', data);
        
        const authAlert = document.getElementById('authAlert');
        console.log('🔔 Auth alert element:', authAlert ? 'Found' : 'NOT FOUND');
        
        // Update user status in simplified UI
        const userStatusEl = document.getElementById('userStatus');
        
        // Get profile chevron once to avoid duplicate declarations
        const profileChevron = document.getElementById('profileChevron');
        
        if (data.authenticated) {
            isAuthenticated = true;
            console.log('✅ User IS authenticated:', data.userId);
            
            // Hide auth alert banner
            if (authAlert) {
                authAlert.style.setProperty('display', 'none', 'important');
                authAlert.classList.remove('d-flex');
                console.log('✅ Auth alert hidden successfully');
            }
            
            // Update user status display with user ID initially
            if (userStatusEl) {
                userStatusEl.textContent = data.userId || 'Logged In';
            }
            
            // Show chevron when authenticated
            if (profileChevron) {
                profileChevron.style.display = 'inline-block';
            }
            
            // Update profile dropdown with user name
            const profileUserName = document.getElementById('profileUserName');
            if (profileUserName) {
                profileUserName.textContent = data.userId || 'User';
            }
            
            // Store current user
            currentUser = data;
            
            // Load user info to get name and margin balance
            loadUserInfoForName();
            loadUserInfo();
            
            // Load today's orders if authenticated
            loadTodaysOrders();
            
        } else {
            isAuthenticated = false;
            currentUser = null;
            console.log('❌ User NOT authenticated');
            
            // Show auth alert banner
            if (authAlert) {
                authAlert.style.setProperty('display', 'flex', 'important');
                authAlert.classList.add('d-flex');
                console.log('⚠️ Auth alert shown');
            }
            
            // Update user status display
            if (userStatusEl) {
                userStatusEl.textContent = 'Not Logged In';
            }
            
            // Hide profile dropdown
            const profileDropdown = document.getElementById('profileDropdown');
            if (profileDropdown) {
                profileDropdown.style.display = 'none';
            }
            
            // Hide chevron when not authenticated
            if (profileChevron) {
                profileChevron.style.display = 'none';
            }
            
            // Hide margin balance display
            const marginBalanceDisplay = document.getElementById('marginBalanceDisplay');
            if (marginBalanceDisplay) {
                marginBalanceDisplay.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('❌ Auth check error:', error);
        isAuthenticated = false;
        
        // Hide margin balance display on error
        const marginBalanceDisplay = document.getElementById('marginBalanceDisplay');
        if (marginBalanceDisplay) {
            marginBalanceDisplay.style.display = 'none';
        }
    }
}

// Load user name for display
async function loadUserInfoForName() {
    try {
        // Get user details
        const userResponse = await fetch('/api/user-details', { credentials: 'include' });
        const userData = await userResponse.json();
        
        if (userData.stat === 'Ok') {
            const userName = userData.uname || userData.actid || userData.userId || 'User';
            
            // Update user status display with name
            const userStatusEl = document.getElementById('userStatus');
            if (userStatusEl) {
                userStatusEl.textContent = userName;
            }
            
            // Update profile dropdown with user name
            const profileUserName = document.getElementById('profileUserName');
            if (profileUserName) {
                profileUserName.textContent = userName;
            }
            
            console.log('✅ User name loaded:', userName);
        }
    } catch (error) {
        console.error('❌ Error loading user name:', error);
    }
}

// Load user info
async function loadUserInfo() {
    try {
        // Get margin info
        const marginResponse = await fetch('/api/limits', { credentials: 'include' });
        const marginResponseData = await marginResponse.json();
        
        if (marginResponseData.stat === 'Ok') {
            const cash = parseFloat(marginResponseData.cash || 0);
            const used = parseFloat(marginResponseData.marginused || 0);
            const total = cash + used; // Calculate total margin
            
            // Extract MCX margin (try different possible field names)
            // Log available fields for debugging
            if (Object.keys(marginResponseData).some(key => key.toLowerCase().includes('mcx') || key.toLowerCase().includes('commodity'))) {
                console.log('📊 Margin data fields:', Object.keys(marginResponseData));
            }
            
            const mcxMargin = parseFloat(
                marginResponseData.mcx || 
                marginResponseData.mcx_margin || 
                marginResponseData.mcxmargin ||
                marginResponseData.commodity || 
                marginResponseData.commodity_margin ||
                marginResponseData.commoditymargin ||
                0
            );
            
            // Store margin data globally
            marginData = {
                total: total,
                available: cash,
                used: used,
                mcx: mcxMargin
            };
            
            // Update all displays
            if (document.getElementById('topFunds')) {
                document.getElementById('topFunds').textContent = `₹${cash.toLocaleString('en-IN')}`;
            }
            if (document.getElementById('availableMargin')) {
                document.getElementById('availableMargin').textContent = `₹${cash.toLocaleString('en-IN')}`;
            }
            if (document.getElementById('usedMargin')) {
                document.getElementById('usedMargin').textContent = `₹${used.toLocaleString('en-IN')}`;
            }
            
            // Update margin details dropdown
            if (document.getElementById('totalMargin')) {
                document.getElementById('totalMargin').textContent = `₹${total.toLocaleString('en-IN')}`;
            }
            if (document.getElementById('availableMarginDetail')) {
                document.getElementById('availableMarginDetail').textContent = `₹${cash.toLocaleString('en-IN')}`;
            }
            if (document.getElementById('usedMarginDetail')) {
                document.getElementById('usedMarginDetail').textContent = `₹${used.toLocaleString('en-IN')}`;
            }
            if (document.getElementById('mcxMarginDetail')) {
                document.getElementById('mcxMarginDetail').textContent = `₹${mcxMargin.toLocaleString('en-IN')}`;
                // Show/hide MCX section based on whether MCX margin exists
                const mcxSection = document.getElementById('mcxMarginSection');
                if (mcxSection) {
                    mcxSection.style.display = mcxMargin > 0 ? 'block' : 'none';
                }
            }
            
            // Show margin balance display
            const marginBalanceDisplay = document.getElementById('marginBalanceDisplay');
            if (marginBalanceDisplay) {
                marginBalanceDisplay.style.display = 'flex';
            }
        } else {
            // Hide margin balance display if margin data is not available
            const marginBalanceDisplay = document.getElementById('marginBalanceDisplay');
            if (marginBalanceDisplay) {
                marginBalanceDisplay.style.display = 'none';
            }
        }
        
        // Get user details
        const userResponse = await fetch('/api/user-details', { credentials: 'include' });
        const userData = await userResponse.json();
        
        if (userData.stat === 'Ok') {
            const userName = userData.uname || userData.actid || 'User';
            
            // Update user status display with name
            const userStatusEl = document.getElementById('userStatus');
            if (userStatusEl) {
                userStatusEl.textContent = userName;
            }
            
            const userInfoEl = document.getElementById('userInfo');
            if (userInfoEl) {
                userInfoEl.textContent = userName;
            }
            
            // Update dropdown with full name
            const dropdownUserName = document.getElementById('dropdownUserName');
            if (dropdownUserName) {
                dropdownUserName.textContent = userName;
            }
            
            // Update top bar with user name
            const topUserName = document.getElementById('topUserName');
            const topUserNameText = document.getElementById('topUserNameText');
            if (topUserName && topUserNameText) {
                topUserNameText.textContent = userName;
                topUserName.style.setProperty('display', 'block', 'important');
            }
        }
        
        console.log('✅ User data loaded successfully');
        
        // Load orders and positions for P&L and count
        await loadOrdersAndPositions();
        
        // Load today's orders display
        await loadTodaysOrders();
        
    } catch (error) {
        console.error('❌ Error loading user info:', error);
        // Hide margin balance display on error
        const marginBalanceDisplay = document.getElementById('marginBalanceDisplay');
        if (marginBalanceDisplay) {
            marginBalanceDisplay.style.display = 'none';
        }
    }
}

// Load orders and positions to calculate P&L and counts
async function loadOrdersAndPositions() {
    try {
        // Don't try to load if not authenticated
        if (!isAuthenticated) {
            console.log('⏭️ Skipping orders/positions load - user not authenticated');
            return;
        }
        
        console.log('🔄 ========== Loading orders and positions ==========');
        
        let totalPnL = 0;
        let positions = [];
        
        // Get positions for P&L calculation
        // According to Flattrade API docs, PositionBook contains both:
        // - rpnl (Realized P&L) - profit/loss from closed positions
        // - urmtom (Unrealized P&L/MTM) - mark-to-market for open positions
        // Total P&L = sum of rpnl + urmtom across all positions
        console.log('📡 Calling /api/positions...');
        const positionsResponse = await fetch('/api/positions', { credentials: 'include' });
        
        console.log('📡 Response status:', positionsResponse.status, positionsResponse.statusText);
        
        if (!positionsResponse.ok) {
            console.error('❌ Positions API error:', positionsResponse.status, positionsResponse.statusText);
            // Still try to update display with 0
            const pnlTodayEl = document.getElementById('pnlToday');
            if (pnlTodayEl) {
                pnlTodayEl.textContent = '₹0.00';
                pnlTodayEl.className = 'value price-up';
            }
            return;
        }
        
        const positionsResult = await positionsResponse.json();
        console.log('📦 Raw positions response:', JSON.stringify(positionsResult, null, 2));
        
        // Handle API error responses (stat: "Not_Ok")
        if (positionsResult.stat === 'Not_Ok' || positionsResult.stat === 'not_ok') {
            const errorMsg = positionsResult.emsg || positionsResult.message || 'No positions found';
            console.log(`⚠️ API returned Not_Ok: ${errorMsg}`);
            totalPnL = 0;
        } else {
            // Handle different response formats
            positions = positionsResult.data || positionsResult || [];
            
            // If it's not an array, try to extract array from response
            if (!Array.isArray(positions)) {
                console.log('⚠️ Response is not an array, trying to extract...');
                if (positionsResult.values && Array.isArray(positionsResult.values)) {
                    positions = positionsResult.values;
                    console.log('✅ Found positions in .values array');
                } else if (positionsResult.status === 'success' && Array.isArray(positionsResult.data)) {
                    positions = positionsResult.data;
                    console.log('✅ Found positions in .data array');
                } else if (positionsResult.length !== undefined) {
                    // Handle array-like objects
                    positions = Array.from(positionsResult);
                    console.log('✅ Converted array-like object to array');
                } else {
                    console.warn('⚠️ Unexpected positions response format:', positionsResult);
                    positions = [];
                }
            }
            
            console.log(`📊 Positions array length: ${positions.length}`);
            
            if (Array.isArray(positions) && positions.length > 0) {
                console.log('📊 Processing position details:');
                
                positions.forEach((position, index) => {
                    // FlatTrade PositionBook API fields (as per official docs):
                    // rpnl - Realized P&L (profit/loss from closed positions)
                    // urmtom - Unrealized P&L/MTM (mark-to-market for open positions)
                    // netqty - Net quantity (non-zero for open positions)
                    // netavgprc or avgprc - Average price
                    // lp or ltp - Last price
                    
                    console.log(`  Position ${index + 1}:`, position);
                    
                    const realizedPnL = parseFloat(position.rpnl || position.RPNL || 0);
                    const unrealizedPnL = parseFloat(position.urmtom || position.URMTOM || position.upnl || position.UPNL || 0);
                    const netQty = parseFloat(position.netqty || position.NETQTY || position.daybuyqty || 0);
                    
                    // Total P&L for this position = Realized + Unrealized
                    const positionPnL = realizedPnL + unrealizedPnL;
                    
                    console.log(`  📈 ${position.tsym || position.TSYM || position.symbol || position.exch || 'N/A'}:`);
                    console.log(`     Net Qty: ${netQty}, Realized P&L: ₹${realizedPnL.toFixed(2)}, Unrealized P&L: ₹${unrealizedPnL.toFixed(2)}, Position P&L: ₹${positionPnL.toFixed(2)}`);
                    
                    // Add to total P&L (sum of rpnl + urmtom as per Flattrade API docs)
                    totalPnL += positionPnL;
                });
                
                console.log(`💰 Total P&L calculated from positions: ₹${totalPnL.toFixed(2)}`);
            } else {
                console.log('📊 No positions found (empty array or no data)');
                totalPnL = 0;
            }
        }
        
        console.log(`💰 Final Total P&L (Today): ₹${totalPnL.toFixed(2)}`);
        
        // Update P&L display
        const pnlTodayEl = document.getElementById('pnlToday');
        console.log('🔍 Looking for pnlToday element:', pnlTodayEl ? 'FOUND' : 'NOT FOUND');
        
        if (pnlTodayEl) {
            const formattedPnL = totalPnL.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            console.log(`💰 Updating P&L display element with: ₹${formattedPnL}`);
            pnlTodayEl.textContent = `₹${formattedPnL}`;
            pnlTodayEl.className = totalPnL >= 0 ? 'value price-up' : 'value price-down';
            console.log(`✅ P&L display updated successfully: ₹${formattedPnL}`);
        } else {
            // Element doesn't exist in this UI - this is expected, not an error
            console.log('ℹ️ pnlToday element not found (not in this UI)');
        }
        
        // Get orders for count
        const ordersResponse = await fetch('/api/orders', { credentials: 'include' });
        
        if (!ordersResponse.ok) {
            console.error('❌ Orders API error:', ordersResponse.status, ordersResponse.statusText);
            return;
        }
        
        const ordersResult = await ordersResponse.json();
        console.log('📦 Raw orders response:', ordersResult);
        
        const orders = ordersResult.data || ordersResult || [];
        console.log('📋 Orders array:', orders, 'Length:', orders.length);
        
        let orderCount = 0;
        let ordersByStatus = {};
        
        if (Array.isArray(orders) && orders.length > 0) {
            // Count orders by status
            orders.forEach(order => {
                const status = order.status || 'UNKNOWN';
                ordersByStatus[status] = (ordersByStatus[status] || 0) + 1;
            });
            
            console.log('📊 Orders by status:', ordersByStatus);
            
            // FlatTrade order status values:
            // 'COMPLETE' - Order executed
            // 'OPEN' - Order pending in market
            // 'TRIGGER PENDING' - GTT/OCO waiting for trigger
            // 'REJECTED' - Order rejected
            // 'CANCELED' - Order cancelled
            
            // Count all orders for today (you can filter by status if needed)
            orderCount = orders.length;
            
            // Alternative: Count only active orders
            // orderCount = orders.filter(order => 
            //     order.status === 'OPEN' || order.status === 'TRIGGER PENDING'
            // ).length;
        }
        
        console.log('📊 Total orders count:', orderCount, '(Total orders today:', orders.length, ')');
        
        // Update orders count (if element exists)
        const ordersCountEl = document.getElementById('ordersCount');
        if (ordersCountEl) {
            ordersCountEl.textContent = orderCount;
            console.log(`📊 Updated orders count: ${orderCount}`);
        } else {
            // Element doesn't exist in this UI - this is expected, not an error
            console.log('ℹ️ ordersCount element not found (not in this UI)');
        }

                console.log('✅ P&L and Orders loaded:', { totalPnL, orderCount, positionsCount: positions.length, totalOrders: orders.length });
        
    } catch (error) {
                console.error('❌ Error loading orders/positions:', error);
    }
}

// Refresh current price from NSE
async function refreshPrice() {
    try {
        console.log('📈 Fetching live NIFTY & BANKNIFTY prices from NSE...');
        
        const response = await fetch('/api/nifty-price', {
            method: 'GET',
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📊 Price data received:', data);
        
        // Update NIFTY
        if (data.nifty && data.nifty.price) {
            const price = parseFloat(data.nifty.price);
            const change = parseFloat(data.nifty.change || 0);
            const changePct = parseFloat(data.nifty.pChange || 0);
            
            // Update global currentPrice for option builder
            currentPrice = price;
            
            const niftyPriceEl = document.getElementById('niftyPrice');
            if (niftyPriceEl) {
                niftyPriceEl.textContent = price.toLocaleString('en-IN', { minimumFractionDigits: 2 });
                niftyPriceEl.className = change >= 0 ? 'value price-up' : 'value price-down';
            }
            
            // Update NIFTY in market indices bar
            const niftyExpiryPriceEl = document.getElementById('niftyExpiryPrice');
            if (niftyExpiryPriceEl) {
                niftyExpiryPriceEl.textContent = price.toLocaleString('en-IN', { minimumFractionDigits: 2 });
                niftyExpiryPriceEl.style.color = change >= 0 ? '#10b981' : '#ef4444';
            }
            
            const niftyExpiryChangeEl = document.getElementById('niftyExpiryChange');
            if (niftyExpiryChangeEl) {
                const changeText = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`;
                niftyExpiryChangeEl.textContent = changeText;
                niftyExpiryChangeEl.style.color = change >= 0 ? '#10b981' : '#ef4444';
            }
            
            const niftyChangeEl = document.getElementById('niftyChange');
            if (niftyChangeEl) {
                const changeText = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`;
                niftyChangeEl.textContent = changeText;
                niftyChangeEl.className = change >= 0 ? 'price-up' : 'price-down';
            }
            
            const niftyHighLowEl = document.getElementById('niftyHighLow');
            if (niftyHighLowEl && data.nifty.dayHigh && data.nifty.dayLow) {
                niftyHighLowEl.textContent = `${parseFloat(data.nifty.dayHigh).toFixed(2)} / ${parseFloat(data.nifty.dayLow).toFixed(2)}`;
            }
            
            const niftyVolumeEl = document.getElementById('niftyVolume');
            if (niftyVolumeEl && data.nifty.totalTradedVolume) {
                const volume = parseFloat(data.nifty.totalTradedVolume);
                niftyVolumeEl.textContent = volume >= 1000000 ? (volume / 1000000).toFixed(1) + 'M' : (volume / 1000).toFixed(0) + 'K';
            }
            
            // Update option builder spot price
            const currentPriceEl = document.getElementById('currentPrice');
            if (currentPriceEl) {
                currentPriceEl.textContent = price.toLocaleString('en-IN', { minimumFractionDigits: 2 });
            }
            
            console.log('✅ NIFTY updated:', price, 'Change:', change);
        }
        
        // Update SENSEX
        if (data.sensex && data.sensex.price) {
            const price = parseFloat(data.sensex.price);
            const change = parseFloat(data.sensex.change || 0);
            const changePct = parseFloat(data.sensex.pChange || 0);
            
            const sensexPriceEl = document.getElementById('sensexPrice');
            if (sensexPriceEl) {
                sensexPriceEl.textContent = price.toLocaleString('en-IN', { minimumFractionDigits: 2 });
                sensexPriceEl.style.color = change >= 0 ? '#10b981' : '#ef4444';
            }
            
            const sensexChangeEl = document.getElementById('sensexChange');
            if (sensexChangeEl) {
                const changeText = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`;
                sensexChangeEl.textContent = changeText;
                sensexChangeEl.style.color = change >= 0 ? '#10b981' : '#ef4444';
            }
            
            console.log('✅ SENSEX updated:', price, 'Change:', change);
        }
        
        // Update BANKNIFTY
        if (data.banknifty && data.banknifty.price) {
            const price = parseFloat(data.banknifty.price);
            const change = parseFloat(data.banknifty.change || 0);
            const changePct = parseFloat(data.banknifty.pChange || 0);
            
            const bankniftyPriceEl = document.getElementById('bankniftyPrice');
            if (bankniftyPriceEl) {
                bankniftyPriceEl.textContent = price.toLocaleString('en-IN', { minimumFractionDigits: 2 });
                bankniftyPriceEl.style.color = change >= 0 ? '#10b981' : '#ef4444';
            }
            
            const bankniftyChangeEl = document.getElementById('bankniftyChange');
            if (bankniftyChangeEl) {
                const changeText = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`;
                bankniftyChangeEl.textContent = changeText;
                bankniftyChangeEl.style.color = change >= 0 ? '#10b981' : '#ef4444';
            }
            
            console.log('✅ BANKNIFTY updated:', price, 'Change:', change);
        }
        
        // Update VIX
        if (data.vix && data.vix.price) {
            const price = parseFloat(data.vix.price);
            const change = parseFloat(data.vix.change || 0);
            const changePct = parseFloat(data.vix.pChange || 0);
            
            const vixPriceEl = document.getElementById('vixPrice');
            if (vixPriceEl) {
                vixPriceEl.textContent = price.toLocaleString('en-IN', { minimumFractionDigits: 2 });
                vixPriceEl.style.color = change >= 0 ? '#10b981' : '#ef4444';
            }
            
            const vixChangeEl = document.getElementById('vixChange');
            if (vixChangeEl) {
                const changeText = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`;
                vixChangeEl.textContent = changeText;
                vixChangeEl.style.color = change >= 0 ? '#10b981' : '#ef4444';
            }
            
            console.log('✅ VIX updated:', price, 'Change:', change);
        }
        
    } catch (error) {
        console.error('❌ Error refreshing price:', error);
        // Use fallback static price
        currentPrice = 24350.00;
        console.log('⚠️ Using fallback price:', currentPrice);
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

// Select option type (CE/PE)
function selectOptionType(type) {
    document.getElementById('optionType').value = type;
    
    // Update button styles
    const ceBtn = document.getElementById('typeCE');
    const peBtn = document.getElementById('typePE');
    
    if (type === 'CE') {
        ceBtn.style.background = '#22c55e';
        ceBtn.style.opacity = '1';
        ceBtn.style.fontWeight = 'bold';
        peBtn.style.background = '#475569';
        peBtn.style.opacity = '0.6';
        peBtn.style.fontWeight = 'normal';
    } else {
        peBtn.style.background = '#ef4444';
        peBtn.style.opacity = '1';
        peBtn.style.fontWeight = 'bold';
        ceBtn.style.background = '#475569';
        ceBtn.style.opacity = '0.6';
        ceBtn.style.fontWeight = 'normal';
    }
}

// Select product type (MIS/NRML)
function selectProduct(product) {
    document.getElementById('product').value = product;
    
    // Update button styles
    const misBtn = document.getElementById('productMIS');
    const nrmlBtn = document.getElementById('productNRML');
    
    if (product === 'MIS') {
        misBtn.style.background = '#3b82f6';
        misBtn.style.opacity = '1';
        misBtn.style.fontWeight = 'bold';
        nrmlBtn.style.background = '#475569';
        nrmlBtn.style.opacity = '0.6';
        nrmlBtn.style.fontWeight = 'normal';
    } else {
        nrmlBtn.style.background = '#6366f1';
        nrmlBtn.style.opacity = '1';
        nrmlBtn.style.fontWeight = 'bold';
        misBtn.style.background = '#475569';
        misBtn.style.opacity = '0.6';
        misBtn.style.fontWeight = 'normal';
    }
}

// Handle mouse wheel scroll on strike price input
function handleStrikeScroll(event) {
    event.preventDefault(); // Prevent default scroll behavior
    
    const strikeInput = document.getElementById('strikePrice');
    const currentStrike = parseFloat(strikeInput.value) || 0;
    
    // Get current spot price to calculate ATM
    const spotPriceText = document.getElementById('currentPrice')?.textContent || '';
    const atmPrice = parseFloat(spotPriceText.replace(/,/g, '')) || currentPrice || 0;
    const atmStrike = Math.round(atmPrice / 50) * 50; // Round to nearest 50
    
    // Get step value (default 50 for strike prices)
    const step = parseFloat(strikeInput.step) || 50;
    
    // Determine scroll direction
    const delta = event.deltaY < 0 ? step : -step; // Scroll up = +step, Scroll down = -step
    
    // Calculate difference from ATM
    const diffFromATM = currentStrike - atmStrike;
    
    // Round current difference to nearest step
    const roundedDiff = Math.round(diffFromATM / step) * step;
    
    // Calculate new difference from ATM
    const newDiffFromATM = roundedDiff + delta;
    
    // Calculate new strike price relative to ATM
    const newStrike = atmStrike + newDiffFromATM;
    
    // Ensure minimum is 0 and round to nearest step
    const finalStrike = Math.max(0, Math.round(newStrike / step) * step);
    
    // Update strike price
    strikeInput.value = finalStrike;
}

// Prevent negative lot size when using arrow keys
function preventNegativeLot(event) {
    const lotInput = document.getElementById('quantity');
    const currentLot = parseFloat(lotInput.value) || 0;
    
    // Handle arrow down key
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        const newLot = Math.max(1, currentLot - 1);
        lotInput.value = newLot;
        updateQuantityFromLot();
        return false;
    }
    
    // Handle arrow up key
    if (event.key === 'ArrowUp') {
        event.preventDefault();
        const newLot = currentLot + 1;
        lotInput.value = newLot;
        updateQuantityFromLot();
        return false;
    }
    
    // Allow other keys (numbers, backspace, delete, etc.)
    return true;
}

// Handle mouse wheel scroll on lot size input
function handleLotScroll(event) {
    event.preventDefault(); // Prevent default scroll behavior
    
    const lotInput = document.getElementById('quantity');
    const currentLot = parseFloat(lotInput.value) || 0;
    
    // Round to nearest integer to ensure whole number increments
    const currentLotInt = Math.round(currentLot);
    
    // Determine scroll direction
    const delta = event.deltaY < 0 ? 1 : -1; // Scroll up = +1, Scroll down = -1
    
    // Calculate new lot size (minimum 1, always whole number)
    const newLot = Math.max(1, currentLotInt + delta);
    
    // Update lot size as whole number
    lotInput.value = newLot;
    
    // Update quantity display
    updateQuantityFromLot();
}

// Update quantity from lot size (when lot size changes)
function updateQuantityFromLot() {
    const lotInput = document.getElementById('quantity');
    const qtyInput = document.getElementById('actualQuantity');
    const lotSize = parseFloat(lotInput.value) || 0;
    
    // Ensure lot size is not negative
    if (lotSize < 1) {
        lotInput.value = 1;
        lotSize = 1;
    }
    
    // Get lot size multiplier based on symbol
    const symbol = document.getElementById('symbol').value;
    let multiplier = 75; // Default NIFTY
    
    if (symbol === 'NIFTY') {
        multiplier = 75; // 1 lot = 75 qty
    } else if (symbol === 'BANKNIFTY') {
        multiplier = 35; // 1 lot = 35 qty
    } else if (symbol === 'FINNIFTY') {
        multiplier = 40; // 1 lot = 40 qty
    }
    
    const calculatedQty = Math.round(lotSize * multiplier);
    
    if (qtyInput) {
        qtyInput.value = calculatedQty;
    }
}

// Update lot size from quantity (when quantity changes)
function updateLotFromQuantity() {
    const lotInput = document.getElementById('quantity');
    const qtyInput = document.getElementById('actualQuantity');
    const qty = parseFloat(qtyInput.value) || 0;
    
    // Get lot size multiplier based on symbol
    const symbol = document.getElementById('symbol').value;
    let multiplier = 75; // Default NIFTY
    
    if (symbol === 'NIFTY') {
        multiplier = 75; // 1 lot = 75 qty
    } else if (symbol === 'BANKNIFTY') {
        multiplier = 35; // 1 lot = 35 qty
    } else if (symbol === 'FINNIFTY') {
        multiplier = 40; // 1 lot = 40 qty
    }
    
    const calculatedLot = (qty / multiplier).toFixed(2);
    
    if (lotInput) {
        lotInput.value = calculatedLot;
    }
}

// Update quantity display (lot size and calculated quantity) - Legacy function, keeping for compatibility
function updateQuantityDisplay() {
    updateQuantityFromLot(); // Use the new function
}

// Toggle price field based on order type
function togglePriceField() {
    const orderType = document.getElementById('orderType').value;
    const priceSection = document.getElementById('priceSection');
    const priceInput = document.getElementById('price');
    const gttSection = document.getElementById('gttSection');
    
    if (orderType === 'MARKET') {
        priceSection.style.display = 'none';
        priceInput.required = false;
        if (gttSection) gttSection.style.display = 'none';
    } else if (orderType === 'LIMIT') {
        priceSection.style.display = 'block';
        priceInput.required = true;
        if (gttSection) gttSection.style.display = 'none';
    } else if (orderType === 'GTT_OCO') {
        priceSection.style.display = 'none';
        priceInput.required = false;
        if (gttSection) gttSection.style.display = 'flex';
    }
}

// Create order object from form
function createOrderFromForm(trantype) {
    const symbol = document.getElementById('symbol').value;
    const expiry = document.getElementById('expiry').value;
    const strike = document.getElementById('strikePrice').value;
    const optionType = document.getElementById('optionType').value;
    const lotSize = parseInt(document.getElementById('quantity').value) || 0;
    
    // Calculate actual quantity based on lot size and symbol multiplier
    let multiplier = 75; // Default NIFTY
    if (symbol === 'NIFTY') {
        multiplier = 75; // 1 lot = 75 qty
    } else if (symbol === 'BANKNIFTY') {
        multiplier = 35; // 1 lot = 35 qty
    } else if (symbol === 'FINNIFTY') {
        multiplier = 40; // 1 lot = 40 qty
    }
    
    // Use actual quantity input if available, otherwise calculate from lot size
    const actualQtyInput = document.getElementById('actualQuantity');
    const quantity = actualQtyInput ? parseInt(actualQtyInput.value) || 0 : (lotSize * multiplier);
    
    const productEl = document.getElementById('product');
    const product = productEl ? productEl.value : 'MIS';
    const orderTypeEl = document.getElementById('orderType');
    const orderType = orderTypeEl ? orderTypeEl.value : 'Market';
    const priceEl = document.getElementById('price');
    const price = priceEl ? priceEl.value : '';
    const gttSL = document.getElementById('gttSL')?.value || '';
    const gttTP = document.getElementById('gttTP')?.value || '';
    
    if (!strike || !lotSize) {
        showAlert('Please enter strike price and quantity', 'warning');
        return null;
    }
    
    if (orderType === 'Limit' && !price) {
        showAlert('Please enter price for limit orders', 'warning');
        return null;
    }

    if (orderType === 'GTT_OCO') {
        if (!gttSL && !gttTP) {
            showAlert('Enter at least one trigger: SL or Target', 'warning');
            return null;
        }
    }
    
    // Create trading symbol in FlatTrade format: SYMBOLDDMMMYYC/PSTRIKE
    // Example: NIFTY04NOV25P25800 (2-digit year, as per FlatTrade actual format)
    
    // Get the selected option text from dropdown (e.g., "04 NOV 2025 (Tue)")
    const expirySelect = document.getElementById('expiry');
    const selectedOption = expirySelect.options[expirySelect.selectedIndex];
    const expiryText = selectedOption.textContent; // e.g., "04 NOV 2025 (Tue)"
    
    // Parse from dropdown text: "DD MMM YYYY (Day)"
    const expiryMatch = expiryText.match(/(\d{2})\s+([A-Z]{3})\s+(\d{4})/);
    
    let day, month, year;
    if (expiryMatch) {
        day = expiryMatch[1]; // Already zero-padded
        month = expiryMatch[2]; // Already uppercase
        year = expiryMatch[3].slice(-2); // Last 2 digits
        console.log(`✅ Parsed from dropdown: "${expiryText}" → ${day}-${month}-${year}`);
    } else {
        // Fallback: parse from value if dropdown text parsing fails
        const expiryDate = new Date(expiry + 'T00:00:00');
        day = expiryDate.getDate().toString().padStart(2, '0');
        month = expiryDate.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
        year = expiryDate.getFullYear().toString().slice(-2);
        console.warn(`⚠️ Fallback parsing: ${day}-${month}-${year}`);
    }
    
    // Convert CE/PE to single letter C/P for FlatTrade
    const optionTypeCode = optionType.charAt(0); // 'C' or 'P'
    
    // FlatTrade format: SYMBOLDDMMMYYC/PSTRIKE (no zero-padding on strike)
    const tradingSymbol = `${symbol}${day}${month}${year}${optionTypeCode}${strike}`;
    
    console.log('📝 Creating order:', { 
        symbol, 
        strike, 
        optionType, 
        trantype, 
        tradingSymbol, 
        expiry,
        expiryFromDropdown: expiryText,
        formatted: `${symbol} ${day}-${month}-20${year} ${strike}${optionType}` 
    });
    
    return {
        symbol,
        tradingSymbol,
        strikePrice: strike,
        optionType,
        expiry,
        trantype: trantype === 'BUY' ? 'B' : 'S',
        quantity: parseInt(quantity),
        orderType,
        price: orderType === 'Market' ? null : parseFloat(price),
        product,
        validity: 'DAY',
        exchange: 'NFO',
        gtt: orderType === 'GTT_OCO' ? {
            slTrigger: gttSL ? parseFloat(gttSL) : null,
            tpTrigger: gttTP ? parseFloat(gttTP) : null
        } : null
    };
}

// Add to basket
function addToBasket(trantype) {
    const order = createOrderFromForm(trantype);
    if (!order) return;
    
    basketOrders.push({
        ...order,
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString()
    });
    
    updateBasketDisplay();
    showAlert(`Added ${trantype} order to basket: ${order.tradingSymbol}`, 'success');
}

// Place order now (direct execution, bypassing basket)
async function placeOrderNow(trantype) {
    const order = createOrderFromForm(trantype);
    if (!order) return;
    
    if (!confirm(`Place ${trantype} order: ${order.tradingSymbol} x ${order.quantity} @ ${order.price || 'Market'}?`)) {
        return;
    }
    
    try {
        console.log('📤 Placing order:', order);
        showAlert('Placing order...', 'info');
        
        const endpoint = order.orderType === 'GTT_OCO' ? '/api/place-gtt-oco' : '/api/place-single-order';
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ order })
        });
        
        const result = await response.json();
        console.log('📥 Order response:', result);
        
        if (result.success) {
            if (order.orderType === 'GTT_OCO') {
                let msg = `✅ GTT alerts placed successfully!`;
                if (result.slOrderId || result.slAlertId) msg += `\n🛡️ SL GTT Alert ID: ${result.slOrderId || result.slAlertId}`;
                if (result.tpOrderId || result.tpAlertId) msg += `\n🎯 TP GTT Alert ID: ${result.tpOrderId || result.tpAlertId}`;
                showAlert(msg, 'success');
            } else {
            showAlert(`✅ Order placed! Order ID: ${result.orderId}`, 'success');
            }
            clearForm();
            loadTodaysOrders();
            loadOrdersAndPositions(); // Refresh P&L
        } else {
            // Handle partial success for GTT orders
            if (order.orderType === 'GTT_OCO' && (result.slOrderId || result.slAlertId || result.tpOrderId || result.tpAlertId)) {
                let msg = `⚠️ GTT alerts partially placed:`;
                if (result.slOrderId || result.slAlertId) msg += `\n🛡️ SL GTT Alert ID: ${result.slOrderId || result.slAlertId}`;
                if (result.tpOrderId || result.tpAlertId) msg += `\n🎯 TP GTT Alert ID: ${result.tpOrderId || result.tpAlertId}`;
                if (result.error) msg += `\n⚠️ Errors: ${result.error}`;
                showAlert(msg, 'warning');
        } else {
            console.error('❌ Order failed:', result.error, result.details);
                showAlert(`❌ Order failed: ${result.error || result.message || 'Unknown error'}`, 'danger');
            }
            if (result.slOrderId || result.slAlertId || result.tpOrderId || result.tpAlertId) {
                // If any GTT alert succeeded, refresh anyway
                loadTodaysOrders();
                loadOrdersAndPositions();
            }
        }
    } catch (error) {
        console.error('❌ Error placing order:', error);
        showAlert('❌ Error placing order: ' + error.message, 'danger');
    }
}

// Update basket display
function updateBasketDisplay() {
    const container = document.getElementById('basketContainer');
    const placeAllBtn = document.getElementById('placeAllBtn');
    const basketCountHeader = document.getElementById('basketCountHeader');
    
    if (basketCountHeader) {
        basketCountHeader.textContent = basketOrders.length;
    }
    
    if (basketOrders.length === 0) {
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-shopping-basket"></i>
                    <div style="font-size:16px; margin-bottom:8px;">No orders in basket</div>
                    <small>Orders will appear here when added</small>
                </div>
            `;
        }
        if (placeAllBtn) placeAllBtn.disabled = true;
        return;
    }
    
    if (placeAllBtn) placeAllBtn.disabled = false;
    
    if (container) {
        container.innerHTML = basketOrders.map(order => `
            <div class="basket-item">
                <div style="flex:1;">
                    <div class="symbol">${order.tradingSymbol || order.symbol || 'N/A'}</div>
                    <div class="details">
                        ${order.trantype || order.action || 'BUY'} • ${order.quantity || 0} qty • ${order.orderType === 'LIMIT' ? '₹' + (order.price || 0) : 'Market'} • ${order.product || 'MIS'}
                    </div>
                </div>
                <button class="remove-btn" onclick="removeFromBasket(${order.id})" title="Remove">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    }
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

// Place all orders from basket
async function placeAllOrders() {
    if (basketOrders.length === 0) return;
    
    if (!confirm(`Place all ${basketOrders.length} orders?`)) return;
    
    showAlert(`Placing ${basketOrders.length} orders...`, 'info');
    
    let success = 0, failed = 0;
    const failedOrders = [];
    
    for (const order of basketOrders) {
        try {
            console.log('📤 Placing basket order:', order);
            
            const endpoint = order.orderType === 'GTT_OCO' ? '/api/place-gtt-oco' : '/api/place-single-order';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ order })
            });
            
            const result = await response.json();
            console.log('📥 Basket order response:', result);
            
            if (result.success) {
                success++;
                const alertId = result.slOrderId || result.slAlertId || result.tpOrderId || result.tpAlertId || result.orderId;
                console.log(`✅ GTT alerts placed for order ${success}`);
                if (order.orderType === 'GTT_OCO') {
                    console.log(`   SL GTT Alert ID: ${result.slOrderId || result.slAlertId || 'N/A'}, TP GTT Alert ID: ${result.tpOrderId || result.tpAlertId || 'N/A'}`);
                }
            } else {
                failed++;
                // For GTT orders, check if any alerts succeeded even if some failed
                if (result.slOrderId || result.slAlertId || result.tpOrderId || result.tpAlertId) {
                    console.warn(`⚠️ Partial success: Some GTT alerts placed`);
                    success++; // Count as partial success
                    failed--; // Don't count as completely failed
                }
                const errorMsg = result.error || result.message || 'Unknown error';
                failedOrders.push({ symbol: order.tradingSymbol, error: errorMsg });
                console.error(`❌ Order ${failed} failed:`, errorMsg);
                if (result.details) {
                    console.error('   Details:', result.details);
                }
            }
            
            // Small delay between orders to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 300));
            
        } catch (error) {
            failed++;
            failedOrders.push({ symbol: order.tradingSymbol, error: error.message });
            console.error('❌ Order error:', error);
        }
    }
    
    basketOrders = [];
    updateBasketDisplay();
    
    // Show results
    if (success > 0 && failed === 0) {
        showAlert(`✅ All ${success} orders placed successfully!`, 'success');
    } else if (success > 0 && failed > 0) {
        showAlert(`⚠️ ${success} orders placed, ${failed} failed`, 'warning');
        console.error('Failed orders:', failedOrders);
    } else if (failed > 0) {
        showAlert(`❌ All ${failed} orders failed`, 'danger');
        console.error('Failed orders:', failedOrders);
    }
    
    if (success > 0) {
        loadTodaysOrders();
        loadOrdersAndPositions(); // Refresh P&L
    }
}

// Store all orders for filtering
let allTodayOrders = [];

// Load today's orders
async function loadTodaysOrders() {
    try {
        // Don't try to load orders if not authenticated
        if (!isAuthenticated) {
            console.log('⏭️ Skipping orders load - user not authenticated');
            const container = document.getElementById('todaysOrders');
            if (container) {
                container.innerHTML = `
                    <div class="empty-state" style="padding:40px 20px;">
                        <i class="fas fa-clipboard-list"></i>
                        <div style="font-size:14px; color:#64748b;">No orders today</div>
                    </div>
                `;
            }
            return;
        }
        
        console.log('📋 Loading today\'s orders...');
        const response = await fetch('/api/orders', { credentials: 'include' });
        
        if (!response.ok) {
            if (response.status === 401) {
                // Unauthorized - user is not logged in
                console.log('🔒 Unauthorized - user not logged in');
                isAuthenticated = false;
                return;
            }
            console.error('❌ Orders API error:', response.status, response.statusText);
            return;
        }
        
        const result = await response.json();
        console.log('📦 Today\'s orders response:', result);
        
        const container = document.getElementById('todaysOrders');
        if (!container) {
            console.error('❌ todaysOrders element not found');
            return;
        }
        
        const orders = result.data || result.values || [];
        allTodayOrders = orders; // Store for filtering
        
        if (Array.isArray(orders) && orders.length > 0) {
            console.log(`✅ Loaded ${orders.length} orders`);
            renderTodayOrders(orders);
        } else {
            console.log('📋 No orders found');
            allTodayOrders = [];
            container.innerHTML = `
                <div class="empty-state" style="padding:40px 20px;">
                    <i class="fas fa-clipboard-list"></i>
                    <div style="font-size:14px; color:#64748b;">No orders today</div>
                </div>
            `;
        }
    } catch (error) {
        console.error('❌ Error loading today\'s orders:', error);
        const container = document.getElementById('todaysOrders');
        if (container) {
            container.innerHTML = `
                <div class="text-center text-danger py-3">
                    <small>Error loading orders</small>
                </div>
            `;
        }
    }
}

// Render orders with filtering
function renderTodayOrders(orders) {
    const container = document.getElementById('todaysOrders');
    if (!container) return;
    
    if (orders.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding:40px 20px;">
                <i class="fas fa-clipboard-list"></i>
                <div style="font-size:14px; color:#64748b;">No orders match your filters</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = orders.map(order => {
        const symbol = order.tsym || order.tradingsymbol || 'N/A';
        const trantype = order.trantype === 'B' || order.transactiontype === 'BUY' ? 'BUY' : 'SELL';
        const qty = order.qty || order.quantity || 0;
        const price = parseFloat(order.prc || order.price || 0);
        const status = order.status || order.orderstatus || order.stat || 'UNKNOWN';
        const time = order.exch_tm || order.time || order.exchordtime || 'N/A';
        const orderId = order.norenordno || order.orderid || 'N/A';
        
        const statusColor = status === 'COMPLETE' || status === 'Ok' ? '#10b981' : 
                          status === 'REJECTED' ? '#ef4444' : 
                          status === 'CANCELED' || status === 'CANCEL' ? '#f59e0b' : 
                          status === 'OPEN' || status === 'PENDING' ? '#3b82f6' : '#64748b';
        
        return `
            <div class="basket-item" style="margin-bottom:8px;" data-order-id="${orderId}" data-symbol="${symbol}" data-status="${status}" data-type="${trantype}">
                <div style="flex:1;">
                    <div class="symbol">${symbol}</div>
                    <div class="details">
                        ${trantype} • ${qty} qty • ${price > 0 ? '₹' + price.toFixed(2) : 'Market'} • ${time}
                    </div>
                    <div style="font-size:10px; color:#64748b; margin-top:4px;">Order ID: ${orderId}</div>
                </div>
                <div style="color:${statusColor}; font-weight:600; font-size:12px; text-align:right;">
                    <div>${status}</div>
                    ${status === 'OPEN' || status === 'PENDING' ? `
                        <button class="btn btn-xs" onclick="cancelOrder('${orderId}')" style="margin-top:4px; padding:4px 8px; background:#ef4444; color:white; border:none; font-size:10px; border-radius:4px;">
                            Cancel
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Store current filter values
let currentStatusFilter = 'all';
let currentTypeFilter = 'all';

// Set filter value
function setFilter(filterType, value) {
    if (filterType === 'status') {
        currentStatusFilter = value;
        // Update button states
        document.querySelectorAll('[data-filter="status"]').forEach(btn => {
            btn.classList.remove('active');
            btn.style.background = '#1e293b';
            btn.style.color = btn.dataset.value === 'COMPLETE' ? '#10b981' : 
                              btn.dataset.value === 'OPEN' ? '#3b82f6' :
                              btn.dataset.value === 'PENDING' ? '#f59e0b' :
                              btn.dataset.value === 'REJECTED' ? '#ef4444' :
                              btn.dataset.value === 'CANCELED' ? '#f59e0b' : '#e2e8f0';
            btn.style.border = '1px solid #334155';
        });
        const activeBtn = document.querySelector(`[data-filter="status"][data-value="${value}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.style.background = '#3b82f6';
            activeBtn.style.color = 'white';
            activeBtn.style.borderColor = '#3b82f6';
        }
    } else if (filterType === 'type') {
        currentTypeFilter = value;
        // Update button states
        document.querySelectorAll('[data-filter="type"]').forEach(btn => {
            btn.classList.remove('active');
            btn.style.background = '#1e293b';
            btn.style.color = btn.dataset.value === 'BUY' ? '#10b981' : 
                              btn.dataset.value === 'SELL' ? '#ef4444' : '#e2e8f0';
            btn.style.border = '1px solid #334155';
        });
        const activeBtn = document.querySelector(`[data-filter="type"][data-value="${value}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.style.background = '#3b82f6';
            activeBtn.style.color = 'white';
            activeBtn.style.borderColor = '#3b82f6';
        }
    }
    
    // Apply filters
    filterTodayOrders();
}

// Filter today's orders
function filterTodayOrders() {
    const searchInput = document.getElementById('orderSearchInput');
    const searchTerm = (searchInput?.value || '').toLowerCase().trim();
    
    let filteredOrders = [...allTodayOrders];
    
    // Apply search filter
    if (searchTerm) {
        filteredOrders = filteredOrders.filter(order => {
            const symbol = (order.tsym || order.tradingsymbol || '').toLowerCase();
            const orderId = (order.norenordno || order.orderid || '').toString();
            return symbol.includes(searchTerm) || orderId.includes(searchTerm);
        });
    }
    
    // Apply status filter
    if (currentStatusFilter !== 'all') {
        filteredOrders = filteredOrders.filter(order => {
            const status = (order.status || order.orderstatus || order.stat || '').toUpperCase();
            return status === currentStatusFilter.toUpperCase() || 
                   (currentStatusFilter === 'COMPLETE' && status === 'OK');
        });
    }
    
    // Apply type filter
    if (currentTypeFilter !== 'all') {
        filteredOrders = filteredOrders.filter(order => {
            const trantype = order.trantype === 'B' || order.transactiontype === 'BUY' ? 'BUY' : 'SELL';
            return trantype === currentTypeFilter;
        });
    }
    
    // Render filtered orders
    renderTodayOrders(filteredOrders);
}

// Clear all filters
function clearOrderFilters() {
    const searchInput = document.getElementById('orderSearchInput');
    
    if (searchInput) searchInput.value = '';
    
    // Reset filter values
    currentStatusFilter = 'all';
    currentTypeFilter = 'all';
    
    // Reset button states
    document.querySelectorAll('[data-filter="status"]').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = '#1e293b';
        btn.style.color = btn.dataset.value === 'COMPLETE' ? '#10b981' : 
                          btn.dataset.value === 'OPEN' ? '#3b82f6' :
                          btn.dataset.value === 'PENDING' ? '#f59e0b' :
                          btn.dataset.value === 'REJECTED' ? '#ef4444' :
                          btn.dataset.value === 'CANCELED' ? '#f59e0b' : '#e2e8f0';
        btn.style.border = '1px solid #334155';
    });
    
    document.querySelectorAll('[data-filter="type"]').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = '#1e293b';
        btn.style.color = btn.dataset.value === 'BUY' ? '#10b981' : 
                          btn.dataset.value === 'SELL' ? '#ef4444' : '#e2e8f0';
        btn.style.border = '1px solid #334155';
    });
    
    // Set "All" buttons as active
    const statusAllBtn = document.querySelector('[data-filter="status"][data-value="all"]');
    const typeAllBtn = document.querySelector('[data-filter="type"][data-value="all"]');
    if (statusAllBtn) {
        statusAllBtn.classList.add('active');
        statusAllBtn.style.background = '#3b82f6';
        statusAllBtn.style.color = 'white';
        statusAllBtn.style.borderColor = '#3b82f6';
    }
    if (typeAllBtn) {
        typeAllBtn.classList.add('active');
        typeAllBtn.style.background = '#3b82f6';
        typeAllBtn.style.color = 'white';
        typeAllBtn.style.borderColor = '#3b82f6';
    }
    
    // Render all orders
    renderTodayOrders(allTodayOrders);
}

// Cancel order
async function cancelOrder(orderId) {
    if (!confirm(`Are you sure you want to cancel order ${orderId}?`)) {
        return;
    }
    
    try {
        const response = await fetch('/api/cancel-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ orderId })
        });
        
        const result = await response.json();
        
        if (result.stat === 'Ok' || result.success) {
            showAlert(`Order ${orderId} cancelled successfully`, 'success');
            // Reload orders
            await loadTodaysOrders();
        } else {
            showAlert(`Failed to cancel order: ${result.emsg || result.message || 'Unknown error'}`, 'danger');
        }
    } catch (error) {
        console.error('Error cancelling order:', error);
        showAlert('Error cancelling order: ' + error.message, 'danger');
    }
}

// Refresh orders manually
function refreshOrders() {
    loadTodaysOrders();
}

// Load and display orders in the main Orders table
async function loadOrdersTable() {
    try {
        console.log('📋 Loading orders table...');
        const response = await fetch('/api/orders', { credentials: 'include' });
        
        if (!response.ok) {
            console.error('❌ Orders API error:', response.status, response.statusText);
            const tbody = document.getElementById('ordersTableBody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4" style="color:#ef4444;">Error loading orders</td></tr>';
            }
            return;
        }
        
        const result = await response.json();
        console.log('📦 Orders table response:', result);
        
        const tbody = document.getElementById('ordersTableBody');
        if (!tbody) {
            console.error('❌ ordersTableBody element not found');
            return;
        }
        
        const orders = result.data || result.values || [];
        
        if (Array.isArray(orders) && orders.length > 0) {
            console.log(`✅ Displaying ${orders.length} orders in table`);
            tbody.innerHTML = orders.map(order => {
                // FlatTrade OrderBook fields
                const symbol = order.tsym || order.tradingsymbol || 'N/A';
                const trantype = order.trantype === 'B' || order.transactiontype === 'BUY' ? 'BUY' : 'SELL';
                const qty = order.qty || order.quantity || 0;
                const price = parseFloat(order.prc || order.price || 0); // Ensure price is a number
                const status = order.status || order.orderstatus || order.stat || 'UNKNOWN';
                const time = order.exch_tm || order.time || order.exchordtime || 'N/A';
                const orderId = order.norenordno || order.orderid || 'N/A';
                
                // Format status
                let statusClass = 'text-muted';
                if (status === 'COMPLETE' || status === 'Ok') {
                    statusClass = 'text-success';
                } else if (status === 'OPEN' || status === 'PENDING') {
                    statusClass = 'text-warning';
                } else if (status === 'REJECTED' || status === 'REJECT') {
                    statusClass = 'text-danger';
                } else if (status === 'CANCELED' || status === 'CANCEL') {
                    statusClass = 'text-muted';
                }
                
                return `
                    <tr>
                        <td>${time}</td>
                        <td><strong>${symbol}</strong></td>
                        <td><span class="badge ${trantype === 'BUY' ? 'bg-success' : 'bg-danger'}">${trantype}</span></td>
                        <td>${qty}</td>
                        <td>₹${price > 0 ? price.toFixed(2) : 'Market'}</td>
                        <td><span class="${statusClass}">${status}</span></td>
                        <td>
                            ${status === 'OPEN' || status === 'PENDING' ? `
                                <button class="btn btn-sm btn-outline-danger" onclick="cancelOrder('${orderId}')" title="Cancel Order">
                                    <i class="fas fa-times"></i>
                                </button>
                            ` : ''}
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            console.log('📋 No orders found for table');
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4" style="color:#64748b;">No orders</td></tr>';
        }
    } catch (error) {
        console.error('❌ Error loading orders table:', error);
        const tbody = document.getElementById('ordersTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4" style="color:#ef4444;">Error loading orders</td></tr>';
        }
    }
}

// Cancel order function
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
            credentials: 'include',
            body: JSON.stringify({ orderId })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('Order cancelled successfully');
            loadOrdersTable(); // Refresh table
            loadTodaysOrders(); // Refresh today's orders
        } else {
            alert('Failed to cancel order: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error cancelling order:', error);
        alert('Error cancelling order: ' + error.message);
    }
}

// Clear form
function clearForm() {
    document.getElementById('strikePrice').value = '';
    const symbol = document.getElementById('symbol').value;
    let defaultQty = 75;
    let multiplier = 75;
    if (symbol === 'NIFTY') {
        multiplier = 75;
    } else if (symbol === 'BANKNIFTY') {
        multiplier = 35;
    } else if (symbol === 'FINNIFTY') {
        multiplier = 40;
    }
    defaultQty = multiplier;
    
    document.getElementById('quantity').value = '1';
    const actualQtyInput = document.getElementById('actualQuantity');
    if (actualQtyInput) {
        actualQtyInput.value = defaultQty.toString();
    }
    document.getElementById('price').value = '';
    document.getElementById('orderType').value = 'MARKET';
    togglePriceField();
}

// Get next Thursday from given date
function getNextThursday(date) {
    const result = new Date(date);
    const day = result.getDay();
    const daysUntilThursday = (4 - day + 7) % 7;
    if (daysUntilThursday === 0) {
        // If today is Thursday, get next Thursday
        result.setDate(result.getDate() + 7);
    } else {
        result.setDate(result.getDate() + daysUntilThursday);
    }
    return result;
}

// Populate expiry dates - fetch from FlatTrade API
async function populateExpiryDates(symbol = 'NIFTY') {
    const expirySelect = document.getElementById('expiry');
    if (!expirySelect) return;
    
    try {
        console.log(`📅 Fetching expiry dates for ${symbol}...`);
        
        const response = await fetch(`/api/expiry-dates?symbol=${symbol}`, {
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (result.status === 'success' && result.expiries && result.expiries.length > 0) {
            expirySelect.innerHTML = '';
            
            result.expiries.forEach(expiry => {
                const option = document.createElement('option');
                option.value = expiry.date; // YYYY-MM-DD format
                option.textContent = expiry.display; // DD MMM YYYY format
                expirySelect.appendChild(option);
            });
            
            console.log(`✅ Loaded ${result.expiries.length} expiry dates from ${result.source || 'API'}`);
            console.log(`📋 Expiries:`, result.expiries.map(e => e.display).join(', '));
        } else {
            // Fallback to calculated Thursdays if API fails
            console.warn('⚠️ No expiry data from API, using fallback calculation');
            populateExpiryDatesFallback();
        }
    } catch (error) {
        console.error('❌ Error fetching expiry dates:', error);
        // Fallback to calculated Thursdays
        populateExpiryDatesFallback();
    }
}

// Fallback: Populate expiry dates with next 8 Thursdays (if API fails)
function populateExpiryDatesFallback() {
    const expirySelect = document.getElementById('expiry');
    if (!expirySelect) return;
    
    const today = new Date();
    expirySelect.innerHTML = '';
    
    // Find first Thursday
    let currentDate = new Date(today);
    const dayOfWeek = currentDate.getDay();
    
    // Calculate days until next Thursday (0=Sun, 4=Thu)
    let daysUntilThursday = (4 - dayOfWeek + 7) % 7;
    if (daysUntilThursday === 0 && currentDate.getHours() >= 15) {
        // If it's Thursday after 3:30 PM, skip to next week
        daysUntilThursday = 7;
    }
    
    currentDate.setDate(currentDate.getDate() + daysUntilThursday);
    
    // Generate next 8 Thursdays
    for (let i = 0; i < 8; i++) {
        // Verify it's actually Thursday
        if (currentDate.getDay() !== 4) {
            console.error('❌ Not a Thursday!', currentDate);
            continue;
        }
        
        // Format as YYYY-MM-DD for value (machine-readable)
        const valueFormat = currentDate.toISOString().split('T')[0];
        
        // Format as "DD MMM YYYY" for display (human-readable)
        const day = currentDate.getDate().toString().padStart(2, '0');
        const month = currentDate.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
        const year = currentDate.getFullYear();
        const displayFormat = `${day} ${month} ${year} (Thu)`;
        
        const option = document.createElement('option');
        option.value = valueFormat;
        option.textContent = displayFormat;
        expirySelect.appendChild(option);
        
        // Move to next Thursday (add 7 days)
        currentDate = new Date(currentDate);
        currentDate.setDate(currentDate.getDate() + 7);
    }
    
    console.log('✅ Expiry dates populated (fallback - 8 Thursdays)');
}

// Toggle Margin Details Dropdown
function toggleMarginDetails() {
    const dropdown = document.getElementById('marginDetailsDropdown');
    const chevron = document.getElementById('marginChevron');
    
    if (dropdown && chevron) {
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';
        chevron.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
    }
}

// Toggle Profile Dropdown
function toggleProfileDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    const chevron = document.getElementById('profileChevron');
    
    if (dropdown && chevron) {
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';
        chevron.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
        
        // Close margin dropdown if open
        const marginDropdown = document.getElementById('marginDetailsDropdown');
        const marginChevron = document.getElementById('marginChevron');
        if (marginDropdown && marginChevron) {
            marginDropdown.style.display = 'none';
            marginChevron.style.transform = 'rotate(0deg)';
        }
    }
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(event) {
    // Close margin dropdown
    const marginBalanceDisplay = document.getElementById('marginBalanceDisplay');
    const marginDetailsDropdown = document.getElementById('marginDetailsDropdown');
    
    if (marginBalanceDisplay && marginDetailsDropdown) {
        if (!marginBalanceDisplay.contains(event.target) && !marginDetailsDropdown.contains(event.target)) {
            marginDetailsDropdown.style.display = 'none';
            const chevron = document.getElementById('marginChevron');
            if (chevron) {
                chevron.style.transform = 'rotate(0deg)';
            }
        }
    }
    
    // Close profile dropdown
    const userStatusBtn = document.getElementById('userStatusBtn');
    const profileDropdown = document.getElementById('profileDropdown');
    
    if (userStatusBtn && profileDropdown) {
        if (!userStatusBtn.contains(event.target) && !profileDropdown.contains(event.target)) {
            profileDropdown.style.display = 'none';
            const chevron = document.getElementById('profileChevron');
            if (chevron) {
                chevron.style.transform = 'rotate(0deg)';
            }
        }
    }
});

// Theme Toggle Function
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Update icon
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        if (newTheme === 'light') {
            themeIcon.className = 'fas fa-sun';
        } else {
            themeIcon.className = 'fas fa-moon';
        }
    }
    
    console.log(`✅ Theme switched to ${newTheme} mode`);
}

// Initialize Theme
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const html = document.documentElement;
    html.setAttribute('data-theme', savedTheme);
    
    // Update icon based on saved theme
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        if (savedTheme === 'light') {
            themeIcon.className = 'fas fa-sun';
        } else {
            themeIcon.className = 'fas fa-moon';
        }
    }
    
    console.log(`✅ Theme initialized to ${savedTheme} mode`);
}

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 FiFTO TRADER UI loaded - checking authentication...');
    
    // Initialize theme first
    initTheme();
    
    // Initialize profile button click handler
    const userStatusBtn = document.getElementById('userStatusBtn');
    if (userStatusBtn) {
        // Remove any existing listeners to avoid duplicates
        const newBtn = userStatusBtn.cloneNode(true);
        userStatusBtn.parentNode.replaceChild(newBtn, userStatusBtn);
        
        // Add fresh event listener
        const profileBtn = document.getElementById('userStatusBtn');
        if (profileBtn) {
            profileBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                // Check authentication status before deciding action
                const userStatusText = document.getElementById('userStatus');
                const isLoggedIn = userStatusText && userStatusText.textContent !== 'Not Logged In';
                
                if (!isLoggedIn || !isAuthenticated) {
                    console.log('🔄 User not authenticated, triggering login...');
                    quickLogin();
                } else {
                    console.log('👤 User authenticated, showing profile dropdown...');
                    toggleProfileDropdown();
                }
            });
        }
    }
    
    // Check auth first, then populate expiry dates
    checkAuthStatus().then(() => {
        // Initialize basket display
        updateBasketDisplay();
        
        // Load today's orders only after auth check completes
        // (loadTodaysOrders already checks isAuthenticated internally)
        loadTodaysOrders();
    });
    
    // Auto-refresh auth status every 30 seconds
    setInterval(checkAuthStatus, 30000);
    
    // Auto-refresh orders every 30 seconds
    setInterval(() => {
        if (isAuthenticated) {
            loadTodaysOrders();
        }
    }, 30000);
    
    console.log('✅ Order Basket UI initialized');
});

// Navigation handler - show/hide sections based on hash
function handleNavigation() {
    const hash = window.location.hash || '#markets';
    const hashName = hash.substring(1); // Remove #
    
    console.log('🧭 Navigation:', hashName);
    
    // Fix structure: ensure all page sections are siblings of main-content
    const mainContent = document.querySelector('.main-content');
    const pageOptionChain = document.getElementById('page-optionchain');
    const pageOrders = document.getElementById('page-orders');
    const pagePrice = document.getElementById('page-price');
    
    if (mainContent && pageOptionChain) {
        // If page-optionchain is nested in page-orders or page-price, move it out
        if ((pageOrders && pageOrders.contains(pageOptionChain)) || 
            (pagePrice && pagePrice.contains(pageOptionChain))) {
            const pagePositions = document.getElementById('page-positions');
            if (pagePositions && pagePositions.parentElement === mainContent) {
                mainContent.insertBefore(pageOptionChain, pagePositions);
                console.log('🔧 Fixed: Moved page-optionchain to be a sibling');
            } else {
                mainContent.appendChild(pageOptionChain);
            }
        }
    }
    
    // Hide all sections
    document.querySelectorAll('.page-section').forEach(section => {
        section.classList.remove('active');
        section.style.display = 'none';
        section.style.opacity = '0';
        section.style.visibility = 'hidden';
    });
    
    // Show active section
    let activeSection = document.getElementById(`page-${hashName}`);
    
    // Map navigation items to page sections
    const navMap = {
        'markets': 'page-price',
        'watchlist': 'page-price',
        'portfolio': 'page-price',
        'orders': 'page-orders',
        'positions': 'page-positions',
        'optionchain': 'page-optionchain'
    };
    
    if (navMap[hashName]) {
        activeSection = document.getElementById(navMap[hashName]);
        console.log('📍 Found section via navMap:', navMap[hashName], activeSection ? '✅' : '❌');
    }
    
    if (activeSection) {
        activeSection.classList.add('active');
        activeSection.style.display = 'block';
        activeSection.style.opacity = '1';
        activeSection.style.visibility = 'visible';
        console.log('✅ Activated section:', activeSection.id);
    } else {
        console.error('❌ Section not found for:', hashName);
        // Default to markets page if hash doesn't match
        const priceSection = document.getElementById('page-price');
        if (priceSection) {
            priceSection.classList.add('active');
            priceSection.style.display = 'block';
            priceSection.style.opacity = '1';
            priceSection.style.visibility = 'visible';
            window.location.hash = '#markets';
        }
    }
    
    // Update top navigation active state
    document.querySelectorAll('.top-nav a').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === hash) {
            link.classList.add('active');
        }
    });
    
    // Load specific page data
    if (hashName === 'positions') {
        loadPositionsPage();
    } else if (hashName === 'orders') {
        loadOrdersTable();
    } else if (hashName === 'optionchain') {
        console.log('📊 Loading option chain...');
        loadOptionChain();
    }
}

// Toggle Total P&L details dropdown
function toggleTotalPnLDetails() {
    // TODO: Implement dropdown with detailed P&L breakdown
    console.log('Toggle Total P&L details');
}

// Handle hash changes
window.addEventListener('hashchange', function() {
    handleNavigation();
});

// Parse symbol to extract instrument details
function parseSymbol(symbol) {
    // Flattrade symbols come in formats like:
    // "NATURALGAS20NOV25C350" or "NIFTY04NOV25C25850" or "NIFTY11NOV25C25900"
    // Format: [INSTRUMENT][DD][MMM][YY][C/P][STRIKE]
    
    if (!symbol || symbol === 'N/A') {
        return {
            instrument: symbol,
            exchange: '',
            expiry: '',
            strike: '',
            type: ''
        };
    }
    
    const monthMap = {
        'JAN': 'Jan', 'FEB': 'Feb', 'MAR': 'Mar', 'APR': 'Apr',
        'MAY': 'May', 'JUN': 'Jun', 'JUL': 'Jul', 'AUG': 'Aug',
        'SEP': 'Sep', 'OCT': 'Oct', 'NOV': 'Nov', 'DEC': 'Dec'
    };
    
    // Try to parse NIFTY/BANKNIFTY format: NIFTY04NOV25C25850
    const niftyMatch = symbol.match(/^(NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY)(\d{2})([A-Z]{3})(\d{2})([CP])(\d+)$/);
    if (niftyMatch) {
        const [, instrument, day, month, year, type, strike] = niftyMatch;
        const fullYear = '20' + year;
        const expiry = `${day} ${monthMap[month] || month} ${fullYear}`;
        return {
            instrument,
            exchange: 'NFO',
            expiry,
            strike,
            type: type === 'C' ? 'CE' : 'PE'
        };
    }
    
    // Try to parse commodity format: NATURALGAS20NOV25C340
    // Use a more specific pattern that doesn't match NIFTY variants
    const commodityMatch = symbol.match(/^([A-Z]+)(\d{2})([A-Z]{3})(\d{2})([CP])(\d+)$/);
    if (commodityMatch) {
        const [, instrument, day, month, year, type, strike] = commodityMatch;
        // Skip if it matches NIFTY pattern (should have been caught above)
        if (!instrument.includes('NIFTY') && !instrument.includes('BANK') && !instrument.includes('FIN')) {
            const fullYear = '20' + year;
            const expiry = `${day} ${monthMap[month] || month} ${fullYear}`;
            return {
                instrument,
                exchange: 'MCX',
                expiry,
                strike,
                type: type === 'C' ? 'CE' : 'PE'
            };
        }
    }
    
    // If format doesn't match, try space-separated format
    const parts = symbol.split(' ');
    if (parts.length >= 5) {
        const instrument = parts[0];
        const exchange = parts[1];
        let expiry = '';
        let strike = '';
        let type = '';
        
        if (parts.length >= 5) {
            if (!isNaN(parseInt(parts[2]))) {
                expiry = `${parts[2]} ${parts[3]} ${parts[4]}`;
                strike = parts[5] || '';
                type = parts[6] || '';
            } else {
                expiry = parts.slice(2, 5).join(' ');
                strike = parts[5] || '';
                type = parts[6] || '';
            }
        }
        
        return { instrument, exchange, expiry, strike, type };
    }
    
    // Default: return as-is
    return {
        instrument: symbol,
        exchange: '',
        expiry: '',
        strike: '',
        type: ''
    };
}

// Get lot size for instrument
function getLotSize(instrument, exchange) {
    const lotSizes = {
        'NIFTY': 75,
        'BANKNIFTY': 35,
        'FINNIFTY': 50,
        'MIDCPNIFTY': 75,
        'NATURALGAS': 1250
    };
    
    // Check if it's a known index
    for (const [key, value] of Object.entries(lotSizes)) {
        if (instrument.includes(key)) {
            return value;
        }
    }
    
    // Default lot size
    return exchange === 'MCX' ? 1250 : 75;
}

// Load positions page with new format matching the image
async function loadPositionsPage() {
    try {
        console.log('📊 Loading positions page...');
        
        // Load positions
        const positionsResponse = await fetch('/api/positions', { credentials: 'include' });
        
        if (!positionsResponse.ok) {
            console.error('❌ Positions API error:', positionsResponse.status);
            document.getElementById('positionsTableBody').innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4" style="color:#ef4444;">
                        Error loading positions
                    </td>
                </tr>
            `;
            return;
        }
        
        const positionsResult = await positionsResponse.json();
        
        // Handle API error responses (stat: "Not_Ok")
        if (positionsResult.stat === 'Not_Ok' || positionsResult.stat === 'not_ok') {
            const errorMsg = positionsResult.emsg || positionsResult.message || 'No positions found';
            console.log(`⚠️ API returned Not_Ok: ${errorMsg}`);
            
            document.getElementById('positionsTableBody').innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4" style="color:#64748b;">
                        ${errorMsg === 'no data' ? 'No positions found' : errorMsg}
                    </td>
                </tr>
            `;
            
            // Reset displays
            const totalPnLEl = document.getElementById('positionsTotalPnL');
            const positionsCountEl = document.getElementById('positionsCount');
            
            if (totalPnLEl) totalPnLEl.textContent = '₹0.00';
            if (positionsCountEl) positionsCountEl.textContent = '0';
            
            return;
        }
        
        const positions = positionsResult.data || positionsResult || [];
        
        // Handle different response formats
        let positionsArray = [];
        if (Array.isArray(positions)) {
            positionsArray = positions;
        } else if (positionsResult.values && Array.isArray(positionsResult.values)) {
            positionsArray = positionsResult.values;
        }
        
        // Calculate total P&L
        let totalPnL = 0;
        positionsArray.forEach(position => {
            const realizedPnL = parseFloat(position.rpnl || position.RPNL || 0);
            const unrealizedPnL = parseFloat(position.urmtom || position.URMTOM || position.upnl || position.UPNL || 0);
            totalPnL += (realizedPnL + unrealizedPnL);
        });
        
        // Filter open positions (netqty != 0)
        const openPositions = positionsArray.filter(pos => {
            const netQtyStr = String(pos.netqty || pos.NETQTY || '0').trim();
            const netQtyNum = parseFloat(netQtyStr);
            return netQtyStr !== '0' && netQtyNum !== 0;
        });
        
        // Update header count
        const positionsCountEl = document.getElementById('positionsCount');
        if (positionsCountEl) {
            positionsCountEl.textContent = openPositions.length;
        }
        
        // Update footer total P&L
        const totalPnLEl = document.getElementById('positionsTotalPnL');
        if (totalPnLEl) {
            const formattedPnL = totalPnL.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            totalPnLEl.textContent = `₹${formattedPnL}`;
            totalPnLEl.style.color = totalPnL >= 0 ? '#10b981' : '#ef4444';
        }
        
        // Display positions in table
        const positionsTableBody = document.getElementById('positionsTableBody');
        if (positionsTableBody) {
            if (positionsArray.length === 0) {
                positionsTableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center py-4" style="color:#64748b;">
                            No positions found
                        </td>
                    </tr>
                `;
            } else {
                positionsTableBody.innerHTML = positionsArray.map(position => {
                    const symbol = (position.tsym || position.TSYM || position.symbol || 'N/A').trim();
                    // Remove exchange from symbol if present (e.g., "NATURALGAS20NOV25C350 MCX" -> "NATURALGAS20NOV25C350")
                    const symbolOnly = symbol.split(' ')[0];
                    const parsed = parseSymbol(symbolOnly);
                    const exch = position.exch || position.EXCH || parsed.exchange || 'NFO';
                    const netQty = parseFloat(position.netqty || position.NETQTY || 0);
                    const buyQty = parseFloat(position.daybuyqty || position.DAYBUYQTY || position.daybuy || 0);
                    const sellQty = parseFloat(position.daysellqty || position.DAYSELLQTY || position.daysell || 0);
                    const buyPrice = parseFloat(position.buyavgprc || position.BUYAVGPRC || position.daybuyavgprc || 0);
                    const sellPrice = parseFloat(position.sellavgprc || position.SELLAVGPRC || position.daysellavgprc || 0);
                    const avgPrice = parseFloat(position.netavgprc || position.NETAVGPRC || position.avgprc || position.AVGPRC || 0);
                    const ltp = parseFloat(position.lp || position.LP || position.ltp || position.LTP || 0);
                    const previousClose = parseFloat(position.previousclose || position.PREVIOUSCLOSE || position.pc || 0);
                    const realizedPnL = parseFloat(position.rpnl || position.RPNL || 0);
                    const unrealizedPnL = parseFloat(position.urmtom || position.URMTOM || position.upnl || position.UPNL || 0);
                    const positionPnL = realizedPnL + unrealizedPnL;
                    
                    // Calculate lot size
                    const lotSize = getLotSize(parsed.instrument, exch);
                    
                    // Calculate quantity in lots
                    const qtyInLots = Math.abs(netQty) / lotSize;
                    const qtyDisplay = qtyInLots > 0 ? `${netQty > 0 ? '+' : '-'}${qtyInLots} Lot` : '0 Lot';
                    
                    // Determine action/status
                    let actionDisplay = '';
                    const isClosed = netQty === 0;
                    
                    if (isClosed) {
                        actionDisplay = '<span class="badge badge-red">CLOSED CF</span>';
                    } else if (netQty > 0) {
                        actionDisplay = '<span class="badge badge-blue">B CF</span>';
                    } else if (netQty < 0) {
                        actionDisplay = '<span class="badge badge-orange">S CF</span>';
                    } else if (buyQty > 0 && sellQty > 0) {
                        actionDisplay = `
                            <button class="btn btn-xs btn-success me-1" onclick="quickBuy('${symbol}')">B Buy</button>
                            <button class="btn btn-xs btn-danger" onclick="quickSell('${symbol}')">S Sell</button>
                        `;
                    }
                    
                    // ATP display (Buy/Sell prices)
                    let atpDisplay = '';
                    if (isClosed && buyPrice > 0 && sellPrice > 0) {
                        atpDisplay = `<div style="font-size:11px;line-height:1.3;">B ${buyPrice.toFixed(2)}</div><div style="font-size:11px;line-height:1.3;">S ${sellPrice.toFixed(2)}</div>`;
                    } else if (avgPrice > 0) {
                        atpDisplay = `<span style="font-size:12px;">${avgPrice.toFixed(2)}</span>`;
                    } else {
                        atpDisplay = '-';
                    }
                    
                    // LTP with percentage change
                    let ltpDisplay = '';
                    if (ltp > 0) {
                        const change = previousClose > 0 ? ((ltp - previousClose) / previousClose * 100) : 0;
                        const changeColor = change >= 0 ? '#10b981' : '#ef4444';
                        const changeSign = change >= 0 ? '+' : '';
                        ltpDisplay = `<div style="font-size:12px;">${ltp.toFixed(2)}</div><div style="font-size:10px;color:${changeColor};line-height:1.2;">(${changeSign}${change.toFixed(2)}%)</div>`;
                    } else {
                        ltpDisplay = '-';
                    }
                    
                    // Gain & Loss
                    const pnlColor = positionPnL >= 0 ? '#10b981' : '#ef4444';
                    const pnlSign = positionPnL >= 0 ? '+' : '';
                    const pnlPercent = avgPrice > 0 && netQty !== 0 ? ((positionPnL / Math.abs(netQty * avgPrice)) * 100) : 0;
                    const pnlPercentDisplay = !isNaN(pnlPercent) && isFinite(pnlPercent) && pnlPercent !== 0 ? `(${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)` : '';
                    
                    const gainLossDisplay = `
                        <div style="color:${pnlColor};font-weight:bold;font-size:12px;line-height:1.4;">
                            ${pnlSign}${Math.abs(positionPnL).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${pnlPercentDisplay}
                        </div>
                        ${!isClosed ? `<button class="btn btn-xs btn-outline-danger mt-1" onclick="closePosition('${symbol}')" title="Close Position" style="padding:2px 6px;font-size:10px;"><i class="fas fa-times"></i></button>` : ''}
                    `;
                    
                    // Stock name display - format properly
                    const expiryDisplay = parsed.expiry ? `${parsed.expiry} ` : '';
                    const strikeDisplay = parsed.strike ? `${parsed.strike} ` : '';
                    const typeDisplay = parsed.type || '';
                    const stockNameDisplay = `
                        <div style="font-size:13px;line-height:1.4;"><strong>${parsed.instrument || symbolOnly}</strong> ${exch}</div>
                        ${expiryDisplay || strikeDisplay || typeDisplay ? `<div style="font-size:10px;color:#94a3b8;line-height:1.3;margin-top:2px;">${expiryDisplay}${strikeDisplay}${typeDisplay}</div>` : ''}
                    `;
                    
                    return `
                        <tr>
                            <td style="padding:10px 8px;word-wrap:break-word;line-height:1.4;">${stockNameDisplay}</td>
                            <td style="padding:10px 8px;text-align:center;">${actionDisplay}</td>
                            <td style="padding:10px 8px;white-space:nowrap;">
                                <div>${qtyDisplay}</div>
                                <div style="font-size:10px;color:#94a3b8;">(1 Lot = ${lotSize})</div>
                            </td>
                            <td style="padding:10px 8px;">${atpDisplay}</td>
                            <td style="padding:10px 8px;">${ltpDisplay}</td>
                            <td style="padding:10px 8px;">${gainLossDisplay}</td>
                        </tr>
                    `;
                }).join('');
            }
        }
        
    } catch (error) {
        console.error('❌ Error loading positions page:', error);
        const positionsTableBody = document.getElementById('positionsTableBody');
        if (positionsTableBody) {
            positionsTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4" style="color:#ef4444;">
                        Error: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
}

// Filter positions by search
function filterPositions() {
    const searchText = document.getElementById('positionsSearch')?.value.toLowerCase() || '';
    const rows = document.querySelectorAll('#positionsTableBody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchText) ? '' : 'none';
    });
}

// Export positions
function exportPositions() {
    alert('Export functionality coming soon!');
}

// Exit all positions
function exitAllPositions() {
    if (confirm('Are you sure you want to exit all positions?')) {
        alert('Exit all functionality coming soon!');
    }
}

// Secure exit all
function secureExitAll() {
    if (confirm('Are you sure you want to securely exit all positions?')) {
        alert('Secure exit functionality coming soon!');
    }
}

// Quick buy/sell
function quickBuy(symbol) {
    console.log('Quick buy:', symbol);
    // TODO: Implement quick buy
}

function quickSell(symbol) {
    console.log('Quick sell:', symbol);
    // TODO: Implement quick sell
}

// Close position
function closePosition(symbol) {
    if (confirm(`Are you sure you want to close position: ${symbol}?`)) {
        console.log('Closing position:', symbol);
        // TODO: Implement close position
    }
}

// ============================================
// OPTION CHAIN FUNCTIONS
// ============================================

let currentOptionChainSymbol = 'NIFTY';
let currentOptionChainData = null;
let optionChainBasket = [];

// Open option chain page
function openOptionChain(symbol = 'NIFTY') {
    console.log('🔗 Opening option chain for:', symbol);
    console.log('📍 Current hash:', window.location.hash);
    
    // Verify element exists
    const optionChainPage = document.getElementById('page-optionchain');
    console.log('📄 Option chain page element:', optionChainPage ? 'Found ✅' : 'Not found ❌');
    
    if (!optionChainPage) {
        console.error('❌ Option chain page element not found!');
        alert('Option chain page not found. Please refresh the page.');
        return;
    }
    
    currentOptionChainSymbol = symbol;
    window.location.hash = '#optionchain';
    console.log('📍 Hash set to:', window.location.hash);
    
    // Call navigation immediately and also let hashchange handle it
    handleNavigation();
    
    // Also ensure hashchange event fires if not already handled
    setTimeout(() => {
        if (window.location.hash !== '#optionchain') {
            window.location.hash = '#optionchain';
        }
        handleNavigation();
        console.log('✅ Navigation handled');
    }, 50);
}

// Format number with K, L, Cr suffixes
function formatNumber(num) {
    if (!num && num !== 0) return '--';
    const absNum = Math.abs(num);
    if (absNum >= 10000000) {
        return (num / 10000000).toFixed(2) + ' Cr';
    } else if (absNum >= 100000) {
        return (num / 100000).toFixed(2) + ' L';
    } else if (absNum >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString('en-IN');
}

// Format price change percentage
function formatChange(value, isPercentage = false) {
    if (!value && value !== 0) return '--';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}${isPercentage ? '%' : ''}`;
}

// Load option chain data
async function loadOptionChain() {
    try {
        const symbol = currentOptionChainSymbol;
        const tableBody = document.getElementById('optionChainTableBody');
        
        if (!tableBody) {
            console.error('Option chain table body not found');
            return;
        }
        
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-4" style="color:#64748b;">
                    <i class="fas fa-spinner fa-spin me-2"></i> Loading option chain...
                </td>
            </tr>
        `;
        
        // Update header
        document.getElementById('optionChainSymbol').textContent = symbol;
        
        // Fetch option chain data
        console.log('📡 Fetching option chain for:', symbol);
        const response = await fetch(`/api/option-chain/${symbol}`, {
            credentials: 'include'
        });
        
        console.log('📡 Option chain response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📦 Option chain data received:', data);
        currentOptionChainData = data;
        
        // Update header with current price
        const spotPrice = data.underlyingValue || 0;
        const priceChange = 0; // Calculate from data if available
        const priceChangePercent = 0; // Calculate from data if available
        
        document.getElementById('optionChainPrice').textContent = spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        document.getElementById('optionChainPrice').innerHTML = `₹${spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        
        const changeColor = priceChange >= 0 ? '#10b981' : '#ef4444';
        const changeSign = priceChange >= 0 ? '+' : '';
        document.getElementById('optionChainChange').innerHTML = 
            `<span style="color:${changeColor};">${changeSign}${priceChange.toFixed(2)} (${changeSign}${priceChangePercent.toFixed(2)}%)</span>`;
        
        // Populate expiry dropdown
        const expirySelect = document.getElementById('optionChainExpiry');
        if (data.expiryDates && data.expiryDates.length > 0) {
            expirySelect.innerHTML = data.expiryDates.map(expiry => 
                `<option value="${expiry}">${expiry}</option>`
            ).join('');
        } else {
            // Generate default expiry dates
            const defaultExpiries = ['04 Nov 2025', '11 Nov 2025', '18 Nov 2025', '25 Nov 2025', '02 Dec 2025'];
            expirySelect.innerHTML = defaultExpiries.map(expiry => 
                `<option value="${expiry}">${expiry}</option>`
            ).join('');
        }
        
        // Render option chain table
        renderOptionChainTable(data, spotPrice);
        
    } catch (error) {
        console.error('Error loading option chain:', error);
        const tableBody = document.getElementById('optionChainTableBody');
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-4" style="color:#ef4444;">
                        <i class="fas fa-exclamation-triangle me-2"></i> Error loading option chain: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
}

// Render option chain table
function renderOptionChainTable(data, spotPrice) {
    console.log('🎨 Rendering option chain table...');
    const tableBody = document.getElementById('optionChainTableBody');
    if (!tableBody) {
        console.error('❌ Table body not found!');
        return;
    }
    if (!data.options) {
        console.error('❌ No options data!', data);
        return;
    }
    console.log('✅ Rendering', data.options.length, 'options');
    
    // Group options by strike price
    const strikesMap = new Map();
    
    data.options.forEach(option => {
        const strike = option.strikePrice;
        if (!strikesMap.has(strike)) {
            strikesMap.set(strike, { strike, call: null, put: null });
        }
        
        if (option.optionType === 'CE') {
            strikesMap.get(strike).call = option;
        } else if (option.optionType === 'PE') {
            strikesMap.get(strike).put = option;
        }
    });
    
    // Sort strikes
    const strikes = Array.from(strikesMap.keys()).sort((a, b) => a - b);
    
    // Find ATM strike
    const atmStrike = strikes.reduce((prev, curr) => 
        Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice) ? curr : prev
    );
    
    // Render rows
    tableBody.innerHTML = strikes.map(strike => {
        const row = strikesMap.get(strike);
        const call = row.call || {};
        const put = row.put || {};
        const isATM = strike === atmStrike;
        
        // Call option data
        const callLTP = call.lastPrice || 0;
        const callChange = parseFloat(call.change || 0);
        const callChangePercent = parseFloat(call.pChange || 0);
        const callOI = call.openInterest || 0;
        const callOIChange = 0; // Not available in API response
        const callOIChangePercent = 0;
        
        // Put option data
        const putLTP = put.lastPrice || 0;
        const putChange = parseFloat(put.change || 0);
        const putChangePercent = parseFloat(put.pChange || 0);
        const putOI = put.openInterest || 0;
        const putOIChange = 0;
        const putOIChangePercent = 0;
        
        return `
            <tr class="${isATM ? 'atm-strike' : ''}" data-strike="${strike}">
                <!-- Call OI Change -->
                <td>
                    <div style="text-align:right;">
                        <div style="font-size:11px;color:${callOIChange >= 0 ? '#10b981' : '#ef4444'};">${formatNumber(callOIChange)}</div>
                        <div style="font-size:10px;color:#64748b;">${formatChange(callOIChangePercent, true)}</div>
                    </div>
                </td>
                <!-- Call OI -->
                <td>
                    <div style="text-align:right;font-size:11px;">${formatNumber(callOI)}</div>
                </td>
                <!-- Call LTP -->
                <td>
                    <div style="text-align:right;">
                        <div class="option-chain-price">₹${callLTP.toFixed(2)}</div>
                        <div class="option-chain-change ${callChange >= 0 ? 'positive' : 'negative'}">${formatChange(callChange)} (${formatChange(callChangePercent, true)})</div>
                    </div>
                </td>
                <!-- Call Actions -->
                <td style="text-align:center;">
                    <button class="option-chain-btn buy" onclick="quickBuyOption('${currentOptionChainSymbol}', ${strike}, 'CE')" title="Buy Call">B</button>
                    <button class="option-chain-btn sell" onclick="quickSellOption('${currentOptionChainSymbol}', ${strike}, 'CE')" title="Sell Call">S</button>
                </td>
                <!-- Strike -->
                <td>
                    ${isATM ? `<div style="position:absolute;left:0;top:50%;transform:translateY(-50%);background:#ef4444;color:#fff;padding:2px 6px;font-size:9px;border-radius:0 4px 4px 0;">${spotPrice.toFixed(2)}</div>` : ''}
                    <div style="font-weight:700;">${strike.toLocaleString('en-IN')}</div>
                    ${isATM ? '<div style="position:absolute;right:0;top:0;bottom:0;width:3px;background:#ef4444;"></div>' : ''}
                </td>
                <!-- Put Actions -->
                <td style="text-align:center;">
                    <button class="option-chain-btn buy" onclick="quickBuyOption('${currentOptionChainSymbol}', ${strike}, 'PE')" title="Buy Put">B</button>
                    <button class="option-chain-btn sell" onclick="quickSellOption('${currentOptionChainSymbol}', ${strike}, 'PE')" title="Sell Put">S</button>
                </td>
                <!-- Put LTP -->
                <td>
                    <div style="text-align:left;">
                        <div class="option-chain-price">₹${putLTP.toFixed(2)}</div>
                        <div class="option-chain-change ${putChange >= 0 ? 'positive' : 'negative'}">${formatChange(putChange)} (${formatChange(putChangePercent, true)})</div>
                    </div>
                </td>
                <!-- Put OI -->
                <td>
                    <div style="text-align:left;font-size:11px;">${formatNumber(putOI)}</div>
                </td>
                <!-- Put OI Change -->
                <td>
                    <div style="text-align:left;">
                        <div style="font-size:11px;color:${putOIChange >= 0 ? '#10b981' : '#ef4444'};">${formatNumber(putOIChange)}</div>
                        <div style="font-size:10px;color:#64748b;">${formatChange(putOIChangePercent, true)}</div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Filter option chain strikes
function filterOptionChainStrikes() {
    const searchValue = document.getElementById('optionChainStrikeSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#optionChainTableBody tr');
    
    rows.forEach(row => {
        const strike = row.getAttribute('data-strike');
        if (strike && strike.includes(searchValue)) {
            row.style.display = '';
        } else {
            row.style.display = searchValue === '' ? '' : 'none';
        }
    });
}

// Quick buy option
function quickBuyOption(symbol, strike, optionType) {
    console.log(`Quick Buy: ${symbol} ${strike} ${optionType}`);
    // TODO: Implement quick buy option
    addToBasket(symbol, strike, optionType, 'BUY');
}

// Quick sell option
function quickSellOption(symbol, strike, optionType) {
    console.log(`Quick Sell: ${symbol} ${strike} ${optionType}`);
    // TODO: Implement quick sell option
    addToBasket(symbol, strike, optionType, 'SELL');
}

// Add to basket
function addToBasket(symbol, strike, optionType, action) {
    const item = {
        symbol,
        strike,
        optionType,
        action,
        timestamp: Date.now()
    };
    
    optionChainBasket.push(item);
    updateBasket();
    showToast(`Added to basket: ${symbol} ${strike} ${optionType} ${action}`, 'success');
}

// Update basket display
function updateBasket() {
    const basketCount = document.getElementById('basketCount');
    const basketItems = document.getElementById('basketItems');
    
    if (basketCount) {
        basketCount.textContent = optionChainBasket.length;
    }
    
    if (basketItems) {
        if (optionChainBasket.length === 0) {
            basketItems.innerHTML = '<div class="text-center text-muted py-2" style="font-size:11px;">No items in basket</div>';
        } else {
            basketItems.innerHTML = optionChainBasket.map((item, index) => `
                <div class="basket-item">
                    <div>
                        <div class="basket-item-symbol">${item.symbol} ${item.strike} ${item.optionType}</div>
                        <div style="font-size:10px;color:#64748b;">${item.action}</div>
                    </div>
                    <button class="btn btn-xs btn-outline-danger" onclick="removeFromBasket(${index})" style="padding:2px 6px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('');
        }
    }
}

// Remove from basket
function removeFromBasket(index) {
    optionChainBasket.splice(index, 1);
    updateBasket();
}

// Toggle basket visibility
function toggleBasket() {
    const basket = document.getElementById('optionChainBasket');
    if (basket) {
        const currentDisplay = basket.style.display;
        basket.style.display = (currentDisplay === 'none' || currentDisplay === '') ? 'block' : 'none';
    }
}

// Clear basket
function clearBasket() {
    if (confirm('Clear all items from basket?')) {
        optionChainBasket = [];
        updateBasket();
    }
}

// Create strategy
function createStrategy() {
    if (optionChainBasket.length === 0) {
        showToast('Basket is empty. Add options to create a strategy.', 'warning');
        return;
    }
    console.log('Creating strategy from basket:', optionChainBasket);
    // TODO: Implement strategy creation
    showToast('Strategy creation feature coming soon!', 'info');
}

