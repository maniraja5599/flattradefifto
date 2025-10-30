const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const puppeteer = require('puppeteer');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(cookieParser());
app.use(bodyParser.json());
app.use(express.static('public'));

// Flattrade API Configuration
const FLATTRADE_BASE_URL = 'https://piconnect.flattrade.in/PiConnectTP';
const FLATTRADE_AUTH_URL = 'https://auth.flattrade.in';

// Pre-configured credentials (stored securely in production)
const DEFAULT_CREDENTIALS = {
    userId: 'FT003862',
    password: 'Weare@6',
    totp: '17111992',
    apiKey: '2475be2c2a5843fa8da2f53c55330619',
    apiSecret: '2025.dd4e574e686741f7b62e162c06e7bc5a6c9e9036bcafa3a5'
};

// Global session variables
let latestSessionId = null;
let userSessions = new Map();

// Store session data (in production, use proper session management)
let sessionData = {
    userId: '',
    sessionToken: '',
    isLoggedIn: false
};

// Session persistence file
const SESSION_FILE = path.join(__dirname, 'session.json');

// Helper function to ensure session cookie is set - SIMPLIFIED FOR FRESH LOGIN
function ensureSessionCookie(req, res) {
    let sessionId = req.cookies.sessionId;
    
    // If no cookie but we have a saved session, use that one
    if (!sessionId && userSessions.size > 0) {
        // Get the first authenticated session
        for (const [id, session] of userSessions.entries()) {
            if (session.isAuthenticated) {
                sessionId = id;
                // Set the cookie for future requests
                res.cookie('sessionId', sessionId, { 
                    httpOnly: true, 
                    maxAge: 24 * 60 * 60 * 1000,
                    sameSite: 'lax'
                });
                console.log('🔄 Auto-assigned existing session:', sessionId);
                break;
            }
        }
    }
    
    return sessionId;
}

// Load saved session on startup
function loadSavedSession() {
    try {
        if (fs.existsSync('./session.json')) {
            const sessionFile = JSON.parse(fs.readFileSync('./session.json', 'utf8'));
            
            // Handle new format { sessionId, data: {...} }
            if (sessionFile.sessionId && sessionFile.data) {
                // Ensure loginTime is stored as ISO string for consistency
                if (sessionFile.data.loginTime instanceof Date) {
                    sessionFile.data.loginTime = sessionFile.data.loginTime.toISOString();
                }
                userSessions.set(sessionFile.sessionId, sessionFile.data);
                console.log('✅ Loaded session for user:', sessionFile.data.userId);
                return sessionFile.sessionId;
            }
            
            // Handle old format { sessionId, userId, jKey, ... }
            if (sessionFile.sessionId && sessionFile.userId && sessionFile.jKey) {
                const sessionData = {
                    userId: sessionFile.userId,
                    jKey: sessionFile.jKey,
                    clientId: sessionFile.clientId || sessionFile.userId,
                    isAuthenticated: true,
                    loginTime: sessionFile.timestamp || new Date().toISOString(),
                    apiKey: DEFAULT_CREDENTIALS.apiKey,
                    apiSecret: DEFAULT_CREDENTIALS.apiSecret
                };
                userSessions.set(sessionFile.sessionId, sessionData);
                console.log('✅ Loaded old format session for user:', sessionFile.userId);
                // Re-save in new format
                saveSession(sessionFile.sessionId, sessionData);
                return sessionFile.sessionId;
            }
        }
    } catch (error) {
        console.error('Error loading session:', error);
    }
    return false;
}

// Save session to file
function saveSession(sessionId, sessionData) {
    try {
        fs.writeFileSync('./session.json', JSON.stringify({
            sessionId,
            data: sessionData
        }, null, 2));
        console.log('✅ Session saved for user:', sessionData.userId);
    } catch (error) {
        console.error('Error saving session:', error);
    }
}

// Routes

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// OAuth callback endpoint - Phase 2: Handle redirect and get access token
app.get('/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        
        console.log('OAuth callback received:', { code: code ? 'provided' : 'missing', state });
        
        if (!code) {
            return res.status(400).send('Authorization code not provided');
        }
        
        // Find the most recent session (since we can't rely on cookies in OAuth flow)
        let latestSession = null;
        let latestSessionId = null;
        let latestTime = 0;
        
        for (const [sessionId, session] of userSessions.entries()) {
            const loginTime = session.loginTime instanceof Date ? session.loginTime : new Date(session.loginTime || 0);
            if (loginTime && loginTime.getTime() > latestTime && !session.isAuthenticated) {
                latestTime = loginTime.getTime();
                latestSession = session;
                latestSessionId = sessionId;
            }
        }
        
        if (!latestSession) {
            return res.send(`
                <html>
                    <head><title>Authentication Error</title></head>
                    <body>
                        <h3>Authentication Error</h3>
                        <p>No pending session found. Please go back to the main application and try logging in again.</p>
                        <p><a href="/">Return to Application</a></p>
                    </body>
                </html>
            `);
        }
        
        // Generate API secret hash: SHA-256 of (api_key + request_code + api_secret)
        const hashString = latestSession.apiKey + code + latestSession.apiSecret;
        const hashedSecret = crypto.createHash('sha256').update(hashString).digest('hex');
        
        console.log('Requesting access token for user:', latestSession.userId);
        
        // Exchange request_code for access token
        const tokenResponse = await axios.post('https://authapi.flattrade.in/trade/apitoken', {
            api_key: latestSession.apiKey,
            request_code: code,
            api_secret: hashedSecret
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Token response:', tokenResponse.data);
        
        if (tokenResponse.data.stat === 'Ok') {
            // Update session with access token
            latestSession.jKey = tokenResponse.data.token;
            latestSession.clientId = tokenResponse.data.client;
            latestSession.isAuthenticated = true;
            userSessions.set(latestSessionId, latestSession);
            
            // Save session to file for persistence
            saveSession(latestSessionId, latestSession);
            
            console.log('Authentication successful for user:', latestSession.userId);
            
            // Set session cookie so the main app can access it
            res.cookie('sessionId', latestSessionId, { 
                httpOnly: true, 
                maxAge: 24 * 60 * 60 * 1000, // 24 hours
                sameSite: 'lax'
            });
            
            // Return success page with auto-redirect and session info
            res.send(`
                <html>
                    <head>
                        <title>Authentication Successful</title>
                        <script>
                            // Store session ID in localStorage for the main app
                            localStorage.setItem('sessionId', '${latestSessionId}');
                            
                            setTimeout(() => {
                                if (window.opener) {
                                    window.opener.postMessage({
                                        type: 'auth_success',
                                        sessionId: '${latestSessionId}',
                                        userId: '${latestSession.userId}'
                                    }, '*');
                                }
                                window.close();
                            }, 2000);
                        </script>
                    </head>
                    <body>
                        <h3>✅ Authentication Successful!</h3>
                        <p><strong>User:</strong> ${latestSession.userId}</p>
                        <p><strong>Client ID:</strong> ${tokenResponse.data.client}</p>
                        <p><strong>Session ID:</strong> ${latestSessionId}</p>
                        <p>🔄 This window will close automatically. Return to the main application.</p>
                        <p><a href="/">Return to Application</a></p>
                    </body>
                </html>
            `);
        } else {
            console.error('Token exchange failed:', tokenResponse.data);
            res.send(`
                <html>
                    <head><title>Authentication Failed</title></head>
                    <body>
                        <h3>Authentication Failed</h3>
                        <p>Error: ${tokenResponse.data.emsg || 'Authentication failed'}</p>
                        <p><a href="/">Return to Application</a></p>
                    </body>
                </html>
            `);
        }
        
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.send(`
            <html>
                <head><title>Authentication Error</title></head>
                <body>
                    <h3>Authentication Error</h3>
                    <p>Error: ${error.message}</p>
                    <p><a href="/">Return to Application</a></p>
                </body>
            </html>
        `);
    }
});

// Place GTT OCO (stop-loss and target) linked to a position
app.post('/api/place-gtt-oco', async (req, res) => {
    try {
        const { order } = req.body;
        const sessionId = ensureSessionCookie(req, res);
        if (!sessionId || !userSessions.has(sessionId)) {
            return res.json({ success: false, error: 'Not authenticated. Please login first.' });
        }
        const session = userSessions.get(sessionId);
        if (!session.isAuthenticated) {
            return res.json({ success: false, error: 'Authentication incomplete. Please complete OAuth flow.' });
        }

        // Validate inputs
        const sl = order?.gtt?.slTrigger || null;
        const tp = order?.gtt?.tpTrigger || null;
        if (!sl && !tp) {
            return res.json({ success: false, error: 'At least one trigger (SL or TP) is required for GTT OCO.' });
        }

        console.log('📤 [GTT_OCO] Placing order with GTT:', {
            user: session.userId,
            orderSummary: {
                symbol: order.symbol,
                tradingSymbol: order.tradingSymbol,
                qty: order.quantity,
                side: order.trantype,
                slTrigger: sl,
                tpTrigger: tp
            }
        });

        // Get trading symbol
        let tradingSymbol = order.tradingSymbol;
        if (!tradingSymbol) {
            // Generate trading symbol
            const expirySelect = order.expiry || new Date().toISOString().split('T')[0];
            const expiryDate = new Date(expirySelect + 'T00:00:00');
            const day = expiryDate.getDate().toString().padStart(2, '0');
            const month = expiryDate.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
            const year = expiryDate.getFullYear().toString().slice(-2);
            const optionTypeCode = order.optionType ? order.optionType.charAt(0) : 'C';
            tradingSymbol = `${order.symbol}${day}${month}${year}${optionTypeCode}${order.strikePrice}`;
        }

        // Validate symbol by searching - CRITICAL: Must use exact format from FlatTrade
        try {
            console.log(`🔍 Validating trading symbol: ${tradingSymbol}`);
            const searchData = { uid: session.userId, stext: tradingSymbol };
            const searchResponse = await axios.post(`${FLATTRADE_BASE_URL}/SearchScrip`, 
                `jData=${JSON.stringify(searchData)}&jKey=${session.jKey}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            
            if (searchResponse.data.stat === 'Ok' && searchResponse.data.values?.length > 0) {
                // Try exact match first
                let exactMatch = searchResponse.data.values.find(item => 
                    item.exch === 'NFO' && item.tsym?.toUpperCase() === tradingSymbol.toUpperCase()
                );
                
                // If no exact match, try to find by strike price and option type
                if (!exactMatch && order.strikePrice) {
                    const strikeStr = order.strikePrice.toString();
                    const optionTypeCode = order.optionType ? order.optionType.charAt(0) : 'C';
                    exactMatch = searchResponse.data.values.find(item => 
                        item.exch === 'NFO' && 
                        item.tsym?.includes(strikeStr) &&
                        item.tsym?.includes(optionTypeCode)
                    );
                }
                
                if (exactMatch) {
                    tradingSymbol = exactMatch.tsym; // Use exact format from FlatTrade
                    console.log(`✅ Symbol validated: ${tradingSymbol} (Token: ${exactMatch.token})`);
                } else {
                    console.warn(`⚠️ No exact match found for ${tradingSymbol}`);
                    console.log(`📋 Available symbols:`, searchResponse.data.values.slice(0, 5).map(v => `${v.tsym} (${v.exch})`));
                }
            } else {
                console.warn(`⚠️ Symbol search returned no results for: ${tradingSymbol}`);
            }
        } catch (searchError) {
            console.error('❌ Symbol validation error:', searchError.response?.data || searchError.message);
        }

        const results = {
            mainOrder: null, // Not placing main order - only GTT alerts
            slOrder: null,
            tpOrder: null
        };

        // Place only GTT orders (alerts) - no main order
        console.log('📤 Placing GTT orders only (no main order)');

        // Step 1: Place SL GTT Alert if provided
        if (sl) {
            try {
                // Determine opposite side for SL: if BUY, SL is SELL; if SELL, SL is BUY
                const slTrantype = order.trantype === 'B' ? 'S' : 'B';
                
                // According to Flattrade API docs:
                // - For SL: trigger when LTP goes BELOW trigger price (LTP_BOS = Last Traded Price Below Or Same)
                // - Use alerttype: 'LTP' with alertval as trigger price
                // - Alternative format: ai_t: 'LTP_BOS' with d: trigger price
                const slAlertData = {
                    uid: session.userId,
                    actid: session.userId,
                    exch: 'NFO',
                    tsym: tradingSymbol,
                    ai_t: 'LTP_BOS', // Alert Type - Last Traded Price Below Or Same (triggers when LTP <= trigger)
                    validity: 'GTT', // GTT validity (1-year)
                    d: sl.toString(), // Data to be compared with LTP (trigger price - when LTP goes below/equal this)
                    prc: sl.toString(), // Limit price for the order to be placed
                    qty: order.quantity.toString(),
                    prd: order.product === 'MIS' ? 'I' : (order.product === 'NRML' ? 'M' : 'I'),
                    trantype: slTrantype, // Opposite side to exit position
                    prctyp: 'LMT', // Limit order type
                    ret: 'DAY', // Retention type (or 'GTT' for GTT orders)
                    dscqty: '0', // Disclosed quantity (required)
                    remarks: 'SL GTT', // Remarks (required)
                    ordersource: 'API'
                    // Note: Alternative format according to docs:
                    // alerttype: 'LTP', alertval: sl.toString() - but current format works
                };

                console.log('📤 Setting SL GTT Alert:', JSON.stringify(slAlertData, null, 2));
                const slResponse = await axios.post(`${FLATTRADE_BASE_URL}/PlaceGTTOrder`, 
                    `jData=${JSON.stringify(slAlertData)}&jKey=${session.jKey}`,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );

                console.log('📥 SL GTT Alert Response:', JSON.stringify(slResponse.data, null, 2));

                // PlaceGTTOrder returns an array with response object
                const slRespData = Array.isArray(slResponse.data) ? slResponse.data[0] : slResponse.data;
                
                if (slRespData && (slRespData.stat === 'Ok' || slRespData.stat === 'Oi created')) {
                    const alertId = slRespData.Al_id || slRespData.al_id; // Alert ID (capital A in response)
                    results.slOrder = {
                        orderId: alertId,
                        success: true
                    };
                    console.log(`✅ SL GTT Alert set: ${alertId}`);
                } else {
                    const errorMsg = slRespData?.emsg || slRespData?.error || slRespData?.stat || JSON.stringify(slResponse.data);
                    console.error(`❌ SL GTT Alert failed:`, errorMsg);
                    console.error(`Full response:`, JSON.stringify(slResponse.data, null, 2));
                    console.error(`Response stat:`, slRespData?.stat);
                    console.error(`Response emsg:`, slRespData?.emsg);
                    results.slOrder = {
                        success: false,
                        error: `SL GTT: ${errorMsg || 'SL GTT Alert failed'}`
                    };
                }
            } catch (slError) {
                const errorData = slError.response?.data;
                const errorMsg = errorData?.emsg || (Array.isArray(errorData) ? errorData[0]?.emsg : null) || slError.message;
                console.error('❌ SL GTT Alert error:', errorMsg);
                console.error('Full error response:', JSON.stringify(errorData || slError.message, null, 2));
                results.slOrder = {
                    success: false,
                    error: errorMsg || 'SL GTT Alert failed'
                };
            }
        }

        // Step 2: Place TP GTT Alert if provided
        if (tp) {
            try {
                // TP is opposite side to exit position
                const tpTrantype = order.trantype === 'B' ? 'S' : 'B';
                
                // According to Flattrade API docs:
                // - For TP: trigger when LTP goes ABOVE trigger price (LTP_AOS = Last Traded Price Above Or Same)
                // - Use alerttype: 'LTP' with alertval as trigger price
                // - Alternative format: ai_t: 'LTP_AOS' with d: trigger price
                const tpAlertData = {
                    uid: session.userId,
                    actid: session.userId,
                    exch: 'NFO',
                    tsym: tradingSymbol,
                    ai_t: 'LTP_AOS', // Alert Type - Last Traded Price Above Or Same (triggers when LTP >= trigger)
                    validity: 'GTT', // GTT validity (1-year)
                    d: tp.toString(), // Data to be compared with LTP (trigger price - when LTP goes above/equal this)
                    prc: tp.toString(), // Limit price for the order to be placed
                    qty: order.quantity.toString(),
                    prd: order.product === 'MIS' ? 'I' : (order.product === 'NRML' ? 'M' : 'I'),
                    trantype: tpTrantype, // Opposite side to exit position
                    prctyp: 'LMT', // Limit order type
                    ret: 'DAY', // Retention type (or 'GTT' for GTT orders)
                    dscqty: '0', // Disclosed quantity (required)
                    remarks: 'TP GTT', // Remarks (required)
                    ordersource: 'API'
                    // Note: Alternative format according to docs:
                    // alerttype: 'LTP', alertval: tp.toString() - but current format works
                };

                console.log('📤 Setting TP GTT Alert:', JSON.stringify(tpAlertData, null, 2));
                const tpResponse = await axios.post(`${FLATTRADE_BASE_URL}/PlaceGTTOrder`, 
                    `jData=${JSON.stringify(tpAlertData)}&jKey=${session.jKey}`,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );

                console.log('📥 TP GTT Alert Response:', JSON.stringify(tpResponse.data, null, 2));

                // PlaceGTTOrder returns an array with response object
                const tpRespData = Array.isArray(tpResponse.data) ? tpResponse.data[0] : tpResponse.data;
                
                if (tpRespData && (tpRespData.stat === 'Ok' || tpRespData.stat === 'Oi created')) {
                    const alertId = tpRespData.Al_id || tpRespData.al_id; // Alert ID (capital A in response)
                    results.tpOrder = {
                        orderId: alertId,
                        success: true
                    };
                    console.log(`✅ TP GTT Alert set: ${alertId}`);
                } else {
                    const errorMsg = tpRespData?.emsg || tpRespData?.error || tpRespData?.stat || JSON.stringify(tpResponse.data);
                    console.error(`❌ TP GTT Alert failed:`, errorMsg);
                    console.error(`Full response:`, JSON.stringify(tpResponse.data, null, 2));
                    console.error(`Response stat:`, tpRespData?.stat);
                    console.error(`Response emsg:`, tpRespData?.emsg);
                    results.tpOrder = {
                        success: false,
                        error: `TP GTT: ${errorMsg || 'TP GTT Alert failed'}`
                    };
                }
            } catch (tpError) {
                const errorData = tpError.response?.data;
                const errorMsg = errorData?.emsg || (Array.isArray(errorData) ? errorData[0]?.emsg : null) || tpError.message;
                console.error('❌ TP GTT Alert error:', errorMsg);
                console.error('Full error response:', JSON.stringify(errorData || tpError.message, null, 2));
                results.tpOrder = {
                    success: false,
                    error: errorMsg || 'TP GTT Alert failed'
                };
            }
        }

        // Return results - only GTT orders, no main order
        const allSuccess = (!sl || results.slOrder?.success) && (!tp || results.tpOrder?.success);

        const responseData = {
            success: allSuccess,
            message: allSuccess ? 'GTT alerts placed successfully' : 
                     'Some GTT alerts failed',
            slAlertId: results.slOrder?.orderId || null, // Alert ID for SL GTT
            tpAlertId: results.tpOrder?.orderId || null, // Alert ID for TP GTT
            // Keep old field names for backward compatibility
            slOrderId: results.slOrder?.orderId || null,
            tpOrderId: results.tpOrder?.orderId || null,
            details: results
        };

        // Add error messages if any failed
        if (!allSuccess) {
            const errors = [];
            if (sl && !results.slOrder?.success) {
                errors.push(`SL GTT: ${results.slOrder?.error || 'Failed'}`);
            }
            if (tp && !results.tpOrder?.success) {
                errors.push(`TP GTT: ${results.tpOrder?.error || 'Failed'}`);
            }
            responseData.error = errors.join('; ');
        }

        res.json(responseData);

    } catch (error) {
        console.error('❌ GTT_OCO error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test endpoint to verify API is working
app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'API is working', timestamp: new Date().toISOString() });
});

// Debug endpoint to check Flattrade API methods
app.get('/api/debug-flattrade', async (req, res) => {
    try {
        console.log('Testing various Flattrade endpoints...');
        
        const endpoints = [
            'https://piconnect.flattrade.in',
            'https://auth.flattrade.in',
            'https://flattrade.in'
        ];
        
        const results = [];
        
        for (const endpoint of endpoints) {
            try {
                const response = await axios.get(endpoint, {
                    timeout: 5000,
                    validateStatus: () => true // Accept any status
                });
                results.push({
                    endpoint,
                    status: response.status,
                    reachable: true
                });
            } catch (error) {
                results.push({
                    endpoint,
                    status: error.code || 'UNKNOWN',
                    reachable: false,
                    error: error.message
                });
            }
        }
        
        res.json({ 
            success: true, 
            message: 'Flattrade endpoint test results',
            results,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Test Flattrade API connectivity
app.get('/api/test-flattrade', async (req, res) => {
    try {
        console.log('Testing Flattrade connectivity...');
        
        // Simple connectivity test - just check if we can resolve the domain
        const dns = require('dns').promises;
        await dns.lookup('piconnect.flattrade.in');
        
        console.log('Flattrade domain is reachable');
        
        res.json({ 
            success: true, 
            message: 'Flattrade servers are reachable (DNS resolution successful)',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Flattrade connectivity test failed:', error.message);
        
        res.json({ 
            success: false, 
            error: error.message,
            message: 'Cannot reach Flattrade servers - Check internet connection',
            timestamp: new Date().toISOString()
        });
    }
});

// Generate Flattrade authorization URL
app.post('/api/auth-url', (req, res) => {
    console.log('Auth URL request received:', req.body);
    
    try {
        const { api_key, redirect_url } = req.body;
        
        if (!api_key || !redirect_url) {
            return res.json({ 
                success: false, 
                error: 'API Key and Redirect URL are required' 
            });
        }
        
        // Flattrade authorization URL - Updated to correct format
        const authUrl = `${FLATTRADE_AUTH_URL}/?app_key=${api_key}&redirect_uri=${encodeURIComponent(redirect_url)}&response_type=code&state=sample_state`;
        
        console.log('Generated auth URL:', authUrl);
        
        res.json({ 
            success: true, 
            auth_url: authUrl,
            message: 'Open this URL in browser to authenticate'
        });
    } catch (error) {
        console.error('Auth URL generation error:', error);
        res.json({ success: false, error: error.message });
    }
});

// Get user status endpoint
app.get('/api/user-status', (req, res) => {
    try {
        const sessionId = ensureSessionCookie(req, res);
        
        console.log('User status check - sessionId:', sessionId);
        console.log('Available sessions:', Array.from(userSessions.keys()));
        
        if (!sessionId || !userSessions.has(sessionId)) {
            console.log('No session found for sessionId:', sessionId);
            return res.json({
                authenticated: false,
                message: 'No active session'
            });
        }
        
        const session = userSessions.get(sessionId);
        console.log('Session found:', {
            userId: session.userId,
            isAuthenticated: session.isAuthenticated,
            hasJKey: !!session.jKey
        });
        
        res.json({
            authenticated: session.isAuthenticated,
            userId: session.userId,
            clientId: session.clientId || null,
            loginTime: session.loginTime,
            message: session.isAuthenticated ? 'User authenticated' : 'OAuth pending'
        });
    } catch (error) {
        console.error('User status error:', error);
        res.status(500).json({
            authenticated: false,
            error: 'Failed to get user status: ' + error.message
        });
    }
});

// Login to Flattrade
// Mock option chain generation function
function generateMockOptionChain(symbol, expiry, spotPrice = 19500) {
    const options = [];
    const strikes = [];
    
    // Generate strike prices around spot price
    const baseStrike = Math.round(spotPrice / 100) * 100; // Round to nearest 100
    for (let i = -10; i <= 10; i++) {
        strikes.push(baseStrike + (i * 100));
    }
    
    strikes.forEach(strike => {
        // Call option
        const callPrice = Math.max(1, Math.random() * (spotPrice - strike + 100));
        options.push({
            symbol: `${symbol}${expiry}${strike}CE`,
            strike: strike,
            optionType: 'CE',
            lastPrice: callPrice.toFixed(2),
            change: ((Math.random() - 0.5) * 20).toFixed(2),
            bid: (callPrice - Math.random() * 5).toFixed(2),
            ask: (callPrice + Math.random() * 5).toFixed(2),
            volume: Math.floor(Math.random() * 10000),
            openInterest: Math.floor(Math.random() * 50000),
            impliedVolatility: (15 + Math.random() * 20).toFixed(2)
        });
        
        // Put option
        const putPrice = Math.max(1, Math.random() * (strike - spotPrice + 100));
        options.push({
            symbol: `${symbol}${expiry}${strike}PE`,
            strike: strike,
            optionType: 'PE',
            lastPrice: putPrice.toFixed(2),
            change: ((Math.random() - 0.5) * 20).toFixed(2),
            bid: (putPrice - Math.random() * 5).toFixed(2),
            ask: (putPrice + Math.random() * 5).toFixed(2),
            volume: Math.floor(Math.random() * 10000),
            openInterest: Math.floor(Math.random() * 50000),
            impliedVolatility: (15 + Math.random() * 20).toFixed(2)
        });
    });
    
    return options;
}

// Generate auth URL endpoint
app.post('/api/generate-auth-url', (req, res) => {
    try {
        const sessionId = req.cookies.sessionId;
        
        if (!sessionId || !userSessions.has(sessionId)) {
            return res.json({ 
                success: false, 
                error: 'Please login first to generate auth URL' 
            });
        }
        
        const session = userSessions.get(sessionId);
        const redirectUrl = 'http://localhost:3001/callback?';
        
        // Flattrade authorization URL
        const authUrl = `${FLATTRADE_AUTH_URL}/?app_key=${session.apiKey}&redirect_uri=${encodeURIComponent(redirectUrl)}&response_type=code&state=sample_state`;
        
        console.log('Generated auth URL for user:', session.userId);
        
        res.json({ 
            success: true, 
            authUrl: authUrl,
            message: 'Open this URL to complete authentication'
        });
    } catch (error) {
        console.error('Auth URL generation error:', error);
        res.json({ success: false, error: error.message });
    }
});

// One-click login endpoint
app.post('/api/one-click-login', async (req, res) => {
    try {
        console.log('One-click login initiated');
        
        // Use pre-configured credentials
        const { userId, password, totp, apiKey, apiSecret } = DEFAULT_CREDENTIALS;
        const redirectUrl = 'http://localhost:3001/callback?';
        
        console.log('Using pre-configured credentials for user:', userId);
        
        // Store credentials temporarily
        const sessionId = Date.now().toString();
        userSessions.set(sessionId, {
            userId,
            password,
            totp,
            apiKey,
            apiSecret,
            redirectUrl,
            loginTime: new Date().toISOString(),
            isAuthenticated: false
        });

        console.log('Stored user session for one-click login:', sessionId);
        
        // Generate auth URL
        const authUrl = `${FLATTRADE_AUTH_URL}/?app_key=${apiKey}&redirect_uri=${encodeURIComponent(redirectUrl)}&response_type=code&state=sample_state`;
        
        // Set session ID in response
        res.cookie('sessionId', sessionId, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }); // 24 hours
        
        res.json({
            success: true,
            authUrl: authUrl,
            sessionId: sessionId,
            message: 'One-click login initiated. Opening OAuth flow...',
            data: {
                userId: userId,
                nextStep: 'OAuth flow will open automatically'
            }
        });
    } catch (error) {
        console.error('One-click login error:', error);
        res.status(500).json({
            success: false,
            error: 'One-click login failed: ' + error.message
        });
    }
});

// Auto-OAuth endpoint for automatic form submission
app.post('/api/auto-oauth', async (req, res) => {
    try {
        const sessionId = req.cookies.sessionId;
        
        if (!sessionId || !userSessions.has(sessionId)) {
            return res.status(400).json({
                success: false,
                error: 'No active session found'
            });
        }
        
        const session = userSessions.get(sessionId);
        
        // Return credentials for auto-submission
        res.json({
            success: true,
            credentials: {
                userId: session.userId,
                password: session.password,
                totp: session.totp
            }
        });
    } catch (error) {
        console.error('Auto-OAuth error:', error);
        res.status(500).json({
            success: false,
            error: 'Auto-OAuth failed: ' + error.message
        });
    }
});

// Complete auto OAuth flow - handles everything in background
app.post('/api/complete-auto-oauth', async (req, res) => {
    try {
        const credentials = DEFAULT_CREDENTIALS;
        const redirectUrl = 'http://localhost:3001/callback?';
        
        console.log('Starting complete auto OAuth flow...');
        
        // Store session data
        const sessionId = Date.now().toString();
        userSessions.set(sessionId, {
            userId: credentials.userId,
            password: credentials.password,
            totp: credentials.totp,
            apiKey: credentials.apiKey,
            apiSecret: credentials.apiSecret,
            redirectUrl,
            loginTime: new Date().toISOString(),
            isAuthenticated: false
        });
        
        // Generate OAuth URL
        const state = crypto.randomBytes(16).toString('hex');
        const authUrl = `${FLATTRADE_AUTH_URL}/?app_key=${credentials.apiKey}&redirect_uri=${encodeURIComponent(redirectUrl)}&state=${state}`;
        
        console.log('Generated OAuth URL:', authUrl);
        
        // Store latest session ID for callback
        latestSessionId = sessionId;
        
        // Return instructions for manual OAuth (since auto-fill is blocked by browser security)
        res.json({
            success: true,
            authUrl: authUrl,
            sessionId: sessionId,
            credentials: {
                userId: credentials.userId,
                password: credentials.password,
                totp: credentials.totp
            },
            message: 'OAuth URL generated. Manual form submission required due to browser security.'
        });
        
    } catch (error) {
        console.error('Complete auto OAuth error:', error);
        res.status(500).json({
            success: false,
            error: 'Complete auto OAuth failed: ' + error.message
        });
    }
});

// Serve auto-fill instructions page
app.get('/auto-fill-instructions', (req, res) => {
    const { authUrl } = req.query;
    
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Quick Login Instructions - Flattrade</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }
                .container {
                    background: white;
                    padding: 2rem;
                    border-radius: 10px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    text-align: center;
                    max-width: 500px;
                }
                .credentials {
                    background: #f8f9fa;
                    border: 2px solid #e9ecef;
                    border-radius: 8px;
                    padding: 1rem;
                    margin: 1rem 0;
                    font-family: monospace;
                }
                .credential-item {
                    display: flex;
                    justify-content: space-between;
                    margin: 0.5rem 0;
                    padding: 0.5rem;
                    background: white;
                    border-radius: 4px;
                }
                .copy-btn {
                    background: #007bff;
                    color: white;
                    border: none;
                    padding: 0.25rem 0.5rem;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 0.8rem;
                }
                .copy-btn:hover {
                    background: #0056b3;
                }
                .login-btn {
                    background: #28a745;
                    color: white;
                    border: none;
                    padding: 1rem 2rem;
                    border-radius: 8px;
                    font-size: 1.1rem;
                    cursor: pointer;
                    text-decoration: none;
                    display: inline-block;
                    margin: 1rem 0;
                }
                .login-btn:hover {
                    background: #218838;
                }
                .steps {
                    text-align: left;
                    margin: 1rem 0;
                }
                .step {
                    margin: 0.5rem 0;
                    padding: 0.5rem;
                    border-left: 3px solid #007bff;
                    background: #f8f9fa;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🚀 Quick Login to Flattrade</h2>
                <p>Your credentials are ready! Follow these simple steps:</p>
                
                <div class="credentials">
                    <h4>Your Login Credentials:</h4>
                    <div class="credential-item">
                        <span><strong>User ID:</strong> ${DEFAULT_CREDENTIALS.userId}</span>
                        <button class="copy-btn" onclick="copyToClipboard('${DEFAULT_CREDENTIALS.userId}')">Copy</button>
                    </div>
                    <div class="credential-item">
                        <span><strong>Password:</strong> ${DEFAULT_CREDENTIALS.password}</span>
                        <button class="copy-btn" onclick="copyToClipboard('${DEFAULT_CREDENTIALS.password}')">Copy</button>
                    </div>
                    <div class="credential-item">
                        <span><strong>TOTP/OTP:</strong> ${DEFAULT_CREDENTIALS.totp}</span>
                        <button class="copy-btn" onclick="copyToClipboard('${DEFAULT_CREDENTIALS.totp}')">Copy</button>
                    </div>
                </div>
                
                <div class="steps">
                    <div class="step">📋 <strong>Step 1:</strong> Copy credentials using buttons above</div>
                    <div class="step">🔗 <strong>Step 2:</strong> Click "Login to Flattrade" below</div>
                    <div class="step">📝 <strong>Step 3:</strong> Paste credentials in the form</div>
                    <div class="step">✅ <strong>Step 4:</strong> Click LOGIN button</div>
                </div>
                
                <a href="${authUrl}" target="_blank" class="login-btn">
                    🚀 Login to Flattrade
                </a>
                
                <p style="font-size: 0.9rem; color: #666; margin-top: 1rem;">
                    After successful login, you'll be redirected back to the trading interface automatically.
                </p>
            </div>
            
            <script>
                function copyToClipboard(text) {
                    navigator.clipboard.writeText(text).then(() => {
                        // Visual feedback
                        event.target.textContent = 'Copied!';
                        setTimeout(() => {
                            event.target.textContent = 'Copy';
                        }, 1000);
                    });
                }
                
                // Listen for authentication success
                window.addEventListener('message', function(event) {
                    if (event.data === 'auth_success') {
                        alert('Authentication successful! Redirecting to trading interface...');
                        window.close();
                    }
                });
            </script>
        </body>
        </html>
    `);
});

// Check if we have a valid saved session
app.get('/api/check-session', (req, res) => {
    try {
        const hasValidSession = loadSavedSession();
        
        if (hasValidSession && latestSession && latestSession.isAuthenticated) {
            res.json({
                success: true,
                hasValidSession: true,
                userId: latestSession.userId,
                message: 'Valid session found'
            });
        } else {
            res.json({
                success: true,
                hasValidSession: false,
                message: 'No valid session found'
            });
        }
    } catch (error) {
        console.error('Session check error:', error);
        res.status(500).json({
            success: false,
            error: 'Session check failed: ' + error.message
        });
    }
});

// Generate manual OAuth URL
app.post('/api/generate-manual-auth-url', async (req, res) => {
    try {
        const credentials = DEFAULT_CREDENTIALS;
        const redirectUrl = 'http://localhost:3001/callback?';
        
        console.log('Generating manual OAuth URL...');
        
        // Store session data for manual login
        const sessionId = Date.now().toString();
        userSessions.set(sessionId, {
            userId: credentials.userId,
            password: credentials.password,
            totp: credentials.totp,
            apiKey: credentials.apiKey,
            apiSecret: credentials.apiSecret,
            redirectUrl,
            loginTime: new Date().toISOString(),
            isAuthenticated: false
        });
        
        // Generate OAuth URL
        const state = crypto.randomBytes(16).toString('hex');
        const authUrl = `${FLATTRADE_AUTH_URL}/?app_key=${credentials.apiKey}&redirect_uri=${encodeURIComponent(redirectUrl)}&state=${state}`;
        
        console.log('Manual OAuth URL generated');
        
        // Store latest session ID for callback
        latestSessionId = sessionId;
        
        res.json({
            success: true,
            authUrl: authUrl,
            sessionId: sessionId,
            message: 'Manual OAuth URL generated successfully'
        });
        
    } catch (error) {
        console.error('Manual OAuth URL generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate manual OAuth URL: ' + error.message
        });
    }
});
app.post('/api/login', async (req, res) => {
    try {
        const { userId, password, totp, apiKey, apiSecret } = req.body;
        const redirectUrl = 'http://localhost:3001/callback?'; // Default redirect URL
        
        console.log('Login credentials received:', { 
            userId, 
            password: password ? 'provided' : 'missing',
            totp: totp ? 'provided' : 'missing',
            apiKey: apiKey ? 'provided' : 'missing',
            apiSecret: apiSecret ? 'provided' : 'missing',
            redirectUrl 
        });
        
        // Validate required fields
        if (!userId || !password || !totp || !apiKey || !apiSecret) {
            return res.status(400).json({
                success: false,
                error: 'All fields are required: userId, password, totp, apiKey, apiSecret'
            });
        }
        
        // Store credentials temporarily (in production, use secure session storage)
        const sessionId = Date.now().toString();
        userSessions.set(sessionId, {
            userId,
            password,
            totp,
            apiKey,
            apiSecret,
            redirectUrl,
            loginTime: new Date().toISOString(),
            isAuthenticated: false
        });

        console.log('Stored user session:', sessionId);
        
        // Set session ID in response
        res.cookie('sessionId', sessionId, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }); // 24 hours
        
        res.json({
            success: true,
            message: 'Credentials stored. Please complete OAuth flow using the auth URL.',
            data: {
                userId: userId,
                sessionId: sessionId,
                nextStep: 'Use the generated auth URL to complete authentication'
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed: ' + error.message
        });
    }
});

// Get option chain
app.post('/api/option-chain', async (req, res) => {
    try {
        const { symbol, expiry, spotPrice } = req.body;
        const sessionId = req.cookies.sessionId;
        
        if (!sessionId || !userSessions.has(sessionId)) {
            return res.status(401).json({ 
                status: 'error', 
                message: 'Not authenticated. Please login first.' 
            });
        }
        
        const session = userSessions.get(sessionId);
        
        if (!session.isAuthenticated) {
            return res.status(401).json({ 
                status: 'error', 
                message: 'Authentication incomplete. Please complete OAuth flow.' 
            });
        }

        // For demo purposes, generate mock option chain data
        // In real implementation, use actual Flattrade API
        const optionChain = generateMockOptionChain(symbol, expiry, spotPrice);
        
        res.json({ 
            status: 'success', 
            data: optionChain,
            message: 'Option chain loaded (demo data)'
        });
    } catch (error) {
        console.error('Option chain error:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Failed to load option chain',
            error: error.message 
        });
    }
});

// Get option chain
app.get('/api/option-chain', async (req, res) => {
    try {
        const sessionId = req.cookies.sessionId;
        
        if (!sessionId || !userSessions.has(sessionId)) {
            return res.status(401).json({ 
                status: 'error', 
                message: 'Not authenticated. Please login first.' 
            });
        }
        
        const session = userSessions.get(sessionId);
        
        if (!session.isAuthenticated) {
            return res.status(401).json({ 
                status: 'error', 
                message: 'Authentication incomplete. Please complete OAuth flow.' 
            });
        }

        // Get option chain using GetOptionChain API
        const optionChainData = {
            uid: session.userId,
            exch: 'NFO',
            tsym: req.query.symbol || 'NIFTY', // Get option chain for NIFTY or specified symbol
            strprc: req.query.strike || '24500', // Strike price 
            cnt: req.query.count || '10' // Number of strikes
        };

        console.log(`Getting option chain for: ${optionChainData.tsym} strike: ${optionChainData.strprc}`);

        const response = await axios.post(`${FLATTRADE_BASE_URL}/GetOptionChain`, 
            `jData=${JSON.stringify(optionChainData)}&jKey=${session.jKey}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        console.log('Option chain response:', JSON.stringify(response.data, null, 2));

        res.json({
            status: 'success',
            data: response.data
        });

    } catch (error) {
        console.error('Option chain error:', error.response?.data || error.message);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch option chain',
            error: error.response?.data || error.message
        });
    }
});

// Cache for expiry dates (refresh once per day)
const expiryCache = new Map();
const EXPIRY_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Get expiry dates from NSE website (official source) with caching
app.get('/api/expiry-dates', async (req, res) => {
    try {
        const symbol = req.query.symbol || 'NIFTY';
        
        // Check cache first
        const cacheKey = symbol;
        const cached = expiryCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < EXPIRY_CACHE_DURATION) {
            console.log(`✅ Returning cached expiry dates for ${symbol} (age: ${Math.floor((Date.now() - cached.timestamp) / 1000 / 60)} minutes)`);
            return res.json(cached.data);
        }
        
        console.log(`📅 Fetching fresh expiry dates for ${symbol} from NSE India...`);

        // Map our symbols to NSE option chain symbols
        const nseSymbolMap = {
            'NIFTY': 'NIFTY',
            'BANKNIFTY': 'BANKNIFTY',
            'FINNIFTY': 'FINNIFTY'
        };

        const nseSymbol = nseSymbolMap[symbol] || 'NIFTY';

        try {
            // Fetch option chain from NSE to get expiry dates
            const nseResponse = await axios.get(`https://www.nseindia.com/api/option-chain-indices?symbol=${nseSymbol}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'application/json',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Referer': 'https://www.nseindia.com/option-chain',
                    'Connection': 'keep-alive'
                },
                timeout: 15000
            });

            if (nseResponse.data && nseResponse.data.records && nseResponse.data.records.expiryDates) {
                const expiryDates = nseResponse.data.records.expiryDates;
                
                console.log(`📦 NSE returned ${expiryDates.length} expiry dates`);

                // Parse and format expiry dates
                const expiryDetails = expiryDates.map(dateStr => {
                    // NSE format: "30-Oct-2025" or "30-10-2025"
                    const date = new Date(dateStr);
                    
                    if (!isNaN(date.getTime())) {
                        const dayOfWeek = date.getDay();
                        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                        
                        const day = date.getDate().toString().padStart(2, '0');
                        const month = date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
                        const year = date.getFullYear();
                        
                        // Format for HTML date input
                        const dateFormatted = date.toISOString().split('T')[0]; // YYYY-MM-DD
                        
                        // Add day name to display (show if it's Thursday or not)
                        const dayLabel = dayOfWeek === 4 ? 'Thu' : dayNames[dayOfWeek];
                        
                        return {
                            date: dateFormatted,
                            display: `${day} ${month} ${year} (${dayLabel})`,
                            timestamp: date.getTime(),
                            isThursday: dayOfWeek === 4
                        };
                    }
                    return null;
                }).filter(Boolean);

                // Sort by date
                expiryDetails.sort((a, b) => a.timestamp - b.timestamp);

                // Filter future dates
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                let futureExpiries = expiryDetails.filter(e => e.timestamp >= today.getTime());
                
                // Log all dates including non-Thursdays
                console.log(`📅 NSE returned ${futureExpiries.length} future expiries (all days):`, 
                    futureExpiries.map(e => e.display).slice(0, 5));
                
                // Prefer Thursdays but include all if no Thursdays available
                const thursdays = futureExpiries.filter(e => e.isThursday).slice(0, 10);
                if (thursdays.length >= 3) {
                    futureExpiries = thursdays;
                    console.log(`✅ Using ${thursdays.length} Thursday expiries`);
                } else {
                    futureExpiries = futureExpiries.slice(0, 10);
                    console.log(`⚠️ Using all ${futureExpiries.length} expiries (not all Thursdays)`);
                }

                console.log(`📋 Final expiries:`, futureExpiries.map(e => e.display));

                const responseData = {
                    status: 'success',
                    symbol: symbol,
                    expiries: futureExpiries,
                    source: 'NSE India'
                };
                
                // Cache the result
                expiryCache.set(cacheKey, {
                    data: responseData,
                    timestamp: Date.now()
                });
                console.log(`💾 Cached expiry dates for ${symbol}`);

                res.json(responseData);
            } else {
                throw new Error('No expiry data in NSE response');
            }

        } catch (nseError) {
            console.error('❌ NSE API error:', nseError.message);
            
            // Fallback: Calculate next 8 Thursdays
            console.log('⚠️ Using fallback: calculating Thursday expiries');
            const expiries = [];
            const today = new Date();
            
            let currentDate = new Date(today);
            for (let i = 0; i < 8; i++) {
                // Find next Thursday
                const dayOfWeek = currentDate.getDay();
                const daysUntilThursday = (4 - dayOfWeek + 7) % 7;
                if (daysUntilThursday === 0 && i === 0) {
                    currentDate.setDate(currentDate.getDate() + 7);
                } else {
                    currentDate.setDate(currentDate.getDate() + daysUntilThursday);
                }
                
                const day = currentDate.getDate().toString().padStart(2, '0');
                const month = currentDate.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
                const year = currentDate.getFullYear();
                const dateFormatted = currentDate.toISOString().split('T')[0];
                
                expiries.push({
                    date: dateFormatted,
                    display: `${day} ${month} ${year}`,
                    timestamp: currentDate.getTime()
                });
                
                // Move to next week
                currentDate = new Date(currentDate);
                currentDate.setDate(currentDate.getDate() + 1);
            }

            console.log(`✅ Fallback: Generated ${expiries.length} Thursday expiries`);

            const fallbackData = {
                status: 'success',
                symbol: symbol,
                expiries: expiries,
                source: 'Calculated (NSE unavailable)'
            };
            
            // Cache fallback data too (shorter duration - 1 hour)
            expiryCache.set(cacheKey, {
                data: fallbackData,
                timestamp: Date.now()
            });

            res.json(fallbackData);
        }

    } catch (error) {
        console.error('❌ Expiry dates error:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch expiry dates',
            error: error.message
        });
    }
});

// Test symbol lookup (for debugging)
app.get('/api/test-symbol', async (req, res) => {
    try {
        const { symbol, strike, expiry, optionType } = req.query;
        const sessionId = req.cookies.sessionId;
        
        if (!sessionId || !userSessions.has(sessionId)) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const session = userSessions.get(sessionId);
        if (!session.isAuthenticated) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        // Generate symbol with 2-digit year (FlatTrade format)
        const expiryDate = new Date(expiry);
        const day = expiryDate.getDate().toString().padStart(2, '0');
        const month = expiryDate.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
        const year = expiryDate.getFullYear().toString().slice(-2); // Last 2 digits
        const optCode = optionType.charAt(0); // 'C' or 'P'
        const generatedSymbol = `${symbol}${day}${month}${year}${optCode}${strike}`;
        
        // Search for it
        const searchData = {
            uid: session.userId,
            stext: generatedSymbol
        };
        
        const searchResponse = await axios.post(`${FLATTRADE_BASE_URL}/SearchScrip`, 
            `jData=${JSON.stringify(searchData)}&jKey=${session.jKey}`,
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );
        
        res.json({
            generated: generatedSymbol,
            searchResults: searchResponse.data.values || [],
            nfoResults: (searchResponse.data.values || []).filter(v => v.exch === 'NFO')
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Search instruments endpoint to find valid symbols
app.get('/api/search-symbols', async (req, res) => {
    try {
        const sessionId = req.cookies.sessionId;
        
        if (!sessionId || !userSessions.has(sessionId)) {
            return res.status(401).json({ 
                status: 'error', 
                message: 'Session not found. Please login first.' 
            });
        }
        
        const session = userSessions.get(sessionId);
        
        if (!session.isAuthenticated) {
            return res.status(401).json({ 
                status: 'error', 
                message: 'Authentication incomplete. Please complete OAuth flow.' 
            });
        }

        // Search for NIFTY option symbols using SearchScrip API
        const searchData = {
            uid: session.userId,
            stext: req.query.text || 'NIFTY'
        };

        console.log(`Searching symbols for: ${searchData.stext}`);

        const response = await axios.post(`${FLATTRADE_BASE_URL}/SearchScrip`, 
            `jData=${JSON.stringify(searchData)}&jKey=${session.jKey}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        console.log('Search symbols response:', response.data);

        res.json({
            status: 'success',
            data: response.data
        });

    } catch (error) {
        console.error('Search symbols error:', error.response?.data || error.message);
        res.status(500).json({
            status: 'error',
            message: 'Failed to search symbols',
            error: error.response?.data || error.message
        });
    }
});

// Place basket order
app.post('/api/basket-order', async (req, res) => {
    try {
        const { orders } = req.body;
        const sessionId = req.cookies.sessionId;
        
        if (!sessionId || !userSessions.has(sessionId)) {
            return res.status(401).json({ 
                status: 'error', 
                message: 'Not authenticated. Please login first.' 
            });
        }
        
        const session = userSessions.get(sessionId);
        
        if (!session.isAuthenticated) {
            return res.status(401).json({ 
                status: 'error', 
                message: 'Authentication incomplete. Please complete OAuth flow.' 
            });
        }

        console.log(`Processing ${orders.length} orders for user ${session.userId}`);
        
        const results = [];
        
        // For demo purposes, simulate order placement
        for (const order of orders) {
            const result = {
                symbol: order.symbol,
                quantity: order.quantity,
                price: order.price,
                transaction_type: order.transaction_type,
                status: 'success',
                order_id: 'DEMO' + Date.now() + Math.random().toString(36).substr(2, 9),
                message: 'Order placed successfully (demo mode)'
            };
            
            results.push(result);
        }
        
        res.json({ 
            status: 'success', 
            data: {
                total_orders: orders.length,
                successful_orders: results.length,
                failed_orders: 0,
                results: results
            },
            message: `${results.length} orders placed successfully (demo mode)`
        });
    } catch (error) {
        console.error('Basket order error:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Failed to place basket order',
            error: error.message 
        });
    }
});

// Place basket order (new endpoint for manual entry)
app.post('/api/place-basket-order', async (req, res) => {
    try {
        const { orders } = req.body;
        const sessionId = req.cookies.sessionId;
        
        if (!sessionId || !userSessions.has(sessionId)) {
            return res.json({ 
                success: false, 
                error: 'Not authenticated. Please login first.' 
            });
        }
        
        const session = userSessions.get(sessionId);
        
        if (!session.isAuthenticated) {
            return res.json({ 
                success: false, 
                error: 'Authentication incomplete. Please complete OAuth flow.' 
            });
        }

        console.log(`Processing ${orders.length} basket orders for user ${session.userId}`);
        
        const orderResults = [];
        
        // Place actual orders using Flattrade API
        for (let i = 0; i < orders.length; i++) {
            const order = orders[i];
            
            try {
                // Construct trading symbol for options
                // Format: NIFTYDDMMMYYC/PSTRIKE (Flattrade specific format)
                // Example: NIFTY14AUG25C24500
                const today = new Date();
                const weeklyExpiry = getNextThursday(today);
                const month = weeklyExpiry.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
                const year = weeklyExpiry.getFullYear().toString().slice(-2); // Get last 2 digits of year
                const day = weeklyExpiry.getDate().toString().padStart(2, '0');
                
                // Convert CE/PE to C/P
                const optionTypeCode = order.optionType === 'CE' ? 'C' : 'P';
                
                // Flattrade format: NIFTYDDMMMYYC/PSTRIKE (no spaces, no dashes)
                const tradingSymbol = `NIFTY${day}${month}${year}${optionTypeCode}${order.strikePrice}`;
                
                console.log(`Generated trading symbol: ${tradingSymbol}`);
                
                // Prepare order data for Flattrade API
                const orderData = {
                    uid: session.userId,
                    actid: session.userId, // Using same as uid
                    exch: 'NFO', // NFO for options
                    tsym: tradingSymbol,
                    qty: order.quantity.toString(),
                    prc: order.price || '0',
                    prd: 'M', // NRML product
                    trantype: order.trantype, // B for Buy, S for Sell
                    prctyp: order.price ? 'LMT' : 'MKT', // LMT for limit, MKT for market
                    ret: 'DAY',
                    dscqty: '0',
                    ordersource: 'API'
                };
                
                // Make API call to Flattrade
                const response = await axios.post(`${FLATTRADE_BASE_URL}/PlaceOrder`, 
                    `jData=${JSON.stringify(orderData)}&jKey=${session.jKey}`,
                    {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    }
                );
                
                console.log('Flattrade PlaceOrder response:', response.data);
                
                if (response.data.stat === 'Ok') {
                    const result = {
                        orderId: response.data.norenordno,
                        symbol: order.symbol,
                        strikePrice: order.strikePrice,
                        optionType: order.optionType,
                        trantype: order.trantype,
                        quantity: order.quantity,
                        price: order.price,
                        orderType: order.orderType || (order.price ? 'LIMIT' : 'MARKET'),
                        status: 'SUCCESS',
                        message: 'Order placed successfully',
                        timestamp: new Date().toISOString(),
                        tradingSymbol: tradingSymbol
                    };
                    orderResults.push(result);
                } else {
                    const result = {
                        symbol: order.symbol,
                        strikePrice: order.strikePrice,
                        optionType: order.optionType,
                        trantype: order.trantype,
                        quantity: order.quantity,
                        price: order.price,
                        status: 'FAILED',
                        message: response.data.emsg || 'Order placement failed',
                        timestamp: new Date().toISOString(),
                        tradingSymbol: tradingSymbol
                    };
                    orderResults.push(result);
                }
                
            } catch (orderError) {
                console.error('Individual order placement error:', orderError);
                
                const result = {
                    symbol: order.symbol,
                    strikePrice: order.strikePrice,
                    optionType: order.optionType,
                    trantype: order.trantype,
                    quantity: order.quantity,
                    price: order.price,
                    status: 'ERROR',
                    message: 'Network error during order placement: ' + orderError.message,
                    timestamp: new Date().toISOString()
                };
                orderResults.push(result);
            }
        }
        
        const successCount = orderResults.filter(r => r.status === 'SUCCESS').length;
        const failCount = orderResults.length - successCount;
        
        res.json({ 
            success: successCount > 0, 
            orderIds: orderResults.filter(r => r.orderId).map(r => r.orderId),
            orders: orderResults,
            message: `${successCount} orders placed successfully${failCount > 0 ? `, ${failCount} failed` : ''}`
        });
        
    } catch (error) {
        console.error('Place basket order error:', error);
        res.json({ 
            success: false, 
            error: 'Failed to place basket order: ' + error.message
        });
    }
});

// Helper function to get next Thursday (weekly expiry)
function getNextThursday(date) {
    const today = new Date(date);
    const dayOfWeek = today.getDay(); // 0 = Sunday, 4 = Thursday
    let daysUntilThursday;
    
    if (dayOfWeek <= 4) {
        daysUntilThursday = 4 - dayOfWeek;
    } else {
        daysUntilThursday = 7 - dayOfWeek + 4;
    }
    
    const thursday = new Date(today);
    thursday.setDate(today.getDate() + daysUntilThursday);
    return thursday;
}

// Get orderbook
app.get('/api/orders', async (req, res) => {
    try {
        const sessionId = ensureSessionCookie(req, res);
        
        if (!sessionId || !userSessions.has(sessionId)) {
            return res.status(401).json({ 
                status: 'error', 
                message: 'Not authenticated. Please login first.' 
            });
        }
        
        const session = userSessions.get(sessionId);
        
        if (!session.isAuthenticated) {
            return res.status(401).json({ 
                status: 'error', 
                message: 'Authentication incomplete. Please complete OAuth flow.' 
            });
        }

        // Get Full Order Book (All Orders for the Day)
        // Endpoint: https://piconnect.flattrade.in/PiConnectTP/OrderBook
        // Parameters: jKey and jData with uid only
        const requestData = {
            uid: session.userId
        };

        console.log('📋 Fetching order book for user:', session.userId);

        const response = await axios.post(`${FLATTRADE_BASE_URL}/OrderBook`, 
            `jData=${JSON.stringify(requestData)}&jKey=${session.jKey}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        console.log('✅ OrderBook API response type:', Array.isArray(response.data) ? 'Array' : typeof response.data);
        console.log('✅ OrderBook API response:', JSON.stringify(response.data, null, 2));
        
        // According to FlatTrade docs, OrderBook returns a JSON array directly
        // Each item in the array has stat: "Ok" and order details
        let orders = [];
        
        if (Array.isArray(response.data)) {
            // Direct array response
            orders = response.data;
            console.log(`✅ Found ${orders.length} orders in array response`);
        } else if (response.data.stat === 'Ok' || response.data.stat === 'ok') {
            // Object with stat: "Ok" and values array
            if (response.data.values && Array.isArray(response.data.values)) {
                orders = response.data.values;
                console.log(`✅ Found ${orders.length} orders in values property`);
            } else if (response.data.tsym || response.data.qty !== undefined) {
                // Single order object
                orders = [response.data];
                console.log(`✅ Found single order`);
            } else {
                console.log(`⚠️ API returned Ok but no orders found`);
            }
        } else {
            // Error response
            const errorMsg = response.data.emsg || response.data.message || 'Failed to fetch orders';
            console.error(`❌ OrderBook API error: ${errorMsg}`);
            console.error('Response structure:', {
                isArray: Array.isArray(response.data),
                type: typeof response.data,
                stat: response.data.stat,
                hasValues: !!response.data.values,
                keys: Object.keys(response.data || {})
            });
            
            // Check if it's actually an array being returned as error
            if (Array.isArray(response.data) && response.data.length > 0) {
                orders = response.data;
                console.log(`⚠️ Treating array response as orders (${orders.length} items)`);
            } else {
                // Empty or error - return empty array but success status
                console.log(`⚠️ No orders: ${errorMsg}`);
                return res.json({ 
                    status: 'success', 
                    data: [],
                    message: 'No orders found for today'
                });
            }
        }
        
        // Return success with orders (even if empty)
        res.json({ 
            status: 'success', 
            data: orders,
            message: orders.length > 0 ? `Found ${orders.length} orders` : 'No orders found for today'
        });
    } catch (error) {
        console.error('❌ Orders endpoint error:', error.message);
        console.error('Error details:', error.response?.data || error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Failed to get orders: ' + (error.response?.data?.emsg || error.message),
            data: [],
            error: error.response?.data || error.message
        });
    }
});

// Place single order endpoint
app.post('/api/place-single-order', async (req, res) => {
    try {
        const { order } = req.body;
        const sessionId = ensureSessionCookie(req, res);
        
        if (!sessionId || !userSessions.has(sessionId)) {
            return res.json({ 
                success: false, 
                error: 'Not authenticated. Please login first.' 
            });
        }
        
        const session = userSessions.get(sessionId);
        
        if (!session.isAuthenticated) {
            return res.json({ 
                success: false, 
                error: 'Authentication incomplete. Please complete OAuth flow.' 
            });
        }

        console.log(`📤 Placing single order for user ${session.userId}:`, order);
        
        try {
            // Use the trading symbol from frontend if provided, otherwise generate it
            let tradingSymbol = order.tradingSymbol;
            
            if (!tradingSymbol) {
                // Generate trading symbol if not provided (2-digit year, FlatTrade format)
                const today = new Date();
                const weeklyExpiry = getNextThursday(today);
                const month = weeklyExpiry.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
                const year = weeklyExpiry.getFullYear().toString().slice(-2); // Last 2 digits
                const day = weeklyExpiry.getDate().toString().padStart(2, '0');
                
                const optionTypeCode = order.optionType ? order.optionType.charAt(0) : 'C'; // 'C' or 'P'
                tradingSymbol = `${order.symbol}${day}${month}${year}${optionTypeCode}${order.strikePrice}`;
                console.log(`🔧 Generated trading symbol: ${tradingSymbol}`);
            } else {
                console.log(`✅ Using provided trading symbol: ${tradingSymbol}`);
            }
            
            // Validate symbol by searching in FlatTrade's database
            console.log(`🔍 Validating symbol: ${tradingSymbol}`);
            try {
                const searchData = {
                    uid: session.userId,
                    stext: tradingSymbol
                };
                
                const searchResponse = await axios.post(`${FLATTRADE_BASE_URL}/SearchScrip`, 
                    `jData=${JSON.stringify(searchData)}&jKey=${session.jKey}`,
                    {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    }
                );
                
                if (searchResponse.data.stat === 'Ok' && searchResponse.data.values && searchResponse.data.values.length > 0) {
                    // Find exact match (case-insensitive) in NFO exchange
                    const exactMatch = searchResponse.data.values.find(item => 
                        item.exch === 'NFO' && 
                        item.tsym && 
                        item.tsym.toUpperCase() === tradingSymbol.toUpperCase()
                    );
                    
                    if (exactMatch) {
                        tradingSymbol = exactMatch.tsym; // Use exact format from FlatTrade
                        console.log(`✅ Exact match validated: ${tradingSymbol} (Token: ${exactMatch.token})`);
                    } else {
                        // Try to find closest match starting with our symbol
                        const closeMatch = searchResponse.data.values.find(item => 
                            item.exch === 'NFO' && 
                            item.tsym && 
                            item.tsym.toUpperCase().startsWith(tradingSymbol.substring(0, 10).toUpperCase())
                        );
                        
                        if (closeMatch) {
                            console.warn(`⚠️ Using close match: ${closeMatch.tsym} (searched for: ${tradingSymbol})`);
                            tradingSymbol = closeMatch.tsym;
                        } else {
                            console.warn(`⚠️ No exact match found, using generated: ${tradingSymbol}`);
                            console.log(`📋 Available symbols:`, searchResponse.data.values.slice(0, 5).map(v => v.tsym));
                        }
                    }
                } else {
                    console.warn(`⚠️ Symbol search returned no results, using generated: ${tradingSymbol}`);
                }
            } catch (searchError) {
                console.warn(`⚠️ Symbol validation failed:`, searchError.message);
            }
            
            // Map order type: 'Market' or 'Limit' -> 'MKT' or 'LMT'
            let prctyp = 'MKT';
            let prc = '0';
            
            if (order.orderType === 'Limit' || order.orderType === 'LMT') {
                prctyp = 'LMT';
                prc = order.price ? order.price.toString() : '0';
            } else if (order.orderType === 'Market' || order.orderType === 'MKT') {
                prctyp = 'MKT';
                prc = '0';
            }
            
            console.log(`📊 Order details: Type=${prctyp}, Price=${prc}, Qty=${order.quantity}, Product=${order.product}`);
            
            // Log in user-friendly format
            console.log(`📋 Order Summary:`, {
                exchange: 'NFO',
                tradingsymbol: tradingSymbol,
                transactiontype: order.trantype === 'B' ? 'BUY' : 'SELL',
                ordertype: prctyp === 'MKT' ? 'MARKET' : 'LIMIT',
                producttype: order.product,
                duration: 'DAY',
                quantity: order.quantity,
                price: prc
            });
            
            // Prepare order data for FlatTrade API
            const orderData = {
                uid: session.userId,
                actid: session.userId,
                exch: 'NFO',
                tsym: tradingSymbol,
                qty: order.quantity.toString(),
                prc: prc,
                prd: order.product === 'MIS' ? 'I' : (order.product === 'NRML' ? 'M' : (order.product === 'CNC' ? 'C' : 'I')),
                trantype: order.trantype,
                prctyp: prctyp,
                ret: order.validity || 'DAY',
                dscqty: '0',
                ordersource: 'API'
            };
            
            // Add trigger price for SL/GTT orders
            if (order.triggerPrice) {
                orderData.blprc = order.triggerPrice.toString();
            }
            
            console.log(`📤 Sending to FlatTrade PlaceOrder API:`, orderData);
            
            const response = await axios.post(`${FLATTRADE_BASE_URL}/PlaceOrder`, 
                `jData=${JSON.stringify(orderData)}&jKey=${session.jKey}`,
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );
            
            console.log('📥 FlatTrade API response:', response.data);
            
            if (response.data.stat === 'Ok') {
                console.log(`✅ Order placed successfully! Order ID: ${response.data.norenordno}`);
                res.json({ 
                    success: true, 
                    orderId: response.data.norenordno,
                    message: 'Order placed successfully',
                    tradingSymbol: tradingSymbol,
                    details: response.data
                });
            } else {
                console.error(`❌ Order failed: ${response.data.emsg}`);
                res.json({ 
                    success: false, 
                    error: response.data.emsg || 'Order placement failed',
                    details: response.data
                });
            }
            
        } catch (orderError) {
            console.error('Single order placement error:', orderError);
            res.json({ 
                success: false, 
                error: 'Order placement failed: ' + (orderError.response?.data?.emsg || orderError.message)
            });
        }
        
    } catch (error) {
        console.error('Place single order error:', error);
        res.json({ 
            success: false, 
            error: 'Failed to place order: ' + error.message
        });
    }
});

// Get margins endpoint
app.post('/api/get-margins', async (req, res) => {
    try {
        const { order } = req.body;
        const sessionId = req.cookies.sessionId;
        
        if (!sessionId || !userSessions.has(sessionId)) {
            return res.json({ 
                success: false, 
                error: 'Not authenticated. Please login first.' 
            });
        }
        
        const session = userSessions.get(sessionId);
        
        if (!session.isAuthenticated) {
            return res.json({ 
                success: false, 
                error: 'Authentication incomplete. Please complete OAuth flow.' 
            });
        }

        // Generate trading symbol for margin calculation
        const today = new Date();
        const weeklyExpiry = getNextThursday(today);
        const month = weeklyExpiry.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
        const year = weeklyExpiry.getFullYear().toString().slice(-2);
        const day = weeklyExpiry.getDate().toString().padStart(2, '0');
        
        const optionTypeCode = order.optionType === 'CE' ? 'C' : 'P';
        const tradingSymbol = `${order.symbol}${day}${month}${year}${optionTypeCode}${order.strikePrice}`;
        
        const marginData = {
            uid: session.userId,
            exch: 'NFO',
            tsym: tradingSymbol,
            qty: order.quantity.toString(),
            prc: order.price || '0',
            prd: order.product === 'MIS' ? 'I' : (order.product === 'CNC' ? 'C' : 'M'),
            trantype: order.trantype
        };
        
        const response = await axios.post(`${FLATTRADE_BASE_URL}/GetMargins`, 
            `jData=${JSON.stringify(marginData)}&jKey=${session.jKey}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        console.log('Margin response:', response.data);
        
        if (response.data.stat === 'Ok') {
            res.json({ 
                success: true, 
                data: {
                    requiredMargin: response.data.marginused,
                    availableMargin: response.data.marginused,
                    exposureMargin: response.data.marginused,
                    span: response.data.span,
                    exposure: response.data.exposure,
                    premium: response.data.premium
                }
            });
        } else {
            res.json({ 
                success: false, 
                error: response.data.emsg || 'Failed to get margin information'
            });
        }
        
    } catch (error) {
        console.error('Get margins error:', error);
        res.json({ 
            success: false, 
            error: 'Failed to get margins: ' + error.message
        });
    }
});

// Cancel order endpoint
app.post('/api/cancel-order', async (req, res) => {
    try {
        const { orderId } = req.body;
        const sessionId = req.cookies.sessionId;
        
        if (!sessionId || !userSessions.has(sessionId)) {
            return res.json({ 
                success: false, 
                error: 'Not authenticated. Please login first.' 
            });
        }
        
        const session = userSessions.get(sessionId);
        
        if (!session.isAuthenticated) {
            return res.json({ 
                success: false, 
                error: 'Authentication incomplete. Please complete OAuth flow.' 
            });
        }

        const cancelData = {
            uid: session.userId,
            norenordno: orderId
        };
        
        const response = await axios.post(`${FLATTRADE_BASE_URL}/CancelOrder`, 
            `jData=${JSON.stringify(cancelData)}&jKey=${session.jKey}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        console.log('Cancel order response:', response.data);
        
        if (response.data.stat === 'Ok') {
            res.json({ 
                success: true, 
                message: 'Order cancelled successfully'
            });
        } else {
            res.json({ 
                success: false, 
                error: response.data.emsg || 'Failed to cancel order'
            });
        }
        
    } catch (error) {
        console.error('Cancel order error:', error);
        res.json({ 
            success: false, 
            error: 'Failed to cancel order: ' + error.message
        });
    }
});

// Get orders endpoint (enhanced)
// Duplicate endpoint removed - using the enhanced version above

// Get positions endpoint (enhanced)
app.get('/api/positions', async (req, res) => {
    try {
        const sessionId = ensureSessionCookie(req, res);
        
        if (!sessionId || !userSessions.has(sessionId)) {
            return res.status(401).json({ 
                status: 'error', 
                message: 'Not authenticated. Please login first.' 
            });
        }
        
        const session = userSessions.get(sessionId);
        
        if (!session.isAuthenticated) {
            return res.status(401).json({ 
                status: 'error', 
                message: 'Authentication incomplete. Please complete OAuth flow.' 
            });
        }

        // According to Flattrade API docs, PositionBook requires uid and actid
        const positionData = {
            uid: session.userId,
            actid: session.userId  // Account ID (same as user ID for individual accounts)
        };
        
        console.log('📋 Fetching PositionBook for user:', session.userId);
        const response = await axios.post(`${FLATTRADE_BASE_URL}/PositionBook`, 
            `jData=${JSON.stringify(positionData)}&jKey=${session.jKey}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        console.log('✅ PositionBook response type:', Array.isArray(response.data) ? 'Array' : typeof response.data);
        console.log('✅ PositionBook response:', JSON.stringify(response.data, null, 2));
        
        // According to Flattrade API docs, PositionBook can return:
        // 1. Array of positions directly
        // 2. Object with stat: "Ok" and values array
        // 3. Single position object
        // 4. Error: {"stat": "Not_Ok", "emsg": "no data"} when no positions
        let positions = [];
        
        // Check for error response first
        if (response.data.stat === 'Not_Ok' || response.data.stat === 'not_ok') {
            const errorMsg = response.data.emsg || response.data.message || 'No positions found';
            console.log(`⚠️ API returned Not_Ok: ${errorMsg}`);
            
            // Return empty array with success status (no positions is not an error)
            return res.json({ 
                status: 'success', 
                data: [],
                message: errorMsg === 'no data' ? 'No positions found' : errorMsg
            });
        }
        
        // Handle successful responses
        if (Array.isArray(response.data)) {
            // Direct array response
            positions = response.data;
            console.log(`✅ Found ${positions.length} positions in array response`);
        } else if (response.data.stat === 'Ok' || response.data.stat === 'ok') {
            // Object with stat: "Ok" and values array
            if (response.data.values && Array.isArray(response.data.values)) {
                positions = response.data.values;
                console.log(`✅ Found ${positions.length} positions in values property`);
            } else if (response.data.tsym || response.data.netqty !== undefined) {
                // Single position object
                positions = [response.data];
                console.log(`✅ Found single position`);
            } else {
                console.log(`⚠️ API returned Ok but no positions found`);
            }
        } else {
            // Unknown response format - try to extract array
            const errorMsg = response.data?.emsg || response.data?.message || 'Unknown response format';
            
            // Check if it's actually an array being returned
            if (Array.isArray(response.data) && response.data.length > 0) {
                positions = response.data;
                console.log(`⚠️ Treating array response as positions (${positions.length} items)`);
            } else {
                // Empty or error - return empty array but success status
                console.log(`⚠️ No positions: ${errorMsg}`);
                return res.json({ 
                    status: 'success', 
                    data: [],
                    message: 'No positions found'
                });
            }
        }
        
        // Calculate total P&L from positions (for server-side logging)
        // According to Flattrade API docs: sum of rpnl + urmtom for each position
        let totalPnL = 0;
        positions.forEach(pos => {
            const rpnl = parseFloat(pos.rpnl || 0); // Realized P&L
            const urmtom = parseFloat(pos.urmtom || pos.upnl || 0); // Unrealized P&L (mark-to-market)
            totalPnL += (rpnl + urmtom);
            
            // Log position details for debugging
            if (pos.tsym) {
                console.log(`  📈 ${pos.tsym}: NetQty=${pos.netqty || 0}, AvgPrc=${pos.avgprc || pos.netavgprc || 0}, LTP=${pos.ltp || pos.lp || 0}, RPNL=₹${rpnl.toFixed(2)}, UPNL=₹${urmtom.toFixed(2)}`);
            }
        });
        
        console.log(`💰 Server-side Total P&L (Today): ₹${totalPnL.toFixed(2)}`);
        
        res.json({ 
            status: 'success',
            data: positions,
            message: 'Positions loaded successfully'
        });
        
    } catch (error) {
        console.error('❌ Get positions error:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Failed to get positions',
            error: error.message 
        });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    try {
        const sessionId = req.cookies.sessionId;
        
        if (sessionId && userSessions.has(sessionId)) {
            userSessions.delete(sessionId);
        }
        
        // Clear all session data and saved session file
        userSessions.clear();
        latestSessionId = null;
        latestSession = null;
        
        // Remove saved session file
        if (fs.existsSync(SESSION_FILE)) {
            fs.unlinkSync(SESSION_FILE);
            console.log('Saved session file deleted');
        }
        
        res.clearCookie('sessionId');
        res.json({ 
            status: 'success', 
            message: 'Logged out successfully' 
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Logout failed',
            error: error.message 
        });
    }
});

// Get user limits/margin
app.get('/api/limits', async (req, res) => {
    try {
        const sessionId = ensureSessionCookie(req, res);
        
        if (!sessionId || !userSessions.has(sessionId)) {
            return res.status(401).json({ 
                stat: 'Not_Ok',
                emsg: 'Not authenticated. Please login first.' 
            });
        }
        
        const session = userSessions.get(sessionId);
        
        if (!session.isAuthenticated) {
            return res.status(401).json({ 
                stat: 'Not_Ok',
                emsg: 'Authentication incomplete. Please complete OAuth flow.' 
            });
        }

        const limitsData = {
            uid: session.userId,
            actid: session.userId
        };

        console.log('Getting limits for user:', session.userId);
        const response = await axios.post(`${FLATTRADE_BASE_URL}/Limits`, 
            `jData=${JSON.stringify(limitsData)}&jKey=${session.jKey}`,
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        console.log('Limits response:', response.data);
        res.json(response.data);
    } catch (error) {
        console.error('Error getting limits:', error);
        res.status(500).json({ 
            stat: 'Not_Ok',
            emsg: 'Failed to get limits: ' + error.message 
        });
    }
});

// Get user details
app.get('/api/user-details', async (req, res) => {
    try {
        const sessionId = ensureSessionCookie(req, res);
        
        if (!sessionId || !userSessions.has(sessionId)) {
            return res.status(401).json({ 
                stat: 'Not_Ok',
                emsg: 'Not authenticated. Please login first.' 
            });
        }
        
        const session = userSessions.get(sessionId);
        
        if (!session.isAuthenticated) {
            return res.status(401).json({ 
                stat: 'Not_Ok',
                emsg: 'Authentication incomplete. Please complete OAuth flow.' 
            });
        }

        const userDetailsData = {
            uid: session.userId,
            actid: session.userId
        };

        console.log('Getting user details for user:', session.userId);
        const response = await axios.post(`${FLATTRADE_BASE_URL}/UserDetails`, 
            `jData=${JSON.stringify(userDetailsData)}&jKey=${session.jKey}`,
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        console.log('User details response:', response.data);
        res.json(response.data);
    } catch (error) {
        console.error('Error getting user details:', error);
        res.status(500).json({ 
            stat: 'Not_Ok',
            emsg: 'Failed to get user details: ' + error.message 
        });
    }
});

// Get holdings
app.get('/api/holdings', async (req, res) => {
    try {
        const sessionId = ensureSessionCookie(req, res);
        
        if (!sessionId || !userSessions.has(sessionId)) {
            return res.status(401).json({ 
                stat: 'Not_Ok',
                emsg: 'Not authenticated. Please login first.' 
            });
        }
        
        const session = userSessions.get(sessionId);
        
        if (!session.isAuthenticated) {
            return res.status(401).json({ 
                stat: 'Not_Ok',
                emsg: 'Authentication incomplete. Please complete OAuth flow.' 
            });
        }

        const holdingsData = {
            uid: session.userId,
            actid: session.userId
        };

        console.log('Getting holdings for user:', session.userId);
        const response = await axios.post(`${FLATTRADE_BASE_URL}/Holdings`, 
            `jData=${JSON.stringify(holdingsData)}&jKey=${session.jKey}`,
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        console.log('Holdings response:', response.data);
        res.json(response.data);
    } catch (error) {
        console.error('Error getting holdings:', error);
        res.status(500).json({ 
            stat: 'Not_Ok',
            emsg: 'Failed to get holdings: ' + error.message 
        });
    }
});

// Get trade book (supports both GET and POST)
app.get('/api/trade-book', async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0].replace(/-/g, '');
        const sessionId = ensureSessionCookie(req, res);
        
        if (!sessionId || !userSessions.has(sessionId)) {
            return res.status(401).json({ 
                stat: 'Not_Ok',
                emsg: 'Not authenticated. Please login first.' 
            });
        }
        
        const session = userSessions.get(sessionId);
        
        if (!session.isAuthenticated) {
            return res.status(401).json({ 
                stat: 'Not_Ok',
                emsg: 'Authentication incomplete. Please complete OAuth flow.' 
            });
        }

        const tradeBookData = {
            uid: session.userId,
            actid: session.userId,
            from: date
        };

        console.log('📋 Getting trade book for user:', session.userId, 'date:', tradeBookData.from);
        const response = await axios.post(`${FLATTRADE_BASE_URL}/TradeBook`, 
            `jData=${JSON.stringify(tradeBookData)}&jKey=${session.jKey}`,
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        console.log('✅ Trade book response type:', Array.isArray(response.data) ? 'Array' : typeof response.data);
        console.log('✅ Trade book response:', JSON.stringify(response.data, null, 2));
        
        // According to FlatTrade docs, TradeBook returns a JSON array directly
        // Each item in the array has stat: "Ok" and trade details
        let trades = [];
        
        if (Array.isArray(response.data)) {
            // Direct array response
            trades = response.data;
            console.log(`✅ Found ${trades.length} trades in array response`);
        } else if (response.data.stat === 'Ok') {
            // Object with stat: "Ok" and values array
            if (response.data.values && Array.isArray(response.data.values)) {
                trades = response.data.values;
                console.log(`✅ Found ${trades.length} trades in values property`);
            } else if (response.data.tsym || response.data.qty !== undefined) {
                // Single trade object
                trades = [response.data];
                console.log(`✅ Found single trade`);
            } else {
                console.log(`⚠️ API returned Ok but no trades found`);
            }
        } else {
            // Error response
            const errorMsg = response.data.emsg || response.data.message || 'Failed to fetch trade book';
            console.error(`❌ TradeBook API error: ${errorMsg}`);
            
            // Check if it's actually an array being returned as error
            if (Array.isArray(response.data) && response.data.length > 0) {
                trades = response.data;
                console.log(`⚠️ Treating array response as trades (${trades.length} items)`);
            } else {
                return res.json({ 
                    status: 'success',
                    data: [],
                    message: 'No trades found'
                });
            }
        }
        
        res.json({ 
            status: 'success',
            data: trades,
            message: 'Trade book fetched successfully'
        });
        
    } catch (error) {
        console.error('❌ Error getting trade book:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to get trade book: ' + error.message,
            data: []
        });
    }
});

// POST endpoint for trade book (for compatibility)
app.post('/api/trade-book', async (req, res) => {
    try {
        const { date } = req.body;
        const sessionId = ensureSessionCookie(req, res);
        
        if (!sessionId || !userSessions.has(sessionId)) {
            return res.status(401).json({ 
                stat: 'Not_Ok',
                emsg: 'Not authenticated. Please login first.' 
            });
        }
        
        const session = userSessions.get(sessionId);
        
        if (!session.isAuthenticated) {
            return res.status(401).json({ 
                stat: 'Not_Ok',
                emsg: 'Authentication incomplete. Please complete OAuth flow.' 
            });
        }

        const tradeBookData = {
            uid: session.userId,
            actid: session.userId,
            from: date || new Date().toISOString().split('T')[0].replace(/-/g, '')
        };

        console.log('📋 Getting trade book for user:', session.userId, 'date:', tradeBookData.from);
        const response = await axios.post(`${FLATTRADE_BASE_URL}/TradeBook`, 
            `jData=${JSON.stringify(tradeBookData)}&jKey=${session.jKey}`,
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        console.log('✅ Trade book response:', response.data);
        
        if (response.data.stat === 'Ok') {
            res.json({
                status: 'success',
                data: response.data.values || [],
                message: 'Trade book fetched successfully'
            });
        } else {
            res.json({
                status: 'error',
                message: response.data.emsg || 'Failed to fetch trade book',
                data: []
            });
        }
    } catch (error) {
        console.error('❌ Error getting trade book:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to get trade book: ' + error.message,
            data: []
        });
    }
});

// Cache for price data (1 minute cache)
let priceCache = null;
let priceCacheTimestamp = 0;
const PRICE_CACHE_DURATION = 60 * 1000; // 1 minute

// Price fetching endpoints
app.get('/api/nifty-price', async (req, res) => {
    try {
        // Check cache first
        if (priceCache && (Date.now() - priceCacheTimestamp) < PRICE_CACHE_DURATION) {
            const age = Math.floor((Date.now() - priceCacheTimestamp) / 1000);
            console.log(`✅ Returning cached price data (age: ${age}s)`);
            return res.json(priceCache);
        }
        
        console.log('📈 Fetching fresh live prices from NSE India API...');
        
        // Fetch from NSE India API (no Python required!)
        const nseResponse = await axios.get('https://www.nseindia.com/api/allIndices', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.nseindia.com/'
            },
            timeout: 10000
        });
        
        if (nseResponse.data && nseResponse.data.data) {
            // Find NIFTY 50, BANKNIFTY, and VIX data
            const niftyData = nseResponse.data.data.find(index => 
                index.index === 'NIFTY 50' || index.indexSymbol === 'NIFTY 50'
            );
            
            const bankniftyData = nseResponse.data.data.find(index => 
                index.index === 'NIFTY BANK' || index.indexSymbol === 'NIFTY BANK'
            );
            
            const vixData = nseResponse.data.data.find(index => 
                index.index === 'INDIA VIX' || index.indexSymbol === 'INDIA VIX'
            );
            
            if (niftyData || bankniftyData || vixData) {
                const result = {
                    status: 'success',
                    source: 'NSE India API',
                    timestamp: new Date().toISOString()
                };
                
                if (niftyData) {
                    const price = parseFloat(niftyData.last || niftyData.lastPrice);
                    const prevClose = parseFloat(niftyData.previousClose || niftyData.previousClose);
                    const change = niftyData.change ? parseFloat(niftyData.change) : (price - prevClose);
                    const pChange = niftyData.percentChange ? parseFloat(niftyData.percentChange) : 
                                   niftyData.pChange ? parseFloat(niftyData.pChange) : 
                                   (change / prevClose * 100);
                    
                    result.nifty = {
                        symbol: 'NIFTY 50',
                        price: price,
                        open: parseFloat(niftyData.open),
                        dayHigh: parseFloat(niftyData.high),
                        dayLow: parseFloat(niftyData.low),
                        change: change,
                        pChange: pChange,
                        previousClose: prevClose,
                        yearHigh: parseFloat(niftyData.yearHigh || 0),
                        yearLow: parseFloat(niftyData.yearLow || 0),
                        totalTradedVolume: parseFloat(niftyData.totalTradedVolume || 0)
                    };
                    console.log('✅ Live NIFTY price:', result.nifty.price, 'Change:', result.nifty.change.toFixed(2), `(${result.nifty.pChange.toFixed(2)}%)`);
                }
                
                if (bankniftyData) {
                    const price = parseFloat(bankniftyData.last || bankniftyData.lastPrice);
                    const prevClose = parseFloat(bankniftyData.previousClose || bankniftyData.previousClose);
                    const change = bankniftyData.change ? parseFloat(bankniftyData.change) : (price - prevClose);
                    const pChange = bankniftyData.percentChange ? parseFloat(bankniftyData.percentChange) : 
                                   bankniftyData.pChange ? parseFloat(bankniftyData.pChange) : 
                                   (change / prevClose * 100);
                    
                    result.banknifty = {
                        symbol: 'NIFTY BANK',
                        price: price,
                        open: parseFloat(bankniftyData.open),
                        dayHigh: parseFloat(bankniftyData.high),
                        dayLow: parseFloat(bankniftyData.low),
                        change: change,
                        pChange: pChange,
                        previousClose: prevClose,
                        yearHigh: parseFloat(bankniftyData.yearHigh || 0),
                        yearLow: parseFloat(bankniftyData.yearLow || 0),
                        totalTradedVolume: parseFloat(bankniftyData.totalTradedVolume || 0)
                    };
                    console.log('✅ Live BANKNIFTY price:', result.banknifty.price, 'Change:', result.banknifty.change.toFixed(2), `(${result.banknifty.pChange.toFixed(2)}%)`);
                }
                
                if (vixData) {
                    const price = parseFloat(vixData.last || vixData.lastPrice);
                    const prevClose = parseFloat(vixData.previousClose || vixData.previousClose);
                    const change = vixData.change ? parseFloat(vixData.change) : (price - prevClose);
                    const pChange = vixData.percentChange ? parseFloat(vixData.percentChange) : 
                                   vixData.pChange ? parseFloat(vixData.pChange) : 
                                   (change / prevClose * 100);
                    
                    result.vix = {
                        symbol: 'INDIA VIX',
                        price: price,
                        open: parseFloat(vixData.open),
                        dayHigh: parseFloat(vixData.high),
                        dayLow: parseFloat(vixData.low),
                        change: change,
                        pChange: pChange,
                        previousClose: prevClose,
                        yearHigh: parseFloat(vixData.yearHigh || 0),
                        yearLow: parseFloat(vixData.yearLow || 0),
                        totalTradedVolume: parseFloat(vixData.totalTradedVolume || 0)
                    };
                    console.log('✅ Live VIX price:', result.vix.price, 'Change:', result.vix.change.toFixed(2), `(${result.vix.pChange.toFixed(2)}%)`);
                }
                
                // Cache the result
                priceCache = result;
                priceCacheTimestamp = Date.now();
                console.log('💾 Cached price data for 1 minute');
                
                return res.json(result);
            }
        }
        
        throw new Error('NIFTY 50 data not found in NSE response');
        
    } catch (error) {
        console.error('❌ NSE API error:', error.message);
        
        // Fallback to mock data with realistic values
        console.log('⚠️ Using mock data fallback');
        const mockNiftyPrice = 24300 + (Math.random() - 0.5) * 200;
        const niftyChange = (Math.random() - 0.5) * 150;
        const mockBankNiftyPrice = 51000 + (Math.random() - 0.5) * 400;
        const bankNiftyChange = (Math.random() - 0.5) * 300;
        const mockVixPrice = 15 + (Math.random() - 0.5) * 4;
        const vixChange = (Math.random() - 0.5) * 2;
        
        const result = {
            status: 'mock',
            source: 'Mock Data (NSE API unavailable)',
            timestamp: new Date().toISOString(),
            nifty: {
                symbol: 'NIFTY 50',
                price: parseFloat(mockNiftyPrice.toFixed(2)),
                open: parseFloat((mockNiftyPrice - 50).toFixed(2)),
                dayHigh: parseFloat((mockNiftyPrice + 100).toFixed(2)),
                dayLow: parseFloat((mockNiftyPrice - 120).toFixed(2)),
                change: parseFloat(niftyChange.toFixed(2)),
                pChange: parseFloat((niftyChange / mockNiftyPrice * 100).toFixed(2)),
                previousClose: parseFloat((mockNiftyPrice - niftyChange).toFixed(2)),
                yearHigh: 25000.00,
                yearLow: 21000.00,
                totalTradedVolume: Math.floor(Math.random() * 2000000 + 1000000)
            },
            banknifty: {
                symbol: 'NIFTY BANK',
                price: parseFloat(mockBankNiftyPrice.toFixed(2)),
                open: parseFloat((mockBankNiftyPrice - 100).toFixed(2)),
                dayHigh: parseFloat((mockBankNiftyPrice + 200).toFixed(2)),
                dayLow: parseFloat((mockBankNiftyPrice - 250).toFixed(2)),
                change: parseFloat(bankNiftyChange.toFixed(2)),
                pChange: parseFloat((bankNiftyChange / mockBankNiftyPrice * 100).toFixed(2)),
                previousClose: parseFloat((mockBankNiftyPrice - bankNiftyChange).toFixed(2)),
                yearHigh: 53000.00,
                yearLow: 45000.00,
                totalTradedVolume: Math.floor(Math.random() * 1000000 + 500000)
            },
            vix: {
                symbol: 'INDIA VIX',
                price: parseFloat(mockVixPrice.toFixed(2)),
                open: parseFloat((mockVixPrice - 0.5).toFixed(2)),
                dayHigh: parseFloat((mockVixPrice + 1).toFixed(2)),
                dayLow: parseFloat((mockVixPrice - 1.5).toFixed(2)),
                change: parseFloat(vixChange.toFixed(2)),
                pChange: parseFloat((vixChange / mockVixPrice * 100).toFixed(2)),
                previousClose: parseFloat((mockVixPrice - vixChange).toFixed(2)),
                yearHigh: 30.00,
                yearLow: 10.00,
                totalTradedVolume: 0
            }
        };
        
        res.json(result);
    }
});

app.get('/api/option-chain/:symbol?', async (req, res) => {
    try {
        const symbol = req.params.symbol || 'NIFTY';
        console.log('Generating option chain for:', symbol);
        
        // Since yfinance doesn't provide Indian option chain data,
        // we'll generate realistic mock option chain based on current price
        
        // First get the current underlying price
        let spotPrice = 24300; // Default
        
        try {
            const priceResponse = await axios.get(`http://localhost:${PORT}/api/nifty-price`);
            if (priceResponse.data && priceResponse.data.price) {
                spotPrice = priceResponse.data.price;
            }
        } catch (error) {
            console.log('Could not fetch current price, using default');
        }
        
        console.log('Generating option chain around spot price:', spotPrice);
        
        const options = [];
        
        // Generate option chain around current price
        const atmStrike = Math.round(spotPrice / 50) * 50; // Round to nearest 50
        
        for (let strike = atmStrike - 500; strike <= atmStrike + 500; strike += 50) {
            // Call option - realistic pricing model
            const ceMoneyness = (spotPrice - strike) / spotPrice;
            const ceIntrinsic = Math.max(0, spotPrice - strike);
            const ceTimeValue = Math.max(5, 50 * Math.exp(-Math.abs(ceMoneyness) * 3)) + Math.random() * 10;
            const cePrice = ceIntrinsic + ceTimeValue;
            
            options.push({
                strikePrice: strike,
                optionType: 'CE',
                lastPrice: parseFloat(cePrice.toFixed(2)),
                change: parseFloat((Math.random() - 0.5) * 20).toFixed(2),
                pChange: parseFloat((Math.random() - 0.5) * 10).toFixed(2),
                volume: Math.floor(Math.random() * 50000),
                openInterest: Math.floor(Math.random() * 100000),
                impliedVolatility: parseFloat((15 + Math.random() * 20).toFixed(2)),
                bid: parseFloat((cePrice - 0.5 - Math.random()).toFixed(2)),
                ask: parseFloat((cePrice + 0.5 + Math.random()).toFixed(2))
            });
            
            // Put option - realistic pricing model
            const peMoneyness = (strike - spotPrice) / spotPrice;
            const peIntrinsic = Math.max(0, strike - spotPrice);
            const peTimeValue = Math.max(5, 50 * Math.exp(-Math.abs(peMoneyness) * 3)) + Math.random() * 10;
            const pePrice = peIntrinsic + peTimeValue;
            
            options.push({
                strikePrice: strike,
                optionType: 'PE',
                lastPrice: parseFloat(pePrice.toFixed(2)),
                change: parseFloat((Math.random() - 0.5) * 20).toFixed(2),
                pChange: parseFloat((Math.random() - 0.5) * 10).toFixed(2),
                volume: Math.floor(Math.random() * 50000),
                openInterest: Math.floor(Math.random() * 100000),
                impliedVolatility: parseFloat((15 + Math.random() * 20).toFixed(2)),
                bid: parseFloat((pePrice - 0.5 - Math.random()).toFixed(2)),
                ask: parseFloat((pePrice + 0.5 + Math.random()).toFixed(2))
            });
        }

        const result = {
            symbol: symbol,
            underlyingValue: spotPrice,
            options: options,
            expiryDates: ['14AUG25', '21AUG25', '28AUG25', '29AUG25', '04SEP25'],
            timestamp: new Date().toISOString(),
            status: 'success',
            source: 'yfinance-compatible-mock',
            note: 'Generated realistic option chain - yfinance does not provide Indian option data'
        };

        console.log(`Option chain generated for ${symbol}: ${options.length} options around ₹${spotPrice}`);
        res.json(result);
        
    } catch (error) {
        console.error('Error generating option chain:', error.message);
        res.status(500).json({
            error: error.message,
            status: 'error',
            timestamp: new Date().toISOString(),
            source: 'yfinance-compatible'
        });
    }
});

// Get ATM (At-The-Money) options
app.get('/api/atm-options/:symbol?', async (req, res) => {
    try {
        const symbol = req.params.symbol || 'NIFTY';
        
        // Get current price and option chain
        const [priceResponse, optionResponse] = await Promise.all([
            axios.get(`http://localhost:${PORT}/api/nifty-price`),
            axios.get(`http://localhost:${PORT}/api/option-chain/${symbol}`)
        ]);

        const currentPrice = priceResponse.data.price;
        const optionChain = optionResponse.data.options;

        // Find ATM strike (closest to current price)
        const strikes = [...new Set(optionChain.map(opt => opt.strikePrice))].sort((a, b) => a - b);
        const atmStrike = strikes.reduce((prev, curr) => 
            Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev
        );

        // Get ATM options
        const atmOptions = optionChain.filter(opt => opt.strikePrice === atmStrike);

        const result = {
            symbol: symbol,
            spotPrice: currentPrice,
            atmStrike: atmStrike,
            options: atmOptions,
            timestamp: new Date().toISOString(),
            status: 'success'
        };

        res.json(result);
        
    } catch (error) {
        console.error('Error fetching ATM options:', error.message);
        res.status(500).json({
            error: error.message,
            status: 'error',
            timestamp: new Date().toISOString()
        });
    }
});

app.listen(PORT, () => {
    console.log(`Flattrade Option Trading UI running on http://localhost:${PORT}`);
    
    // Load any saved session on startup
    loadSavedSession();
});
