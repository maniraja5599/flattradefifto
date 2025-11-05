// Global variables
let isAuthenticated = false;
let currentUser = null;
let basketOrders = [];
let currentSymbol = 'NIFTY';
let currentExpiry = '';
let strikeCount = 10;
let optionChainData = null;

// Theme management
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        themeIcon.className = savedTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        themeIcon.className = newTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
}

// Check authentication status
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth-status', { credentials: 'include' });
        
        if (!response.ok) {
            console.error('❌ Auth status response not OK:', response.status);
            isAuthenticated = false;
            currentUser = null;
            return false;
        }
        
        const data = await response.json();
        console.log('📡 Auth status response:', data);
        
        if (data.authenticated) {
            isAuthenticated = true;
            currentUser = data;
            console.log('✅ User authenticated:', data.userId || 'User');
            return true;
        } else {
            isAuthenticated = false;
            currentUser = null;
            console.log('❌ User NOT authenticated:', data.message || 'No message');
            return false;
        }
    } catch (error) {
        console.error('❌ Auth check error:', error);
        isAuthenticated = false;
        currentUser = null;
        return false;
    }
}

// Load expiry dates
async function loadExpiryDates() {
    try {
        const response = await fetch(`/api/expiry-dates?symbol=${currentSymbol}`, { credentials: 'include' });
        if (!response.ok) {
            throw new Error('Failed to load expiry dates');
        }
        
        const data = await response.json();
        const expirySelect = document.getElementById('expirySelect');
        
        // Handle both expiryDates array and expiries array with objects
        let expiriesToShow = [];
        if (data.expiryDates && Array.isArray(data.expiryDates)) {
            expiriesToShow = data.expiryDates;
        } else if (data.expiries && Array.isArray(data.expiries)) {
            // If expiries is array of objects, extract dates
            expiriesToShow = data.expiries.map(e => e.flattradeFormat || e.date || e);
        }
        
        if (expiriesToShow.length > 0) {
            expirySelect.innerHTML = '';
            expiriesToShow.forEach((expiry, index) => {
                const option = document.createElement('option');
                // Handle both string and object formats
                const expiryValue = typeof expiry === 'string' ? expiry : (expiry.flattradeFormat || expiry.date || expiry);
                const expiryDisplay = typeof expiry === 'string' ? expiry : (expiry.display || expiryValue);
                
                option.value = expiryValue;
                option.textContent = expiryDisplay;
                if (index === 0 && !currentExpiry) {
                    option.selected = true;
                    currentExpiry = expiryValue;
                } else if (expiryValue === currentExpiry) {
                    option.selected = true;
                }
                expirySelect.appendChild(option);
            });
        } else {
            // Fallback: generate next few Thursdays
            const expiries = generateNextExpiries();
            expirySelect.innerHTML = '';
            expiries.forEach((expiry, index) => {
                const option = document.createElement('option');
                option.value = expiry;
                option.textContent = expiry;
                if (index === 0) {
                    option.selected = true;
                    currentExpiry = expiry;
                }
                expirySelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading expiry dates:', error);
        // Fallback to generated expiries
        const expirySelect = document.getElementById('expirySelect');
        const expiries = generateNextExpiries();
        expirySelect.innerHTML = '';
        expiries.forEach((expiry, index) => {
            const option = document.createElement('option');
            option.value = expiry;
            option.textContent = expiry;
            if (index === 0) {
                option.selected = true;
                currentExpiry = expiry;
            }
            expirySelect.appendChild(option);
        });
    }
}

// Generate next few Thursdays (expiry dates)
function generateNextExpiries() {
    const expiries = [];
    const today = new Date();
    let currentDate = new Date(today);
    
    // Find next Thursday
    while (currentDate.getDay() !== 4) {
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Generate 4 expiries
    for (let i = 0; i < 4; i++) {
        const expiryDate = new Date(currentDate);
        const day = String(expiryDate.getDate()).padStart(2, '0');
        const month = String(expiryDate.getMonth() + 1).padStart(2, '0');
        const year = String(expiryDate.getFullYear()).slice(-2);
        expiries.push(`${day}-${month}-20${year}`);
        currentDate.setDate(currentDate.getDate() + 7);
    }
    
    return expiries;
}

// Change symbol
function changeSymbol() {
    const symbolSelect = document.getElementById('symbolSelect');
    currentSymbol = symbolSelect.value;
    document.getElementById('optionChainSymbol').textContent = currentSymbol;
    loadExpiryDates().then(() => {
        loadOptionChain();
    });
}

// Change expiry - automatically loads option chain according to Flattrade PI API docs
// When expiry is selected, server searches for trading symbol with that expiry
// then calls GetOptionChain with the found symbol
function changeExpiry() {
    const expirySelect = document.getElementById('expirySelect');
    const newExpiry = expirySelect.value;
    
    if (!newExpiry || newExpiry === currentExpiry) {
        return; // No change or empty selection
    }
    
    currentExpiry = newExpiry;
    console.log('📅 Expiry changed to:', currentExpiry);
    console.log('🔄 Reloading option chain with new expiry...');
    
    // Show loading state
    const tableBody = document.getElementById('optionChainTableBody') || document.getElementById('optionChainBody');
    if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading option chain for selected expiry...</td></tr>';
    }
    
    // Reload option chain with new expiry
    // Server will: 1) Search for futures symbol with expiry, 2) Call GetOptionChain
    loadOptionChain();
}

// Change strike count
function changeStrikeCount() {
    const strikeCountInput = document.getElementById('strikeCount');
    strikeCount = parseInt(strikeCountInput.value) || 10;
    loadOptionChain();
}

// Load option chain
async function loadOptionChain() {
    try {
        if (!isAuthenticated) {
            const authResult = await checkAuthStatus();
            if (!authResult) {
                showAlert('Please login to view option chain', 'warning');
                return;
            }
        }
        
        const tbody = document.getElementById('optionChainTableBody');
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align:center; padding:40px;">
                    <div style="color:#64748b;">
                        <i class="fas fa-spinner fa-spin"></i> Loading option chain...
                    </div>
                </td>
            </tr>
        `;
        
        console.log('📡 Loading option chain:', { currentSymbol, currentExpiry, strikeCount });
        
        // Get spot price first
        const spotResponse = await fetch(`/api/nifty-price`, { credentials: 'include' });
        if (spotResponse.ok) {
            const spotData = await spotResponse.json();
            const spotPrice = currentSymbol === 'NIFTY' ? (spotData.nifty?.price || 0) : 
                             currentSymbol === 'BANKNIFTY' ? (spotData.banknifty?.price || 0) : 
                             (spotData.finnifty?.price || 0);
            document.getElementById('spotPrice').textContent = `₹${spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        
        // Load option chain from Flattrade with expiry if selected
        // According to Flattrade PI API docs: https://pi.flattrade.in/docs
        // Expiry is embedded in trading symbol, so we pass it to server which will search for the symbol
        let apiUrl = `/api/option-chain?symbol=${currentSymbol}`;
        if (currentExpiry) {
            // Pass expiry in Flattrade format (DDMMMYY) or any format - server will convert
            apiUrl += `&expiry=${encodeURIComponent(currentExpiry)}`;
            console.log('📅 Loading option chain with expiry:', currentExpiry);
        }
        console.log('📡 Fetching option chain from:', apiUrl);
        
        const response = await fetch(apiUrl, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        console.log('📦 Option chain response from Flattrade:', result);
        
        if (result.status === 'error') {
            throw new Error(result.message || result.error || 'Failed to load option chain');
        }
        
        // Update spot price from API response
        if (result.underlyingValue) {
            document.getElementById('spotPrice').textContent = `₹${result.underlyingValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        
        // Don't update expiry dropdown if user already selected one - preserve selection
        // Only update if dropdown is empty or has placeholder
        
        optionChainData = result.data || result.options || result;
        displayOptionChain(optionChainData);
        
    } catch (error) {
        console.error('❌ Error loading option chain:', error);
        showAlert('Error loading option chain: ' + error.message, 'error');
        const tbody = document.getElementById('optionChainTableBody');
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align:center; padding:40px;">
                    <div style="color:#64748b;">
                        <i class="fas fa-exclamation-triangle"></i> Error loading option chain
                    </div>
                </td>
            </tr>
        `;
    }
}

// Display option chain
function displayOptionChain(data) {
    const tbody = document.getElementById('optionChainTableBody');
    
    if (!data || (Array.isArray(data) && data.length === 0)) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align:center; padding:40px;">
                    <div style="color:#64748b;">No option chain data available</div>
                </td>
            </tr>
        `;
        return;
    }
    
    // Parse option chain data from Flattrade
    let options = [];
    if (Array.isArray(data)) {
        options = data;
    } else if (data.values && Array.isArray(data.values)) {
        options = data.values;
    } else if (data.data && Array.isArray(data.data)) {
        options = data.data;
    } else if (data.options && Array.isArray(data.options)) {
        options = data.options;
    }
    
    console.log(`📊 Processing ${options.length} options from Flattrade`);
    
    // Get spot price and ATM strike from API response
    const spotPrice = data.spotPrice || data.underlyingValue || parseFloat(document.getElementById('spotPrice').textContent.replace('₹', '').replace(/,/g, '')) || 24500;
    const atmStrike = data.atmStrike || (Math.round(spotPrice / 50) * 50); // Default 50 interval for NIFTY
    const strikeInterval = data.strikeInterval || 50;
    
    // Update spot price display
    if (data.spotPrice || data.underlyingValue) {
        document.getElementById('spotPrice').textContent = `₹${spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    
    console.log(`💰 Spot: ${spotPrice}, ATM Strike: ${atmStrike}, Interval: ${strikeInterval}`);
    
    // Group by strike price
    const strikeMap = new Map();
    
    options.forEach(opt => {
        // Handle Flattrade API field names
        const strike = parseFloat(opt.strike || opt.strprc || opt.strikePrice || 0);
        if (strike <= 0) return; // Skip invalid strikes
        
        // Round strike to nearest interval (50 for NIFTY) to ensure proper grouping
        const roundedStrike = Math.round(strike / strikeInterval) * strikeInterval;
        
        if (!strikeMap.has(roundedStrike)) {
            strikeMap.set(roundedStrike, { strike: roundedStrike, ce: null, pe: null });
        }
        
        // Handle Flattrade option type field names
        const optionType = (opt.opttyp || opt.optionType || opt.type || '').toUpperCase();
        if (optionType === 'CE' || optionType.includes('CALL') || optionType === 'C') {
            strikeMap.get(roundedStrike).ce = opt;
        } else if (optionType === 'PE' || optionType.includes('PUT') || optionType === 'P') {
            strikeMap.get(roundedStrike).pe = opt;
        }
    });
    
    // Sort strikes
    const sortedStrikes = Array.from(strikeMap.keys()).sort((a, b) => a - b);
    
    // Use ATM strike from API or find closest to spot
    const calculatedAtmStrike = atmStrike || sortedStrikes.reduce((prev, curr) => 
        Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice) ? curr : prev
    );
    
    console.log(`🎯 ATM Strike: ${calculatedAtmStrike} (from ${sortedStrikes.length} total strikes)`);
    
    // Display around ATM (center on ATM strike)
    const atmIndex = sortedStrikes.indexOf(calculatedAtmStrike);
    const startIndex = Math.max(0, atmIndex >= 0 ? atmIndex - Math.floor(strikeCount / 2) : 0);
    const endIndex = Math.min(sortedStrikes.length, startIndex + strikeCount);
    const displayStrikes = sortedStrikes.slice(startIndex, endIndex);
    
    console.log(`📊 Displaying ${displayStrikes.length} strikes (${startIndex} to ${endIndex}) around ATM ${calculatedAtmStrike}`);
    
    let html = '';
    displayStrikes.forEach(strike => {
        const row = strikeMap.get(strike);
        // Check if strike is ATM (within one interval of spot price)
        const isATM = Math.abs(strike - spotPrice) <= strikeInterval;
        
        // Handle Flattrade API field names
        const ceLtp = row.ce ? (parseFloat(row.ce.ltp || row.ce.LTP || row.ce.lastPrice || row.ce.price || 0)).toFixed(2) : '--';
        const ceOi = row.ce ? formatNumber(row.ce.oi || row.ce.OI || row.ce.openInterest || row.ce.intoi || 0) : '--';
        const ceVolume = row.ce ? formatNumber(row.ce.vol || row.ce.volume || row.ce.VOLUME || row.ce.trdqty || 0) : '--';
        
        const peLtp = row.pe ? (parseFloat(row.pe.ltp || row.pe.LTP || row.pe.lastPrice || row.pe.price || 0)).toFixed(2) : '--';
        const peOi = row.pe ? formatNumber(row.pe.oi || row.pe.OI || row.pe.openInterest || row.pe.intoi || 0) : '--';
        const peVolume = row.pe ? formatNumber(row.pe.vol || row.pe.volume || row.pe.VOLUME || row.pe.trdqty || 0) : '--';
        
        const strikeClass = isATM ? 'strike-price' : '';
        const strikeStyle = isATM ? 'background:rgba(99, 102, 241, 0.2); font-weight:700;' : '';
        
        html += `
            <tr>
                <td class="${strikeClass}" style="${strikeStyle}">${strike}</td>
                <td class="ce-price">${ceLtp}</td>
                <td>${ceOi}</td>
                <td>${ceVolume}</td>
                <td>
                    ${row.ce ? `<button class="btn-buy-small" onclick="addToBasketFromChain('${strike}', 'CE', 'BUY', ${ceLtp !== '--' ? ceLtp : 0})">Buy</button>` : '--'}
                </td>
                <td>
                    ${row.ce ? `<button class="btn-sell-small" onclick="addToBasketFromChain('${strike}', 'CE', 'SELL', ${ceLtp !== '--' ? ceLtp : 0})">Sell</button>` : '--'}
                </td>
                <td>
                    ${row.pe ? `<button class="btn-buy-small" onclick="addToBasketFromChain('${strike}', 'PE', 'BUY', ${peLtp !== '--' ? peLtp : 0})">Buy</button>` : '--'}
                </td>
                <td>${peOi}</td>
                <td class="pe-price">${peLtp}</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

// Format number
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

// Add to basket from option chain
function addToBasketFromChain(strike, optionType, trantype, ltp) {
    if (!isAuthenticated) {
        showAlert('Please login to add orders to basket', 'warning');
        return;
    }
    
    // Show order modal
    openOrderModal(strike, optionType, trantype, ltp);
}

// Open order modal
function openOrderModal(strike, optionType, trantype, ltp) {
    const modal = document.getElementById('orderModal');
    const content = document.getElementById('orderModalContent');
    
    const tradingSymbol = `${currentSymbol}${currentExpiry.replace(/-/g, '')}${strike}${optionType}`;
    
    content.innerHTML = `
        <div style="margin-bottom:16px;">
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:4px;">Symbol</div>
            <div style="font-weight:700; color:var(--text-primary);">${tradingSymbol}</div>
        </div>
        <div style="margin-bottom:16px;">
            <label style="font-size:12px; color:var(--text-muted); margin-bottom:4px; display:block;">Quantity:</label>
            <input type="number" id="orderQuantity" value="50" min="1" style="width:100%; padding:8px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:6px; color:var(--text-primary);">
        </div>
        <div style="margin-bottom:16px;">
            <label style="font-size:12px; color:var(--text-muted); margin-bottom:4px; display:block;">Order Type:</label>
            <select id="orderType" style="width:100%; padding:8px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:6px; color:var(--text-primary);">
                <option value="Market">Market</option>
                <option value="Limit">Limit</option>
            </select>
        </div>
        <div id="priceContainer" style="margin-bottom:16px; display:none;">
            <label style="font-size:12px; color:var(--text-muted); margin-bottom:4px; display:block;">Price:</label>
            <input type="number" id="orderPrice" value="${ltp}" step="0.05" style="width:100%; padding:8px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:6px; color:var(--text-primary);">
        </div>
        <div style="margin-bottom:16px;">
            <label style="font-size:12px; color:var(--text-muted); margin-bottom:4px; display:block;">Product:</label>
            <select id="orderProduct" style="width:100%; padding:8px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:6px; color:var(--text-primary);">
                <option value="MIS">MIS</option>
                <option value="NRML">NRML</option>
            </select>
        </div>
        <div style="display:flex; gap:8px; margin-top:20px;">
            <button class="btn btn-success" style="flex:1;" onclick="confirmAddToBasket('${strike}', '${optionType}', '${trantype}', '${tradingSymbol}')">
                Add to Basket
            </button>
            <button class="btn btn-outline-light" style="flex:1;" onclick="closeOrderModal()">
                Cancel
            </button>
        </div>
    `;
    
    // Show/hide price input based on order type
    document.getElementById('orderType').addEventListener('change', function() {
        document.getElementById('priceContainer').style.display = this.value === 'Limit' ? 'block' : 'none';
    });
    
    modal.style.display = 'flex';
}

// Close order modal
function closeOrderModal() {
    document.getElementById('orderModal').style.display = 'none';
}

// Confirm add to basket
function confirmAddToBasket(strike, optionType, trantype, tradingSymbol) {
    const quantity = parseInt(document.getElementById('orderQuantity').value) || 50;
    const orderType = document.getElementById('orderType').value;
    const price = orderType === 'Limit' ? parseFloat(document.getElementById('orderPrice').value) : null;
    const product = document.getElementById('orderProduct').value;
    
    const order = {
        id: Date.now(),
        symbol: currentSymbol,
        tradingSymbol: tradingSymbol,
        strikePrice: parseFloat(strike),
        optionType: optionType,
        expiry: currentExpiry,
        trantype: trantype === 'BUY' ? 'B' : 'S',
        quantity: quantity,
        orderType: orderType,
        price: price,
        product: product,
        validity: 'DAY',
        exchange: 'NFO',
        timestamp: new Date().toLocaleTimeString()
    };
    
    basketOrders.push(order);
    updateBasketDisplay();
    closeOrderModal();
    showAlert(`Added ${trantype} order to basket: ${tradingSymbol}`, 'success');
}

// Update basket display
function updateBasketDisplay() {
    const count = basketOrders.length;
    document.getElementById('basketCountHeader').textContent = count;
    document.getElementById('basketCountBadge').textContent = count;
    
    // Store in localStorage to sync with main page
    localStorage.setItem('basketOrders', JSON.stringify(basketOrders));
}

// View basket
function viewBasket() {
    window.location.href = 'index.html';
}

// Refresh option chain
async function refreshOptionChain() {
    await loadOptionChain();
}

// Show alert
function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return;
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show`;
    alertDiv.style.cssText = `
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
        color: white;
        border: none;
        border-radius: 8px;
        padding: 12px 16px;
        margin-bottom: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close" style="filter: brightness(0) invert(1);"></button>
    `;
    
    alertContainer.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.remove();
    }, 3000);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    initTheme();
    await checkAuthStatus();
    
    // Load basket from localStorage
    const savedBasket = localStorage.getItem('basketOrders');
    if (savedBasket) {
        try {
            basketOrders = JSON.parse(savedBasket);
            updateBasketDisplay();
        } catch (e) {
            console.error('Error loading basket:', e);
        }
    }
    
    await loadExpiryDates();
    await loadOptionChain();
    
    // Auto-refresh every 30 seconds
    setInterval(async () => {
        if (isAuthenticated) {
            await loadOptionChain();
        }
    }, 30000);
});

