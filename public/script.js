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
            console.error('❌ pnlToday element not found in DOM!');
            console.error('Available elements with "pnl" in id:', 
                Array.from(document.querySelectorAll('[id*="pnl"]')).map(el => el.id));
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
                const price = parseFloat(order.prc || order.price || 0); // Ensure price is a number
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
    loadOrdersTable();
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

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 FiFTO TRADER UI loaded - checking authentication...');
    
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
            const actualQtyInput = document.getElementById('actualQuantity');
            if (quantityInput && actualQtyInput) {
                let multiplier = 75;
                if (selectedSymbol === 'NIFTY') {
                    quantityInput.value = 1; // Default 1 lot for NIFTY
                    multiplier = 75;
                } else if (selectedSymbol === 'BANKNIFTY') {
                    quantityInput.value = 1; // Default 1 lot for BANKNIFTY
                    multiplier = 35;
                } else if (selectedSymbol === 'FINNIFTY') {
                    quantityInput.value = 1; // Default 1 lot for FINNIFTY
                    multiplier = 40;
                }
                actualQtyInput.value = multiplier; // Set default quantity
            }
            
            refreshPrice();
            populateExpiryDates(selectedSymbol); // Refresh expiry dates for new symbol
        });
    }
    
    // Auto-refresh auth status every 30 seconds
    setInterval(checkAuthStatus, 30000);
    
    // Auto-refresh price every 1 minute (60 seconds)
    setInterval(refreshPrice, 60000);
    
    // Auto-refresh P&L and orders every 30 seconds
    setInterval(() => {
        if (isAuthenticated) {
            console.log('🔄 Auto-refreshing P&L and orders...');
            loadOrdersAndPositions();
            loadOrdersTable(); // Also refresh orders table
        }
    }, 30000);
    
    // Load orders table on initial load after auth check
    setTimeout(() => {
        if (isAuthenticated) {
            loadOrdersTable();
        }
    }, 2000);
    
    // Initialize option type and product buttons
    selectOptionType('CE'); // Set CE as default
    selectProduct('MIS'); // Set MIS as default
    
    // Initialize quantity display
    updateQuantityFromLot();
    
    // Add mouse wheel event listener to lot size input for instant scroll increment/decrement
    const quantityInput = document.getElementById('quantity');
    if (quantityInput) {
        quantityInput.addEventListener('wheel', handleLotScroll, { passive: false });
    }
    
    // Add mouse wheel event listener to strike price input for instant scroll increment/decrement
    const strikeInput = document.getElementById('strikePrice');
    if (strikeInput) {
        strikeInput.addEventListener('wheel', handleStrikeScroll, { passive: false });
    }
    
    console.log('⏰ Auto-refresh enabled: Auth (30s), Price (60s), P&L (30s)');
    
    // Load positions page when hash changes to #positions
    window.addEventListener('hashchange', function() {
        if (window.location.hash === '#positions') {
            loadPositionsPage();
        }
    });
    
    // Load positions page on initial load if hash is #positions
    if (window.location.hash === '#positions') {
        loadPositionsPage();
    }
});

// Load positions page with P&L and open orders
async function loadPositionsPage() {
    try {
        console.log('📊 Loading positions page...');
        
        // Load positions
        const positionsResponse = await fetch('/api/positions', { credentials: 'include' });
        
        if (!positionsResponse.ok) {
            console.error('❌ Positions API error:', positionsResponse.status);
            document.getElementById('positionsTableBody').innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-4" style="color:#ef4444;">
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
                    <td colspan="9" class="text-center py-4" style="color:#64748b;">
                        ${errorMsg === 'no data' ? 'No open positions' : errorMsg}
                    </td>
                </tr>
            `;
            
            // Reset P&L displays
            const totalPnLEl = document.getElementById('positionsTotalPnL');
            const realizedPnLEl = document.getElementById('positionsRealizedPnL');
            const unrealizedPnLEl = document.getElementById('positionsUnrealizedPnL');
            const positionsCountEl = document.getElementById('positionsCount');
            
            if (totalPnLEl) totalPnLEl.textContent = '₹0.00';
            if (realizedPnLEl) realizedPnLEl.textContent = '₹0.00';
            if (unrealizedPnLEl) unrealizedPnLEl.textContent = '₹0.00';
            if (positionsCountEl) positionsCountEl.textContent = '0';
            
            return;
        }
        
        const positions = positionsResult.data || positionsResult || [];
        
        // Handle different response formats (array, object with values, etc.)
        let positionsArray = [];
        if (Array.isArray(positions)) {
            positionsArray = positions;
        } else if (positionsResult.values && Array.isArray(positionsResult.values)) {
            positionsArray = positionsResult.values;
        }
        
        // Calculate P&L totals from ALL positions (both open and closed)
        // Realized P&L can come from closed positions, Unrealized P&L from open positions
        // According to Flattrade API docs:
        // - rpnl: Realized P&L (profit/loss from closed positions)
        // - urmtom: Unrealized P&L/MTM (mark-to-market for open positions)
        let totalRealizedPnL = 0;
        let totalUnrealizedPnL = 0;
        let totalPnL = 0;
        
        // Calculate P&L from ALL positions first
        positionsArray.forEach(position => {
            const realizedPnL = parseFloat(position.rpnl || position.RPNL || 0);
            const unrealizedPnL = parseFloat(position.urmtom || position.URMTOM || position.upnl || position.UPNL || 0);
            
            // Debug logging for positions with realized P&L
            if (realizedPnL !== 0) {
                const symbol = position.tsym || position.TSYM || 'N/A';
                console.log(`💰 Realized P&L found: ${symbol} = ₹${realizedPnL.toFixed(2)}`);
            }
            
            totalRealizedPnL += realizedPnL;
            totalUnrealizedPnL += unrealizedPnL;
            totalPnL += (realizedPnL + unrealizedPnL);
        });
        
        console.log(`📊 P&L Summary: Realized=₹${totalRealizedPnL.toFixed(2)}, Unrealized=₹${totalUnrealizedPnL.toFixed(2)}, Total=₹${totalPnL.toFixed(2)}`);
        
        // Filter open positions: netqty != 0 (handle both string and number formats)
        // According to Flattrade API docs: "Open positions" are those with non-zero net quantity
        // Note: We filter AFTER calculating P&L because closed positions may have realized P&L
        const openPositions = positionsArray.filter(pos => {
            // Handle both string "0" and number 0 formats
            const netQtyStr = String(pos.netqty || pos.NETQTY || '0').trim();
            const netQtyNum = parseFloat(netQtyStr);
            
            // Position is "open" if netqty is not "0" (as string) or not 0 (as number)
            return netQtyStr !== '0' && netQtyNum !== 0;
        });
        
        // Update P&L summary
        const totalPnLEl = document.getElementById('positionsTotalPnL');
        const realizedPnLEl = document.getElementById('positionsRealizedPnL');
        const unrealizedPnLEl = document.getElementById('positionsUnrealizedPnL');
        const positionsCountEl = document.getElementById('positionsCount');
        
        if (totalPnLEl) {
            totalPnLEl.textContent = `₹${totalPnL.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            totalPnLEl.className = totalPnL >= 0 ? 'value price-up' : 'value price-down';
        }
        
        if (realizedPnLEl) {
            realizedPnLEl.textContent = `₹${totalRealizedPnL.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            realizedPnLEl.className = totalRealizedPnL >= 0 ? 'value price-up' : 'value price-down';
        }
        
        if (unrealizedPnLEl) {
            unrealizedPnLEl.textContent = `₹${totalUnrealizedPnL.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            unrealizedPnLEl.className = totalUnrealizedPnL >= 0 ? 'value price-up' : 'value price-down';
        }
        
        if (positionsCountEl) {
            positionsCountEl.textContent = openPositions.length;
        }
        
        // Display ALL positions in "All Positions" table (including closed positions)
        const positionsTableBody = document.getElementById('positionsTableBody');
        if (positionsTableBody) {
            if (positionsArray.length === 0) {
                positionsTableBody.innerHTML = `
                    <tr>
                        <td colspan="9" class="text-center py-4" style="color:#64748b;">
                            No positions found
                        </td>
                    </tr>
                `;
            } else {
                positionsTableBody.innerHTML = positionsArray.map(position => {
                    const symbol = position.tsym || position.TSYM || position.symbol || 'N/A';
                    const exch = position.exch || position.EXCH || 'N/A';
                    const product = position.s_prdt_ali || position.S_PRDT_ALI || position.prd || 'N/A';
                    const netQty = parseFloat(position.netqty || position.NETQTY || 0);
                    const avgPrice = parseFloat(position.netavgprc || position.NETAVGPRC || position.avgprc || position.AVGPRC || 0);
                    const ltp = parseFloat(position.lp || position.LP || position.ltp || position.LTP || 0);
                    const realizedPnL = parseFloat(position.rpnl || position.RPNL || 0);
                    const unrealizedPnL = parseFloat(position.urmtom || position.URMTOM || position.upnl || position.UPNL || 0);
                    const positionPnL = realizedPnL + unrealizedPnL;
                    
                    // Color coding: green for positive, red for negative
                    const qtyColor = netQty >= 0 ? 'text-success' : 'text-danger';
                    const pnlColor = positionPnL >= 0 ? 'text-success' : 'text-danger';
                    const realizedColor = realizedPnL >= 0 ? 'text-success' : (realizedPnL < 0 ? 'text-danger' : 'text-muted');
                    const unrealizedColor = unrealizedPnL >= 0 ? 'text-success' : (unrealizedPnL < 0 ? 'text-danger' : 'text-muted');
                    
                    // Show "CLOSED" badge if netqty is 0
                    const statusBadge = netQty === 0 ? '<span class="badge badge-red">CLOSED</span>' : '';
                    
                    return `
                        <tr>
                            <td><strong>${symbol}</strong> ${statusBadge}</td>
                            <td>${exch}</td>
                            <td><span class="badge ${product === 'MIS' ? 'badge-green' : 'badge-yellow'}">${product}</span></td>
                            <td class="${qtyColor}"><strong>${netQty}</strong></td>
                            <td>₹${avgPrice.toFixed(2)}</td>
                            <td>₹${ltp.toFixed(2)}</td>
                            <td class="${realizedColor}">₹${realizedPnL.toFixed(2)}</td>
                            <td class="${unrealizedColor}">₹${unrealizedPnL.toFixed(2)}</td>
                            <td class="${pnlColor}"><strong>₹${positionPnL.toFixed(2)}</strong></td>
                        </tr>
                    `;
                }).join('');
            }
        }
        
        // Display ONLY OPEN positions in "Open Orders" section (netqty != 0)
        loadOpenPositions(openPositions);
        
    } catch (error) {
        console.error('❌ Error loading positions page:', error);
        const positionsTableBody = document.getElementById('positionsTableBody');
        if (positionsTableBody) {
            positionsTableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-4" style="color:#ef4444;">
                        Error: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
}

// Load and display ONLY OPEN positions in "Open Orders" section
async function loadOpenPositions(openPositions) {
    try {
        const openOrdersContainer = document.getElementById('openOrdersContainer');
        if (!openOrdersContainer) {
            console.error('❌ openOrdersContainer element not found');
            return;
        }
        
        // openPositions should already be filtered (netqty != 0)
        if (!openPositions || openPositions.length === 0) {
            openOrdersContainer.innerHTML = `
                <div class="text-center py-3" style="color:#64748b;">
                    <i class="fas fa-check-circle me-2"></i> No open positions
                </div>
            `;
            return;
        }
        
        console.log(`✅ Displaying ${openPositions.length} open positions in Open Orders section`);
        
        openOrdersContainer.innerHTML = `
            <div style="max-height:400px;overflow-y:auto;">
                <table class="table-modern">
                    <thead>
                        <tr>
                            <th>Symbol</th>
                            <th>Exchange</th>
                            <th>Product</th>
                            <th>Net Qty</th>
                            <th>Avg Price</th>
                            <th>LTP</th>
                            <th>Realized P&L</th>
                            <th>Unrealized P&L</th>
                            <th>Total P&L</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${openPositions.map(position => {
                            const symbol = position.tsym || position.TSYM || position.symbol || 'N/A';
                            const exch = position.exch || position.EXCH || 'N/A';
                            const product = position.s_prdt_ali || position.S_PRDT_ALI || position.prd || 'N/A';
                            const netQty = parseFloat(position.netqty || position.NETQTY || 0);
                            const avgPrice = parseFloat(position.netavgprc || position.NETAVGPRC || position.avgprc || position.AVGPRC || 0);
                            const ltp = parseFloat(position.lp || position.LP || position.ltp || position.LTP || 0);
                            const realizedPnL = parseFloat(position.rpnl || position.RPNL || 0);
                            const unrealizedPnL = parseFloat(position.urmtom || position.URMTOM || position.upnl || position.UPNL || 0);
                            const positionPnL = realizedPnL + unrealizedPnL;
                            
                            const qtyColor = netQty >= 0 ? 'text-success' : 'text-danger';
                            const pnlColor = positionPnL >= 0 ? 'text-success' : 'text-danger';
                            const realizedColor = realizedPnL >= 0 ? 'text-success' : (realizedPnL < 0 ? 'text-danger' : 'text-muted');
                            const unrealizedColor = unrealizedPnL >= 0 ? 'text-success' : (unrealizedPnL < 0 ? 'text-danger' : 'text-muted');
                            
                            return `
                                <tr>
                                    <td><strong>${symbol}</strong></td>
                                    <td>${exch}</td>
                                    <td><span class="badge ${product === 'MIS' ? 'badge-green' : 'badge-yellow'}">${product}</span></td>
                                    <td class="${qtyColor}"><strong>${netQty}</strong></td>
                                    <td>₹${avgPrice.toFixed(2)}</td>
                                    <td>₹${ltp.toFixed(2)}</td>
                                    <td class="${realizedColor}">₹${realizedPnL.toFixed(2)}</td>
                                    <td class="${unrealizedColor}">₹${unrealizedPnL.toFixed(2)}</td>
                                    <td class="${pnlColor}"><strong>₹${positionPnL.toFixed(2)}</strong></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('❌ Error loading open positions:', error);
        const openOrdersContainer = document.getElementById('openOrdersContainer');
        if (openOrdersContainer) {
            openOrdersContainer.innerHTML = `
                <div class="text-center py-3" style="color:#ef4444;">
                    Error loading open positions
                </div>
            `;
        }
    }
}
