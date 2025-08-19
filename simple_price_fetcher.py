#!/usr/bin/env python3
"""
Yahoo Finance data fetcher using yfinance library
Handles rate limits and provides fallback mock data
"""

import yfinance as yf
import pandas as pd
import json
import sys
import time
import random
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

def generate_realistic_mock_data(symbol_name="NIFTY 50", base_price=24300):
    """Generate realistic mock data when yfinance is unavailable"""
    # Add some realistic variation
    variation = random.uniform(-100, 100)
    current_price = base_price + variation
    
    # Generate realistic OHLC
    open_price = current_price + random.uniform(-50, 50)
    high_price = max(current_price, open_price) + random.uniform(0, 80)
    low_price = min(current_price, open_price) - random.uniform(0, 80)
    
    # Calculate change
    change = current_price - open_price
    change_percent = (change / open_price) * 100 if open_price != 0 else 0
    
    return {
        "symbol": symbol_name,
        "price": round(current_price, 2),
        "open": round(open_price, 2),
        "high": round(high_price, 2),
        "low": round(low_price, 2),
        "change": round(change, 2),
        "changePercent": round(change_percent, 2),
        "volume": random.randint(500000, 2000000),
        "timestamp": datetime.now().isoformat(),
        "status": "mock",
        "source": "yfinance-fallback",
        "note": "Generated realistic mock data - yfinance rate limited or unavailable"
    }

def fetch_yfinance_simple(symbol, symbol_name, retries=2):
    """Simplified yfinance fetch with retry logic"""
    for attempt in range(retries):
        try:
            # Create ticker with minimal requests
            ticker = yf.Ticker(symbol)
            
            # Try to get just basic price data
            hist = ticker.history(period="1d", interval="1d")
            
            if not hist.empty:
                latest = hist.iloc[-1]
                
                # Get basic OHLC data
                current_price = float(latest['Close'])
                open_price = float(latest['Open'])
                high_price = float(latest['High'])
                low_price = float(latest['Low'])
                volume = int(latest['Volume']) if not pd.isna(latest['Volume']) else 0
                
                # Calculate change
                change = current_price - open_price
                change_percent = (change / open_price) * 100 if open_price != 0 else 0
                
                return {
                    "symbol": symbol_name,
                    "price": round(current_price, 2),
                    "open": round(open_price, 2),
                    "high": round(high_price, 2),
                    "low": round(low_price, 2),
                    "change": round(change, 2),
                    "changePercent": round(change_percent, 2),
                    "volume": volume,
                    "timestamp": datetime.now().isoformat(),
                    "status": "success",
                    "source": "yfinance"
                }
            else:
                raise Exception("No data returned from yfinance")
                
        except Exception as e:
            if attempt < retries - 1:
                # Wait before retry
                time.sleep(1 + attempt)
                continue
            else:
                # Final attempt failed
                return {
                    "symbol": symbol_name,
                    "error": str(e),
                    "status": "error",
                    "source": "yfinance",
                    "timestamp": datetime.now().isoformat()
                }
    
    return None

def fetch_nifty_data():
    """Fetch NIFTY data with fallback"""
    # Try multiple symbol variations for NIFTY
    symbols = ["^NSEI", "NSEI", "NIFTY50"]
    
    for symbol in symbols:
        result = fetch_yfinance_simple(symbol, "NIFTY 50")
        if result and result.get('status') == 'success':
            return result
        
        # Small delay between attempts
        time.sleep(0.5)
    
    # All yfinance attempts failed, return mock data
    return generate_realistic_mock_data("NIFTY 50", 24300)

def fetch_bank_nifty_data():
    """Fetch Bank NIFTY data with fallback"""
    symbols = ["^NSEBANK", "NSEBANK", "BANKNIFTY"]
    
    for symbol in symbols:
        result = fetch_yfinance_simple(symbol, "BANK NIFTY")
        if result and result.get('status') == 'success':
            return result
        
        time.sleep(0.5)
    
    # Fallback to mock data
    return generate_realistic_mock_data("BANK NIFTY", 51200)

def fetch_individual_stock(symbol_ns, name):
    """Fetch individual stock data"""
    result = fetch_yfinance_simple(symbol_ns, name)
    if result and result.get('status') == 'success':
        return result
    
    # Generate mock data for individual stocks
    base_prices = {
        "RELIANCE": 2800,
        "TCS": 4200,
        "HDFCBANK": 1700,
        "INFY": 1850
    }
    
    base_price = base_prices.get(name.split()[0], 1500)
    return generate_realistic_mock_data(name, base_price)

def main():
    if len(sys.argv) > 1:
        arg = sys.argv[1].upper()
        
        if arg in ["BANKNIFTY", "BANK_NIFTY", "NSEBANK"]:
            result = fetch_bank_nifty_data()
        elif arg in ["RELIANCE"]:
            result = fetch_individual_stock("RELIANCE.NS", "RELIANCE")
        elif arg in ["TCS"]:
            result = fetch_individual_stock("TCS.NS", "TCS")
        elif arg in ["HDFCBANK"]:
            result = fetch_individual_stock("HDFCBANK.NS", "HDFC BANK")
        elif arg in ["INFY"]:
            result = fetch_individual_stock("INFY.NS", "INFOSYS")
        else:
            # Default to NIFTY
            result = fetch_nifty_data()
    else:
        # Default: fetch NIFTY data
        result = fetch_nifty_data()
    
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
