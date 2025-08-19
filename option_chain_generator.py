#!/usr/bin/env python3
"""
Option Chain Generator for Indian Markets
Uses yfinance-style data structure with realistic mock data
"""

import json
import sys
import random
from datetime import datetime, timedelta
import yfinance as yf
import time

def generate_option_chain(spot_price, symbol="NIFTY", expiry_days=7):
    """Generate realistic option chain data using yfinance-style structure"""
    
    # Define strike ranges based on index
    if symbol.upper() in ["NIFTY", "NIFTY50"]:
        strike_interval = 50
        strikes_around = 10  # 10 strikes on each side
    elif symbol.upper() in ["BANKNIFTY", "BANK_NIFTY"]:
        strike_interval = 100
        strikes_around = 8
    else:
        strike_interval = 50
        strikes_around = 8
    
    # Calculate ATM strike
    atm_strike = round(spot_price / strike_interval) * strike_interval
    
    # Generate strikes
    strikes = []
    for i in range(-strikes_around, strikes_around + 1):
        strikes.append(atm_strike + (i * strike_interval))
    
    # Calculate expiry date
    expiry_date = datetime.now() + timedelta(days=expiry_days)
    expiry_str = expiry_date.strftime("%Y-%m-%d")
    
    option_chain = {
        "symbol": symbol.upper(),
        "spot_price": spot_price,
        "expiry": expiry_str,
        "timestamp": datetime.now().isoformat(),
        "source": "yfinance-mock",
        "calls": [],
        "puts": []
    }
    
    for strike in strikes:
        # Calculate rough option prices based on moneyness
        moneyness = strike - spot_price
        time_value = max(20, 100 - abs(moneyness) * 0.5)  # Rough time value
        
        # Call option
        if strike <= spot_price:
            # ITM call
            intrinsic_value = spot_price - strike
            call_price = intrinsic_value + time_value + random.uniform(-10, 20)
        else:
            # OTM call
            call_price = time_value * (1 - (moneyness / (spot_price * 0.1))) + random.uniform(-5, 15)
        
        call_price = max(0.05, call_price)  # Minimum premium
        
        # Put option
        if strike >= spot_price:
            # ITM put
            intrinsic_value = strike - spot_price
            put_price = intrinsic_value + time_value + random.uniform(-10, 20)
        else:
            # OTM put
            put_price = time_value * (1 - (abs(moneyness) / (spot_price * 0.1))) + random.uniform(-5, 15)
        
        put_price = max(0.05, put_price)  # Minimum premium
        
        # Add realistic bid-ask spread
        call_bid = call_price - random.uniform(0.5, 2.0)
        call_ask = call_price + random.uniform(0.5, 2.0)
        put_bid = put_price - random.uniform(0.5, 2.0)
        put_ask = put_price + random.uniform(0.5, 2.0)
        
        call_data = {
            "strike": strike,
            "lastPrice": round(call_price, 2),
            "bid": round(max(0.05, call_bid), 2),
            "ask": round(call_ask, 2),
            "volume": random.randint(100, 5000),
            "openInterest": random.randint(1000, 50000),
            "impliedVolatility": round(random.uniform(15, 35), 2),
            "delta": round(min(1.0, max(0.0, 0.5 + (spot_price - strike) / (spot_price * 0.1))), 3),
            "gamma": round(random.uniform(0.001, 0.01), 4),
            "theta": round(-random.uniform(0.5, 3.0), 3),
            "vega": round(random.uniform(5, 25), 2),
            "moneyness": "ITM" if strike <= spot_price else "OTM",
            "contractSymbol": f"{symbol}{expiry_date.strftime('%y%m%d')}C{int(strike):05d}000"
        }
        
        put_data = {
            "strike": strike,
            "lastPrice": round(put_price, 2),
            "bid": round(max(0.05, put_bid), 2),
            "ask": round(put_ask, 2),
            "volume": random.randint(100, 5000),
            "openInterest": random.randint(1000, 50000),
            "impliedVolatility": round(random.uniform(15, 35), 2),
            "delta": round(max(-1.0, min(0.0, -0.5 - (strike - spot_price) / (spot_price * 0.1))), 3),
            "gamma": round(random.uniform(0.001, 0.01), 4),
            "theta": round(-random.uniform(0.5, 3.0), 3),
            "vega": round(random.uniform(5, 25), 2),
            "moneyness": "ITM" if strike >= spot_price else "OTM",
            "contractSymbol": f"{symbol}{expiry_date.strftime('%y%m%d')}P{int(strike):05d}000"
        }
        
        option_chain["calls"].append(call_data)
        option_chain["puts"].append(put_data)
    
    return option_chain

def get_atm_options(spot_price, symbol="NIFTY"):
    """Get ATM and nearby options"""
    chain = generate_option_chain(spot_price, symbol)
    
    # Find ATM strike
    strikes = [opt["strike"] for opt in chain["calls"]]
    atm_strike = min(strikes, key=lambda x: abs(x - spot_price))
    
    # Get ATM options
    atm_call = next((opt for opt in chain["calls"] if opt["strike"] == atm_strike), None)
    atm_put = next((opt for opt in chain["puts"] if opt["strike"] == atm_strike), None)
    
    # Get nearby strikes
    atm_index = strikes.index(atm_strike)
    nearby_calls = []
    nearby_puts = []
    
    for i in range(max(0, atm_index - 2), min(len(strikes), atm_index + 3)):
        nearby_calls.append(chain["calls"][i])
        nearby_puts.append(chain["puts"][i])
    
    return {
        "symbol": symbol,
        "spot_price": spot_price,
        "atm_strike": atm_strike,
        "atm_call": atm_call,
        "atm_put": atm_put,
        "nearby_calls": nearby_calls,
        "nearby_puts": nearby_puts,
        "timestamp": datetime.now().isoformat(),
        "source": "yfinance-mock"
    }

def main():
    symbol = "NIFTY"
    spot_price = 24300
    
    if len(sys.argv) > 1:
        command = sys.argv[1].upper()
        
        if command == "ATM":
            # Get ATM options
            if len(sys.argv) > 2:
                spot_price = float(sys.argv[2])
            if len(sys.argv) > 3:
                symbol = sys.argv[3].upper()
            
            result = get_atm_options(spot_price, symbol)
        
        elif command == "CHAIN":
            # Get full option chain
            if len(sys.argv) > 2:
                spot_price = float(sys.argv[2])
            if len(sys.argv) > 3:
                symbol = sys.argv[3].upper()
            
            result = generate_option_chain(spot_price, symbol)
        
        else:
            # Default ATM
            result = get_atm_options(spot_price, symbol)
    else:
        # Default ATM options
        result = get_atm_options(spot_price, symbol)
    
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
