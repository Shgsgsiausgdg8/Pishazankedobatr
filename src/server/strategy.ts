/**
 * FarazGold Trading Strategy - N Pattern Detector
 * تشخیص الگوی N معمولی و N معکوس با سه نقطه A, B, C
 * نقطه ورود: ۳٪ بازگشت از سقف/کف
 * تارگت‌ها: ۲٪، ۳.۲٪، ۳.۸٪ - استاپ: ۲٪
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
  kaf?: number;
  saghf?: number;
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
     * تشخیص الگوی N با استفاده از نسبت موج (Range)
     * ورود: ۳٪ از رنج سقف تا کف
     */
    private detectNPattern(candles: Candle[]) {
        const pivots = this.getSwingPivots(candles, 8); 
        if (pivots.length < 3) return null;

        const p3 = pivots[pivots.length - 1]; // نقطه C
        const p2 = pivots[pivots.length - 2]; // نقطه B
        const p1 = pivots[pivots.length - 3]; // نقطه A

        const atr = this.calculateATR(candles, 14);

        // الگوی N صعودی
        if (p1.type === 'low' && p2.type === 'high' && p3.type === 'low') {
            const A = p1.price;
            const B = p2.price;
            const C = p3.price;
            
            if (B > A && C < B && C > A) {
                const range = B - A;
                // ورود ۳٪ پایین‌تر از سقف بر مبنای کل رنج موج
                const signalPrice = B - (range * 0.03); 
                
                const patternKey = `N_UP|${p1.index}|${p2.index}|${p3.index}`;
                if (this.lastPatternKey === patternKey) return null;
                this.lastPatternKey = patternKey;
                return { 
                    type: 'BUY', 
                    signalPrice, 
                    atr, 
                    range, // ارسال رنج برای محاسبات تناسبی
                    kaf: A, 
                    saghf: B, 
                    isNPattern: true 
                };
            }
        }

        // الگوی N نزولی
        if (p1.type === 'high' && p2.type === 'low' && p3.type === 'high') {
            const A = p1.price;
            const B = p2.price;
            const C = p3.price;

            if (B < A && C > B && C < A) {
                const range = A - B;
                // ورود ۳٪ بالاتر از کف بر مبنای کل رنج موج
                const signalPrice = B + (range * 0.03);
                
                const patternKey = `N_DOWN|${p1.index}|${p2.index}|${p3.index}`;
                if (this.lastPatternKey === patternKey) return null;
                this.lastPatternKey = patternKey;
                return { 
                    type: 'SELL', 
                    signalPrice, 
                    atr, 
                    range, // ارسال رنج
                    kaf: B, 
                    saghf: A, 
                    isNPattern: true 
                };
            }
        }

        return null;
    }

    /**
     * شناسایی هوشمند سقف و کف (Major & Minor)
     * این تابع سقف و کف‌های "آخر" را با دقت بالا شناسایی می‌کند
     */
    public getSwingPivots(candles: Candle[], majorDepth: number = 12, minorDepth: number = 4) {
        if (candles.length < majorDepth) return [];

        const pivots: { type: 'high' | 'low', price: number, index: number, time: number, levelType: 'major' | 'minor' | 'live' }[] = [];

        // 1. شناسایی سطوح اصلی (Major) برای ساختار کلی
        const majorPivots = this.findPivotsInRange(candles, majorDepth, 0, candles.length - majorDepth, 'major');
        
        // 2. شناسایی سطوح فرعی (Minor) برای دقت در انتهای چارت چرخش‌های سریع
        const minorPivots = this.findPivotsInRange(candles, minorDepth, candles.length - 50, candles.length - minorDepth, 'minor');

        // ترکیب و مرتب‌سازی
        const allPending = [...majorPivots, ...minorPivots].sort((a, b) => a.index - b.index);
        
        const mergedPivots: any[] = [];
        for (const p of allPending) {
            if (mergedPivots.length === 0) {
                mergedPivots.push(p);
                continue;
            }
            const last = mergedPivots[mergedPivots.length - 1];
            if (Math.abs(p.index - last.index) < minorDepth) {
                if (p.levelType === 'major' || (p.type === 'high' && p.price > last.price) || (p.type === 'low' && p.price < last.price)) {
                    mergedPivots[mergedPivots.length - 1] = p;
                }
                continue;
            }
            mergedPivots.push(p);
        }

        // 3. شناسایی سقف و کف "لحظه‌ای" (Live) که هنوز به عمق نرسیده‌اند
        const lastConfirmed = mergedPivots[mergedPivots.length - 1];
        const startIndex = lastConfirmed ? lastConfirmed.index + 1 : 0;
        
        let liveHigh = -Infinity;
        let liveLow = Infinity;
        let liveHighIdx = -1;
        let liveLowIdx = -1;

        for (let i = startIndex; i < candles.length; i++) {
            if (candles[i].high > liveHigh) { liveHigh = candles[i].high; liveHighIdx = i; }
            if (candles[i].low < liveLow) { liveLow = candles[i].low; liveLowIdx = i; }
        }

        if (liveHighIdx !== -1) {
            mergedPivots.push({ type: 'high', price: liveHigh, index: liveHighIdx, time: candles[liveHighIdx].time, levelType: 'live' });
        }
        if (liveLowIdx !== -1) {
            mergedPivots.push({ type: 'low', price: liveLow, index: liveLowIdx, time: candles[liveLowIdx].time, levelType: 'live' });
        }

        // فیلتر نهایی ZigZag
        const zigzag: typeof pivots = [];
        for (const p of mergedPivots) {
            if (zigzag.length === 0) {
                zigzag.push(p);
                continue;
            }
            const last = zigzag[zigzag.length - 1];
            if (last.type === p.type) {
                if ((p.type === 'high' && p.price > last.price) || (p.type === 'low' && p.price < last.price)) {
                    zigzag[zigzag.length - 1] = p;
                }
            } else {
                zigzag.push(p);
            }
        }

        return zigzag;
    }

    private findPivotsInRange(candles: Candle[], depth: number, start: number, end: number, levelType: 'major' | 'minor') {
        const result: any[] = [];
        const safeStart = Math.max(depth, start);
        const safeEnd = Math.min(candles.length - depth, end);

        for (let i = safeStart; i < safeEnd; i++) {
            const curr = candles[i];
            let isHigh = true;
            let isLow = true;
            for (let j = 1; j <= depth; j++) {
                if (candles[i - j].high > curr.high || candles[i + j].high > curr.high) isHigh = false;
                if (candles[i - j].low < curr.low || candles[i + j].low < curr.low) isLow = false;
            }
            if (isHigh) result.push({ type: 'high', price: curr.high, index: i, time: curr.time, levelType });
            else if (isLow) result.push({ type: 'low', price: curr.low, index: i, time: curr.time, levelType });
        }
        return result;
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
        const isN = !!pattern.isNPattern;
        
        // Dynamic SL/TP based on ATR, or fixed % for N-Pattern
        const atr = pattern.atr || entry * 0.001; 
        
        let tp1, tp2, tp3, sl;

        if (isN) {
            // مقادیر درخواستی کاربر برای الگوی N (کالیبره شده برای تایم پایین):
            // تارگت ۱: ۰.۲٪ | تارگت ۲: ۰.۳۲٪ | تارگت ۳: ۰.۳۸٪
            tp1 = isBuy ? entry * 1.002 : entry * 0.998;
            tp2 = isBuy ? entry * 1.0032 : entry * 0.9968;
            tp3 = isBuy ? entry * 1.0038 : entry * 0.9962;
            sl = isBuy ? entry * 0.998 : entry * 1.002; // استاپ لاس ۰.۲٪
        } else {
            const slDist = atr * 1.5;
            const tpDist = atr * 2.1;
            tp1 = isBuy ? entry + tpDist : entry - tpDist;
            tp2 = isBuy ? entry + (tpDist * 1.5) : entry - (tpDist * 1.5);
            tp3 = isBuy ? entry + (tpDist * 2.0) : entry - (tpDist * 2.0);
            sl = isBuy ? entry - slDist : entry + slDist;
        }

        return {
            type: pattern.type,
            entry: entry,
            sl: sl,
            tp1: tp1,
            tp2: tp2,
            tp3: tp3,
            time: Date.now(),
            timeframe: timeframe,
            kaf: pattern.kaf,
            saghf: pattern.saghf
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
