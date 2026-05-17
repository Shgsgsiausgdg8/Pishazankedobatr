import { Candle, StrategyConfig } from '../strategy.js';
import { calculateATR, getSwingPivots } from './utils.js';

export class NPatternDetector {
    public totalPatternsCount: number = 0;
    public activeStructure: { 
        A: { type: 'high' | 'low', price: number, index: number, time: number }, 
        B: { type: 'high' | 'low', price: number, index: number, time: number },
        C: { price: number, time: number, index: number },
        isLockedB: boolean,
        isLockedC: boolean,
        targetD: number,
        status: 'MONITORING' | 'SIGNALLED'
    } | null = null;

    public detect(candles: Candle[], config: StrategyConfig) {
        const minRequired = 100;
        if (candles.length < minRequired) return null;

        const lastCandle = candles[candles.length - 1];
        const lastPrice = lastCandle.close;
        const atr = calculateATR(candles, 14);

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
                    this.activeStructure.C = { ...this.activeStructure.B }; // ریست C
                    return null;
                }

                // تثبیت B: قیمت باید حداقل ۳۸٪ موج AB را اصلاح کند
                const pullback = Math.abs(B.price - lastPrice);
                if (pullback >= waveAB * config.nMinPullback) {
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
                    confidence: 90,
                    atr
                };
            }
        }

        // ۲. شناسایی موج شروع با استفاده از Swing Pivots (Window بزرگ برای فیلتر نویز)
        if (!this.activeStructure) {
            const pivots = getSwingPivots(candles, 12, 4);
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
}
