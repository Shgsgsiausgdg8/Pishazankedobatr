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

export interface StrategyConfig {
    smaPeriod: number;
    nMinPullback: number;
    nMaxPullback: number;
    nReversalThreshold: number;
    fibLookback: number;
    fibMinRange: number;
    strategy3Strictness: 'low' | 'medium' | 'high';
}

export class TradingStrategy {
    private lastSignalTime: number = 0;       // جلوگیری از سیگنال‌های تکراری
    private lastPatternKey: string | null = null;    // کلید منحصربه‌فرد الگو
    private totalPatternsCount: number = 0;
    private config: StrategyConfig = {
        smaPeriod: 100,
        nMinPullback: 0.382, // Standard Fib level
        nMaxPullback: 0.70,  // Lowered from 0.85 to avoid "dead" patterns
        nReversalThreshold: 0.02,
        fibLookback: 60,
        fibMinRange: 0.5,
        strategy3Strictness: 'medium'
    };

    private activeStructure: { 
        A: { type: 'high' | 'low', price: number, index: number, time: number }, 
        B: { type: 'high' | 'low', price: number, index: number, time: number },
        C: { price: number, time: number, index: number },
        isLockedB: boolean,
        isLockedC: boolean,
        targetD: number,
        status: 'MONITORING' | 'SIGNALLED'
    } | null = null;

    constructor() {}

    public updateConfig(newConfig: Partial<StrategyConfig>) {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * تابع اصلی تحلیل
     */
    analyze(candles: Candle[], timeframe: string, strategyType: string = 'N-PATTERN', confirmations?: any): Signal | null {
        if (!candles || candles.length < 50) return null;
        if (strategyType === 'STRATEGY_3' && candles.length < 110) return null;

        let result: any = null;

        switch (strategyType) {
            case 'FIB-38':
                result = this.analyzeFIB38(candles);
                break;
            case 'STRATEGY_3':
                result = this.detectStrategy3(candles);
                break;
            case 'STRATEGY_4':
                result = this.detectStrategy4(candles);
                break;
            case 'N-PATTERN':
            default:
                result = this.detectNPattern(candles);
                break;
        }

        if (!result) return null;

        // تاییدیه کندلی مخصوص FIB-38
        if (strategyType === 'FIB-38' && confirmations) {
            const hasConfirmationsRequested = Object.values(confirmations).some(v => v === true);
            if (hasConfirmationsRequested) {
                const candleConfirmed = this.checkCandleConfirmations(candles, confirmations);
                if (!candleConfirmed) return null;
            }
        }

        // جلوگیری از سیگنال‌های تکراری بر اساس زمان بازار
        const candleTime = candles[candles.length - 1].time;
        if (this.lastSignalTime && (candleTime - this.lastSignalTime) < 60000 && strategyType === 'N-PATTERN') return null;

        const signal = this.createSignalFromPattern(result, timeframe);
        this.lastSignalTime = candleTime;
        return signal;
    }

    private checkCandleConfirmations(candles: Candle[], confs: any): boolean {
        const last = candles[candles.length - 1];
        const prev = candles.length > 1 ? candles[candles.length - 2] : null;

        const body = Math.abs(last.close - last.open);
        const upperWick = last.high - Math.max(last.open, last.close);
        const lowerWick = Math.min(last.open, last.close) - last.low;
        const totalRange = last.high - last.low;

        // 1. Hammer (Legacy/Salvation) - Bullish
        if (confs.legacy || confs.salvation) {
            const isHammer = lowerWick > (body * 2) && upperWick < (body * 0.5) && totalRange > 0;
            if (isHammer) return true;
        }

        // 2. Nameless (بی‌نام) - Long lower wick even if body is red
        if (confs.nameless) {
            const isNameless = lowerWick > (body * 2.5) && totalRange > 0;
            if (isNameless) return true;
        }

        // 3. Engulfing (پوششی) - Bullish Engulfing
        if (confs.engulfing && prev) {
            const isPrevRed = prev.close < prev.open;
            const isCurrGreen = last.close > last.open;
            const isEngulfing = isCurrGreen && isPrevRed && last.close > prev.open && last.open < prev.close;
            if (isEngulfing) return true;
        }

        // 4. Dark Cloud / Gap variant (ابر سیاه)
        if (confs.darkCloud && prev) {
            const gap = last.open - prev.close;
            if (Math.abs(gap) > (totalRange * 0.1)) return true; // Significant gap
        }

        return false;
    }

    private analyzeFIB38(candles: Candle[]) {
        const lookback = this.config.fibLookback;
        const recentCandles = candles.slice(-lookback);
        if (recentCandles.length < (lookback * 0.6)) return null; 

        let saghf = -Infinity;
        let kaf = Infinity;

        recentCandles.forEach(c => {
            if (c.high > saghf) saghf = c.high;
            if (c.low < kaf) kaf = c.low;
        });

        const range = saghf - kaf;
        if (range <= this.config.fibMinRange) return null; 

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

    /**
     * استراتژی سوم - فیبوناچی + واگرایی CRSI (نسخه دقیق تریدر فراز)
     */
    private detectStrategy3(candles: Candle[]) {
        if (!candles || candles.length < 110) return null;

        const lookback = this.config.fibLookback;
        const data = candles.slice(-lookback);

        let high = -Infinity, low = Infinity, highIdx = 0, lowIdx = 0;

        for (let i = 0; i < data.length; i++) {
            const realIndex = candles.length - lookback + i;
            if (data[i].high > high) {
                high = data[i].high;
                highIdx = realIndex;
            }
            if (data[i].low < low) {
                low = data[i].low;
                lowIdx = realIndex;
            }
        }

        const last = candles[candles.length - 1];
        const fibRange = Math.abs(high - low);
        if (fibRange < this.config.fibMinRange) return null;

        /* SELL: High -> Low (حرکت نزولی، بازگشت به سمت بالا - سیگنال فروش در سقف اصلاحی) */
        if (highIdx < lowIdx) {
            const fib71 = low + fibRange * 0.71;
            const fib88 = low + fibRange * 0.88;

            const inZone = last.low <= fib88 && last.high >= fib71;
            if (inZone) {
                const hasDiv = this.checkCRSIDivergence(candles, "SELL");
                if (!hasDiv) return null;

                return {
                    type: "SELL",
                    signalPrice: last.close,
                    high, low, range: fibRange,
                    isFibCRSI: true,
                    confidence: 90
                };
            }
        }

        /* BUY: Low -> High (حرکت صعودی، بازگشت به سمت پایین - سیگنال خرید در کف اصلاحی) */
        if (lowIdx < highIdx) {
            const fib71 = high - fibRange * 0.71;
            const fib88 = high - fibRange * 0.88;

            const inZone = last.high >= fib88 && last.low <= fib71;
            if (inZone) {
                const hasDiv = this.checkCRSIDivergence(candles, "BUY");
                if (!hasDiv) return null;

                return {
                    type: "BUY",
                    signalPrice: last.close,
                    high, low, range: fibRange,
                    isFibCRSI: true,
                    confidence: 90
                };
            }
        }

        return null;
    }

    private calculateCRSI(candles: Candle[], rsiPeriod = 3, streakPeriod = 2, rocPeriod = 100) {
        let values = candles.map(c => c.close);
        let crsi = new Array(values.length).fill(50); // Pad start

        if (values.length < rocPeriod + 5) return crsi;

        // 1. Calculate price RSI
        const priceRSI = this.calculateRSICustom(values, rsiPeriod);

        // 2. Calculate Streak RSI
        const streaks = new Array(values.length).fill(0);
        let currentStreak = 0;
        for (let i = 1; i < values.length; i++) {
            if (values[i] > values[i-1]) {
                if (currentStreak < 0) currentStreak = 0;
                currentStreak++;
            } else if (values[i] < values[i-1]) {
                if (currentStreak > 0) currentStreak = 0;
                currentStreak--;
            } else {
                currentStreak = 0;
            }
            streaks[i] = currentStreak;
        }
        const streakRSI = this.calculateRSICustom(streaks, streakPeriod);

        // 3. Calculate ROC Percentage Rank
        const rocValues = new Array(values.length).fill(0);
        for(let i = 1; i < values.length; i++) {
            rocValues[i] = (values[i] - values[i-1]) / values[i-1];
        }

        const percentRanks = new Array(values.length).fill(50);
        for (let i = rocPeriod; i < values.length; i++) {
            let count = 0;
            const currentRoc = rocValues[i];
            for (let j = 1; j <= rocPeriod; j++) {
                if (rocValues[i - j] < currentRoc) {
                    count++;
                }
            }
            percentRanks[i] = (count / rocPeriod) * 100;
        }

        // Calculate final CRSI
        for (let i = 0; i < values.length; i++) {
            crsi[i] = (priceRSI[i] + streakRSI[i] + percentRanks[i]) / 3;
        }

        return crsi;
    }

    private calculateRSICustom(values: number[], period: number) {
        let rsi = new Array(values.length).fill(50);
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

    private calculateRSI(candles: Candle[], period: number = 14) {
        let values = candles.map(c => c.close);
        return this.calculateRSICustom(values, period);
    }

    private checkCRSIDivergence(candles: Candle[], type: "BUY" | "SELL") {
        const crsi = this.calculateCRSI(candles);
        if (!crsi || crsi.length < 10) return false;

        // Apply Strictness levels
        const currentCRSI = crsi[crsi.length - 1];
        let depth = 5;
        if (this.config.strategy3Strictness === 'medium') {
            if (type === "BUY" && currentCRSI > 40) return false;
            if (type === "SELL" && currentCRSI < 60) return false;
        } else if (this.config.strategy3Strictness === 'high') {
            if (type === "BUY" && currentCRSI > 30) return false;
            if (type === "SELL" && currentCRSI < 70) return false;
            depth = 7;
        } else if (this.config.strategy3Strictness === 'low') {
            depth = 3;
        }

        const closes = candles.map(c => c.close);
        
        // Simple lookback comparison based on trader's original logic
        const priceLast = closes[closes.length - 1];
        const pricePrev = closes[closes.length - 1 - depth];
        
        const rsiLast = crsi[crsi.length - 1];
        const rsiPrev = crsi[crsi.length - 1 - depth];

        if (type === "BUY") {
            // Price makes a lower low compared to 'depth' candles ago, but RSI makes higher low
            return priceLast < pricePrev && rsiLast > rsiPrev;
        } else {
            // Price makes a higher high compared to 'depth' candles ago, but RSI makes lower high
            return priceLast > pricePrev && rsiLast < rsiPrev;
        }
    }

    /**
     * استراتژی چهارم - ساده (MA Cross)
     * معامله‌گر می‌تواند به راحتی این بخش را تغییر دهد
     */
    private detectStrategy4(candles: Candle[]) {
        const ma20 = this.calculateSMA(candles, 20);
        const lastPrice = candles[candles.length - 1].close;
        if (!ma20) return null;

        if (lastPrice > ma20) {
            return { type: 'BUY', signalPrice: lastPrice, confidence: 60, label: 'MA-UP' };
        } else if (lastPrice < ma20) {
            return { type: 'SELL', signalPrice: lastPrice, confidence: 60, label: 'MA-DOWN' };
        }
        return null;
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
     * اطلاعات ترسیم زنده الگوی N برای نمایش در چارت
     */
    public getTotalPatternsCount() {
        return this.totalPatternsCount;
    }

    /**
     * اطلاعات ترسیم زنده الگوی N برای نمایش در چارت
     */
    public getNPatternDrawing(candles: Candle[]) {
        if (candles.length < 20) return null;
        const lastCandle = candles[candles.length - 1];

        if (this.activeStructure) {
            const { A, B, C, targetD, status } = this.activeStructure;
            const points = [
                { price: A.price, time: A.time, index: A.index, label: 'A' },
                { price: B.price, time: B.time, index: B.index, label: 'B' }
            ];

            if (C) {
                points.push({ price: C.price, time: C.time, index: C.index, label: 'C' });
                const timeDiff = Math.abs(B.time - A.time);
                points.push({ price: targetD, time: C.time + (timeDiff * 0.8), index: C.index + 20, label: 'D' });
            }

            return {
                points,
                type: A.type === 'low' ? 'BUY' : 'SELL',
                isConfirmed: status === 'SIGNALLED',
                totalCount: this.totalPatternsCount
            };
        }
        
        const pivots = this.getSwingPivots(candles, 7, 3);
        if (pivots.length >= 2) {
            const p1 = pivots[pivots.length - 2]; 
            const p2 = pivots[pivots.length - 1]; 
            return {
                points: [
                    { price: p1.price, time: p1.time, index: p1.index, label: 'A' },
                    { price: p2.price, time: p2.time, index: p2.index, label: 'B' },
                    { price: lastCandle.close, time: lastCandle.time, index: candles.length - 1, label: 'C' }
                ],
                type: p1.type === 'low' ? 'BUY' : 'SELL',
                isConfirmed: false,
                totalCount: this.totalPatternsCount
            };
        }

        return { points: [], totalCount: this.totalPatternsCount };
    }

    private calculateSMA(candles: Candle[], period: number) {
        if (candles.length < period) return null;
        let sum = 0;
        for (let i = candles.length - period; i < candles.length; i++) {
            sum += candles[i].close;
        }
        return sum / period;
    }

    private detectNPattern(candles: Candle[]) {
        const minRequired = 100;
        if (candles.length < minRequired) return null;

        const lastCandle = candles[candles.length - 1];
        const lastPrice = lastCandle.close;
        const atr = this.calculateATR(candles, 14);

        // ۱. مدیریت ساختار فعال
        if (this.activeStructure) {
            const { A, B, C, isLockedB, isLockedC, status } = this.activeStructure;
            const waveAB = Math.abs(B.price - A.price);

            // ابطال در صورت شکست کف/سقف اصلی (شکست ساختار)
            if (A.type === 'low' && lastPrice < A.price) { this.activeStructure = null; return null; }
            if (A.type === 'high' && lastPrice > A.price) { this.activeStructure = null; return null; }

            // الف) تثبیت و تعقیب نقطه B
            if (!isLockedB) {
                const isNewExtremum = A.type === 'low' ? lastPrice > B.price : lastPrice < B.price;
                if (isNewExtremum) {
                    this.activeStructure.B = { ...this.activeStructure.B, price: lastPrice, index: candles.length - 1, time: lastCandle.time };
                    this.activeStructure.C = { ...B }; // ریست C
                    return null;
                }

                // تثبیت B: قیمت باید حداقل ۳۸٪ موج AB را اصلاح کند
                const pullback = Math.abs(B.price - lastPrice);
                if (pullback >= waveAB * this.config.nMinPullback) {
                    this.activeStructure.isLockedB = true;
                }
            }

            // ب) تثبیت نقطه C (باید فاصله زمانی معقول از B داشته باشد)
            if (isLockedB && !isLockedC) {
                const isNewExtremumC = A.type === 'low' ? lastCandle.low < C.price : lastCandle.high > C.price;
                if (isNewExtremumC) {
                    this.activeStructure.C = { price: A.type === 'low' ? lastCandle.low : lastCandle.high, index: candles.length - 1, time: lastCandle.time };
                }

                // تایید C: بازگشت قدرتمند و حداقل ۴ کندل فاصله از B
                const timeDistBC = candles.length - 1 - B.index;
                const confirmThreshold = Math.max(waveAB * 0.2, (atr || 0) * 1.5);
                const isReversing = A.type === 'low' ? lastPrice > C.price + confirmThreshold : lastPrice < C.price - confirmThreshold;

                if (isReversing && timeDistBC >= 4) {
                    this.activeStructure.isLockedC = true;
                    this.activeStructure.targetD = A.type === 'low' ? C.price + waveAB : C.price - waveAB;
                }

                // ابطال اگر اصلاح خیلی عمیق شد (بیشتر از ۷۵٪ موج اول)
                if (Math.abs(B.price - lastPrice) > waveAB * 0.75) {
                    this.activeStructure = null;
                    return null;
                }
            }

            // ج) خروجی برای رندرینگ یا سیگنال
            if (isLockedC && status !== 'SIGNALLED') {
                this.activeStructure.status = 'SIGNALLED';
                this.totalPatternsCount++;
                return {
                    type: A.type === 'low' ? 'BUY' : 'SELL',
                    signalPrice: lastPrice,
                    range: waveAB,
                    isNPattern: true,
                    confidence: 90
                };
            }
        }

        // ۲. شناسایی موج شروع با استفاده از Swing Pivots (Window بزرگ برای فیلتر نویز)
        if (!this.activeStructure) {
            const pivots = this.getSwingPivots(candles, 12, 4);
            if (pivots.length >= 2) {
                const p1 = pivots[pivots.length - 2];
                const p2 = pivots[pivots.length - 1];
                const wave = Math.abs(p2.price - p1.price);
                const timeDist = p2.index - p1.index;

                if (p1.type !== p2.type && wave >= lastPrice * 0.001 && timeDist >= 5) {
                    this.activeStructure = {
                        A: p1, B: p2, C: { ...p2 },
                        isLockedB: false, isLockedC: false,
                        targetD: 0, status: 'MONITORING'
                    };
                }
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
            const structure = this.activeStructure!;
            const A = structure.A;
            const B = structure.B;
            const C = structure.C!;
            const abDist = Math.abs(A.price - B.price);

            if (isBuy) {
                // استاپ لاس: زیر حمایتِ نقطه A (با کمی فاصه برای جلوگیری از شکارِ استاپ)
                sl = A.price - (atr * 0.5); 
                // تارگت ۱: سقفِ قبلی (نقطه B) - جای که احتمال نوسان هست
                tp1 = B.price;
                // تارگت ۲: ۱۰۰٪ پراجکشن (هدف کلاسیک N)
                tp2 = C.price + abDist;
                // تارگت ۳: ۱۲۷٪ پراجکشن (امتداد روند)
                tp3 = C.price + (abDist * 1.27);
            } else {
                // استاپ لاس: بالای مقاومتِ نقطه A
                sl = A.price + (atr * 0.5);
                // تارگت ۱: کفِ قبلی (نقطه B)
                tp1 = B.price;
                // تارگت ۲: ۱۰۰٪ پراجکشن
                tp2 = C.price - abDist;
                // تارگت ۳: ۱۲۷٪ پراجکشن
                tp3 = C.price - (abDist * 1.27);
            }
        } else if (pattern.isFibCRSI) {
            const { high, low, range, type } = pattern;
            
            // Standardizing based on Trader's math but corrected for Long/Short logic
            if (type === "BUY") {
                // BUY (Long) signal from a "Low -> High" move that retraced down to 71-88%
                // Entry is near high - 0.88 * range. Target should be higher!
                sl = low - low * 0.0015;
                tp1 = high - range * 0.71; // closest
                tp2 = high - range * 0.50; // middle
                tp3 = high - range * 0.38; // furthest
            } else {
                // SELL (Short) signal from a "High -> Low" move that bounced up to 71-88%
                // Entry is near low + 0.88 * range. Target should be lower!
                sl = high + high * 0.0015;
                tp1 = low + range * 0.71; // closest
                tp2 = low + range * 0.50; // middle
                tp3 = low + range * 0.38; // furthest
            }
        } else if (pattern.isFIB38) {
            const range = pattern.saghf - pattern.kaf;
            if (isBuy) {
                sl = pattern.kaf - (range * 0.05); // Tighter SL below the move low
                tp1 = pattern.saghf; // Target the recent high
                tp2 = pattern.saghf + (range * 0.38);
                tp3 = pattern.saghf + (range * 0.61);
            } else {
                sl = pattern.saghf + (range * 0.05); // Tighter SL above the move high
                tp1 = pattern.kaf; // Target the recent low
                tp2 = pattern.kaf - (range * 0.38);
                tp3 = pattern.kaf - (range * 0.61);
            }
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
