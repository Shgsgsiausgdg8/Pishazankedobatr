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
  confidence?: number; // درصد اطمینان سیگنال
}

export class TradingStrategy {
    private lastSignalTime: number = 0;       // جلوگیری از سیگنال‌های تکراری
    private lastPatternKey: string | null = null;    // کلید منحصربه‌فرد الگو
    private activeStructure: { 
        A: { type: 'high' | 'low', price: number, index: number, time: number }, 
        B: { type: 'high' | 'low', price: number, index: number, time: number } 
    } | null = null;

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

        // جلوگیری از سیگنال‌های تکراری بر اساس زمان بازار
        const candleTime = candles[candles.length - 1].time;
        if (this.lastSignalTime && (candleTime - this.lastSignalTime) < 60000 && strategyType === 'N-PATTERN') return null;

        const signal = this.createSignalFromPattern(result, timeframe);
        this.lastSignalTime = candleTime;
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
        // Limit calculation window to 200 to save memory/CPU
        const data = candles.slice(-(period + 150));
        if (data.length < period + 1) return [];

        let gains = 0;
        let losses = 0;

        for (let i = 1; i <= period; i++) {
            const diff = data[i].close - data[i - 1].close;
            if (diff >= 0) gains += diff;
            else losses -= diff;
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        const rsi = [];
        for (let i = period + 1; i < data.length; i++) {
            const diff = data[i].close - data[i - 1].close;
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
        // Limit data to 200 last candles for performance and stable results
        const data = candles.slice(-200); 
        const k = 2 / (period + 1);
        let ema = data[0].close;
        const emaArray = [ema];

        for (let i = 1; i < data.length; i++) {
            ema = (data[i].close * k) + (ema * (1 - k));
            emaArray.push(ema);
        }
        return emaArray;
    }

    /**
     * تشخیص الگوی N بر اساس موج Maneuver (A-B) و Measure (Pullback)
     * این نسخه بهینه‌سازی شده تا از سقف و کف‌های تایید شده و "آخرین" ساختار استفاده کند.
     */
    /**
     * اطلاعات ترسیم زنده الگوی N برای نمایش در چارت
     */
    public getNPatternDrawing(candles: Candle[]) {
        if (candles.length < 30) return null;
        
        const lastCandle = candles[candles.length - 1];

        // اگر ساختار فعال داریم، از همان استفاده کن برای ترسیم دائم
        if (this.activeStructure) {
            return {
                points: [
                    { price: this.activeStructure.A.price, time: this.activeStructure.A.time },
                    { price: this.activeStructure.B.price, time: this.activeStructure.B.time },
                    { price: lastCandle.close, time: lastCandle.time }
                ],
                type: this.activeStructure.A.type === 'low' ? 'BUY' : 'SELL'
            };
        }
        
        // در غیر این صورت، آخرین پیوت‌ها را برای نمایش اولیه پیدا کن
        const pivots = this.getSwingPivots(candles, 6, 2);
        if (pivots.length < 2) return null;
        
        const p1 = pivots[pivots.length - 2]; // A
        const p2 = pivots[pivots.length - 1]; // B
        
        return {
            points: [
                { price: p1.price, time: p1.time },
                { price: p2.price, time: p2.time },
                { price: lastCandle.close, time: lastCandle.time }
            ],
            type: p1.type === 'low' ? 'BUY' : 'SELL'
        };
    }

    private detectNPattern(candles: Candle[]) {
        if (candles.length < 40) return null;

        const lastPrice = candles[candles.length - 1].close;
        const prevPrice = candles[candles.length - 2]?.close || lastPrice;
        const atr = this.calculateATR(candles, 14);

        // ۱. مدیریت ساختار فعال
        if (this.activeStructure) {
            const { A, B } = this.activeStructure;
            
            // باطل شدن یا آپدیت سقف/کف فعلی
            if (A.type === 'low') {
                if (lastPrice < A.price) { this.activeStructure = null; } 
                else if (lastPrice > B.price) {
                    this.activeStructure.B = { type: 'high', price: lastPrice, index: candles.length - 1, time: candles[candles.length - 1].time };
                }
            } else {
                if (lastPrice > A.price) { this.activeStructure = null; } 
                else if (lastPrice < B.price) {
                    this.activeStructure.B = { type: 'low', price: lastPrice, index: candles.length - 1, time: candles[candles.length - 1].time };
                }
            }
        }

        // ۲. شناسایی ساختار جدید در صورت لزوم
        if (!this.activeStructure) {
            const pivots = this.getSwingPivots(candles, 3, 1); // حساسیت بسیار بالا
            if (pivots.length >= 2) {
                const p1 = pivots[pivots.length - 2];
                const p2 = pivots[pivots.length - 1];
                const waveRange = Math.abs(p2.price - p1.price);
                
                // تایید قدرت موج اولیه (Maneuver)
                if (p1.type !== p2.type && waveRange >= atr * 0.5) {
                    this.activeStructure = { A: p1, B: p2 };
                }
            }
        }

        if (!this.activeStructure) return null;

        const { A, B } = this.activeStructure;
        const range = Math.abs(B.price - A.price);
        const pullback = Math.abs(B.price - lastPrice);
        const pullbackPercent = (pullback / range);

        // صعودی (A: Low -> B: High)
        if (A.type === 'low') {
            // شرایط ورود: پولبک بین ۲٪ تا ۴۰٪ کل موج باشد
            // این بازه وسیع باعث می‌شود هیچ فرصتی در طلا از دست نرود
            if (pullbackPercent >= 0.02 && pullbackPercent <= 0.40) {
                const patternKey = `N_V9_BUY_${A.time}_${B.time}`;
                if (this.lastPatternKey === patternKey) return null;

                // تریگر: شروع اصلاح یا حضور در محدوده اصلاح
                this.lastPatternKey = patternKey;
                this.activeStructure = null; 
                
                let confidence = 80;
                if (range > atr * 1.5) confidence += 10;
                if (pullbackPercent <= 0.15) confidence += 10; // پولبک کم‌عمق نشان تداوم پرقدرت است
                
                return { 
                    type: 'BUY', signalPrice: lastPrice, atr, range, kaf: A.price, saghf: B.price, isNPattern: true, confidence: Math.min(100, confidence)
                };
            }
        } 
        // نزولی (A: High -> B: Low)
        else {
            if (pullbackPercent >= 0.02 && pullbackPercent <= 0.40) {
                const patternKey = `N_V9_SELL_${A.time}_${B.time}`;
                if (this.lastPatternKey === patternKey) return null;

                this.lastPatternKey = patternKey;
                this.activeStructure = null;

                let confidence = 80;
                if (range > atr * 1.5) confidence += 10;
                if (pullbackPercent <= 0.15) confidence += 10;

                return { 
                    type: 'SELL', signalPrice: lastPrice, atr, range, kaf: B.price, saghf: A.price, isNPattern: true, confidence: Math.min(100, confidence)
                };
            }
        }

        return null;
    }

    /**
     * شناسایی هوشمند سقف و کف (Major & Minor + Current Range)
     * این تابع سقف و کف‌های "آخر" را با دقت بالا شناسایی می‌کند
     */
    public getSwingPivots(candles: Candle[], majorDepth: number = 10, minorDepth: number = 3) {
        if (candles.length < 20) return [];

        const pivots: { type: 'high' | 'low', price: number, index: number, time: number, levelType: 'major' | 'minor' | 'live' }[] = [];

        // 1. شناسایی سطوح تایید شده
        const majorPivots = this.findPivotsInRange(candles, majorDepth, 0, candles.length - majorDepth, 'major');
        const minorPivots = this.findPivotsInRange(candles, minorDepth, Math.max(0, candles.length - 60), candles.length - minorDepth, 'minor');

        let merged = [...majorPivots, ...minorPivots].sort((a, b) => a.index - b.index);
        
        // 2. شناسایی سقف و کف "لحظه حال" (Maneuver/Measure)
        // این بخش تضمین می‌کند که سقف و کف واقعی که بازار الان بین آن‌هاست همیشه به عنوان نقطه آخر باشند
        const lastConfirmedIdx = merged.length > 0 ? merged[merged.length - 1].index : 0;
        
        // همواره سقف و کف مطلق انتهای چارت را بررسی کن (حتی اگر تایید عمقی نشده باشند)
        let absHigh = -Infinity;
        let absLow = Infinity;
        let absHighIdx = -1;
        let absLowIdx = -1;

        // بررسی ۱۰۰ کندل آخر برای پیدا کردن دامنه نوسان فعلی
        const rangeStart = Math.max(0, candles.length - 100);
        for (let i = rangeStart; i < candles.length; i++) {
            if (candles[i].high >= absHigh) { absHigh = candles[i].high; absHighIdx = i; }
            if (candles[i].low <= absLow) { absLow = candles[i].low; absLowIdx = i; }
        }

        if (absHighIdx !== -1) merged.push({ type: 'high', price: absHigh, index: absHighIdx, time: candles[absHighIdx].time, levelType: 'live' });
        if (absLowIdx !== -1) merged.push({ type: 'low', price: absLow, index: absLowIdx, time: candles[absLowIdx].time, levelType: 'live' });

        // 3. فیلتر ZigZag با اولویت "آخرین بودن" و "بهترین قیمت"
        const zigzag: typeof pivots = [];
        const sorted = merged.sort((a, b) => a.index - b.index);

        for (const p of sorted) {
            if (zigzag.length === 0) {
                zigzag.push(p);
                continue;
            }
            const last = zigzag[zigzag.length - 1];
            if (last.type === p.type) {
                // در انتهای چارت، آنکه قیمت بهتری دارد یا خیلی نزدیک به حال است اولویت دارد
                if (p.index > candles.length - 5) {
                    zigzag[zigzag.length - 1] = p; // همیشه به آخرین نوسان آپدیت شو
                } else if ((p.type === 'high' && p.price >= last.price) || (p.type === 'low' && p.price <= last.price)) {
                    zigzag[zigzag.length - 1] = p;
                }
            } else {
                zigzag.push(p);
            }
        }

        // اطمینان از اینکه خروجی همواره سقف و کف "فعلی" را شامل می‌شود
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
                if (i - j < 0 || i + j >= candles.length) continue;
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
            saghf: pattern.saghf,
            confidence: pattern.confidence
        };
    }

    private calculateATR(candles: Candle[], period: number = 14) {
        const windowSize = period + 5;
        const data = candles.slice(-windowSize);
        if (data.length < period + 1) return candles[candles.length - 1].close * 0.001;
        
        let totalTR = 0;
        for (let i = 1; i < data.length; i++) {
            const h = data[i].high;
            const l = data[i].low;
            const pc = data[i - 1].close;
            const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
            totalTR += tr;
        }
        return totalTR / period;
    }
}
