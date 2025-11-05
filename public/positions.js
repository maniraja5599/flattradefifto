// Global variables
let isAuthenticated = false;
let currentUser = null;

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
            if (!data.message || !data.message.includes('login')) {
                showAlert('Please login to view positions', 'warning');
            }
            return false;
        }
    } catch (error) {
        console.error('❌ Auth check error:', error);
        isAuthenticated = false;
        currentUser = null;
        return false;
    }
}

// Load positions
async function loadPositions() {
    try {
        if (!isAuthenticated) {
            const authResult = await checkAuthStatus();
            if (!authResult) {
                document.getElementById('positionsTableBody').innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align:center; padding:40px;">
                            <div class="empty-state">
                                <i class="fas fa-exclamation-triangle"></i>
                                <div style="font-size:14px; color:#64748b;">Please login to view positions</div>
                            </div>
                        </td>
                    </tr>
                `;
                return;
            }
        }
        
        console.log('📡 Loading positions...');
        showAlert('Loading positions...', 'info');
        
        const response = await fetch('/api/positions', { credentials: 'include' });
        
        if (!response.ok) {
            if (response.status === 401) {
                isAuthenticated = false;
                showAlert('Session expired. Please login again.', 'warning');
                document.getElementById('positionsTableBody').innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align:center; padding:40px;">
                            <div class="empty-state">
                                <i class="fas fa-exclamation-triangle"></i>
                                <div style="font-size:14px; color:#64748b;">Please login to view positions</div>
                            </div>
                        </td>
                    </tr>
                `;
                return;
            }
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        console.log('📦 Positions API response:', JSON.stringify(result, null, 2));
        
        let positions = [];
        
        // Handle different response formats from server
        if (result.status === 'error') {
            console.error('❌ Server error:', result.message || result.error);
            showAlert(result.message || 'Error loading positions', 'error');
            positions = [];
        } else if (result.stat === 'Not_Ok' || result.stat === 'not_ok') {
            console.log('⚠️ API returned Not_Ok:', result.emsg || result.message);
            positions = [];
            // Show message if no positions
            if (result.message && result.message.includes('No positions')) {
                console.log('ℹ️ No positions found (this is normal if you have no open positions)');
            }
        } else {
            // Server returns { status: 'success', data: [...] }
            if (result.status === 'success') {
                if (Array.isArray(result.data)) {
                    positions = result.data;
                    console.log(`✅ Found ${positions.length} positions in result.data`);
                } else if (result.data && typeof result.data === 'object') {
                    // Single position object
                    positions = [result.data];
                    console.log(`✅ Found single position object`);
                } else {
                    positions = [];
                    console.log('⚠️ result.status is success but result.data is not an array');
                }
            } else if (Array.isArray(result.data)) {
                positions = result.data;
                console.log(`✅ Found ${positions.length} positions in result.data (direct array)`);
            } else if (Array.isArray(result.values)) {
                positions = result.values;
                console.log(`✅ Found ${positions.length} positions in result.values`);
            } else if (Array.isArray(result)) {
                // Response is directly an array
                positions = result;
                console.log(`✅ Response is direct array with ${positions.length} positions`);
            } else if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
                // Single position object
                positions = [result.data];
                console.log(`✅ Found single position object in result.data`);
            } else {
                console.warn('⚠️ Unexpected response format. Full result:', result);
                console.warn('⚠️ Result keys:', Object.keys(result || {}));
                positions = [];
            }
        }
        
        console.log(`📊 Raw positions count: ${positions.length}`);
        console.log('📊 Sample position:', positions.length > 0 ? positions[0] : 'No positions');
        
        // Filter out positions with zero quantity (only show open positions)
        // Also handle case where we want to show all positions (including closed ones)
        const openPositions = positions.filter(pos => {
            if (!pos || typeof pos !== 'object') {
                console.log('⚠️ Invalid position object:', pos);
                return false;
            }
            
            const netQty = parseFloat(pos.netqty || pos.NETQTY || pos.daybuyqty || 0);
            const hasQty = netQty !== 0 && !isNaN(netQty);
            
            // Log details for debugging
            const symbol = pos.tsym || pos.TSYM || pos.symbol || 'Unknown';
            if (!hasQty) {
                console.log(`⚠️ Filtered out position with zero qty: ${symbol} (netqty=${netQty})`);
            } else {
                console.log(`✅ Keeping position: ${symbol}, netqty=${netQty}`);
            }
            return hasQty;
        });
        
        console.log(`📊 Raw positions: ${positions.length}, Open positions: ${openPositions.length}`);
        
        // Show all positions if no open positions but we have some positions
        const positionsToDisplay = openPositions.length > 0 ? openPositions : positions;
        
        displayPositions(positionsToDisplay);
        
    } catch (error) {
        console.error('❌ Error loading positions:', error);
        showAlert('Error loading positions: ' + error.message, 'error');
        document.getElementById('positionsTableBody').innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:40px;">
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <div style="font-size:14px; color:#64748b;">Error loading positions</div>
                        <div style="font-size:12px; color:#64748b; margin-top:8px;">${error.message}</div>
                    </div>
                </td>
            </tr>
        `;
    }
}

// Display positions in table
function displayPositions(positions) {
    const tbody = document.getElementById('positionsTableBody');
    
    if (!positions || positions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:40px;">
                    <div class="empty-state">
                        <i class="fas fa-chart-line"></i>
                        <div style="font-size:14px; color:#64748b;">No open positions</div>
                    </div>
                </td>
            </tr>
        `;
        document.getElementById('totalPnL').textContent = '₹0.00';
        document.getElementById('totalPnL').style.color = 'var(--text-primary)';
        return;
    }
    
    let totalPnL = 0;
    let html = '';
    
    positions.forEach((position, index) => {
        // Debug log first position
        if (index === 0) {
            console.log('📊 Sample position object:', position);
            console.log('📊 Position keys:', Object.keys(position || {}));
        }
        
        const symbol = position.tsym || position.TSYM || position.symbol || position.instrument || 'N/A';
        const netQty = parseFloat(position.netqty || position.NETQTY || position.daybuyqty || position.netqty || 0);
        const avgPrice = parseFloat(position.netavgprc || position.NETAVGPRC || position.avgprc || position.AVGPRC || position.netavgprc || 0);
        const ltp = parseFloat(position.lp || position.LP || position.ltp || position.LTP || position.lastprice || 0);
        const realizedPnL = parseFloat(position.rpnl || position.RPNL || position.realizedpnl || 0);
        const unrealizedPnL = parseFloat(position.urmtom || position.URMTOM || position.upnl || position.UPNL || position.unrealizedpnl || 0);
        const positionPnL = realizedPnL + unrealizedPnL;
        
        totalPnL += positionPnL;
        
        // Debug log for each position
        if (index === 0) {
            console.log(`📊 Position ${index + 1} parsed:`, {
                symbol,
                netQty,
                avgPrice,
                ltp,
                realizedPnL,
                unrealizedPnL,
                positionPnL
            });
        }
        
        const qtyClass = netQty > 0 ? 'quantity-positive' : 'quantity-negative';
        const qtySign = netQty > 0 ? '+' : '';
        
        html += `
            <tr>
                <td style="font-weight:600; color:var(--text-primary);">${symbol}</td>
                <td class="${qtyClass}">${qtySign}${netQty}</td>
                <td style="color:var(--text-secondary);">₹${avgPrice.toFixed(2)}</td>
                <td style="color:var(--text-secondary);">₹${ltp.toFixed(2)}</td>
                <td class="${realizedPnL >= 0 ? 'price-positive' : 'price-negative'}">
                    ₹${realizedPnL.toFixed(2)}
                </td>
                <td class="${unrealizedPnL >= 0 ? 'price-positive' : 'price-negative'}">
                    ₹${unrealizedPnL.toFixed(2)}
                </td>
                <td class="${positionPnL >= 0 ? 'price-positive' : 'price-negative'}" style="font-weight:700;">
                    ₹${positionPnL.toFixed(2)}
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    // Update total P&L
    const totalPnLEl = document.getElementById('totalPnL');
    totalPnLEl.textContent = `₹${totalPnL.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    totalPnLEl.style.color = totalPnL >= 0 ? '#10b981' : '#ef4444';
    
    console.log(`💰 Total P&L: ₹${totalPnL.toFixed(2)}`);
}

// Refresh positions
async function refreshPositions() {
    await loadPositions();
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
    await loadPositions();
    
    // Auto-refresh positions every 30 seconds
    setInterval(async () => {
        if (isAuthenticated) {
            await loadPositions();
        }
    }, 30000);
});

