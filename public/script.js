// Global variables
let basketOrders = [];
let currentPrice = 24500;
let isAuthenticated = false;
let currentUser = null;

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
        showAlert('Opening login window...', 'info');
        
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
            
            showAlert('Complete login in the popup window', 'warning');
            
            // Monitor auth window
            const checkInterval = setInterval(() => {
                if (authWindow.closed) {
                    clearInterval(checkInterval);
                    showAlert('Verifying authentication...', 'info');
                    setTimeout(checkAuthStatus, 2000);
                }
            }, 1000);
            
        } else {
            throw new Error(result.error || 'Failed to generate login URL');
        }
        
    } catch (error) {
        console.error('Login error:', error);
        showAlert('Login failed: ' + error.message, 'danger');
    }
}

// Logout function
async function logout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (result.stat === 'Ok' || result.success) {
            showAlert('Logged out successfully. Reloading...', 'success');
            isAuthenticated = false;
            currentUser = null;
            
            // Hide dropdown
            document.getElementById('userDropdown').style.display = 'none';
            
            // Reload page after a short delay
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            throw new Error(result.message || 'Logout failed');
        }
    } catch (error) {
        console.error('Logout error:', error);
        showAlert('Logout failed: ' + error.message, 'danger');
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
        
        if (data.authenticated) {
            isAuthenticated = true;
            console.log('✅ User IS authenticated:', data.userId);
            
            // Hide auth alert banner
            if (authAlert) {
                authAlert.style.setProperty('display', 'none', 'important');
                authAlert.classList.remove('d-flex');
                console.log('✅ Auth alert hidden successfully');
            } else {
                console.warn('⚠️ Cannot hide auth alert - element not found');
            }
            
            // Store current user
            currentUser = data;
            
            // Update login button to show user with dropdown
            const userMenuBtn = document.getElementById('userMenuBtn');
            if (userMenuBtn) {
                userMenuBtn.innerHTML = `<i class="fas fa-user-circle"></i> ${data.userId}`;
                userMenuBtn.classList.remove('btn-outline-light');
                userMenuBtn.classList.add('btn-success');
                userMenuBtn.setAttribute('onclick', 'toggleUserDropdown()');
            }
            
            // Update old buttons (for compatibility)
            const loginBtns = document.querySelectorAll('button[onclick="quickLogin()"]');
            console.log('🔘 Found', loginBtns.length, 'login buttons');
            loginBtns.forEach(btn => {
                if (btn.id !== 'userMenuBtn') {
                    btn.innerHTML = `<i class="fas fa-user-circle"></i> ${data.userId}`;
                    btn.classList.remove('btn-outline-light');
                    btn.classList.add('btn-success');
                }
            });
            
            // Update dropdown user info
            const dropdownUserId = document.getElementById('dropdownUserId');
            if (dropdownUserId) {
                dropdownUserId.textContent = data.userId;
            }
            
            // Load user data (will update name)
            console.log('📊 Loading user data and prices...');
            loadUserInfo();
            refreshPrice();
            
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
            
            // Reset user menu button
            const userMenuBtn = document.getElementById('userMenuBtn');
            if (userMenuBtn) {
                userMenuBtn.innerHTML = `<i class="fas fa-sign-in-alt"></i> Login`;
                userMenuBtn.classList.remove('btn-success');
                userMenuBtn.classList.add('btn-outline-light');
                userMenuBtn.setAttribute('onclick', 'quickLogin()');
            }
            
            // Hide dropdown
            const dropdown = document.getElementById('userDropdown');
            if (dropdown) {
                dropdown.style.display = 'none';
            }
            
            // Reset other login buttons
            const loginBtns = document.querySelectorAll('button[onclick="quickLogin()"]');
            loginBtns.forEach(btn => {
                if (btn.id !== 'userMenuBtn') {
                    btn.innerHTML = `<i class="fas fa-sign-in-alt"></i> Login`;
                    btn.classList.remove('btn-success');
                    btn.classList.add('btn-outline-light');
                }
            });
        }
    } catch (error) {
        console.error('❌ Auth check error:', error);
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
            const cash = parseFloat(marginData.cash || 0);
            const used = parseFloat(marginData.marginused || 0);
            
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
        }
        
        // Get user details
        const userResponse = await fetch('/api/user-details', { credentials: 'include' });
        const userData = await userResponse.json();
        
        if (userData.stat === 'Ok') {
            const userInfoEl = document.getElementById('userInfo');
            if (userInfoEl) {
                userInfoEl.textContent = userData.uname || userData.actid || 'User';
            }
            
            // Update dropdown with full name
            const dropdownUserName = document.getElementById('dropdownUserName');
            if (dropdownUserName) {
                dropdownUserName.textContent = userData.uname || userData.actid || 'User';
            }
            
            // Update top bar with user name
            const topUserName = document.getElementById('topUserName');
            const topUserNameText = document.getElementById('topUserNameText');
            if (topUserName && topUserNameText) {
                topUserNameText.textContent = userData.uname || userData.actid || 'User';
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
    }
}

// Load orders and positions to calculate P&L and counts
async function loadOrdersAndPositions() {
    try {
        console.log('🔄 Loading orders and positions...');
        
        // Get positions for P&L calculation
        const positionsResponse = await fetch('/api/positions', { credentials: 'include' });
        
        if (!positionsResponse.ok) {
            console.error('❌ Positions API error:', positionsResponse.status, positionsResponse.statusText);
            return;
        }
        
        const positionsResult = await positionsResponse.json();
        console.log('📦 Raw positions response:', positionsResult);
        
        let totalPnL = 0;
        const positions = positionsResult.data || positionsResult || [];
        
        if (Array.isArray(positions) && positions.length > 0) {
            console.log('📊 Position Details:');
            positions.forEach(position => {
                // FlatTrade PositionBook API fields:
                // urmtom - Unrealized Mark-to-Market (current P&L for open position)
                // rpnl - Realized P&L (from closed/squared off positions)
                // netqty - Net quantity (can be used to check if position is open)
                
                const unrealizedPnL = parseFloat(position.urmtom || 0);
                const realizedPnL = parseFloat(position.rpnl || 0);
                const netQty = parseFloat(position.netqty || position.daybuyqty || 0);
                
                // Total P&L for this position
                const positionPnL = unrealizedPnL + realizedPnL;
                
                console.log(`  📈 ${position.tsym || position.symbol || 'N/A'}:`);
                console.log(`     Net Qty: ${netQty}, Unrealized: ₹${unrealizedPnL.toFixed(2)}, Realized: ₹${realizedPnL.toFixed(2)}, Total: ₹${positionPnL.toFixed(2)}`);
                
                totalPnL += positionPnL;
            });
            
            console.log(`📊 Total P&L (Today): ₹${totalPnL.toFixed(2)}`);
        } else {
            console.log('📊 No positions found');
        }
        
        console.log('📊 Positions data:', positions.length, 'positions, Total P&L:', totalPnL);
        
        // Update P&L display
        const pnlTodayEl = document.getElementById('pnlToday');
        if (pnlTodayEl) {
            const formattedPnL = totalPnL.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            pnlTodayEl.textContent = `₹${formattedPnL}`;
            pnlTodayEl.className = totalPnL >= 0 ? 'value price-up' : 'value price-down';
            console.log(`💰 Updated P&L display: ₹${formattedPnL}`);
        } else {
            console.error('❌ pnlToday element not found');
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
        
        // Update orders count
        const ordersCountEl = document.getElementById('ordersCount');
        if (ordersCountEl) {
            ordersCountEl.textContent = orderCount;
            console.log(`📊 Updated orders count: ${orderCount}`);
        } else {
            console.error('❌ ordersCount element not found');
        }
        
                // Also fetch trade book for additional P&L verification
                try {
                    const tradeBookResponse = await fetch('/api/trade-book', { credentials: 'include' });
                    if (tradeBookResponse.ok) {
                        const tradeBookResult = await tradeBookResponse.json();
                        const trades = tradeBookResult.data || tradeBookResult.values || [];
                        
                        if (Array.isArray(trades) && trades.length > 0) {
                            console.log(`📋 TradeBook: ${trades.length} trades today`);
                            // Could use trades for additional P&L calculation if needed
                        }
                    } else {
                        console.log('⚠️ TradeBook request failed:', tradeBookResponse.status);
                    }
                } catch (tradeError) {
                    console.log('⚠️ TradeBook not available:', tradeError.message);
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
        
        // Update BANKNIFTY
        if (data.banknifty && data.banknifty.price) {
            const price = parseFloat(data.banknifty.price);
            const change = parseFloat(data.banknifty.change || 0);
            const changePct = parseFloat(data.banknifty.pChange || 0);
            
            const bankniftyPriceEl = document.getElementById('bankniftyPrice');
            if (bankniftyPriceEl) {
                bankniftyPriceEl.textContent = price.toLocaleString('en-IN', { minimumFractionDigits: 2 });
                bankniftyPriceEl.className = change >= 0 ? 'value price-up' : 'value price-down';
            }
            
            const bankniftyChangeEl = document.getElementById('bankniftyChange');
            if (bankniftyChangeEl) {
                const changeText = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`;
                bankniftyChangeEl.textContent = changeText;
                bankniftyChangeEl.className = change >= 0 ? 'price-up' : 'price-down';
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
                vixPriceEl.className = change >= 0 ? 'value price-up' : 'value price-down';
            }
            
            const vixChangeEl = document.getElementById('vixChange');
            if (vixChangeEl) {
                const changeText = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`;
                vixChangeEl.textContent = changeText;
                vixChangeEl.className = change >= 0 ? 'price-up' : 'price-down';
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
function createOrderFromForm(trantype) {
    const symbol = document.getElementById('symbol').value;
    const expiry = document.getElementById('expiry').value;
    const strike = document.getElementById('strikePrice').value;
    const optionType = document.getElementById('optionType').value;
    const quantity = document.getElementById('quantity').value;
    const productEl = document.getElementById('product');
    const product = productEl ? productEl.value : 'MIS';
    const orderTypeEl = document.getElementById('orderType');
    const orderType = orderTypeEl ? orderTypeEl.value : 'Market';
    const priceEl = document.getElementById('price');
    const price = priceEl ? priceEl.value : '';
    
    if (!strike || !quantity) {
        showAlert('Please enter strike price and quantity', 'warning');
        return null;
    }
    
    if (orderType === 'Limit' && !price) {
        showAlert('Please enter price for limit orders', 'warning');
        return null;
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
        exchange: 'NFO'
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
        
        const response = await fetch('/api/place-single-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ order })
        });
        
        const result = await response.json();
        console.log('📥 Order response:', result);
        
        if (result.success) {
            showAlert(`✅ Order placed! Order ID: ${result.orderId}`, 'success');
            clearForm();
            loadTodaysOrders();
            loadOrdersAndPositions(); // Refresh P&L
        } else {
            console.error('❌ Order failed:', result.error, result.details);
            showAlert(`❌ Order failed: ${result.error}`, 'danger');
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
            
            const response = await fetch('/api/place-single-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ order })
            });
            
            const result = await response.json();
            console.log('📥 Basket order response:', result);
            
            if (result.success) {
                success++;
                console.log(`✅ Order ${success} placed: ${result.orderId}`);
            } else {
                failed++;
                failedOrders.push({ symbol: order.tradingSymbol, error: result.error });
                console.error(`❌ Order ${failed} failed:`, result.error);
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

// Load today's orders
async function loadTodaysOrders() {
    try {
        console.log('📋 Loading today\'s orders...');
        const response = await fetch('/api/orders', { credentials: 'include' });
        
        if (!response.ok) {
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
        
        if (Array.isArray(orders) && orders.length > 0) {
            console.log(`✅ Displaying ${orders.length} orders`);
            container.innerHTML = orders.slice(0, 5).map(order => {
                const symbol = order.tsym || order.tradingsymbol || 'N/A';
                const trantype = order.trantype === 'B' || order.transactiontype === 'BUY' ? 'BUY' : 'SELL';
                const qty = order.qty || order.quantity || 0;
                const price = order.prc || order.price || 0;
                const status = order.status || order.orderstatus || 'UNKNOWN';
                
                return `
                    <div class="small border-bottom py-2">
                        <strong>${symbol}</strong><br>
                        <small class="text-muted">${trantype} ${qty} @ ₹${price > 0 ? price.toFixed(2) : 'Market'}</small><br>
                        <small class="text-muted" style="font-size:10px;">Status: ${status}</small>
                    </div>
                `;
            }).join('');
        } else {
            console.log('📋 No orders found');
            container.innerHTML = `
                <div class="text-center text-muted py-3">
                    <small>No orders today</small>
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

// Refresh orders manually
function refreshOrders() {
    loadTodaysOrders();
    loadOrdersAndPositions();
}

// Clear form
function clearForm() {
    document.getElementById('strikePrice').value = '';
    document.getElementById('quantity').value = '25';
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

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Fast Trader UI loaded - checking authentication...');
    
    // Check auth first, then populate expiry dates
    checkAuthStatus();
    
    // Wait a bit then populate expiry dates (after auth check)
    setTimeout(() => {
        const symbol = document.getElementById('symbol')?.value || 'NIFTY';
        console.log(`📅 Initializing expiry dates for ${symbol}...`);
        populateExpiryDates(symbol);
    }, 1000);
    
    // Symbol change handler
    const symbolSelect = document.getElementById('symbol');
    if (symbolSelect) {
        symbolSelect.addEventListener('change', function() {
            const selectedSymbol = symbolSelect.value;
            console.log(`🔄 Symbol changed to: ${selectedSymbol}`);
            
            // Update default quantity based on symbol
            const quantityInput = document.getElementById('quantity');
            if (quantityInput) {
                if (selectedSymbol === 'NIFTY') {
                    quantityInput.value = 75; // NIFTY lot size
                } else if (selectedSymbol === 'BANKNIFTY') {
                    quantityInput.value = 35; // BANKNIFTY lot size
                } else if (selectedSymbol === 'FINNIFTY') {
                    quantityInput.value = 40; // FINNIFTY lot size
                }
            }
            
            refreshPrice();
            populateExpiryDates(selectedSymbol); // Refresh expiry dates for new symbol
        });
    }
    
    // Auto-refresh auth status every 30 seconds
    setInterval(checkAuthStatus, 30000);
    
    // Auto-refresh price every 1 minute (60 seconds)
    setInterval(refreshPrice, 60000);
    
    console.log('⏰ Auto-refresh enabled: Auth (30s), Price (60s)');
});
