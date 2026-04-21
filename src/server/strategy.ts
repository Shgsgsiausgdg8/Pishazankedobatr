/**
 * FarazGold Trading Strategy - N Pattern Detector
 * تشخیص الگوی N معمولی و N معکوس با سه نقطه A, B, C
 * سیگنال Buy/Sell در سطح 50% بین A و B
 * Targets: 2%, 3.3%, 3.9% - Stop Loss: 2%
 */

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Signal {
  type: 'BUY' | 'SELL';
  entry: number;
  tp1: number;
  tp2: number;
  tp3: number;
  sl: number;
  time: number;
  timeframe: string;
}

export class TradingStrategy {
    private lastSignalTime: number = 0;       // جلوگیری از سیگنال‌های تکراری
    private lastPatternKey: string | null = null;    // کلید منحصربه‌فرد الگو

    constructor() {}

    /**
     * تابع اصلی تحلیل
     */
    analyze(candles: Candle[], timeframe: string, strategyType: string = 'N-PATTERN'): Signal | null {
        if (!candles || candles.length < 50) return null;

        let result: any = null;

        switch (strategyType) {
            case 'SCALP-ADV':
                result = this.analyzeScalp(candles);
                break;
            case 'QUANT':
                result = this.analyzeQuant(candles);
                break;
            case 'TREND-MT':
                result = this.analyzeTrend(candles);
                break;
            case 'HST':
                result = this.analyzeHST(candles);
                break;
            case 'PINBAR':
                result = this.analyzePinBar(candles);
                break;
            case 'RSI':
                result = this.analyzeRSI(candles);
                break;
            case 'EMA-CROSS':
                result = this.analyzeEMACross(candles);
                break;
            case 'N-PATTERN':
            default:
                result = this.detectNPattern(candles);
                break;
        }

        if (!result) return null;

        // جلوگیری از سیگنال‌های تکراری
        const now = Date.now();
        if (this.lastSignalTime && (now - this.lastSignalTime) < 60000 && strategyType === 'N-PATTERN') return null;

        const signal = this.createSignalFromPattern(result, timeframe);
        this.lastSignalTime = now;
        return signal;
    }

    private analyzeRSI(candles: Candle[]) {
        const period = 14;
        if (candles.length < period + 1) return null;

        const rsiValues = this.calculateRSI(candles, period);
        const lastRSI = rsiValues[rsiValues.length - 1];
        const prevRSI = rsiValues[rsiValues.length - 2];
        const lastPrice = candles[candles.length - 1].close;

        // Buy on Oversold cross up
        if (prevRSI < 30 && lastRSI >= 30) {
            return { type: 'BUY', signalPrice: lastPrice };
        }
        // Sell on Overbought cross down
        if (prevRSI > 70 && lastRSI <= 70) {
            return { type: 'SELL', signalPrice: lastPrice };
        }

        return null;
    }

    private analyzeEMACross(candles: Candle[]) {
        if (candles.length < 22) return null;

        const ema9 = this.calculateEMA(candles, 9);
        const ema21 = this.calculateEMA(candles, 21);

        const lastEma9 = ema9[ema9.length - 1];
        const prevEma9 = ema9[ema9.length - 2];
        const lastEma21 = ema21[ema21.length - 1];
        const prevEma21 = ema21[ema21.length - 2];
        const lastPrice = candles[candles.length - 1].close;

        // Bullish Cross
        if (prevEma9 < prevEma21 && lastEma9 >= lastEma21) {
            return { type: 'BUY', signalPrice: lastPrice };
        }
        // Bearish Cross
        if (prevEma9 > prevEma21 && lastEma9 <= lastEma21) {
            return { type: 'SELL', signalPrice: lastPrice };
        }

        return null;
    }

    private analyzeScalp(candles: Candle[]) {
        const periodRSI = 14;
        const emaFastP = 9;
        const emaSlowP = 21;
        
        const rsi = this.calculateRSI(candles, periodRSI);
        const ema9 = this.calculateEMA(candles, emaFastP);
        const ema21 = this.calculateEMA(candles, emaSlowP);
        const atr = this.calculateATR(candles, 14);
        
        const lastRSI = rsi[rsi.length - 1];
        const lastE9 = ema9[ema9.length - 1];
        const lastE21 = ema21[ema21.length - 1];
        const lastPrice = candles[candles.length - 1].close;
        const prevPrice = candles[candles.length - 2].close;

        // Buy: Strong trend (9 > 21) + RSI oversold recovery or pullback to EMA
        if (lastE9 > lastE21) {
            if (lastRSI < 40 && lastPrice > prevPrice) return { type: 'BUY', signalPrice: lastPrice, atr };
            if (lastPrice > lastE21 && prevPrice <= lastE21) return { type: 'BUY', signalPrice: lastPrice, atr };
        }
        
        // Sell: Strong down trend (9 < 21) + RSI overbought recovery
        if (lastE9 < lastE21) {
            if (lastRSI > 60 && lastPrice < prevPrice) return { type: 'SELL', signalPrice: lastPrice, atr };
            if (lastPrice < lastE21 && prevPrice >= lastE21) return { type: 'SELL', signalPrice: lastPrice, atr };
        }
        
        return null;
    }

    private analyzeQuant(candles: Candle[]) {
        const lookback = 20;
        const recent = candles.slice(-lookback);
        const highs = recent.map(c => c.high);
        const lows = recent.map(c => c.low);
        
        const maxH = Math.max(...highs);
        const minL = Math.min(...lows);
        const lastPrice = candles[candles.length - 1].close;
        const atr = this.calculateATR(candles, 14);
        
        // Double Bottom / Breakout
        if (lastPrice > maxH * 0.9995 && candles[candles.length - 2].close < maxH) {
            return { type: 'BUY', signalPrice: lastPrice, atr };
        }
        // Double Top / Breakdown
        if (lastPrice < minL * 1.0005 && candles[candles.length - 2].close > minL) {
            return { type: 'SELL', signalPrice: lastPrice, atr };
        }
        
        return null;
    }

    private analyzeTrend(candles: Candle[]) {
        const maFast = this.calculateEMA(candles, 20);
        const maSlow = this.calculateEMA(candles, 50);
        const macd = this.calculateMACD(candles, 12, 26, 9);
        const atr = this.calculateATR(candles, 14);
        
        if (!macd) return null;
        
        const lastFast = maFast[maFast.length - 1];
        const lastSlow = maSlow[maSlow.length - 1];
        const lastHist = macd.histogram;
        const lastPrice = candles[candles.length - 1].close;

        // Long only if fast > slow AND macd hist increasing
        if (lastFast > lastSlow && lastHist > 0) return { type: 'BUY', signalPrice: lastPrice, atr };
        if (lastFast < lastSlow && lastHist < 0) return { type: 'SELL', signalPrice: lastPrice, atr };
        
        return null;
    }

    private analyzeHST(candles: Candle[]) {
        // Simple HMA + Trend implementation
        const hma = this.calculateEMA(candles, 55); 
        const atr = this.calculateATR(candles, 14);
        const lastH = hma[hma.length - 1];
        const prevH = hma[hma.length - 2];
        const lastPrice = candles[candles.length - 1].close;

        if (lastPrice > lastH && lastH > prevH) return { type: 'BUY', signalPrice: lastPrice, atr };
        if (lastPrice < lastH && lastH < prevH) return { type: 'SELL', signalPrice: lastPrice, atr };
        
        return null;
    }

    private analyzePinBar(candles: Candle[]) {
        const c = candles[candles.length - 1];
        const range = c.high - c.low;
        const atr = this.calculateATR(candles, 14);
        if (range === 0) return null;
        
        const body = Math.abs(c.close - c.open);
        const upperWick = c.high - Math.max(c.open, c.close);
        const lowerWick = Math.min(c.open, c.close) - c.low;
        
        // Bullish Pin
        if (lowerWick > body * 3 && upperWick < body) return { type: 'BUY', signalPrice: c.close, atr };
        // Bearish Pin
        if (upperWick > body * 3 && lowerWick < body) return { type: 'SELL', signalPrice: c.close, atr };
        
        return null;
    }

    private calculateMACD(candles: Candle[], fast: number, slow: number, signal: number) {
        if (candles.length < slow + signal) return null;
        const emaF = this.calculateEMA(candles, fast);
        const emaS = this.calculateEMA(candles, slow);
        
        const macdLine = emaF.map((f, i) => f - emaS[i]);
        // Simple signal line (SMA of macdLine)
        const signalLine = macdLine.slice(-signal).reduce((a, b) => a + b, 0) / signal;
        
        return {
            macd: macdLine[macdLine.length - 1],
            signal: signalLine,
            histogram: macdLine[macdLine.length - 1] - signalLine
        };
    }

    private calculateRSI(candles: Candle[], period: number) {
        let gains = 0;
        let losses = 0;

        for (let i = 1; i <= period; i++) {
            const diff = candles[i].close - candles[i - 1].close;
            if (diff >= 0) gains += diff;
            else losses -= diff;
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        const rsi = [];
        for (let i = period + 1; i < candles.length; i++) {
            const diff = candles[i].close - candles[i - 1].close;
            const gain = diff >= 0 ? diff : 0;
            const loss = diff < 0 ? -diff : 0;

            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;

            const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            rsi.push(100 - (100 / (1 + rs)));
        }
        return rsi;
    }

    private calculateEMA(candles: Candle[], period: number) {
        const k = 2 / (period + 1);
        let ema = candles[0].close;
        const emaArray = [ema];

        for (let i = 1; i < candles.length; i++) {
            ema = (candles[i].close * k) + (ema * (1 - k));
            emaArray.push(ema);
        }
        return emaArray;
    }

    /**
     * تشخیص الگوی N یا N معکوس از روی نقاط چرخشی اخیر
     * @param candles 
     * @returns - { type, A, B, C, signalPrice }
     */
    private detectNPattern(candles: Candle[]) {
        // 1. پیدا کردن نقاط چرخشی (سقف و کف محلی)
        const pivots: { type: 'high' | 'low', price: number, index: number, time: number }[] = [];
        const len = candles.length;
        for (let i = 1; i < len - 1; i++) {
            const prev = candles[i-1];
            const curr = candles[i];
            const next = candles[i+1];
            
            // سقف محلی (قله)
            if (curr.high > prev.high && curr.high > next.high) {
                pivots.push({ type: 'high', price: curr.high, index: i, time: curr.time });
            }
            // کف محلی (دره)
            if (curr.low < prev.low && curr.low < next.low) {
                pivots.push({ type: 'low', price: curr.low, index: i, time: curr.time });
            }
        }

        if (pivots.length < 3) return null;

        // 2. سه نقطه چرخشی آخر را بگیرید (باید متناوب باشند)
        const recent = pivots.slice(-3);
        const [p1, p2, p3] = recent;
        if (p1.type === p2.type || p2.type === p3.type) return null;

        // 3. الگوی N معمولی: low → high → low
        if (p1.type === 'low' && p2.type === 'high' && p3.type === 'low') {
            const A = p1.price;
            const B = p2.price;
            const C = p3.price;
            // شرط: A < B و C < B و C > A
            if (A < B && C < B && C > A) {
                const signalPrice = A + (B - A) * 0.5;
                // کلید منحصربه‌فرد برای این الگو
                const patternKey = `N|${A}|${B}|${C}`;
                if (this.lastPatternKey === patternKey) return null;
                this.lastPatternKey = patternKey;
                return { type: 'SELL', A, B, C, signalPrice };
            }
        }

        // 4. الگوی N معکوس: high → low → high
        if (p1.type === 'high' && p2.type === 'low' && p3.type === 'high') {
            const A = p1.price;
            const B = p2.price;
            const C = p3.price;
            // شرط: A > B و C > B و C < A
            if (A > B && C > B && C < A) {
                const signalPrice = A + (B - A) * 0.5; 
                const patternKey = `INV|${A}|${B}|${C}`;
                if (this.lastPatternKey === patternKey) return null;
                this.lastPatternKey = patternKey;
                return { type: 'BUY', A, B, C, signalPrice };
            }
        }

        return null;
    }

    /**
     * ساخت آبجکت سیگنال با تارگت‌ها و استاپ لاس
     * @param pattern 
     * @param timeframe 
     * @returns
     */
    private createSignalFromPattern(pattern: any, timeframe: string): Signal {
        const isBuy = pattern.type === 'BUY';
        const entry = pattern.signalPrice;
        
        // Dynamic SL/TP based on ATR for high precision
        const atr = pattern.atr || entry * 0.001; 
        const slDist = atr * 1.5;
        const tpDist = atr * 2.1; // Balanced RR Ratio

        const tp1 = isBuy ? entry + tpDist : entry - tpDist;
        const tp2 = isBuy ? entry + (tpDist * 1.5) : entry - (tpDist * 1.5);
        const tp3 = isBuy ? entry + (tpDist * 2.0) : entry - (tpDist * 2.0);
        const sl = isBuy ? entry - slDist : entry + slDist;

        return {
            type: pattern.type,
            entry: entry,
            sl: sl,
            tp1: tp1,
            tp2: tp2,
            tp3: tp3,
            time: Date.now(),
            timeframe: timeframe
        };
    }

    private calculateATR(candles: Candle[], period: number = 14) {
        if (candles.length < period + 1) return candles[candles.length - 1].close * 0.001;
        let totalTR = 0;
        for (let i = candles.length - period; i < candles.length; i++) {
            const h = candles[i].high;
            const l = candles[i].low;
            const pc = candles[i - 1].close;
            const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
            totalTR += tr;
        }
        return totalTR / period;
    }
}
