# Flattrade Option Trading UI

A web-based localhost UI for option trading in Flattrade with multiple strike selection and basket order functionality.

## Features

- **Login Integration**: Secure login with Flattrade API credentials
- **Option Chain Display**: Real-time option chain with CE/PE options
- **Multiple Strike Selection**: Select multiple strikes for basket orders
- **Basket Orders**: Place multiple option orders simultaneously
- **CE/PE Selection**: Easy toggle between Call and Put options
- **Position Tracking**: View current positions and P&L
- **Responsive Design**: Works on desktop and mobile devices

## Prerequisites

- Node.js (v14 or higher)
- Flattrade trading account with API access
- Valid Flattrade API credentials

## Installation

1. Clone or download this project
2. Navigate to the project directory
3. Install dependencies:

```bash
npm install
```

## Configuration

Before running the application, you'll need to obtain the following from Flattrade:

- **User ID**: Your Flattrade login ID
- **Password**: Your Flattrade login password
- **TOTP**: Your Time-based One-Time Password (6-digit code from authenticator app)
- **API Key**: Your application's API key (different from API secret)
- **API Secret**: Your API secret key for request signing
- **Redirect URL**: The callback URL for OAuth authentication (default: http://localhost:3001/callback)

## Authentication Flow

Flattrade uses OAuth-based authentication. The process is:

1. **Generate Auth URL**: Click "Generate Auth URL" to create the authorization link
2. **Authorize**: Complete the OAuth flow in the opened browser tab
3. **Return**: Come back to the application after authorization
4. **Login**: Use your credentials to complete the login process

## Running the Application

1. Start the server:

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

2. Open your browser and navigate to:

```
http://localhost:3001
```

## Usage

### 1. Login
- Enter your Flattrade credentials in the login form
- Click "Login" to authenticate

### 2. Load Option Chain
- Select the underlying symbol (NIFTY, BANKNIFTY, etc.)
- Choose the expiry date
- Enter the current spot price
- Click "Load Chain" to fetch option data

### 3. Select Options
- Click on any CE (Call) or PE (Put) option to add it to your basket
- Use "All CE" or "All PE" buttons for bulk selection
- Use "Clear All" to deselect all options

### 4. Configure Orders
- Set default quantity and product type
- Individual orders can be modified in the basket
- Choose BUY or SELL for each option
- Adjust quantities as needed

### 5. Place Basket Order
- Review your selected options in the basket
- Click "Place Basket Order" to execute all orders
- Monitor the results and check your positions

## API Endpoints

The application provides several API endpoints:

- `POST /api/login` - Authenticate with Flattrade
- `POST /api/option-chain` - Get option chain data
- `POST /api/basket-order` - Place multiple orders
- `GET /api/positions` - Get current positions
- `GET /api/orders` - Get order book
- `POST /api/logout` - Logout

## File Structure

```
├── package.json          # Project dependencies
├── server.js            # Express server with API routes
├── public/
│   ├── index.html       # Main UI
│   ├── styles.css       # CSS styling
│   └── script.js        # Frontend JavaScript
└── README.md           # This file
```

## Important Notes

### Flattrade API Setup
- **API Registration**: You must register your application with Flattrade to get API credentials
- **Callback URL**: The redirect URL must be registered with Flattrade beforehand
- **Rate Limits**: Flattrade API has specific rate limits and usage policies
- **Market Hours**: Some API functions may only work during market hours

### Security
- This is a localhost application for personal use
- Never share your API credentials
- The session data is stored in memory (not persistent)
- For production use, implement proper session management

### Trading Risks
- This application is for educational/personal use
- Always verify orders before placing them
- Be aware of market risks when trading options
- Test thoroughly before using with real money

### API Limitations
- Flattrade API has rate limits
- Some features may require additional API permissions
- Option chain data is generated for demo purposes in this version

## Customization

### Adding New Symbols
Edit the symbol dropdown in `public/index.html`:

```html
<select class="form-select" id="symbolSelect">
    <option value="NIFTY">NIFTY</option>
    <option value="BANKNIFTY">BANKNIFTY</option>
    <option value="FINNIFTY">FINNIFTY</option>
    <option value="MIDCPNIFTY">MIDCPNIFTY</option>
    <!-- Add new symbols here -->
</select>
```

### Modifying Default Settings
Update default values in `public/script.js`:

```javascript
getDefaultSpotPrice(symbol) {
    const prices = {
        'NIFTY': 19500,
        'BANKNIFTY': 45000,
        // Add default prices for new symbols
    };
    return prices[symbol] || 19500;
}
```

## Troubleshooting

### Common Issues

1. **API Connection Failed**
   - Click "Test API Connection" to verify network connectivity to Flattrade servers
   - This test checks if Flattrade domains are reachable (DNS resolution)
   - Check your internet connection if the test fails
   - Verify Flattrade services are operational
   - Ensure firewall/proxy settings allow connections to *.flattrade.in domains

2. **Login Failed**
   - Verify all credentials are correct
   - Check if TOTP code is current (it expires every 30 seconds)
   - Ensure API access is enabled in your Flattrade account
   - Confirm your API key and secret are valid

3. **Auth URL Generation Issues**
   - Ensure API Key and Redirect URL fields are filled
   - Check browser console for detailed error messages
   - Verify the redirect URL matches your registered callback URL

4. **Option Chain Not Loading**
   - Check network connection
   - Verify symbol and expiry date
   - Check server logs for API errors

5. **Orders Not Placing**
   - Ensure you're logged in
   - Check order parameters (quantity, price type)
   - Verify sufficient funds/margins

### Debug Mode
Enable debug logging by modifying the server:

```javascript
// Add this to server.js for detailed logging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`, req.body);
    next();
});
```

## Support

For issues related to:
- **Flattrade API**: Contact Flattrade support
- **Application bugs**: Check the console for error messages
- **Feature requests**: Modify the code as needed

## Disclaimer

This software is provided "as is" without warranty. Trading involves risk of loss. The developers are not responsible for any trading losses incurred while using this application. Always do your own research and consider consulting a financial advisor.

## License

This project is for educational and personal use only.
