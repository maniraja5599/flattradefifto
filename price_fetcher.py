#!/usr/bin/env python3
"""
Price fetcher for NIFTY and NSE option data
Fetches real-time price data from various sources
"""

import yfinance as yf
import requests
import json
import pandas as pd
from datetime import datetime, timedelta
import sys
import warnings
warnings.filterwarnings('ignore')

def fetch_nifty_price():
    """Fetch current NIFTY 50 price from Yahoo Finance"""
    try:
        # NIFTY 50 symbol on Yahoo Finance
        nifty = yf.Ticker("^NSEI")
        
        # Get current data
        info = nifty.info
        hist = nifty.history(period="1d", interval="1m")
        
        if not hist.empty:
            current_price = hist['Close'].iloc[-1]
            open_price = hist['Open'].iloc[0]
            high_price = hist['High'].max()
            low_price = hist['Low'].min()
            volume = hist['Volume'].sum()
            
            # Calculate change
            change = current_price - open_price
            change_percent = (change / open_price) * 100
            
            return {
                "symbol": "NIFTY 50",
                "price": round(current_price, 2),
                "open": round(open_price, 2),
                "high": round(high_price, 2),
                "low": round(low_price, 2),
                "change": round(change, 2),
                "changePercent": round(change_percent, 2),
                "volume": int(volume),
                "timestamp": datetime.now().isoformat(),
                "status": "success"
            }
        else:
            raise Exception("No price data available")
            
    except Exception as e:
        return {
            "symbol": "NIFTY 50",
            "error": str(e),
            "status": "error",
            "timestamp": datetime.now().isoformat()
        }

def fetch_nse_option_chain(symbol="NIFTY", expiry_date=None):
    """Fetch option chain data from NSE"""
    try:
        # NSE option chain URL
        url = "https://www.nseindia.com/api/option-chain-indices"
        
        # Headers to mimic browser request
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'DNT': '1',
            'Pragma': 'no-cache',
            'Cache-Control': 'no-cache'
        }
        
        # Parameters
        params = {
            'symbol': symbol
        }
        
        # Create session
        session = requests.Session()
        session.headers.update(headers)
        
        # First, get the main page to establish session
        base_url = "https://www.nseindia.com"
        session.get(base_url)
        
        # Now get option chain data
        response = session.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            
            # Extract relevant option data
            records = data.get('records', {})
            option_data = records.get('data', [])
            
            # Get current market price
            underlying_value = records.get('underlyingValue', 0)
            
            # Process option chain
            options = []
            for item in option_data:
                strike_price = item.get('strikePrice', 0)
                
                # Call option data
                call_data = item.get('CE', {})
                if call_data:
                    options.append({
                        "strikePrice": strike_price,
                        "optionType": "CE",
                        "lastPrice": call_data.get('lastPrice', 0),
                        "change": call_data.get('change', 0),
                        "pChange": call_data.get('pChange', 0),
                        "totalTradedVolume": call_data.get('totalTradedVolume', 0),
                        "impliedVolatility": call_data.get('impliedVolatility', 0),
                        "openInterest": call_data.get('openInterest', 0),
                        "bid": call_data.get('bidprice', 0),
                        "ask": call_data.get('askPrice', 0)
                    })
                
                # Put option data
                put_data = item.get('PE', {})
                if put_data:
                    options.append({
                        "strikePrice": strike_price,
                        "optionType": "PE",
                        "lastPrice": put_data.get('lastPrice', 0),
                        "change": put_data.get('change', 0),
                        "pChange": put_data.get('pChange', 0),
                        "totalTradedVolume": put_data.get('totalTradedVolume', 0),
                        "impliedVolatility": put_data.get('impliedVolatility', 0),
                        "openInterest": put_data.get('openInterest', 0),
                        "bid": put_data.get('bidprice', 0),
                        "ask": put_data.get('askPrice', 0)
                    })
            
            # Get expiry dates
            expiry_dates = records.get('expiryDates', [])
            
            return {
                "symbol": symbol,
                "underlyingValue": underlying_value,
                "options": options,
                "expiryDates": expiry_dates,
                "timestamp": datetime.now().isoformat(),
                "status": "success"
            }
        else:
            raise Exception(f"NSE API returned status code: {response.status_code}")
            
    except Exception as e:
        return {
            "symbol": symbol,
            "error": str(e),
            "status": "error",
            "timestamp": datetime.now().isoformat()
        }

def get_atm_options(spot_price, option_chain):
    """Get At-The-Money (ATM) options"""
    try:
        # Find closest strike to spot price
        strikes = list(set([opt['strikePrice'] for opt in option_chain]))
        strikes.sort()
        
        atm_strike = min(strikes, key=lambda x: abs(x - spot_price))
        
        # Get ATM CE and PE
        atm_options = [opt for opt in option_chain if opt['strikePrice'] == atm_strike]
        
        return {
            "atmStrike": atm_strike,
            "options": atm_options,
            "spotPrice": spot_price
        }
    except Exception as e:
        return {"error": str(e)}

def main():
    """Main function to fetch all price data"""
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == "nifty":
            result = fetch_nifty_price()
            print(json.dumps(result, indent=2))
            
        elif command == "options":
            symbol = sys.argv[2] if len(sys.argv) > 2 else "NIFTY"
            result = fetch_nse_option_chain(symbol)
            print(json.dumps(result, indent=2))
            
        elif command == "atm":
            # Get both NIFTY price and option chain
            nifty_data = fetch_nifty_price()
            if nifty_data['status'] == 'success':
                option_data = fetch_nse_option_chain("NIFTY")
                if option_data['status'] == 'success':
                    atm_data = get_atm_options(nifty_data['price'], option_data['options'])
                    result = {
                        "nifty": nifty_data,
                        "atm": atm_data,
                        "timestamp": datetime.now().isoformat()
                    }
                    print(json.dumps(result, indent=2))
                else:
                    print(json.dumps(option_data, indent=2))
            else:
                print(json.dumps(nifty_data, indent=2))
                
        else:
            print(json.dumps({"error": "Invalid command. Use: nifty, options, or atm"}, indent=2))
    else:
        # Default: fetch all data
        nifty_data = fetch_nifty_price()
        option_data = fetch_nse_option_chain("NIFTY")
        
        result = {
            "nifty": nifty_data,
            "options": option_data,
            "timestamp": datetime.now().isoformat()
        }
        print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
