#!/usr/bin/env python3
"""
Test yfinance with different Indian symbols
"""

import yfinance as yf
import json
from datetime import datetime

def test_symbols():
    """Test different Indian symbols with yfinance"""
    symbols = [
        "^NSEI",      # NIFTY 50
        "^NSEBANK",   # BANK NIFTY
        "RELIANCE.NS", # Reliance Industries
        "TCS.NS",     # TCS
        "HDFCBANK.NS", # HDFC Bank
        "INFY.NS",    # Infosys
    ]
    
    results = []
    
    for symbol in symbols:
        print(f"Testing symbol: {symbol}")
        try:
            ticker = yf.Ticker(symbol)
            
            # Try to get basic info
            info = ticker.info
            
            # Try to get recent data
            hist = ticker.history(period="1d")
            
            if not hist.empty:
                latest = hist.iloc[-1]
                result = {
                    "symbol": symbol,
                    "name": info.get('longName', symbol),
                    "price": float(latest['Close']),
                    "volume": int(latest['Volume']) if latest['Volume'] > 0 else 0,
                    "status": "success"
                }
            else:
                result = {
                    "symbol": symbol,
                    "name": info.get('longName', symbol) if info else symbol,
                    "status": "no_data"
                }
                
        except Exception as e:
            result = {
                "symbol": symbol,
                "error": str(e),
                "status": "error"
            }
        
        results.append(result)
        print(json.dumps(result, indent=2))
        print("-" * 50)
    
    return results

if __name__ == "__main__":
    print("Testing yfinance with Indian symbols...")
    test_symbols()
