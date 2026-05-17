/**
 * FarazGold Trading Strategy - Modularized
 */

import { BitRangeAnalyzer } from './strategies/bit_range_strategy.js';
import { calculateATR, getSwingPivots } from './strategies/utils.js';
import { NPatternDetector } from './strategies/n_pattern.js';
import { Fib38Detector } from './strategies/fib38.js';
import { Strategy3Detector } from './strategies/strategy3.js';
import { Strategy4Detector } from './strategies/strategy4.js';
import { Strategy5Detector } from './strategies/strategy5.js';
import { Candle, Signal, StrategyConfig } from './types.js';

export class TradingStrategy {
    private lastSignalTime: number = 0;       
    private lastPatternKey: string | null = null;    

    private nPatternDetector = new NPatternDetector();
    private fib38Detector = new Fib38Detector();
    private strategy3Detector = new Strategy3Detector();
    private strategy4Detector = new Strategy4Detector();
    private strategy5Detector = new Strategy5Detector();
    private bitRangeAnalyzer = new BitRangeAnalyzer();

    public config: StrategyConfig = {
        smaPeriod: 100,
        nMinPullback: 0.382,
        nMaxPullback: 0.70,
        nReversalThreshold: 0.02,
        fibLookback: 60,
        fibMinRange: 0.5,
        strategy3Strictness: 'medium',
        customKaf: 0,
        customSaghf: 0
    };

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
            case 'BIT_RANGE':
                const bitResult = this.bitRangeAnalyzer.analyzeBitRange(candles);
                if (bitResult) {
                    result = bitResult;
                }
                break;
            case 'FIB-38':
                result = this.fib38Detector.detect(candles, this.config);
                break;
            case 'STRATEGY_3':
                result = this.strategy3Detector.detect(candles, this.config);
                break;
            case 'STRATEGY_4':
                result = this.strategy4Detector.detect(candles, this.config);
                break;
            case 'STRATEGY_5':
                result = this.strategy5Detector.detect(candles, this.config);
                break;
            case 'N-PATTERN':
            default:
                result = this.nPatternDetector.detect(candles, this.config);
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
        if (this.lastSignalTime && (candleTime - this.lastSignalTime) < 60000 && (strategyType === 'N-PATTERN' || strategyType === 'BIT_RANGE')) return null;

        const signal = this.createSignalFromPattern(result, timeframe, candles);
        if (signal) {
            this.lastSignalTime = candleTime;
        }
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

    public getSwingPivots(candles: Candle[], majorDepth: number = 10, minorDepth: number = 3) {
        return getSwingPivots(candles, majorDepth, minorDepth);
    }

    public getTotalPatternsCount() {
        return this.nPatternDetector.totalPatternsCount;
    }

    public getNPatternDrawing(candles: Candle[]) {
        if (candles.length < 20) return null;
        const lastCandle = candles[candles.length - 1];

        if (this.nPatternDetector.activeStructure) {
            const { A, B, C, targetD, status } = this.nPatternDetector.activeStructure;
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
                totalCount: this.nPatternDetector.totalPatternsCount
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
                totalCount: this.nPatternDetector.totalPatternsCount
            };
        }

        return { points: [], totalCount: this.nPatternDetector.totalPatternsCount };
    }

    private createSignalFromPattern(pattern: any, timeframe: string, candles: Candle[]): Signal {
        const isBuy = pattern.type === 'BUY';
        const entry = pattern.signalPrice || pattern.entry; // some strategies use signalPrice, some might use entry
        const isN = !!pattern.isNPattern;
        
        // Dynamic SL/TP based on ATR, or fixed % for N-Pattern
        const atr = pattern.atr || calculateATR(candles, 14); 
        
        let tp1 = 0, tp2 = 0, tp3 = 0, sl = 0;
        let tp4: number | undefined;
        let tp5: number | undefined;
        let tp6: number | undefined;
        let tp7: number | undefined;

        if (isN) {
            const structure = this.nPatternDetector.activeStructure!;
            const A = structure.A;
            const B = structure.B;
            const C = structure.C!;
            const abDist = Math.abs(A.price - B.price);

            if (isBuy) {
                // استاپ لاس: زیر حمایتِ نقطه A
                sl = A.price - (atr * 0.5); 
                tp1 = B.price;
                tp2 = C.price + abDist;
                tp3 = C.price + (abDist * 1.27);
            } else {
                // استاپ لاس: بالای مقاومتِ نقطه A
                sl = A.price + (atr * 0.5);
                tp1 = B.price;
                tp2 = C.price - abDist;
                tp3 = C.price - (abDist * 1.27);
            }
        } else if (pattern.isFibCRSI) {
            const { high, low, range, type } = pattern;
            
            if (type === "BUY") {
                sl = low - low * 0.0015;
                tp1 = high - range * 0.71; 
                tp2 = high - range * 0.50; 
                tp3 = high - range * 0.38; 
            } else {
                sl = high + high * 0.0015;
                tp1 = low + range * 0.71; 
                tp2 = low + range * 0.50; 
                tp3 = low + range * 0.38; 
            }
        } else if (pattern.isStrategy5) {
            const { high: saghf, low: kaf, range: R } = pattern;
            if (isBuy) {
                sl = kaf - 0.79 * R;
                tp1 = kaf + 0.38 * R;
                tp2 = kaf + 0.50 * R;
                tp3 = kaf + 0.12 * R;
                tp4 = saghf;
                tp5 = saghf + 0.22 * R;
                tp6 = saghf + 0.45 * R;
                tp7 = saghf + 0.71 * R;
            } else {
                sl = saghf + 0.79 * R;
                tp1 = kaf + 0.41 * R; 
                tp2 = kaf + 0.50 * R; 
                tp3 = kaf + 0.12 * R; 
                tp4 = kaf;
                tp5 = kaf - 0.22 * R;
                tp6 = kaf - 0.45 * R;
                tp7 = kaf - 0.71 * R;
            }
        } else if (pattern.isBitRange) {
            sl = pattern.sl;
            tp1 = pattern.tp1;
            tp2 = pattern.tp2;
            tp3 = pattern.tp3 || (isBuy ? pattern.tp2 + (pattern.tp2 - pattern.tp1) : pattern.tp2 - (pattern.tp1 - pattern.tp2));
            if (pattern.tp4) tp4 = pattern.tp4;
            if (pattern.tp5) tp5 = pattern.tp5;
        } else if (pattern.isFIB38) {
            const range = pattern.saghf - pattern.kaf;
            if (isBuy) {
                sl = pattern.kaf - (range * 0.05); 
                tp1 = pattern.saghf; 
                tp2 = pattern.saghf + (range * 0.38);
                tp3 = pattern.saghf + (range * 0.61);
            } else {
                sl = pattern.saghf + (range * 0.05); 
                tp1 = pattern.kaf; 
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
            ...pattern,
            type: pattern.type,
            entry: entry,
            sl: sl,
            tp1: tp1,
            tp2: tp2,
            tp3: tp3,
            tp4: tp4,
            tp5: tp5,
            tp6: tp6,
            tp7: tp7,
            time: Date.now(),
            timeframe: timeframe,
            kaf: pattern.kaf,
            saghf: pattern.saghf,
            confidence: pattern.confidence
        };
    }
}
