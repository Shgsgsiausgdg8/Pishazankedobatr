import { Candle, Signal } from "./strategy.js";

export class BitRangeAnalyzer {
    // Basic Trend Analyzer
    analyzeTrend(candles: Candle[]) {
        if (!candles || candles.length < 50) {
            return { overall: 'neutral', strength: 0 };
        }
        const closes = candles.map(c => c.close);
        const ema20 = this.calculateEMA(closes, 20);
        const ema50 = this.calculateEMA(closes, 50);

        const lastEma20 = ema20[ema20.length - 1];
        const lastEma50 = ema50[ema50.length - 1];
        
        if (lastEma20 > lastEma50) return { overall: 'bullish', strength: 20 };
        if (lastEma20 < lastEma50) return { overall: 'bearish', strength: 20 };
        
        return { overall: 'neutral', strength: 0 };
    }

    calculateEMA(data: number[], period: number) {
        if (data.length < period) return new Array(data.length).fill(null);
        const ema = new Array(data.length).fill(null);
        const multiplier = 2 / (period + 1);
        let sum = 0;
        for (let i = 0; i < period; i++) sum += data[i];
        ema[period - 1] = sum / period;
        for (let i = period; i < data.length; i++) {
            ema[i] = (data[i] - ema[i - 1]) * multiplier + ema[i - 1];
        }
        return ema;
    }

    analyzeRange(candles: Candle[], price: number) {
        // checks if the market is ranging
        if (!candles || candles.length < 20) return { isRanging: false };
        const highs = candles.slice(-20).map(c => c.high);
        const lows = candles.slice(-20).map(c => c.low);
        const maxH = Math.max(...highs);
        const minL = Math.min(...lows);
        const width = ((maxH - minL) / minL) * 100;
        if (width < 3) return { isRanging: true, upper: maxH, lower: minL };
        return { isRanging: false, upper: maxH, lower: minL };
    }

    // Divergence
    getRSI(candles: Candle[], period = 14) {
        const values = candles.map(c => c.close);
        const rsi = new Array(values.length).fill(50);
        if (values.length <= period) return rsi;
        
        let gains = 0, losses = 0;
        for (let i = 1; i <= period; i++) {
            let diff = values[i] - values[i - 1];
            if (diff >= 0) gains += diff;
            else losses -= diff;
        }
        
        let avgGain = gains / period;
        let avgLoss = losses / period;
        
        for (let i = period + 1; i < values.length; i++) {
            const diff = values[i] - values[i - 1];
            const gain = diff >= 0 ? diff : 0;
            const loss = diff < 0 ? -diff : 0;
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
            const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            rsi[i] = 100 - (100 / (1 + rs));
        }
        return rsi;
    }

    public analyzeBitRange(candles: Candle[]): any {
        if (!candles || candles.length < 80) return null;

        const rangeData = this.analyzeRange(candles, candles[candles.length - 1].close);
        const trend = this.analyzeTrend(candles);
        const rsi = this.getRSI(candles);
        const currentRSI = rsi[rsi.length - 1];

        // find swings
        const swings = this.getSignificantSwings(candles, 5);
        if (swings.length < 2) return null;

        const lastPrice = candles[candles.length - 1].close;
        const lastCandle = candles[candles.length - 1];
        
        // Simple 38.2% Fib / Range breakout logic
        const lastLow = swings.filter(s => s.type === 'low').pop();
        const lastHigh = swings.filter(s => s.type === 'high').pop();

        if (lastLow && lastHigh) {
            const fibRange = Math.abs(lastHigh.price - lastLow.price);
            if (fibRange < (lastHigh.price * 0.001)) return null;

            // BULLISH condition: Ranging or slight bullish trend, RSI oversold
            if (trend.overall !== 'bearish' && currentRSI < 40 && lastPrice <= lastLow.price + (fibRange * 0.382)) {
                return {
                    type: 'BUY',
                    signalPrice: lastPrice,
                    sl: lastLow.price - (fibRange * 0.5), // SL below low
                    tp1: lastPrice + (fibRange * 0.382),
                    tp2: lastHigh.price,
                    confidence: 85,
                    isBitRange: true
                };
            }

            // BEARISH condition: Ranging or slight bearish trend, RSI overbought
            if (trend.overall !== 'bullish' && currentRSI > 60 && lastPrice >= lastHigh.price - (fibRange * 0.382)) {
                return {
                    type: 'SELL',
                    signalPrice: lastPrice,
                    sl: lastHigh.price + (fibRange * 0.5), // SL above high
                    tp1: lastPrice - (fibRange * 0.382),
                    tp2: lastLow.price,
                    confidence: 85,
                    isBitRange: true
                };
            }
        }
        return null;
    }

    getSignificantSwings(candles: Candle[], minDistance = 5) {
        const swings = [];
        const len = candles.length;
        const searchDepth = Math.min(60, len - 10);
        
        for (let i = len - searchDepth; i < len - minDistance; i++) {
            let isHigh = true;
            let isLow = true;
            
            for (let j = 1; j <= minDistance; j++) {
                if (i - j >= 0 && candles[i - j].high >= candles[i].high) isHigh = false;
                if (i + j < len && candles[i + j].high >= candles[i].high) isHigh = false;
                if (i - j >= 0 && candles[i - j].low <= candles[i].low) isLow = false;
                if (i + j < len && candles[i + j].low <= candles[i].low) isLow = false;
            }
            
            if (isHigh && candles[i].high > 0) {
                swings.push({ type: 'high', price: candles[i].high, index: i, time: candles[i].time });
            }
            else if (isLow && candles[i].low > 0) {
                swings.push({ type: 'low', price: candles[i].low, index: i, time: candles[i].time });
            }
        }
        return swings;
    }
}
