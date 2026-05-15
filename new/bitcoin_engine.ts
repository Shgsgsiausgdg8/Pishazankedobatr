import axios from "axios";
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';

// ============================================================
// کلاس SessionManager - مدیریت سشن‌های لندن و نیویورک
// ============================================================
class SessionManager {
    sessions = {
        asia: { start: "01:30", end: "09:30", name: "Asia" },
        londonBackas: { start: "11:30", end: "13:30", name: "بکاس لندن (نقدینگی اول)" },
        londonMid: { start: "13:30", end: "16:30", name: "لندن میانی" },
        nyBackas: { start: "16:30", end: "18:30", name: "بکاس نیویورک (نقدینگی اول)" },
        nyLate: { start: "18:30", end: "00:30", name: "نیویورک پایانی" }
    };

    getCurrentSession() {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        
        if (this.isTimeBetween(currentTime, this.sessions.londonBackas.start, this.sessions.londonBackas.end)) {
            return { session: 'londonBackas', ...this.sessions.londonBackas, isActive: true };
        }
        if (this.isTimeBetween(currentTime, this.sessions.nyBackas.start, this.sessions.nyBackas.end)) {
            return { session: 'nyBackas', ...this.sessions.nyBackas, isActive: true };
        }
        return { session: 'other', isActive: false, name: "خارج از سشن معاملاتی" };
    }

    isTimeBetween(current: string, start: string, end: string) {
        const toMinutes = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };
        const curr = toMinutes(current);
        const s = toMinutes(start);
        const e = toMinutes(end);
        if (s <= e) return curr >= s && curr <= e;
        return curr >= s || curr <= e;
    }

    getAsiaHighLow(candles: any[]) {
        if (!candles || candles.length === 0) return { high: null, low: null };
        const asiaStart = this.toTimestamp("01:30");
        const asiaEnd = this.toTimestamp("09:30");
        const asiaCandles = candles.filter(c => c.time >= asiaStart && c.time <= asiaEnd);
        if (asiaCandles.length === 0) return { high: null, low: null };
        return {
            high: Math.max(...asiaCandles.map(c => c.high)),
            low: Math.min(...asiaCandles.map(c => c.low))
        };
    }

    getLondonHighLow(candles: any[], isEarly = true) {
        if (!candles || candles.length === 0) return { high: null, low: null };
        const start = isEarly ? "11:30" : "13:30";
        const end = isEarly ? "13:30" : "16:30";
        const startTs = this.toTimestamp(start);
        const endTs = this.toTimestamp(end);
        const londonCandles = candles.filter(c => c.time >= startTs && c.time <= endTs);
        if (londonCandles.length === 0) return { high: null, low: null };
        return {
            high: Math.max(...londonCandles.map(c => c.high)),
            low: Math.min(...londonCandles.map(c => c.low))
        };
    }

    toTimestamp(timeStr: string) {
        const now = new Date();
        const [h, m] = timeStr.split(':').map(Number);
        const d = new Date(now);
        d.setHours(h, m, 0, 0);
        return Math.floor(d.getTime() / 1000);
    }

    isLiquidityTaken(currentPrice: number, asiaLevels: any, londonLevels: any, sessionType: string) {
        if (sessionType === 'londonBackas') {
            if (asiaLevels.high && currentPrice > asiaLevels.high) return { taken: 'نقدینگی آسیا (High)', direction: 'bullish' };
            if (asiaLevels.low && currentPrice < asiaLevels.low) return { taken: 'نقدینگی آسیا (Low)', direction: 'bearish' };
        }
        if (sessionType === 'nyBackas') {
            if (londonLevels.high && currentPrice > londonLevels.high) return { taken: 'نقدینگی لندن (High)', direction: 'bullish' };
            if (londonLevels.low && currentPrice < londonLevels.low) return { taken: 'نقدینگی لندن (Low)', direction: 'bearish' };
        }
        return null;
    }
}

// ============================================================
// کلاس TrendAnalyzer - تحلیل تخصصی روند (بدون تغییر)
// ============================================================
class TrendAnalyzer {
    trendStatus = {
        overall: 'neutral',
        strength: 0,
        timeframe: {
            short: { trend: 'neutral', strength: 0 },
            medium: { trend: 'neutral', strength: 0 },
            long: { trend: 'neutral', strength: 0 }
        },
        signals: [],
        emaAlign: false,
        macdDirection: 'neutral',
        adxValue: 0
    };

    analyzeFullTrend(candles: any[], multiTimeframeData: any) {
        const results = {
            overall: 'neutral',
            strength: 0,
            confidence: 0,
            reasons: [] as string[],
            warnings: [] as string[]
        };

        if (!candles || candles.length < 50) {
            results.warnings.push("⚠️ داده کافی برای تحلیل روند وجود ندارد");
            return results;
        }

        const emaResult = this.analyzeEMA(candles);
        if (emaResult.trend) {
            results.reasons.push(emaResult.reason);
            if (emaResult.trend === 'bullish') results.strength += 25;
            else if (emaResult.trend === 'bearish') results.strength -= 25;
        }

        const macdResult = this.analyzeMACD(candles);
        if (macdResult.trend) {
            results.reasons.push(macdResult.reason);
            if (macdResult.trend === 'bullish') results.strength += 20;
            else if (macdResult.trend === 'bearish') results.strength -= 20;
        }

        const adxResult = this.analyzeADXDirection(candles);
        if (adxResult.trend) {
            results.reasons.push(adxResult.reason);
            if (adxResult.trend === 'bullish') results.strength += adxResult.strength;
            else if (adxResult.trend === 'bearish') results.strength -= adxResult.strength;
        }

        const structureResult = this.analyzeStructure(candles);
        if (structureResult.trend) {
            results.reasons.push(structureResult.reason);
            if (structureResult.trend === 'bullish') results.strength += 20;
            else if (structureResult.trend === 'bearish') results.strength -= 20;
        }

        const volumeResult = this.analyzeVolume(candles);
        if (volumeResult.trend) {
            results.reasons.push(volumeResult.reason);
        }

        if (multiTimeframeData && multiTimeframeData.candlesMap) {
            const multiResult = this.analyzeMultiTimeframeTrend(multiTimeframeData);
            if (multiResult.trend) {
                results.reasons.push(multiResult.reason);
                if (multiResult.trend === 'bullish') results.strength += 15;
                else if (multiResult.trend === 'bearish') results.strength -= 15;
            }
        }

        if (results.strength >= 30) {
            results.overall = 'bullish';
            results.confidence = Math.min(100, results.strength + 20);
        } else if (results.strength <= -30) {
            results.overall = 'bearish';
            results.confidence = Math.min(100, Math.abs(results.strength) + 20);
        } else {
            results.overall = 'neutral';
            results.confidence = 100 - Math.abs(results.strength);
            if (Math.abs(results.strength) < 15) {
                results.warnings.push("⚠️ بازار در حالت رنج است - از استراتژی رنج استفاده کنید");
            }
        }

        if (emaResult.alignment === 'mixed') {
            results.warnings.push("⚠️ EMAها هم‌جهت نیستند - احتمال نوسان");
        }
        
        if (macdResult.divergence) {
            results.warnings.push(`⚠️ واگرایی MACD مشاهده شد: ${macdResult.divergence === 'bullish' ? 'صعودی' : 'نزولی'}`);
        }

        return results;
    }

    analyzeEMA(candles: any[]) {
        const closes = candles.map(c => c.close);
        const ema9 = this.calculateEMA(closes, 9);
        const ema21 = this.calculateEMA(closes, 21);
        const ema50 = this.calculateEMA(closes, 50);
        const ema200 = this.calculateEMA(closes, 200);

        const lastEma9 = ema9[ema9.length - 1];
        const lastEma21 = ema21[ema21.length - 1];
        const lastEma50 = ema50[ema50.length - 1];
        const lastEma200 = ema200[ema200.length - 1];
        const currentPrice = closes[closes.length - 1];

        if (!lastEma9 || !lastEma21 || !lastEma50 || !lastEma200) {
            return { trend: null as string | null, reason: "⚖️ داده کافی برای EMA", alignment: 'mixed' };
        }

        let bullishCount = 0;
        let bearishCount = 0;

        if (lastEma9 > lastEma21) bullishCount++;
        else if (lastEma9 < lastEma21) bearishCount++;
        
        if (lastEma21 > lastEma50) bullishCount++;
        else if (lastEma21 < lastEma50) bearishCount++;
        
        if (lastEma50 > lastEma200) bullishCount++;
        else if (lastEma50 < lastEma200) bearishCount++;

        if (currentPrice > lastEma50 && currentPrice > lastEma200) bullishCount += 2;
        else if (currentPrice < lastEma50 && currentPrice < lastEma200) bearishCount += 2;

        const alignment = (bullishCount >= 3) ? 'aligned_bullish' : 
                         (bearishCount >= 3) ? 'aligned_bearish' : 'mixed';

        if (bullishCount > bearishCount + 2) {
            return {
                trend: 'bullish',
                strength: Math.min(40, bullishCount * 8),
                reason: `✅ EMAها در وضعیت صعودی (ترتیب: ${bullishCount} امتیاز)`,
                alignment: alignment
            };
        } else if (bearishCount > bullishCount + 2) {
            return {
                trend: 'bearish',
                strength: Math.min(40, bearishCount * 8),
                reason: `🔻 EMAها در وضعیت نزولی (ترتیب: ${bearishCount} امتیاز)`,
                alignment: alignment
            };
        }

        return { trend: null, reason: "⚖️ EMAها بدون جهت مشخص", alignment: alignment };
    }

    analyzeMACD(candles: any[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        const closes = candles.map(c => c.close);
        const emaFast = this.calculateEMA(closes, fastPeriod);
        const emaSlow = this.calculateEMA(closes, slowPeriod);
        
        const macdLine = [];
        for (let i = 0; i < closes.length; i++) {
            if (emaFast[i] && emaSlow[i]) {
                macdLine.push(emaFast[i] - emaSlow[i]);
            } else {
                macdLine.push(0);
            }
        }
        
        const signalLine = this.calculateEMA(macdLine, signalPeriod);
        
        const histogram = [];
        for (let i = 0; i < macdLine.length; i++) {
            if (signalLine[i]) {
                histogram.push(macdLine[i] - signalLine[i]);
            } else {
                histogram.push(0);
            }
        }

        const lastMacd = macdLine[macdLine.length - 1];
        const lastSignal = signalLine[signalLine.length - 1];
        const lastHist = histogram[histogram.length - 1];

        if (lastMacd > lastSignal && lastHist > 0) {
            return {
                trend: 'bullish',
                strength: 20,
                reason: "📊 MACD در منطقه صعودی",
                divergence: null
            };
        } else if (lastMacd < lastSignal && lastHist < 0) {
            return {
                trend: 'bearish',
                strength: 20,
                reason: "📉 MACD در منطقه نزولی",
                divergence: null
            };
        }

        return { trend: null, reason: "⚖️ MACD در حالت خنثی", divergence: null };
    }

    analyzeADXDirection(candles: any[], period = 14) {
        if (candles.length < period * 2) return { trend: null, strength: 0, reason: "⚖️ داده کم", adx: 25 };
        
        const plusDI = [];
        const minusDI = [];
        
        for (let i = 1; i < candles.length; i++) {
            const highDiff = candles[i].high - candles[i-1].high;
            const lowDiff = candles[i-1].low - candles[i].low;
            
            const plusDM = (highDiff > lowDiff && highDiff > 0) ? highDiff : 0;
            const minusDM = (lowDiff > highDiff && lowDiff > 0) ? lowDiff : 0;
            
            const tr = Math.max(
                candles[i].high - candles[i].low,
                Math.abs(candles[i].high - candles[i-1].close),
                Math.abs(candles[i].low - candles[i-1].close)
            );
            
            if (tr > 0) {
                plusDI.push(plusDM / tr * 100);
                minusDI.push(minusDM / tr * 100);
            } else {
                plusDI.push(0);
                minusDI.push(0);
            }
        }
        
        if (plusDI.length < period) return { trend: null, strength: 0, reason: "⚖️ داده کم", adx: 25 };
        
        let avgPlusDI = 0, avgMinusDI = 0;
        for (let i = plusDI.length - period; i < plusDI.length; i++) {
            avgPlusDI += plusDI[i];
            avgMinusDI += minusDI[i];
        }
        avgPlusDI /= period;
        avgMinusDI /= period;
        
        const adx = Math.abs(avgPlusDI - avgMinusDI) / (avgPlusDI + avgMinusDI + 0.001) * 100;
        
        if (adx > 25) {
            if (avgPlusDI > avgMinusDI + 5) {
                return {
                    trend: 'bullish',
                    strength: Math.min(35, adx),
                    reason: `📈 ADX قوی (${adx.toFixed(1)}) با +DI غالب`,
                    adx: adx
                };
            } else if (avgMinusDI > avgPlusDI + 5) {
                return {
                    trend: 'bearish',
                    strength: Math.min(35, adx),
                    reason: `📉 ADX قوی (${adx.toFixed(1)}) با -DI غالب`,
                    adx: adx
                };
            }
        }
        
        return { 
            trend: null, 
            strength: 0, 
            reason: adx > 25 ? "📊 ADX قوی اما بدون جهت مشخص" : `📊 ADX ضعیف (${adx.toFixed(1)})، بازار رنج`,
            adx: adx
        };
    }

    analyzeStructure(candles: any[], window = 5) {
        const swings = this.getSwingPoints(candles, window);
        
        if (swings.highs.length < 2 || swings.lows.length < 2) {
            return { trend: null, reason: "⚖️ داده کافی برای تحلیل ساختار" };
        }
        
        let higherHighs = 0;
        let lowerHighs = 0;
        
        for (let i = 1; i < swings.highs.length; i++) {
            if (swings.highs[i].price > swings.highs[i-1].price) higherHighs++;
            else lowerHighs++;
        }
        
        if (higherHighs >= 2) {
            return {
                trend: 'bullish',
                strength: 25,
                reason: `🏗️ ساختار صعودی`
            };
        } else if (lowerHighs >= 2) {
            return {
                trend: 'bearish',
                strength: 25,
                reason: `🏗️ ساختار نزولی`
            };
        }
        
        return { trend: null, reason: "🏗️ ساختار خنثی" };
    }

    analyzeVolume(candles: any[]) {
        if (!candles[0] || candles[0].volume === undefined) {
            return { trend: null, reason: "📊 داده حجم در دسترس نیست" };
        }
        
        const volumes = candles.map(c => c.volume);
        const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const lastVolume = volumes[volumes.length - 1];
        
        if (lastVolume > avgVolume * 1.5) {
            return {
                trend: candles[candles.length - 1].close > candles[candles.length - 2].close ? 'bullish' : 'bearish',
                strength: 15,
                reason: "📊 حجم بالا همراه با کندل جهتی"
            };
        }
        
        return { trend: null, reason: "📊 حجم معمولی" };
    }

    analyzeMultiTimeframeTrend(multiTimeframeData: any) {
        if (!multiTimeframeData || !multiTimeframeData.candlesMap) return { trend: null, reason: "" };
        
        let bullishCount = 0;
        let bearishCount = 0;
        
        for (const tf of ['5', '15', '60']) {
            const candles = multiTimeframeData.candlesMap[tf];
            if (!candles || candles.length < 50) continue;
            
            const closes = candles.map((c: any) => c.close);
            const ema20 = this.calculateEMA(closes, 20);
            if (closes[closes.length-1] > ema20[ema20.length-1]) bullishCount++; else bearishCount++;
        }
        
        if (bullishCount >= 2) {
            return {
                trend: 'bullish',
                reason: `🕐 همراستایی در ${bullishCount} تایم فریم`
            };
        } else if (bearishCount >= 2) {
            return {
                trend: 'bearish',
                reason: `🕐 همراستایی در ${bearishCount} تایم فریم`
            };
        }
        
        return { trend: null, reason: "🕐 عدم همراستایی" };
    }

    calculateEMA(data: number[], period: number) {
        if (data.length < period) return new Array(data.length).fill(null);
        const ema = new Array(data.length).fill(null);
        const multiplier = 2 / (period + 1);
        let sum = data.slice(0, period).reduce((a, b) => a + b, 0);
        ema[period - 1] = sum / period;
        for (let i = period; i < data.length; i++) {
            ema[i] = (data[i] - ema[i - 1]) * multiplier + ema[i - 1];
        }
        return ema;
    }

    getSwingPoints(candles: any[], window = 5) {
        const highs = [];
        const lows = [];
        
        for (let i = window; i < candles.length - window; i++) {
            let isHigh = true;
            let isLow = true;
            
            for (let j = 1; j <= window; j++) {
                if (candles[i - j].high >= candles[i].high || candles[i + j].high >= candles[i].high) isHigh = false;
                if (candles[i - j].low <= candles[i].low || candles[i + j].low <= candles[i].low) isLow = false;
            }
            
            if (isHigh) highs.push({ index: i, price: candles[i].high });
            if (isLow) lows.push({ index: i, price: candles[i].low });
        }
        
        return { highs, lows };
    }
}

// ============================================================
// کلاس MarketAnalyzer - تحلیل وضعیت بازار (بدون تغییر)
// ============================================================
class MarketAnalyzer {
    analyzeMarket(candles: any[], currentPrice: number) {
        if (candles.length < 50) return { isRanging: false, strength: 0, message: "داده ناکافی" };
        const adx = new TrendAnalyzer().analyzeADXDirection(candles).adx || 25;
        const recent = candles.slice(-20);
        const high = Math.max(...recent.map(c => c.high));
        const low = Math.min(...recent.map(c => c.low));
        const isRanging = adx < 25;
        return {
            isRanging,
            strength: isRanging ? 70 : 20,
            upperBound: high,
            lowerBound: low,
            message: isRanging ? "بازار رنج" : "بازار رونددار"
        };
    }
}

// ============================================================
// کلاس DivergenceDetector - تشخیص انواع واگرایی (بدون تغییر)
// ============================================================
class DivergenceDetector {
    getPriceSwings(candles: any[], lookback = 60, window = 2) {
        const swings = [];
        for (let i = candles.length - lookback; i < candles.length - window; i++) {
            let isH = true, isL = true;
            for (let j = 1; j <= window; j++) {
                if (candles[i-j]?.high >= candles[i].high || candles[i+j]?.high >= candles[i].high) isH = false;
                if (candles[i-j]?.low <= candles[i].low || candles[i+j]?.low <= candles[i].low) isL = false;
            }
            if (isH) swings.push({ type: 'high', price: candles[i].high, index: i });
            if (isL) swings.push({ type: 'low', price: candles[i].low, index: i });
        }
        return swings.slice(-5);
    }

    getRSISwings(rsi: number[], lookback = 60, window = 2) {
        const swings = [];
        for (let i = rsi.length - lookback; i < rsi.length - window; i++) {
            let isH = true, isL = true;
            for (let j = 1; j <= window; j++) {
                if (rsi[i-j] >= rsi[i] || rsi[i+j] >= rsi[i]) isH = false;
                if (rsi[i-j] <= rsi[i] || rsi[i+j] <= rsi[i]) isL = false;
            }
            if (isH) swings.push({ type: 'high', value: rsi[i], index: i });
            if (isL) swings.push({ type: 'low', value: rsi[i], index: i });
        }
        return swings.slice(-5);
    }

    checkMultiTimeframeSignal(candlesMap: any, rsiMap: any) {
        for (const tf of ['15', '10', '5']) {
            const c = candlesMap[tf], r = rsiMap[tf];
            if (!c || !r) continue;
            const ps = this.getPriceSwings(c), rs = this.getRSISwings(r);
            if (ps.length < 2 || rs.length < 2) continue;
            const lp = ps[ps.length-1], pp = ps[ps.length-2];
            const lr = rs.find(x => Math.abs(x.index - lp.index) <= 3), pr = rs.find(x => Math.abs(x.index - pp.index) <= 3);
            if (lr && pr && lp.type === pp.type) {
                if (lp.type === 'low' && lp.price > pp.price && lr.value < pr.value) return { found: true, direction: 'bullish', name: `Hidden Bullish ${tf}` };
                if (lp.type === 'high' && lp.price < pp.price && lr.value > pr.value) return { found: true, direction: 'bearish', name: `Hidden Bearish ${tf}` };
            }
        }
        return { found: false };
    }
}

// ============================================================
// کلاس TradingStrategy - استراتژی اصلی
// ============================================================
class TradingStrategy {
    divergence = new DivergenceDetector();
    trend = new TrendAnalyzer();

    async analyze(candles: any[], timeframe: string, type: string, conf: any, price: number, multi: any) {
        const rsiMap: any = {};
        Object.keys(multi.candlesMap).forEach(k => rsiMap[k] = this.calculateRSI(multi.candlesMap[k]));
        const sig: any = this.divergence.checkMultiTimeframeSignal(multi.candlesMap, rsiMap);
        if (!sig.found) return null;

        const fib = this.calcFib(candles, sig.direction === 'bullish');
        if (!fib) return null;
        const tol = fib.range * 0.03;
        const is382 = Math.abs(price - fib.f3) <= tol, is618 = Math.abs(price - fib.f6) <= tol;
        if (!is382 && !is618) return null;

        return {
            type: sig.direction === 'bullish' ? 'BUY' : 'SELL',
            entry: is382 ? fib.f3 : fib.f6,
            sl: fib.sl,
            tp1: is382 ? fib.tp1 : fib.tp2,
            tp2: fib.tp2,
            tp3: fib.tp3,
            tp4: fib.tp4,
            tp5: fib.tp5,
            activeLevel: is382 ? 38.2 : 61.8,
            signalType: sig.name,
            confidence: 85,
            trendAnalysis: this.trend.analyzeFullTrend(candles, multi),
            time: Date.now()
        };
    }

    calcFib(candles: any[], isBull: boolean) {
        const recent = candles.slice(-60);
        if (!recent.length) return null;
        const high = Math.max(...recent.map(c => c.high)), low = Math.min(...recent.map(c => c.low)), range = high - low;
        if (range < 50) return null;
        return {
            f3: isBull ? high - range * 0.382 : low + range * 0.382,
            f6: isBull ? high - range * 0.618 : low + range * 0.618,
            sl: isBull ? low - range * 2.99 : high + range * 2.99,
            tp1: isBull ? high + range * 0.12 : low - range * 0.12,
            tp2: isBull ? high + range * 0.24 : low - range * 0.24,
            tp3: isBull ? high + range * 0.38 : low - range * 0.38,
            tp4: isBull ? high + range * 0.5 : low - range * 0.5,
            tp5: isBull ? high + range * 0.618 : low - range * 0.618,
            range
        };
    }

    calculateRSI(candles: any[]) {
        const prices = candles.map(c => c.close), rsi = new Array(prices.length).fill(50);
        if (prices.length < 15) return rsi;
        let g = 0, l = 0;
        for (let i = 1; i <= 14; i++) {
            const d = prices[i] - prices[i-1];
            if (d >= 0) g += d; else l -= d;
        }
        let ag = g/14, al = l/14;
        for (let i = 15; i < prices.length; i++) {
            const d = prices[i] - prices[i-1], gn = d >= 0 ? d : 0, ln = d < 0 ? -d : 0;
            ag = (ag * 13 + gn) / 14; al = (al * 13 + ln) / 14;
            rsi[i] = 100 - (100 / (1 + ag / (al || 1)));
        }
        return rsi;
    }
}

// ============================================================
// کلاس ActiveTrade - مدیریت معاملات فعال
// ============================================================
class ActiveTrade {
    signalId: number; type: string; entry: number; sl: number; tp1: number; tp2: number; tp3: number; tp4: number; tp5: number;
    reached: string[] = []; sent: any = {}; isCompleted = false;
    constructor(sig: any) {
        Object.assign(this, sig);
        this.signalId = sig.time || Date.now();
    }
    checkTargets(price: number) {
        const newly = [];
        const tps = [this.tp1, this.tp2, this.tp3, this.tp4, this.tp5];
        tps.forEach((tp, i) => {
            const name = `TP${i+1}`;
            if (!this.reached.includes(name) && (this.type === 'BUY' ? price >= tp : price <= tp)) {
                this.reached.push(name);
                if (!this.sent[name]) {
                    newly.push({ target: name, price: tp });
                    this.sent[name] = true;
                }
            }
        });
        if (this.type === 'BUY' ? price <= this.sl : price >= this.sl) return { hitStop: true, hitTargets: newly, finalPrice: this.sl };
        if (this.reached.length === 5) this.isCompleted = true;
        return { hitStop: false, hitTargets: newly, fullTargets: this.isCompleted };
    }
}

// ============================================================
// کلاس MultiTimeframeDataManager - مدیریت داده‌های چند تایم فریم
// ============================================================
class MultiTimeframeDataManager {
    currentToken: string; farazSession: string; cache: any = {};
    constructor(token: string, session: string) { this.currentToken = token; this.farazSession = session; }
    async fetch(tf: string, count = 200) {
        try {
            const to = Math.floor(Date.now() / 1000), from = to - (count * 60 * parseInt(tf));
            const res = await axios.get(`https://ir3.faraz.io/api/customer/trading-view/history?symbolName=INDEX_BTCUSD&resolution=${tf}&from=${from}&to=${to}&countback=${count}&firstDataRequest=true&latest=true&adjustType=2&json=true`, {
                headers: { 'cookie': `x-access-token=${this.currentToken}; farazSession=${this.farazSession}`, 'user-agent': 'Mozilla/5.0' }
            });
            if (res.data.result?.t) {
                this.cache[tf] = res.data.result.t.map((t: any, i: any) => ({
                    time: t,
                    open: parseFloat(res.data.result.o[i]),
                    high: parseFloat(res.data.result.h[i]),
                    low: parseFloat(res.data.result.l[i]),
                    close: parseFloat(res.data.result.c[i])
                }));
            }
            return this.cache[tf] || [];
        } catch(e) { return this.cache[tf] || []; }
    }
    async updateAll() { await Promise.all(['1', '2', '3', '5', '10', '15', '60'].map(tf => this.fetch(tf))); }
}

// ============================================================
// کلاس BitcoinEngine - موتور اصلی ربات بیت‌کوین
// ============================================================
class BitcoinEngine {
    price = 0; mainTimeframe = '5'; candles: any[] = []; activeTrades: ActiveTrade[] = []; isEnabled = true;
    currentToken = ""; farazSession = ""; baleToken = ""; baleChatId = "";
    settingsFile = path.join(process.cwd(), 'new', 'bitcoin_settings.json');
    multi: MultiTimeframeDataManager; strategy = new TradingStrategy(); session = new SessionManager(); market = new MarketAnalyzer();

    constructor() {
        this.loadSettings();
        this.multi = new MultiTimeframeDataManager(this.currentToken, this.farazSession);
    }

    loadSettings() {
        try {
            if (fs.existsSync(this.settingsFile)) {
                const s = JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'));
                this.currentToken = s.currentToken; this.farazSession = s.farazSession;
                this.baleToken = s.baleToken; this.baleChatId = s.baleChatId;
                this.isEnabled = s.isEnabled ?? true;
            }
        } catch(e) {}
    }

    saveSettings() {
        try {
            const s = {
                currentToken: this.currentToken,
                farazSession: this.farazSession,
                baleToken: this.baleToken,
                baleChatId: this.baleChatId,
                isEnabled: this.isEnabled
            };
            fs.writeFileSync(this.settingsFile, JSON.stringify(s, null, 2));
        } catch(e) {}
    }

    // ============================================================
    // منطق رفرش توکن (اضافه شده)
    // ============================================================
    async refreshToken() {
        try {
            console.log("🔄 در حال رفرش توکن...");
            const url = 'https://faraz.io/api/public/authentication/me';
            const res = await axios.get(url, {
                headers: {
                    'authority': 'faraz.io',
                    'accept': 'application/json, text/plain, */*',
                    'cookie': `x-access-token=${this.currentToken}; farazSession=${this.farazSession}`,
                    'referer': 'https://faraz.io/dashboard',
                    'user-agent': 'Mozilla/5.0'
                }
            });
            if (res.data && res.data.token) {
                this.currentToken = res.data.token;
                this.multi.currentToken = this.currentToken;
                this.saveSettings();
                console.log("✅ توکن با موفقیت رفرش شد");
                return true;
            }
        } catch (e: any) {
            console.error("❌ خطا در رفرش توکن:", e.message);
        }
        return false;
    }

    async checkAndRefreshToken() {
        if (!this.currentToken) return;
        try {
            const decoded: any = jwt.decode(this.currentToken);
            if (decoded && decoded.exp) {
                const now = Math.floor(Date.now() / 1000);
                const timeLeft = decoded.exp - now;
                console.log(`🔑 اعتبار توکن: ${Math.floor(timeLeft / 60)} دقیقه`);
                if (timeLeft < 1800) await this.refreshToken();
            }
        } catch (e) {
            console.error("❌ خطا در بررسی توکن:", e);
        }
    }

    async start() {
        if (!this.isEnabled) return;
        await this.checkAndRefreshToken();
        await this.multi.updateAll();
        await this.fetchHistory();
        this.connectWS();
        setInterval(async () => {
            await this.checkAndRefreshToken();
            await this.multi.updateAll();
        }, 60000);
    }

    async fetchHistory() {
        try {
            const to = Math.floor(Date.now() / 1000), from = to - 3600;
            const res = await axios.get(`https://ir3.faraz.io/api/customer/trading-view/history?symbolName=INDEX_BTCUSD&resolution=${this.mainTimeframe}&from=${from}&to=${to}&countback=500&firstDataRequest=true&latest=true&adjustType=2&json=true`, {
                headers: { 'cookie': `x-access-token=${this.currentToken}; farazSession=${this.farazSession}`, 'user-agent': 'Mozilla/5.0' }
            });
            if (res.data.result?.t) {
                this.candles = res.data.result.t.map((t: any, i: any) => ({
                    time: t,
                    open: parseFloat(res.data.result.o[i]),
                    high: parseFloat(res.data.result.h[i]),
                    low: parseFloat(res.data.result.l[i]),
                    close: parseFloat(res.data.result.c[i])
                }));
            }
            if (this.candles.length) this.price = this.candles[this.candles.length-1].close;
        } catch(e) {}
    }

    connectWS() {
        const ws = new WebSocket("wss://ir3.faraz.io/srv09/realtime/?EIO=4&transport=websocket", { origin: "https://faraz.io" });
        ws.on('message', (msg: any) => {
            const s = msg.toString();
            if (s === '2') ws.send('3');
            else if (s.startsWith('42')) {
                try {
                    const p = JSON.parse(s.substring(s.indexOf('[')));
                    if (p[0] === 'symbol-room-@INDEX_BTCUSD@1@0') {
                        const tick = p[1];
                        this.price = tick.close;
                        const last = this.candles[this.candles.length-1];
                        if (last && last.time === tick.time) this.candles[this.candles.length-1] = tick;
                        else {
                            this.candles.push(tick);
                            if (this.candles.length > 500) this.candles.shift();
                            this.runStrategy();
                        }
                        this.checkActiveTrades();
                    }
                } catch(e) {}
            } else if (s.startsWith('0{')) ws.send(`40/customer,${JSON.stringify({ token: this.currentToken })}`);
            else if (s.startsWith('40/customer,')) ws.send(`42/customer,["join-room","symbol-room-@INDEX_BTCUSD@1@0"]`);
        });
    }

    async runStrategy() {
        const sess = this.session.getCurrentSession();
        if (!sess.isActive) return;
        const sig = await this.strategy.analyze(this.candles, this.mainTimeframe, '', {}, this.price, { candlesMap: this.multi.cache });
        if (sig) {
            const asia = this.session.getAsiaHighLow(this.candles);
            if (this.session.isLiquidityTaken(this.price, asia, null, 'londonBackas')) {
                this.activeTrades.push(new ActiveTrade(sig));
                await this.sendBale(sig);
            }
        }
    }

    checkActiveTrades() {
        this.activeTrades = this.activeTrades.filter(t => {
            const r = t.checkTargets(this.price);
            r.hitTargets.forEach(h => this.sendBale({ type: 'TARGET', name: h.target, price: h.price }));
            return !r.hitStop && !r.fullTargets;
        });
    }

    async sendBale(msg: any) {
        try {
            await axios.post(`https://tapi.bale.ai/bot${this.baleToken}/sendMessage`, {
                chat_id: this.baleChatId,
                text: JSON.stringify(msg, null, 2)
            });
        } catch(e) {}
    }
}

new BitcoinEngine().start();
