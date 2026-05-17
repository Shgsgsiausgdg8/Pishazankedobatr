import { Candle, StrategyConfig } from '../strategy.js';

export class Fib38Detector {
    public detect(candles: Candle[], config: StrategyConfig) {
        const lookback = config.fibLookback;
        const recentCandles = candles.slice(-lookback);
        if (recentCandles.length < (lookback * 0.6)) return null; 

        let saghf = -Infinity;
        let kaf = Infinity;

        recentCandles.forEach(c => {
            if (c.high > saghf) saghf = c.high;
            if (c.low < kaf) kaf = c.low;
        });

        const range = saghf - kaf;
        if (range <= config.fibMinRange) return null; 

        const last = candles[candles.length - 1];
        const prev = candles[candles.length - 2];

        // FIB levels
        const fib38 = saghf - (range * 0.382);
        const fib61 = saghf - (range * 0.618);
        
        const fib38_inv = kaf + (range * 0.382);
        const fib61_inv = kaf + (range * 0.618);

        // Buy: Pullback into the 38.2%-61.8% zone and showing a reversal
        if (prev.low <= fib38 && prev.low >= fib61 && last.close > prev.close) {
            return { 
                type: 'BUY', 
                signalPrice: last.close,
                kaf: kaf,
                saghf: saghf,
                confidence: 85,
                isFIB38: true
            };
        }

        // Sell: Pullback into the 38.2%-61.8% zone and showing a reversal
        if (prev.high >= fib38_inv && prev.high <= fib61_inv && last.close < prev.close) {
            return { 
                type: 'SELL', 
                signalPrice: last.close,
                kaf: kaf,
                saghf: saghf,
                confidence: 85,
                isFIB38: true
            };
        }

        return null;
    }
}
