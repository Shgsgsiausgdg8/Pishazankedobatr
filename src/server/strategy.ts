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
        if (!candles || candles.length < 20) return null;

        let result: any = null;

        switch (strategyType) {
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

        // درصدهای تارگت (۲٪، ۳.۳٪، ۳.۹٪)
        const tpPercents = [0.02, 0.033, 0.039];
        const slPercent = 0.02;   // استاپ لاس ۲٪

        const tp1 = isBuy ? entry * (1 + tpPercents[0]) : entry * (1 - tpPercents[0]);
        const tp2 = isBuy ? entry * (1 + tpPercents[1]) : entry * (1 - tpPercents[1]);
        const tp3 = isBuy ? entry * (1 + tpPercents[2]) : entry * (1 - tpPercents[2]);
        const sl = isBuy ? entry * (1 - slPercent) : entry * (1 + slPercent);

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
}
