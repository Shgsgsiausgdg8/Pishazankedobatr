import { Candle, Signal } from "../types.js";
import axios from "axios";
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

// ============================================================
// کلاس TrendAnalyzer - تحلیل تخصصی روند
// ============================================================
class TrendAnalyzer {
    public trendStatus: any;
    constructor() {
        this.trendStatus = {
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
    }

    analyzeFullTrend(candles, multiTimeframeData) {
        const results = {
            overall: 'neutral',
            strength: 0,
            confidence: 0,
            reasons: [],
            warnings: []
        };

        if (!candles || (candles as any).length < 50) {
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

        if (multiTimeframeData && (multiTimeframeData as any).candlesMap) {
            const multiResult = this.analyzeMultiTimeframeTrend(multiTimeframeData);
            if ((multiResult as any).trend) {
                results.reasons.push((multiResult as any).reason);
                if ((multiResult as any).trend === 'bullish') results.strength += 15;
                else if ((multiResult as any).trend === 'bearish') results.strength -= 15;
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

    // تحلیل روند در تایم 15 دقیقه
    analyze15MinTrend(candles15min) {
        if (!candles15min || candles15min.length < 50) {
            return {
                overall: 'neutral',
                strength: 0,
                direction: 'neutral',
                message: 'داده کافی برای تحلیل تایم ۱۵ دقیقه وجود ندارد'
            };
        }

        const closes = candles15min.map(c => c.close);
        const ema9 = this.calculateEMA(closes, 9);
        const ema21 = this.calculateEMA(closes, 21);
        const ema50 = this.calculateEMA(closes, 50);
        const ema200 = this.calculateEMA(closes, 200);

        const lastEma9 = ema9[ema9.length - 1];
        const lastEma21 = ema21[ema21.length - 1];
        const lastEma50 = ema50[ema50.length - 1];
        const lastEma200 = ema200[ema200.length - 1];
        const currentPrice = closes[closes.length - 1];

        let bullishScore = 0;
        let bearishScore = 0;

        // بررسی ترتیب EMAها
        if (lastEma9 > lastEma21) bullishScore += 15;
        else if (lastEma9 < lastEma21) bearishScore += 15;

        if (lastEma21 > lastEma50) bullishScore += 15;
        else if (lastEma21 < lastEma50) bearishScore += 15;

        if (lastEma50 > lastEma200) bullishScore += 20;
        else if (lastEma50 < lastEma200) bearishScore += 20;

        // بررسی قیمت نسبت به EMAها
        if (currentPrice > lastEma50 && currentPrice > lastEma200) bullishScore += 20;
        else if (currentPrice < lastEma50 && currentPrice < lastEma200) bearishScore += 20;

        // تحلیل MACD در تایم 15 دقیقه
        const macdResult = this.analyzeMACD(candles15min);
        if (macdResult.trend === 'bullish') bullishScore += 20;
        else if (macdResult.trend === 'bearish') bearishScore += 20;

        // تحلیل ADX در تایم 15 دقیقه
        const adxResult = this.analyzeADXDirection(candles15min);
        if (adxResult.trend === 'bullish') bullishScore += adxResult.strength;
        else if (adxResult.trend === 'bearish') bearishScore += adxResult.strength;

        // ساختار بازار در تایم 15 دقیقه
        const structureResult = this.analyzeStructure(candles15min);
        if (structureResult.trend === 'bullish') bullishScore += 15;
        else if (structureResult.trend === 'bearish') bearishScore += 15;

        const totalScore = bullishScore + bearishScore;
        let overall = 'neutral';
        let strength = 0;
        let message = '';

        if (bullishScore > bearishScore + 25) {
            overall = 'bullish';
            strength = Math.min(100, Math.round((bullishScore / totalScore) * 100));
            message = `📈 روند تایم ۱۵ دقیقه صعودی (قدرت: ${strength}%)`;
        } else if (bearishScore > bullishScore + 25) {
            overall = 'bearish';
            strength = Math.min(100, Math.round((bearishScore / totalScore) * 100));
            message = `📉 روند تایم ۱۵ دقیقه نزولی (قدرت: ${strength}%)`;
        } else {
            message = `⚖️ روند تایم ۱۵ دقیقه خنثی (صعودی: ${bullishScore}, نزولی: ${bearishScore})`;
        }

        return {
            overall,
            strength,
            direction: overall === 'bullish' ? 'up' : (overall === 'bearish' ? 'down' : 'neutral'),
            message,
            details: {
                bullishScore,
                bearishScore,
                ema9: lastEma9,
                ema21: lastEma21,
                ema50: lastEma50,
                ema200: lastEma200,
                currentPrice,
                macdDirection: macdResult.trend,
                adxValue: adxResult.adx
            }
        };
    }

    analyzeEMA(candles) {
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
            return { trend: null, reason: "⚖️ داده کافی برای EMA", alignment: 'mixed' };
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

    analyzeMACD(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
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
        const prevMacd = macdLine[macdLine.length - 2];
        const lastSignal = signalLine[signalLine.length - 1];
        const prevSignal = signalLine[signalLine.length - 2];
        const lastHist = histogram[histogram.length - 1];
        const prevHist = histogram[histogram.length - 2];

        let divergence = null;
        const priceSwings = this.findPriceSwings(closes, 20);
        const macdSwings = this.findPriceSwings(macdLine, 20);
        
        if (priceSwings.lows.length >= 2 && macdSwings.lows.length >= 2) {
            const lastPriceLow = priceSwings.lows[priceSwings.lows.length - 1];
            const prevPriceLow = priceSwings.lows[priceSwings.lows.length - 2];
            const lastMacdLow = macdSwings.lows[macdSwings.lows.length - 1];
            const prevMacdLow = macdSwings.lows[macdSwings.lows.length - 2];
            
            if (lastPriceLow && prevPriceLow && lastMacdLow && prevMacdLow &&
                lastPriceLow.value < prevPriceLow.value && lastMacdLow.value > prevMacdLow.value) {
                divergence = 'bullish';
            }
        }
        
        if (priceSwings.highs.length >= 2 && macdSwings.highs.length >= 2) {
            const lastPriceHigh = priceSwings.highs[priceSwings.highs.length - 1];
            const prevPriceHigh = priceSwings.highs[priceSwings.highs.length - 2];
            const lastMacdHigh = macdSwings.highs[macdSwings.highs.length - 1];
            const prevMacdHigh = macdSwings.highs[macdSwings.highs.length - 2];
            
            if (lastPriceHigh && prevPriceHigh && lastMacdHigh && prevMacdHigh &&
                lastPriceHigh.value > prevPriceHigh.value && lastMacdHigh.value < prevMacdHigh.value) {
                divergence = 'bearish';
            }
        }

        if (lastMacd > lastSignal && lastHist > 0 && lastHist > prevHist) {
            return {
                trend: 'bullish',
                strength: 30,
                reason: "📊 MACD در منطقه صعودی با هیستوگرام مثبت",
                divergence: divergence
            };
        } else if (lastMacd > lastSignal && lastHist > 0) {
            return {
                trend: 'bullish',
                strength: 20,
                reason: "📊 MACD در منطقه صعودی",
                divergence: divergence
            };
        } else if (lastMacd < lastSignal && lastHist < 0 && lastHist < prevHist) {
            return {
                trend: 'bearish',
                strength: 30,
                reason: "📉 MACD در منطقه نزولی با هیستوگرام منفی",
                divergence: divergence
            };
        } else if (lastMacd < lastSignal && lastHist < 0) {
            return {
                trend: 'bearish',
                strength: 20,
                reason: "📉 MACD در منطقه نزولی",
                divergence: divergence
            };
        }

        if (lastMacd > lastSignal && prevMacd <= prevSignal) {
            return {
                trend: 'bullish',
                strength: 25,
                reason: "🟢 تقاطع صعودی MACD (Signal Line crossover)",
                divergence: divergence
            };
        } else if (lastMacd < lastSignal && prevMacd >= prevSignal) {
            return {
                trend: 'bearish',
                strength: 25,
                reason: "🔴 تقاطع نزولی MACD (Signal Line crossover)",
                divergence: divergence
            };
        }

        return { trend: null, reason: "⚖️ MACD در حالت خنثی", divergence: divergence };
    }

    analyzeADXDirection(candles, period = 14) {
        if ((candles as any).length < period * 2) return { trend: null, strength: 0 };
        
        const plusDI = [];
        const minusDI = [];
        
        for (let i = 1; i < (candles as any).length; i++) {
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
        
        if (plusDI.length < period) return { trend: null, strength: 0 };
        
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

    analyzeStructure(candles, window = 5) {
        const swings = this.getSwingPoints(candles, window);
        
        if (swings.highs.length < 2 || swings.lows.length < 2) {
            return { trend: null, reason: "⚖️ داده کافی برای تحلیل ساختار" };
        }
        
        let higherHighs = 0;
        let higherLows = 0;
        let lowerHighs = 0;
        let lowerLows = 0;
        
        for (let i = 1; i < swings.highs.length; i++) {
            if (swings.highs[i].price > swings.highs[i-1].price) higherHighs++;
            if (swings.highs[i].price < swings.highs[i-1].price) lowerHighs++;
        }
        
        for (let i = 1; i < swings.lows.length; i++) {
            if (swings.lows[i].price > swings.lows[i-1].price) higherLows++;
            if (swings.lows[i].price < swings.lows[i-1].price) lowerLows++;
        }
        
        if (higherHighs >= 2 && higherLows >= 2) {
            return {
                trend: 'bullish',
                strength: 25,
                reason: `🏗️ ساختار صعودی: سقف‌ها و کف‌ها بالاتر می‌روند`,
                details: { higherHighs, higherLows }
            };
        } else if (lowerHighs >= 2 && lowerLows >= 2) {
            return {
                trend: 'bearish',
                strength: 25,
                reason: `🏗️ ساختار نزولی: سقف‌ها و کف‌ها پایین‌تر می‌روند`,
                details: { lowerHighs, lowerLows }
            };
        }
        
        return { trend: null, reason: "🏗️ ساختار خنثی (Sideways)" };
    }

    analyzeVolume(candles) {
        if (!candles[0] || candles[0].volume === undefined) {
            return { trend: null, reason: "📊 داده حجم در دسترس نیست" };
        }
        
        const volumes = candles.map(c => c.volume);
        const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const lastVolume = volumes[volumes.length - 1];
        const lastClose = candles[(candles as any).length - 1].close;
        const prevClose = candles[(candles as any).length - 2].close;
        
        const isBullishCandle = lastClose > prevClose;
        const isVolumeHigh = lastVolume > avgVolume * 1.5;
        
        if (isBullishCandle && isVolumeHigh) {
            return {
                trend: 'bullish',
                strength: 15,
                reason: "📊 حجم بالا همراه با کندل صعودی (تأیید روند)"
            };
        } else if (!isBullishCandle && isVolumeHigh) {
            return {
                trend: 'bearish',
                strength: 15,
                reason: "📊 حجم بالا همراه با کندل نزولی (تأیید روند)"
            };
        }
        
        return { trend: null, reason: "📊 حجم معمولی" };
    }

    analyzeMultiTimeframeTrend(multiTimeframeData) {
        if (!multiTimeframeData || !(multiTimeframeData as any).candlesMap) return { trend: null, reason: "" };
        
        let bullishCount = 0;
        let bearishCount = 0;
        const timeframes = ['5', '15', '60'];
        
        for (const tf of timeframes) {
            const candles = (multiTimeframeData as any).candlesMap[tf];
            if (!candles || (candles as any).length < 50) continue;
            
            const closes = candles.map(c => c.close);
            const ema20 = this.calculateEMA(closes, 20);
            const ema50 = this.calculateEMA(closes, 50);
            const currentPrice = closes[closes.length - 1];
            const lastEma20 = ema20[ema20.length - 1];
            const lastEma50 = ema50[ema50.length - 1];
            
            if (lastEma20 && lastEma50 && lastEma20 > lastEma50 && currentPrice > lastEma20) {
                bullishCount++;
            } else if (lastEma20 && lastEma50 && lastEma20 < lastEma50 && currentPrice < lastEma20) {
                bearishCount++;
            }
        }
        
        if (bullishCount >= 2) {
            return {
                trend: 'bullish',
                strength: 20,
                reason: `🕐 همراستایی در ${bullishCount} تایم فریم (روند صعودی)`
            };
        } else if (bearishCount >= 2) {
            return {
                trend: 'bearish',
                strength: 20,
                reason: `🕐 همراستایی در ${bearishCount} تایم فریم (روند نزولی)`
            };
        }
        
        return { trend: null, reason: "🕐 عدم همراستایی تایم فریم‌ها" };
    }

    calculateEMA(data, period) {
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

    findPriceSwings(prices, lookback) {
        const highs = [];
        const lows = [];
        const startIdx = Math.max(0, prices.length - lookback);
        
        for (let i = startIdx; i < prices.length - 2; i++) {
            let isHigh = true;
            let isLow = true;
            
            for (let j = 1; j <= 2; j++) {
                if (i - j >= 0 && prices[i - j] >= prices[i]) isHigh = false;
                if (i + j < prices.length && prices[i + j] >= prices[i]) isHigh = false;
                if (i - j >= 0 && prices[i - j] <= prices[i]) isLow = false;
                if (i + j < prices.length && prices[i + j] <= prices[i]) isLow = false;
            }
            
            if (isHigh) highs.push({ index: i, value: prices[i] });
            if (isLow) lows.push({ index: i, value: prices[i] });
        }
        
        return { highs, lows };
    }

    getSwingPoints(candles, window = 5) {
        const highs = [];
        const lows = [];
        
        for (let i = window; i < (candles as any).length - window; i++) {
            let isHigh = true;
            let isLow = true;
            
            for (let j = 1; j <= window; j++) {
                if (candles[i - j].high >= candles[i].high) isHigh = false;
                if (candles[i + j].high >= candles[i].high) isHigh = false;
                if (candles[i - j].low <= candles[i].low) isLow = false;
                if (candles[i + j].low <= candles[i].low) isLow = false;
            }
            
            if (isHigh) highs.push({ index: i, price: candles[i].high });
            if (isLow) lows.push({ index: i, price: candles[i].low });
        }
        
        return { highs, lows };
    }
}

// ============================================================
// کلاس MarketAnalyzer - تحلیل وضعیت بازار
// ============================================================
class MarketAnalyzer {
    public rangeStatus: any;
    constructor() {
        this.rangeStatus = {
            isRanging: false,
            strength: 0,
            upperBound: null,
            lowerBound: null,
            avgTrueRange: null,
            adx: null,
            bbWidth: null,
            consolidationRatio: null
        };
    }

    analyzeMarket(candles, currentPrice) {
        if (!candles || (candles as any).length < 50) {
            return { isRanging: false, strength: 0, message: "داده کافی موجود نیست" };
        }

        const indicators = this.calculateAllIndicators(candles);
        
        let rangeScore = 0;
        let reasons = [];

        const adxResult = this.checkADXForRange(indicators.adx);
        if (adxResult.isRanging) {
            rangeScore += adxResult.score;
            reasons.push(adxResult.reason);
        }

        const bbResult = this.checkBollingerBands(indicators.bollingerBands, candles);
        if (bbResult.isRanging) {
            rangeScore += bbResult.score;
            reasons.push(bbResult.reason);
        }

        const atrResult = this.checkATRRange(indicators.atr, currentPrice, candles);
        if (atrResult.isRanging) {
            rangeScore += atrResult.score;
            reasons.push(atrResult.reason);
        }

        const consolidationResult = this.checkConsolidation(candles);
        if (consolidationResult.isRanging) {
            rangeScore += consolidationResult.score;
            reasons.push(consolidationResult.reason);
        }

        const hlRatioResult = this.checkHighLowRatio(candles);
        if (hlRatioResult.isRanging) {
            rangeScore += hlRatioResult.score;
            reasons.push(hlRatioResult.reason);
        }

        const isRanging = rangeScore >= 40;
        const strength = Math.min(100, rangeScore);

        const recentCandles = candles.slice(-20);
        const upperBound = Math.max(...recentCandles.map(c => c.high));
        const lowerBound = Math.min(...recentCandles.map(c => c.low));
        const rangeWidth = ((upperBound - lowerBound) / lowerBound) * 100;

        return {
            isRanging,
            strength,
            upperBound,
            lowerBound,
            rangeWidth: rangeWidth.toFixed(2),
            avgTrueRange: indicators.atr,
            adx: indicators.adx,
            bbWidth: indicators.bollingerBands.width,
            reasons,
            score: rangeScore,
            message: this.getRangeMessage(isRanging, strength, rangeWidth)
        };
    }

    calculateAllIndicators(candles) {
        const closes = candles.map(c => c.close);
        const atr = this.calculateATR(candles, 14);
        const adx = this.calculateADX(candles, 14);
        const bollingerBands = this.calculateBollingerBands(closes, 20, 2);
        return { atr, adx, bollingerBands };
    }

    calculateATR(candles, period) {
        if ((candles as any).length < period + 1) return null;
        const trueRanges = [];
        for (let i = 1; i < (candles as any).length; i++) {
            const tr = Math.max(
                candles[i].high - candles[i].low,
                Math.abs(candles[i].high - candles[i-1].close),
                Math.abs(candles[i].low - candles[i-1].close)
            );
            trueRanges.push(tr);
        }
        
        let atr = 0;
        for (let i = 0; i < period; i++) atr += trueRanges[i];
        atr = atr / period;
        
        for (let i = period; i < trueRanges.length; i++) {
            atr = ((atr * (period - 1)) + trueRanges[i]) / period;
        }
        return atr;
    }

    calculateADX(candles, period) {
        if ((candles as any).length < period * 2) return 25;
        
        const plusDM = [];
        const minusDM = [];
        const tr = [];
        
        for (let i = 1; i < (candles as any).length; i++) {
            const highDiff = candles[i].high - candles[i-1].high;
            const lowDiff = candles[i-1].low - candles[i].low;
            
            if (highDiff > lowDiff && highDiff > 0) {
                plusDM.push(highDiff);
            } else {
                plusDM.push(0);
            }
            
            if (lowDiff > highDiff && lowDiff > 0) {
                minusDM.push(lowDiff);
            } else {
                minusDM.push(0);
            }
            
            const trueRange = Math.max(
                candles[i].high - candles[i].low,
                Math.abs(candles[i].high - candles[i-1].close),
                Math.abs(candles[i].low - candles[i-1].close)
            );
            tr.push(trueRange);
        }
        
        if (tr.length < period) return 25;
        
        let smoothedPlusDM = 0, smoothedMinusDM = 0, smoothedTR = 0;
        for (let i = 0; i < period; i++) {
            smoothedPlusDM += plusDM[i];
            smoothedMinusDM += minusDM[i];
            smoothedTR += tr[i];
        }
        
        const plusDI = (smoothedPlusDM / smoothedTR) * 100;
        const minusDI = (smoothedMinusDM / smoothedTR) * 100;
        const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
        
        return dx;
    }

    calculateBollingerBands(data, period, stdDev) {
        if (data.length < period) return { upper: null, middle: null, lower: null, width: null };
        
        const lastData = data.slice(-period);
        const middle = lastData.reduce((a, b) => a + b, 0) / period;
        
        const squaredDiffs = lastData.map(value => Math.pow(value - middle, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
        const standardDeviation = Math.sqrt(variance);
        
        const upper = middle + (standardDeviation * stdDev);
        const lower = middle - (standardDeviation * stdDev);
        const width = ((upper - lower) / middle) * 100;
        
        return { upper, middle, lower, width };
    }

    checkADXForRange(adx) {
        if (adx === null) return { isRanging: false, score: 0, reason: "" };
        
        if (adx < 20) {
            return { isRanging: true, score: 35, reason: `ADX در سطح ${adx.toFixed(1)} (زیر 20)` };
        } else if (adx < 25) {
            return { isRanging: true, score: 25, reason: `ADX در سطح ${adx.toFixed(1)} (20-25)` };
        } else if (adx < 30) {
            return { isRanging: true, score: 15, reason: `ADX در سطح ${adx.toFixed(1)} (25-30)` };
        }
        return { isRanging: false, score: 0, reason: "" };
    }

    checkBollingerBands(bb, candles) {
        if (!bb.width) return { isRanging: false, score: 0, reason: "" };
        if (bb.width < 3) {
            return { isRanging: true, score: 30, reason: `عرض باند بولینگر ${bb.width.toFixed(2)}%` };
        } else if (bb.width < 5) {
            return { isRanging: true, score: 20, reason: `عرض باند بولینگر ${bb.width.toFixed(2)}%` };
        }
        return { isRanging: false, score: 0, reason: "" };
    }

    checkATRRange(atr, currentPrice, candles) {
        if (!atr || !currentPrice) return { isRanging: false, score: 0, reason: "" };
        const atrPercent = (atr / currentPrice) * 100;
        if (atrPercent < 0.5) {
            return { isRanging: true, score: 25, reason: `ATR درصدی ${atrPercent.toFixed(2)}%` };
        } else if (atrPercent < 0.8) {
            return { isRanging: true, score: 15, reason: `ATR درصدی ${atrPercent.toFixed(2)}%` };
        }
        return { isRanging: false, score: 0, reason: "" };
    }

    checkConsolidation(candles) {
        const recentCandles = candles.slice(-15);
        const bodySizes = [];
        const directions = [];
        
        for (let i = 0; i < recentCandles.length; i++) {
            const body = Math.abs(recentCandles[i].close - recentCandles[i].open);
            const totalRange = recentCandles[i].high - recentCandles[i].low;
            const bodyRatio = totalRange > 0 ? body / totalRange : 0;
            bodySizes.push(bodyRatio);
            const direction = recentCandles[i].close > recentCandles[i].open ? 'up' : 'down';
            directions.push(direction);
        }
        
        const avgBodySize = bodySizes.reduce((a, b) => a + b, 0) / bodySizes.length;
        const upCount = directions.filter(d => d === 'up').length;
        const downCount = directions.filter(d => d === 'down').length;
        const balance = Math.abs(upCount - downCount);
        
        if (avgBodySize < 0.3 && balance < 5) {
            return { isRanging: true, score: 20, reason: "بدنه های کوچک و تعادل جهتی" };
        } else if (avgBodySize < 0.4 && balance < 7) {
            return { isRanging: true, score: 10, reason: "بدنه های متوسط و تعادل نسبی" };
        }
        return { isRanging: false, score: 0, reason: "" };
    }

    checkHighLowRatio(candles) {
        const closes = candles.map(c => c.close);
        const sma = this.calculateSMA(closes, 20);
        if (!sma) return { isRanging: false, score: 0, reason: "" };
        
        const recentCandles = candles.slice(-10);
        let maxDeviation = 0;
        
        for (const candle of recentCandles) {
            const devHigh = Math.abs(candle.high - sma) / sma * 100;
            const devLow = Math.abs(candle.low - sma) / sma * 100;
            maxDeviation = Math.max(maxDeviation, devHigh, devLow);
        }
        
        if (maxDeviation < 1) {
            return { isRanging: true, score: 20, reason: `انحراف ${maxDeviation.toFixed(2)}% از SMA20` };
        } else if (maxDeviation < 2) {
            return { isRanging: true, score: 10, reason: `انحراف ${maxDeviation.toFixed(2)}% از SMA20` };
        }
        return { isRanging: false, score: 0, reason: "" };
    }

    calculateSMA(data, period) {
        if (data.length < period) return null;
        const sum = data.slice(-period).reduce((a, b) => a + b, 0);
        return sum / period;
    }

    getRangeMessage(isRanging, strength, rangeWidth) {
        if (!isRanging) {
            if (strength > 30) return "بازار در حال خروج از رنج";
            return "بازار رونددار";
        }
        if (strength >= 70) return `رنج قوی (${rangeWidth}%)`;
        if (strength >= 50) return `رنج متوسط (${rangeWidth}%)`;
        return `رنج ضعیف (${rangeWidth}%)`;
    }
}

// ============================================================
// کلاس DivergenceDetector - تشخیص انواع واگرایی
// ============================================================
class DivergenceDetector {
    public priceSwings: any;
    public rsiSwings: any;
    constructor() {
        this.priceSwings = [];
        this.rsiSwings = [];
    }

    getPriceSwings(candles, lookback = 60, window = 2) {
        const swings = [];
        const searchDepth = Math.min(lookback, (candles as any).length - 10);
        
        for (let i = (candles as any).length - searchDepth; i < (candles as any).length - window; i++) {
            let isSwingHigh = true;
            let isSwingLow = true;
            
            for (let j = 1; j <= window; j++) {
                if (i - j >= 0 && candles[i - j].high >= candles[i].high) isSwingHigh = false;
                if (i + j < (candles as any).length && candles[i + j].high >= candles[i].high) isSwingHigh = false;
                if (i - j >= 0 && candles[i - j].low <= candles[i].low) isSwingLow = false;
                if (i + j < (candles as any).length && candles[i + j].low <= candles[i].low) isSwingLow = false;
            }
            
            if (isSwingHigh) {
                swings.push({ type: 'high', price: candles[i].high, index: i, time: candles[i].time });
            }
            if (isSwingLow) {
                swings.push({ type: 'low', price: candles[i].low, index: i, time: candles[i].time });
            }
        }
        
        const unique = [];
        for (let i = 0; i < swings.length; i++) {
            if (unique.length === 0) {
                unique.push(swings[i]);
                continue;
            }
            const last = unique[unique.length - 1];
            if (last.type === swings[i].type) {
                if ((last.type === 'high' && swings[i].price > last.price) ||
                    (last.type === 'low' && swings[i].price < last.price)) {
                    unique[unique.length - 1] = swings[i];
                }
            } else {
                unique.push(swings[i]);
            }
        }
        
        return unique.slice(-10);
    }

    getRSISwings(rsiValues, lookback = 60, window = 2) {
        const swings = [];
        const searchDepth = Math.min(lookback, rsiValues.length - 10);
        const startIdx = Math.max(0, rsiValues.length - searchDepth);
        
        for (let i = startIdx; i < rsiValues.length - window; i++) {
            let isSwingHigh = true;
            let isSwingLow = true;
            
            for (let j = 1; j <= window; j++) {
                if (i - j >= 0 && rsiValues[i - j] >= rsiValues[i]) isSwingHigh = false;
                if (i + j < rsiValues.length && rsiValues[i + j] >= rsiValues[i]) isSwingHigh = false;
                if (i - j >= 0 && rsiValues[i - j] <= rsiValues[i]) isSwingLow = false;
                if (i + j < rsiValues.length && rsiValues[i + j] <= rsiValues[i]) isSwingLow = false;
            }
            
            if (isSwingHigh) {
                swings.push({ type: 'high', value: rsiValues[i], index: i });
            }
            if (isSwingLow) {
                swings.push({ type: 'low', value: rsiValues[i], index: i });
            }
        }
        
        const unique = [];
        for (let i = 0; i < swings.length; i++) {
            if (unique.length === 0) {
                unique.push(swings[i]);
                continue;
            }
            const last = unique[unique.length - 1];
            if (last.type === swings[i].type) {
                if ((last.type === 'high' && swings[i].value > last.value) ||
                    (last.type === 'low' && swings[i].value < last.value)) {
                    unique[unique.length - 1] = swings[i];
                }
            } else {
                unique.push(swings[i]);
            }
        }
        
        return unique.slice(-10);
    }

    checkHiddenBullish(priceSwings, rsiSwings) {
        const priceLows = priceSwings.filter(s => s.type === 'low').slice(-5);
        const rsiLows = rsiSwings.filter(s => s.type === 'low').slice(-5);
        
        for (let i = 0; i < priceLows.length - 1; i++) {
            for (let j = i + 1; j < priceLows.length; j++) {
                const rsiLow1 = rsiLows.find(r => Math.abs(r.index - priceLows[i].index) <= 3);
                const rsiLow2 = rsiLows.find(r => Math.abs(r.index - priceLows[j].index) <= 3);
                
                if (rsiLow1 && rsiLow2) {
                    const priceHigher = priceLows[j].price > priceLows[i].price;
                    const rsiLower = rsiLow2.value < rsiLow1.value;
                    
                    if (priceHigher && rsiLower) {
                        const strength = (rsiLow1.value - rsiLow2.value) > 5 ? 'strong' : 'moderate';
                        return {
                            found: true,
                            type: 'hidden_bullish',
                            name: 'واگرایی مخفی صعودی (ادامه روند صعودی)',
                            strength,
                            direction: 'bullish'
                        };
                    }
                }
            }
        }
        return { found: false };
    }

    checkHiddenBearish(priceSwings, rsiSwings) {
        const priceHighs = priceSwings.filter(s => s.type === 'high').slice(-5);
        const rsiHighs = rsiSwings.filter(s => s.type === 'high').slice(-5);
        
        for (let i = 0; i < priceHighs.length - 1; i++) {
            for (let j = i + 1; j < priceHighs.length; j++) {
                const rsiHigh1 = rsiHighs.find(r => Math.abs(r.index - priceHighs[i].index) <= 3);
                const rsiHigh2 = rsiHighs.find(r => Math.abs(r.index - priceHighs[j].index) <= 3);
                
                if (rsiHigh1 && rsiHigh2) {
                    const priceLower = priceHighs[j].price < priceHighs[i].price;
                    const rsiHigher = rsiHigh2.value > rsiHigh1.value;
                    
                    if (priceLower && rsiHigher) {
                        const strength = (rsiHigh2.value - rsiHigh1.value) > 5 ? 'strong' : 'moderate';
                        return {
                            found: true,
                            type: 'hidden_bearish',
                            name: 'واگرایی مخفی نزولی (ادامه روند نزولی)',
                            strength,
                            direction: 'bearish'
                        };
                    }
                }
            }
        }
        return { found: false };
    }

    checkBullishConvergence(priceSwings, rsiSwings) {
        const priceLows = priceSwings.filter(s => s.type === 'low').slice(-4);
        const rsiLows = rsiSwings.filter(s => s.type === 'low').slice(-4);
        
        if (priceLows.length >= 2 && rsiLows.length >= 2) {
            const recentLow = priceLows[priceLows.length - 1];
            const prevLow = priceLows[priceLows.length - 2];
            const recentRsiLow = rsiLows[rsiLows.length - 1];
            const prevRsiLow = rsiLows[rsiLows.length - 2];
            
            if (recentLow && prevLow && recentRsiLow && prevRsiLow) {
                const priceHigher = recentLow.price > prevLow.price;
                const rsiHigher = recentRsiLow.value > prevRsiLow.value;
                
                if (priceHigher && rsiHigher) {
                    return {
                        found: true,
                        type: 'bullish_convergence',
                        name: 'همگرایی صعودی کف‌ها (تأیید روند صعودی)',
                        strength: 'moderate',
                        direction: 'bullish'
                    };
                }
            }
        }
        return { found: false };
    }

    checkBearishConvergence(priceSwings, rsiSwings) {
        const priceHighs = priceSwings.filter(s => s.type === 'high').slice(-4);
        const rsiHighs = rsiSwings.filter(s => s.type === 'high').slice(-4);
        
        if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
            const recentHigh = priceHighs[priceHighs.length - 1];
            const prevHigh = priceHighs[priceHighs.length - 2];
            const recentRsiHigh = rsiHighs[rsiHighs.length - 1];
            const prevRsiHigh = rsiHighs[rsiHighs.length - 2];
            
            if (recentHigh && prevHigh && recentRsiHigh && prevRsiHigh) {
                const priceLower = recentHigh.price < prevHigh.price;
                const rsiLower = recentRsiHigh.value < prevRsiHigh.value;
                
                if (priceLower && rsiLower) {
                    return {
                        found: true,
                        type: 'bearish_convergence',
                        name: 'همگرایی نزولی سقف‌ها (تأیید روند نزولی)',
                        strength: 'moderate',
                        direction: 'bearish'
                    };
                }
            }
        }
        return { found: false };
    }

    checkMultiTimeframeSignal(candlesMap, rsiValuesMap) {
        const timeframesPriority = ['15', '10', '5'];
        
        for (const tf of timeframesPriority) {
            if (candlesMap[tf] && candlesMap[tf].length > 0 && rsiValuesMap[tf] && rsiValuesMap[tf].length > 0) {
                const priceSwings = this.getPriceSwings(candlesMap[tf], 60, 3);
                const rsiSwings = this.getRSISwings(rsiValuesMap[tf], 60, 3);
                
                if (priceSwings.length >= 3 && rsiSwings.length >= 3) {
                    const hiddenBullish = this.checkHiddenBullish(priceSwings, rsiSwings);
                    if (hiddenBullish.found) {
                        return { ...hiddenBullish, timeframe: tf, priority: 1 };
                    }
                    
                    const hiddenBearish = this.checkHiddenBearish(priceSwings, rsiSwings);
                    if (hiddenBearish.found) {
                        return { ...hiddenBearish, timeframe: tf, priority: 1 };
                    }
                    
                    const bullishConvergence = this.checkBullishConvergence(priceSwings, rsiSwings);
                    if (bullishConvergence.found) {
                        return { ...bullishConvergence, timeframe: tf, priority: 2 };
                    }
                    
                    const bearishConvergence = this.checkBearishConvergence(priceSwings, rsiSwings);
                    if (bearishConvergence.found) {
                        return { ...bearishConvergence, timeframe: tf, priority: 2 };
                    }
                }
            }
        }
        
        if (candlesMap['3'] && rsiValuesMap['3']) {
            const priceSwings = this.getPriceSwings(candlesMap['3'], 60, 2);
            const rsiSwings = this.getRSISwings(rsiValuesMap['3'], 60, 2);
            
            if (priceSwings.length >= 3 && rsiSwings.length >= 3) {
                let hiddenBullish = this.checkHiddenBullish(priceSwings, rsiSwings);
                if (hiddenBullish.found) return { ...hiddenBullish, timeframe: '3', priority: 3 };
                let hiddenBearish = this.checkHiddenBearish(priceSwings, rsiSwings);
                if (hiddenBearish.found) return { ...hiddenBearish, timeframe: '3', priority: 3 };
                let bullishConvergence = this.checkBullishConvergence(priceSwings, rsiSwings);
                if (bullishConvergence.found) return { ...bullishConvergence, timeframe: '3', priority: 3 };
                let bearishConvergence = this.checkBearishConvergence(priceSwings, rsiSwings);
                if (bearishConvergence.found) return { ...bearishConvergence, timeframe: '3', priority: 3 };
            }
        }
        
        return { found: false };
    }

    // تشخیص واگرایی در تایم 2 دقیقه برای ورود
    check2MinDivergence(candles2min, rsiValues2min) {
        if (!candles2min || candles2min.length < 30 || !rsiValues2min || (rsiValues2min as any).length < 30) {
            return { found: false };
        }

        const priceSwings = this.getPriceSwings(candles2min, 40, 2);
        const rsiSwings = this.getRSISwings(rsiValues2min, 40, 2);

        if (priceSwings.length < 3 || rsiSwings.length < 3) {
            return { found: false };
        }

        // بررسی واگرایی مخفی صعودی
        const hiddenBullish = this.checkHiddenBullish(priceSwings, rsiSwings);
        if (hiddenBullish.found) {
            return { ...hiddenBullish, timeframe: '2', type: 'hidden_bullish', priority: 1 };
        }

        // بررسی واگرایی مخفی نزولی
        const hiddenBearish = this.checkHiddenBearish(priceSwings, rsiSwings);
        if (hiddenBearish.found) {
            return { ...hiddenBearish, timeframe: '2', type: 'hidden_bearish', priority: 1 };
        }

        // بررسی همگرایی صعودی
        const bullishConvergence = this.checkBullishConvergence(priceSwings, rsiSwings);
        if (bullishConvergence.found) {
            return { ...bullishConvergence, timeframe: '2', type: 'bullish_convergence', priority: 2 };
        }

        // بررسی همگرایی نزولی
        const bearishConvergence = this.checkBearishConvergence(priceSwings, rsiSwings);
        if (bearishConvergence.found) {
            return { ...bearishConvergence, timeframe: '2', type: 'bearish_convergence', priority: 2 };
        }

        return { found: false };
    }
}

// ============================================================
// کلاس TradingStrategy - استراتژی اصلی (با تایم 15 دقیقه برای روند و تایم 2 دقیقه برای ورود)
// ============================================================
class TradingStrategy {
    config = {
        fibLookback: 60,
        fibMinRange: 0.5,
        fib382Tolerance: 0.03,
        fib618Tolerance: 0.03,
        divergenceLookback: 40,
        rsiPeriod: 14,
        minCandles: 80
    };

    lastSignals = new Map();
    divergenceDetector = new DivergenceDetector();
    trendAnalyzer = new TrendAnalyzer();
    pendingSecondEntry = null;
    last15MinTrend: any = { overall: 'neutral', strength: 0, timestamp: 0 };

    priceToPips(price, entryPrice) {
        return Math.abs(price - entryPrice);
    }

    calculateEMA(data, period) {
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

    calculateATR(candles, period = 14) {
        if ((candles as any).length < period + 1) return null;
        const trueRanges = [];
        for (let i = 1; i < (candles as any).length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;
            const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
            trueRanges.push(tr);
        }
        
        let atr = 0;
        for (let i = 0; i < period; i++) atr += trueRanges[i];
        atr = atr / period;
        
        for (let i = period; i < trueRanges.length; i++) {
            atr = ((atr * (period - 1)) + trueRanges[i]) / period;
        }
        return atr;
    }

    getTrendAnalysis(candles, multiTimeframeData) {
        return this.trendAnalyzer.analyzeFullTrend(candles, multiTimeframeData);
    }

    // دریافت روند تایم 15 دقیقه با کش
    get15MinTrend(multiTimeframeData) {
        const now = Date.now();
        // به‌روزرسانی هر 5 دقیقه
        if (now - this.last15MinTrend.timestamp < 5 * 60 * 1000 && this.last15MinTrend.timestamp > 0) {
            return this.last15MinTrend;
        }

        const candles15min = multiTimeframeData?.candlesMap?.['15'];
        if (!candles15min || candles15min.length === 0) {
            return { overall: 'neutral', strength: 0, direction: 'neutral', message: 'داده تایم ۱۵ دقیقه در دسترس نیست' };
        }

        const trendResult = this.trendAnalyzer.analyze15MinTrend(candles15min);
        const oldTrend = this.last15MinTrend.overall;
        
        this.last15MinTrend = {
            overall: (trendResult as any).overall,
            strength: (trendResult as any).strength,
            direction: (trendResult as any).direction,
            message: (trendResult as any).message,
            timestamp: now,
            details: (trendResult as any).details
        };

        if (oldTrend !== (trendResult as any).overall) {
            console.log(`📊 ${(trendResult as any).message}`);
        }
        return this.last15MinTrend;
    }

    // بررسی شرایط ورود در تایم 2 دقیقه
    check2MinEntryConditions(multiTimeframeData, trend15Min) {
        const candles2min = multiTimeframeData?.candlesMap?.['2'];
        if (!candles2min || candles2min.length < 30) {
            return { canEnter: false, reason: 'داده کافی تایم ۲ دقیقه در دسترس نیست' };
        }

        // محاسبه RSI برای تایم 2 دقیقه
        const rsiValues2min = this.calculateRSI(candles2min, this.config.rsiPeriod);
        if ((rsiValues2min as any).length < 30) {
            return { canEnter: false, reason: 'RSI تایم ۲ دقیقه قابل محاسبه نیست' };
        }

        // تشخیص واگرایی در تایم 2 دقیقه
        const divergenceSignal = this.divergenceDetector.check2MinDivergence(candles2min, rsiValues2min);
        
        if (!(divergenceSignal as any).found) {
            return { canEnter: false, reason: 'واگرایی در تایم ۲ دقیقه مشاهده نشد' };
        }

        // بررسی همخوانی با روند تایم 15 دقیقه
        const currentRSI = rsiValues2min[(rsiValues2min as any).length - 1];
        const lastCandle = candles2min[candles2min.length - 1];
        const currentPrice = lastCandle.close;

        // اگر روند تایم 15 دقیقه صعودی است و سیگنال صعودی داریم -> مجاز
        if ((trend15Min as any).overall === 'bullish' && (divergenceSignal as any).direction === 'bullish') {
            return {
                canEnter: true,
                signal: divergenceSignal,
                currentRSI,
                currentPrice,
                reason: `همخوانی روند صعودی تایم ۱۵ دقیقه با واگرایی صعودی تایم ۲ دقیقه`
            };
        }
        
        // اگر روند تایم 15 دقیقه نزولی است و سیگنال نزولی داریم -> مجاز
        if ((trend15Min as any).overall === 'bearish' && (divergenceSignal as any).direction === 'bearish') {
            return {
                canEnter: true,
                signal: divergenceSignal,
                currentRSI,
                currentPrice,
                reason: `همخوانی روند نزولی تایم ۱۵ دقیقه با واگرایی نزولی تایم ۲ دقیقه`
            };
        }

        // اگر روند خنثی است و سیگنال قوی داریم -> با احتیاط مجاز
        if ((trend15Min as any).overall === 'neutral' && (divergenceSignal as any).priority === 1) {
            return {
                canEnter: true,
                signal: divergenceSignal,
                currentRSI,
                currentPrice,
                reason: `روند خنثی تایم ۱۵ دقیقه با واگرایی قوی در تایم ۲ دقیقه (ورود با احتیاط)`
            };
        }

        return {
            canEnter: false,
            reason: `عدم همخوانی: روند تایم ۱۵ دقیقه (${(trend15Min as any).overall}) با سیگنال تایم ۲ دقیقه (${(divergenceSignal as any).direction})`
        };
    }

    analyze(candles, timeframe, strategyType, candleConfirmations, currentPrice, multiTimeframeData = null) {
        if (!(candles as any).length || (candles as any).length < this.config.minCandles) return null;

        if (strategyType === 'FIB382_618_RSI_DIVERGENCE') {
            return this.detectFib382And618WithDivergence(candles, currentPrice, timeframe, multiTimeframeData);
        }
        
        return null;
    }

    findKeyLevels(candles) {
        if (!candles || (candles as any).length === 0) return { high: null, low: null };
        
        let highestHigh = -Infinity;
        let lowestLow = Infinity;
        
        for (let i = 0; i < (candles as any).length; i++) {
            if (candles[i].high > highestHigh) {
                highestHigh = candles[i].high;
            }
            if (candles[i].low < lowestLow) {
                lowestLow = candles[i].low;
            }
        }
        
        return {
            high: highestHigh,
            low: lowestLow
        };
    }

    calculateFibLevels(candles, isBullish) {
        const swings = this.getSignificantSwings(candles, 5);
        if (swings.length < 2) return null;
        
        const lastSwing = swings[swings.length - 1];
        const prevSwing = swings[swings.length - 2];
        
        let high, low;
        
        if (isBullish) {
            if (prevSwing.type === 'low' && lastSwing.type === 'high') {
                low = prevSwing.price;
                high = lastSwing.price;
            } else {
                const lastLow = swings.filter(s => s.type === 'low').pop();
                const lastHigh = swings.filter(s => s.type === 'high').pop();
                if (lastLow && lastHigh && lastLow.index < lastHigh.index) {
                    low = lastLow.price;
                    high = lastHigh.price;
                } else {
                    return null;
                }
            }
        } else {
            if (prevSwing.type === 'high' && lastSwing.type === 'low') {
                high = prevSwing.price;
                low = lastSwing.price;
            } else {
                const lastHigh = swings.filter(s => s.type === 'high').pop();
                const lastLow = swings.filter(s => s.type === 'low').pop();
                if (lastHigh && lastLow && lastHigh.index < lastLow.index) {
                    high = lastHigh.price;
                    low = lastLow.price;
                } else {
                    return null;
                }
            }
        }
        
        if (!high || !low || high <= low) return null;
        
        const fibRange = high - low;
        const percent12 = fibRange * 0.12;
        const percent38 = fibRange * 0.38;
        const percent50 = fibRange * 0.50;
        const percent618 = fibRange * 0.618;
        
        return {
            high,
            low,
            fibRange,
            fib382: isBullish ? high - (fibRange * 0.382) : low + (fibRange * 0.382),
            fib618: isBullish ? high - (fibRange * 0.618) : low + (fibRange * 0.618),
            tp1_bull: isBullish ? high + percent12 : null,
            tp2_bull: isBullish ? high + (percent12 * 2) : null,
            tp3_bull: isBullish ? high + percent38 : null,
            tp4_bull: isBullish ? high + percent50 : null,
            tp5_bull: isBullish ? high + percent618 : null,
            tp1_bear: !isBullish ? low - percent12 : null,
            tp2_bear: !isBullish ? low - (percent12 * 2) : null,
            tp3_bear: !isBullish ? low - percent38 : null,
            tp4_bear: !isBullish ? low - percent50 : null,
            tp5_bear: !isBullish ? low - percent618 : null,
            sl: isBullish ? low - (fibRange * 2.99) : high + (fibRange * 2.99)
        };
    }

    calculateFibLevelsForSignal(candles, signalType) {
        const isBullish = (signalType === 'BUY');
        return this.calculateFibLevels(candles, isBullish);
    }

    getSignificantSwings(candles, minDistance = 5) {
        const swings = [];
        const len = (candles as any).length;
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
        
        const unique = [];
        for (let i = 0; i < swings.length; i++) {
            if (unique.length === 0) {
                unique.push(swings[i]);
                continue;
            }
            const last = unique[unique.length - 1];
            if (last.type === swings[i].type) {
                if ((last.type === 'high' && swings[i].price > last.price) ||
                    (last.type === 'low' && swings[i].price < last.price)) {
                    unique[unique.length - 1] = swings[i];
                }
            } else {
                unique.push(swings[i]);
            }
        }
        
        return unique.slice(-10);
    }

    calculateRSI(candles, period = 14) {
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

    calculateRSIForTimeframes(candlesMap) {
        const rsiMap = {};
        for (const [tf, candles] of Object.entries(candlesMap)) {
            if (candles && (candles as any).length > 0) {
                rsiMap[tf] = this.calculateRSI(candles, this.config.rsiPeriod);
            }
        }
        return rsiMap;
    }

    isDuplicateSignal(fibEntry, activeLevel, currentPrice) {
        const tolerance = 0.02;
        const timeWindow = 3600000;
        
        for (const [key, time] of this.lastSignals.entries()) {
            const parts = key.split('_');
            if (parts.length < 2) continue;
            
            const storedLevel = parts[0];
            const storedPrice = parseFloat(parts[1]);
            const priceDiff = Math.abs(storedPrice - currentPrice) / currentPrice;
            
            if (storedLevel === activeLevel.toString() && priceDiff < 0.005) {
                console.log(`⏸️ سیگنال تکراری جلوگیری شد: سطح ${activeLevel}% (اختلاف ${(priceDiff*100).toFixed(2)}%)`);
                return true;
            }
        }
        
        const priceKey = Math.floor(currentPrice / tolerance) * tolerance;
        const signalKey = `${activeLevel}_${priceKey}`;
        
        const lastSignalTime = this.lastSignals.get(signalKey);
        const now = Date.now();
        
        if (lastSignalTime && (now - lastSignalTime) < timeWindow) {
            console.log(`⏸️ سیگنال تکراری جلوگیری شد: سطح ${activeLevel}% (زمانی)`);
            return true;
        }
        
        this.lastSignals.set(signalKey, now);
        
        for (const [key, time] of this.lastSignals.entries()) {
            if (now - time > 7200000) {
                this.lastSignals.delete(key);
            }
        }
        
        return false;
    }

    detectFib382And618WithDivergence(candles, currentPrice, timeframe, multiTimeframeData = null) {
        if (!candles || (candles as any).length < 80) return null;

        // 1. ابتدا روند تایم 15 دقیقه را بررسی کن
        const trend15Min = this.get15MinTrend(multiTimeframeData);
        
        // 2. شرایط ورود در تایم 2 دقیقه را بررسی کن
        const entryCondition = this.check2MinEntryConditions(multiTimeframeData, trend15Min);
        
        if (!entryCondition.canEnter) {
            // اگر قبلاً منتظر ورود دوم هستیم، بررسی کن
            if (this.pendingSecondEntry) {
                return this.checkSecondEntryPoint(candles, currentPrice, timeframe, multiTimeframeData);
            }
            return null;
        }

        const now = Date.now();
        if (entryCondition.canEnter && (now - (this as any).lastEntryLogTime > 60000 || !(this as any).lastEntryLogTime)) {
             console.log(`✅ ${entryCondition.reason}`);
             (this as any).lastEntryLogTime = now;
        }

        const buyFibLevels = this.calculateFibLevelsForSignal(candles, 'BUY');
        const sellFibLevels = this.calculateFibLevelsForSignal(candles, 'SELL');
        
        if (!buyFibLevels && !sellFibLevels) return null;

        const lastCandle = candles[(candles as any).length - 1];
        const lastPrice = lastCandle.close;

        const rsiValues = this.calculateRSI(candles, 14);
        if (rsiValues.length < 30) return null;
        const currentRSI = rsiValues[rsiValues.length - 1];

        const trendAnalysis = this.getTrendAnalysis(candles, multiTimeframeData);
        
        // اضافه کردن روند تایم 15 دقیقه به تحلیل
        (trendAnalysis as any).trend15Min = {
            overall: (trend15Min as any).overall,
            strength: (trend15Min as any).strength,
            message: (trend15Min as any).message
        };

        let qualitySignal = entryCondition.signal;

        let isBullishSignal = false;
        let signalTypeDetected = '';
        let signalPriority = (qualitySignal as any).priority || 3;
        
        if ((qualitySignal as any).direction === 'bullish') {
            isBullishSignal = true;
            signalTypeDetected = (qualitySignal as any).name;
        } else if ((qualitySignal as any).direction === 'bearish') {
            isBullishSignal = false;
            signalTypeDetected = (qualitySignal as any).name;
        }

        // فیلتر بر اساس روند کلی (اختیاری - می‌توانید غیرفعال کنید)
        // if ((trendAnalysis as any).overall === 'bearish' && (qualitySignal as any).direction === 'bullish') {
        //     console.log("📉 روند کلی نزولی است - سیگنال خرید فیلتر شد");
        //     return null;
        // }
        // 
        // if ((trendAnalysis as any).overall === 'bullish' && (qualitySignal as any).direction === 'bearish') {
        //     console.log("📈 روند کلی صعودی است - سیگنال فروش فیلتر شد");
        //     return null;
        // }

        let fibLevels;
        if (isBullishSignal) {
            fibLevels = buyFibLevels;
            if (!fibLevels) return null;
        } else {
            fibLevels = sellFibLevels;
            if (!fibLevels) return null;
        }

        const tolerance382 = fibLevels.fibRange * this.config.fib382Tolerance;
        const tolerance618 = fibLevels.fibRange * this.config.fib618Tolerance;

        const isAtFib382 = isBullishSignal 
            ? lastPrice <= fibLevels.fib382 + tolerance382 && lastPrice >= fibLevels.fib382 - tolerance382
            : lastPrice >= fibLevels.fib382 - tolerance382 && lastPrice <= fibLevels.fib382 + tolerance382;
        
        const isAtFib618 = isBullishSignal 
            ? lastPrice <= fibLevels.fib618 + tolerance618 && lastPrice >= fibLevels.fib618 - tolerance618
            : lastPrice >= fibLevels.fib618 - tolerance618 && lastPrice <= fibLevels.fib618 + tolerance618;

        if (!isAtFib382 && !isAtFib618) return null;

        let activeLevel = isAtFib382 ? 38.2 : 61.8;
        let fibEntry = isAtFib382 ? fibLevels.fib382 : fibLevels.fib618;
        
        let secondEntryPrice = isBullishSignal ? fibLevels.fib618 : fibLevels.fib618;
        
        if (isAtFib382 && this.pendingSecondEntry === null) {
            this.pendingSecondEntry = {
                fibLevels: fibLevels,
                isBullishSignal: isBullishSignal,
                signalTypeDetected: signalTypeDetected,
                qualitySignal: qualitySignal,
                trendAnalysis: trendAnalysis,
                secondEntryPrice: secondEntryPrice,
                activeLevel: 61.8,
                timeframe: timeframe,
                currentRSI: currentRSI
            };
            console.log(`📌 نقطه ورود دوم ثبت شد: قیمت ${secondEntryPrice.toLocaleString()}`);
        }

        if (this.isDuplicateSignal(fibEntry, activeLevel, currentPrice)) {
            return null;
        }

        let confidence = 70;
        let signalStrength = (qualitySignal as any).strength || 'moderate';
        
        // افزایش اعتماد بر اساس همخوانی با روند تایم 15 دقیقه
        if ((trend15Min as any).overall === (qualitySignal as any).direction) {
            confidence += 15;
            if ((trend15Min as any).strength > 60) {
                confidence += 10;
                signalStrength = 'very_strong';
            }
        }
        
        if ((qualitySignal as any).type.includes('hidden') && (qualitySignal as any).timeframe === '15') {
            confidence = 95;
            signalStrength = 'very_strong';
        } else if ((qualitySignal as any).type.includes('hidden') && (qualitySignal as any).timeframe === '10') {
            confidence = 90;
            signalStrength = 'strong';
        } else if ((qualitySignal as any).type.includes('convergence') && (qualitySignal as any).timeframe === '15') {
            confidence = 85;
            signalStrength = 'strong';
        } else if ((qualitySignal as any).type.includes('convergence') && (qualitySignal as any).timeframe === '10') {
            confidence = 80;
            signalStrength = 'moderate';
        } else if ((qualitySignal as any).timeframe === '2') {
            // سیگنال تایم 2 دقیقه با روند 15 دقیقه همخوانی دارد
            confidence = Math.min(confidence + 5, 92);
        }

        if (activeLevel === 61.8 && (qualitySignal as any).timeframe === '15') {
            confidence = Math.min(confidence + 15, 98);
        } else if (activeLevel === 61.8) {
            confidence = Math.min(confidence + 10, 95);
        }

        let tp1, tp2, tp3, tp4, tp5;
        let pipsToTP1, pipsToTP2, pipsToTP3, pipsToTP4, pipsToTP5;
        let profitTP1, profitTP2, profitTP3, profitTP4, profitTP5;
        
        if (isBullishSignal) {
            tp1 = fibLevels.tp1_bull;
            tp2 = fibLevels.tp2_bull;
            tp3 = fibLevels.tp3_bull;
            tp4 = fibLevels.tp4_bull;
            tp5 = fibLevels.tp5_bull;
            
            pipsToTP1 = Math.round(tp1 - fibEntry);
            pipsToTP2 = Math.round(tp2 - fibEntry);
            pipsToTP3 = Math.round(tp3 - fibEntry);
            pipsToTP4 = Math.round(tp4 - fibEntry);
            pipsToTP5 = Math.round(tp5 - fibEntry);
            
            profitTP1 = ((tp1 - fibEntry) / fibEntry) * 100;
            profitTP2 = ((tp2 - fibEntry) / fibEntry) * 100;
            profitTP3 = ((tp3 - fibEntry) / fibEntry) * 100;
            profitTP4 = ((tp4 - fibEntry) / fibEntry) * 100;
            profitTP5 = ((tp5 - fibEntry) / fibEntry) * 100;
        } else {
            tp1 = fibLevels.tp1_bear;
            tp2 = fibLevels.tp2_bear;
            tp3 = fibLevels.tp3_bear;
            tp4 = fibLevels.tp4_bear;
            tp5 = fibLevels.tp5_bear;
            
            pipsToTP1 = Math.round(fibEntry - tp1);
            pipsToTP2 = Math.round(fibEntry - tp2);
            pipsToTP3 = Math.round(fibEntry - tp3);
            pipsToTP4 = Math.round(fibEntry - tp4);
            pipsToTP5 = Math.round(fibEntry - tp5);
            
            profitTP1 = ((fibEntry - tp1) / fibEntry) * 100;
            profitTP2 = ((fibEntry - tp2) / fibEntry) * 100;
            profitTP3 = ((fibEntry - tp3) / fibEntry) * 100;
            profitTP4 = ((fibEntry - tp4) / fibEntry) * 100;
            profitTP5 = ((fibEntry - tp5) / fibEntry) * 100;
        }

        const riskPips = isBullishSignal ? Math.round(fibEntry - fibLevels.sl) : Math.round(fibLevels.sl - fibEntry);
        const riskPercent = isBullishSignal ? ((fibEntry - fibLevels.sl) / fibEntry) * 100 : ((fibLevels.sl - fibEntry) / fibEntry) * 100;
        
        const rr1 = profitTP1 / riskPercent;
        const rr2 = profitTP2 / riskPercent;
        const rr3 = profitTP3 / riskPercent;
        const rr4 = profitTP4 / riskPercent;
        const rr5 = profitTP5 / riskPercent;

        const isSecondEntry = (activeLevel === 61.8 && this.pendingSecondEntry !== null);
        let entryMessage = "";
        if (isSecondEntry) {
            entryMessage = "\n📍 **نقطه ورود دوم**\n";
            this.pendingSecondEntry = null;
        }

        const result = {
            type: isBullishSignal ? 'BUY' : 'SELL',
            entry: fibEntry,
            sl: fibLevels.sl,
            tp1: tp1,
            tp2: tp2,
            tp3: tp3,
            tp4: tp4,
            tp5: tp5,
            time: Date.now(),
            timeframe: timeframe,
            strategy: 'FIB382_618_RSI_DIVERGENCE',
            activeLevel: activeLevel,
            rsi: currentRSI,
            signalType: `${signalTypeDetected} (تایم ${(qualitySignal as any).timeframe} دقیقه)`,
            signalStrength: signalStrength,
            confidence,
            profitTP1: profitTP1.toFixed(2),
            profitTP2: profitTP2.toFixed(2),
            profitTP3: profitTP3.toFixed(2),
            profitTP4: profitTP4.toFixed(2),
            profitTP5: profitTP5.toFixed(2),
            pipsToTP1: Math.round(pipsToTP1),
            pipsToTP2: Math.round(pipsToTP2),
            pipsToTP3: Math.round(pipsToTP3),
            pipsToTP4: Math.round(pipsToTP4),
            pipsToTP5: Math.round(pipsToTP5),
            riskPips: Math.round(riskPips),
            riskPercent: riskPercent.toFixed(2),
            riskReward1: `1:${rr1.toFixed(2)}`,
            riskReward2: `1:${rr2.toFixed(2)}`,
            riskReward3: `1:${rr3.toFixed(2)}`,
            riskReward4: `1:${rr4.toFixed(2)}`,
            riskReward5: `1:${rr5.toFixed(2)}`,
            riskReward: `1:${rr2.toFixed(2)}`,
            hasDivergence: (qualitySignal as any).type.includes('divergence'),
            hasConvergence: (qualitySignal as any).type.includes('convergence'),
            signalQuality: signalPriority === 1 ? 'عالی' : (signalPriority === 2 ? 'خوب' : 'متوسط'),
            isHighRiskTarget: true,
            isSecondEntry: isSecondEntry,
            entryMessage: entryMessage,
            trendAnalysis: {
                overall: (trendAnalysis as any).overall,
                strength: Math.round((trendAnalysis as any).strength),
                confidence: Math.round((trendAnalysis as any).confidence),
                warnings: (trendAnalysis as any).warnings,
                reasons: (trendAnalysis as any).reasons.slice(0, 3),
                trend15Min: trend15Min
            }
        };

        return result;
    }

    checkSecondEntryPoint(candles, currentPrice, timeframe, multiTimeframeData) {
        if (!this.pendingSecondEntry) return null;
        
        const pending = this.pendingSecondEntry;
        const secondPrice = pending.secondEntryPrice;
        const tolerance = 0.002;
        
        const priceDiff = Math.abs(currentPrice - secondPrice) / secondPrice;
        
        if (priceDiff <= tolerance) {
            console.log(`✅ نقطه ورود دوم فعال شد! قیمت به ${currentPrice.toLocaleString()} رسید`);
            
            const fibLevels = pending.fibLevels;
            const isBullishSignal = pending.isBullishSignal;
            const qualitySignal = pending.qualitySignal;
            const trendAnalysis = pending.trendAnalysis;
            
            let tp1, tp2, tp3, tp4, tp5;
            let pipsToTP1, pipsToTP2, pipsToTP3, pipsToTP4, pipsToTP5;
            let profitTP1, profitTP2, profitTP3, profitTP4, profitTP5;
            
            if (isBullishSignal) {
                tp1 = fibLevels.tp1_bull;
                tp2 = fibLevels.tp2_bull;
                tp3 = fibLevels.tp3_bull;
                tp4 = fibLevels.tp4_bull;
                tp5 = fibLevels.tp5_bull;
                
                pipsToTP1 = Math.round(tp1 - currentPrice);
                pipsToTP2 = Math.round(tp2 - currentPrice);
                pipsToTP3 = Math.round(tp3 - currentPrice);
                pipsToTP4 = Math.round(tp4 - currentPrice);
                pipsToTP5 = Math.round(tp5 - currentPrice);
                
                profitTP1 = ((tp1 - currentPrice) / currentPrice) * 100;
                profitTP2 = ((tp2 - currentPrice) / currentPrice) * 100;
                profitTP3 = ((tp3 - currentPrice) / currentPrice) * 100;
                profitTP4 = ((tp4 - currentPrice) / currentPrice) * 100;
                profitTP5 = ((tp5 - currentPrice) / currentPrice) * 100;
            } else {
                tp1 = fibLevels.tp1_bear;
                tp2 = fibLevels.tp2_bear;
                tp3 = fibLevels.tp3_bear;
                tp4 = fibLevels.tp4_bear;
                tp5 = fibLevels.tp5_bear;
                
                pipsToTP1 = Math.round(currentPrice - tp1);
                pipsToTP2 = Math.round(currentPrice - tp2);
                pipsToTP3 = Math.round(currentPrice - tp3);
                pipsToTP4 = Math.round(currentPrice - tp4);
                pipsToTP5 = Math.round(currentPrice - tp5);
                
                profitTP1 = ((currentPrice - tp1) / currentPrice) * 100;
                profitTP2 = ((currentPrice - tp2) / currentPrice) * 100;
                profitTP3 = ((currentPrice - tp3) / currentPrice) * 100;
                profitTP4 = ((currentPrice - tp4) / currentPrice) * 100;
                profitTP5 = ((currentPrice - tp5) / currentPrice) * 100;
            }
            
            const riskPips = isBullishSignal ? Math.round(currentPrice - fibLevels.sl) : Math.round(fibLevels.sl - currentPrice);
            const riskPercent = isBullishSignal ? ((currentPrice - fibLevels.sl) / currentPrice) * 100 : ((fibLevels.sl - currentPrice) / currentPrice) * 100;
            
            const rr2 = profitTP2 / riskPercent;
            
            const result = {
                type: isBullishSignal ? 'BUY' : 'SELL',
                entry: currentPrice,
                sl: fibLevels.sl,
                tp1: tp1,
                tp2: tp2,
                tp3: tp3,
                tp4: tp4,
                tp5: tp5,
                time: Date.now(),
                timeframe: timeframe,
                strategy: 'FIB382_618_RSI_DIVERGENCE',
                activeLevel: 61.8,
                rsi: pending.currentRSI,
                signalType: `${pending.signalTypeDetected} (تایم ${(qualitySignal as any).timeframe} دقیقه) - ورود دوم`,
                signalStrength: (qualitySignal as any).strength || 'moderate',
                confidence: 88,
                profitTP1: profitTP1.toFixed(2),
                profitTP2: profitTP2.toFixed(2),
                profitTP3: profitTP3.toFixed(2),
                profitTP4: profitTP4.toFixed(2),
                profitTP5: profitTP5.toFixed(2),
                pipsToTP1: Math.round(pipsToTP1),
                pipsToTP2: Math.round(pipsToTP2),
                pipsToTP3: Math.round(pipsToTP3),
                pipsToTP4: Math.round(pipsToTP4),
                pipsToTP5: Math.round(pipsToTP5),
                riskPips: Math.round(riskPips),
                riskPercent: riskPercent.toFixed(2),
                riskReward2: `1:${rr2.toFixed(2)}`,
                riskReward: `1:${rr2.toFixed(2)}`,
                hasDivergence: (qualitySignal as any).type.includes('divergence'),
                hasConvergence: (qualitySignal as any).type.includes('convergence'),
                signalQuality: 'خوب',
                isHighRiskTarget: true,
                isSecondEntry: true,
                entryMessage: "\n📍 **نقطه ورود دوم**\n",
                trendAnalysis: {
                    overall: (trendAnalysis as any).overall,
                    strength: Math.round((trendAnalysis as any).strength),
                    confidence: Math.round((trendAnalysis as any).confidence),
                    warnings: (trendAnalysis as any).warnings,
                    reasons: (trendAnalysis as any).reasons.slice(0, 3)
                }
            };
            
            this.pendingSecondEntry = null;
            return result;
        }
        
        return null;
    }
}

// ============================================================
// کلاس ActiveTrade - مدیریت معاملات فعال
// ============================================================
class ActiveTrade {
    public signalId: any;
    public type: any;
    public entryPrice: any;
    public sl: any;
    public tp1: any;
    public tp2: any;
    public tp3: any;
    public tp4: any;
    public tp5: any;
    public entryTime: any;
    public reachedTargets: any;
    public targetNotificationSent: any;
    public isCompleted: any;
    public isStopped: any;
    public isReentry: any;
    public originalTradeId: any;
    public reentryCount: any;
    public activeLevel: any;
    public signalType: any;
    public pipsToTP1: any;
    public pipsToTP2: any;
    public pipsToTP3: any;
    public pipsToTP4: any;
    public pipsToTP5: any;
    public isSecondEntry: any;
    public tradeNumber: any;
    constructor(signal, isReentry = false, originalTradeId = null, tradeNumber = 0) {
        this.signalId = signal.time;
        this.type = signal.type;
        this.entryPrice = signal.entry;
        this.sl = signal.sl;
        this.tp1 = signal.tp1;
        this.tp2 = signal.tp2;
        this.tp3 = signal.tp3;
        this.tp4 = signal.tp4;
        this.tp5 = signal.tp5;
        this.entryTime = signal.time;
        this.reachedTargets = [];
        this.targetNotificationSent = { TP1: false, TP2: false, TP3: false, TP4: false, TP5: false };
        this.isCompleted = false;
        this.isStopped = false;
        this.isReentry = isReentry;
        this.originalTradeId = originalTradeId || signal.time;
        this.reentryCount = 0;
        this.activeLevel = signal.activeLevel;
        this.signalType = signal.signalType;
        this.pipsToTP1 = signal.pipsToTP1;
        this.pipsToTP2 = signal.pipsToTP2;
        this.pipsToTP3 = signal.pipsToTP3;
        this.pipsToTP4 = signal.pipsToTP4;
        this.pipsToTP5 = signal.pipsToTP5;
        this.isSecondEntry = signal.isSecondEntry || false;
        this.tradeNumber = tradeNumber;
    }

    checkTargets(currentPrice) {
        const newlyReached = [];
        
        if (this.type === 'BUY') {
            if (!this.reachedTargets.includes('TP1') && currentPrice >= this.tp1) {
                this.reachedTargets.push('TP1');
                if (!this.targetNotificationSent.TP1) {
                    newlyReached.push({ target: 'TP1', price: this.tp1 });
                    this.targetNotificationSent.TP1 = true;
                }
            }
            if (!this.reachedTargets.includes('TP2') && currentPrice >= this.tp2) {
                this.reachedTargets.push('TP2');
                if (!this.targetNotificationSent.TP2) {
                    newlyReached.push({ target: 'TP2', price: this.tp2 });
                    this.targetNotificationSent.TP2 = true;
                }
            }
            if (!this.reachedTargets.includes('TP3') && currentPrice >= this.tp3) {
                this.reachedTargets.push('TP3');
                if (!this.targetNotificationSent.TP3) {
                    newlyReached.push({ target: 'TP3', price: this.tp3 });
                    this.targetNotificationSent.TP3 = true;
                }
            }
            if (!this.reachedTargets.includes('TP4') && currentPrice >= this.tp4) {
                this.reachedTargets.push('TP4');
                if (!this.targetNotificationSent.TP4) {
                    newlyReached.push({ target: 'TP4', price: this.tp4 });
                    this.targetNotificationSent.TP4 = true;
                }
            }
            if (!this.reachedTargets.includes('TP5') && currentPrice >= this.tp5) {
                this.reachedTargets.push('TP5');
                if (!this.targetNotificationSent.TP5) {
                    newlyReached.push({ target: 'TP5', price: this.tp5 });
                    this.targetNotificationSent.TP5 = true;
                }
            }
            if (!this.isStopped && currentPrice <= this.sl) {
                this.isStopped = true;
                this.isCompleted = true;
                return { hitStop: true, hitTargets: newlyReached, finalPrice: this.sl };
            }
        } 
        else {
            if (!this.reachedTargets.includes('TP1') && currentPrice <= this.tp1) {
                this.reachedTargets.push('TP1');
                if (!this.targetNotificationSent.TP1) {
                    newlyReached.push({ target: 'TP1', price: this.tp1 });
                    this.targetNotificationSent.TP1 = true;
                }
            }
            if (!this.reachedTargets.includes('TP2') && currentPrice <= this.tp2) {
                this.reachedTargets.push('TP2');
                if (!this.targetNotificationSent.TP2) {
                    newlyReached.push({ target: 'TP2', price: this.tp2 });
                    this.targetNotificationSent.TP2 = true;
                }
            }
            if (!this.reachedTargets.includes('TP3') && currentPrice <= this.tp3) {
                this.reachedTargets.push('TP3');
                if (!this.targetNotificationSent.TP3) {
                    newlyReached.push({ target: 'TP3', price: this.tp3 });
                    this.targetNotificationSent.TP3 = true;
                }
            }
            if (!this.reachedTargets.includes('TP4') && currentPrice <= this.tp4) {
                this.reachedTargets.push('TP4');
                if (!this.targetNotificationSent.TP4) {
                    newlyReached.push({ target: 'TP4', price: this.tp4 });
                    this.targetNotificationSent.TP4 = true;
                }
            }
            if (!this.reachedTargets.includes('TP5') && currentPrice <= this.tp5) {
                this.reachedTargets.push('TP5');
                if (!this.targetNotificationSent.TP5) {
                    newlyReached.push({ target: 'TP5', price: this.tp5 });
                    this.targetNotificationSent.TP5 = true;
                }
            }
            if (!this.isStopped && currentPrice >= this.sl) {
                this.isStopped = true;
                this.isCompleted = true;
                return { hitStop: true, hitTargets: newlyReached, finalPrice: this.sl };
            }
        }
        
        if (this.reachedTargets.length === 5 && !this.isCompleted) {
            this.isCompleted = true;
            return { hitStop: false, hitTargets: newlyReached, fullTargets: true };
        }
        
        return { hitStop: false, hitTargets: newlyReached, fullTargets: false };
    }

    getCurrentTargetsInfo() {
        return {
            reached: this.reachedTargets,
            remaining: ['TP1', 'TP2', 'TP3', 'TP4', 'TP5'].filter(t => !this.reachedTargets.includes(t))
        };
    }

    calculateTotalProfitPercent(currentPrice) {
        if (this.type === 'BUY') {
            return ((currentPrice - this.entryPrice) / this.entryPrice) * 100;
        } else {
            return ((this.entryPrice - currentPrice) / this.entryPrice) * 100;
        }
    }

    calculateTotalProfitPips(currentPrice) {
        if (this.type === 'BUY') {
            return currentPrice - this.entryPrice;
        } else {
            return this.entryPrice - currentPrice;
        }
    }

    getTargetProfits() {
        if (this.type === 'BUY') {
            return {
                TP1: ((this.tp1 - this.entryPrice) / this.entryPrice) * 100,
                TP2: ((this.tp2 - this.entryPrice) / this.entryPrice) * 100,
                TP3: ((this.tp3 - this.entryPrice) / this.entryPrice) * 100,
                TP4: ((this.tp4 - this.entryPrice) / this.entryPrice) * 100,
                TP5: ((this.tp5 - this.entryPrice) / this.entryPrice) * 100,
                risk: ((this.entryPrice - this.sl) / this.entryPrice) * 100,
                TP1Pips: this.tp1 - this.entryPrice,
                TP2Pips: this.tp2 - this.entryPrice,
                TP3Pips: this.tp3 - this.entryPrice,
                TP4Pips: this.tp4 - this.entryPrice,
                TP5Pips: this.tp5 - this.entryPrice,
                riskPips: this.entryPrice - this.sl
            };
        } else {
            return {
                TP1: ((this.entryPrice - this.tp1) / this.entryPrice) * 100,
                TP2: ((this.entryPrice - this.tp2) / this.entryPrice) * 100,
                TP3: ((this.entryPrice - this.tp3) / this.entryPrice) * 100,
                TP4: ((this.entryPrice - this.tp4) / this.entryPrice) * 100,
                TP5: ((this.entryPrice - this.tp5) / this.entryPrice) * 100,
                risk: ((this.sl - this.entryPrice) / this.entryPrice) * 100,
                TP1Pips: this.entryPrice - this.tp1,
                TP2Pips: this.entryPrice - this.tp2,
                TP3Pips: this.entryPrice - this.tp3,
                TP4Pips: this.entryPrice - this.tp4,
                TP5Pips: this.entryPrice - this.tp5,
                riskPips: this.sl - this.entryPrice
            };
        }
    }
}

// ============================================================
// کلاس MultiTimeframeDataManager - مدیریت داده‌های چند تایم فریم
// ============================================================
class MultiTimeframeDataManager {
    public currentToken: any;
    public farazSession: any;
    public candlesCache: any;
    public lastUpdateTime: any;
    constructor(currentToken, farazSession) {
        this.currentToken = currentToken;
        this.farazSession = farazSession;
        this.candlesCache = {
            '1': [],
            '2': [],
            '3': [],
            '5': [],
            '10': [],
            '15': [],
            '60': []
        };
        this.lastUpdateTime = {
            '1': 0,
            '2': 0,
            '3': 0,
            '5': 0,
            '10': 0,
            '15': 0,
            '60': 0
        };
    }

    async fetchCandles(timeframe, count = 5000) {
        try {
            const now = Math.floor(Date.now() / 1000);
            const from = now - (count * 60 * parseInt(timeframe));
            const url = `https://ir3.faraz.io/api/customer/trading-view/history?symbolName=INDEX_BTCUSD&resolution=${timeframe}&from=${from}&to=${now}&countback=${count}&firstDataRequest=true&latest=true&adjustType=2&json=true`;
            
            const res = await axios.get(url, {
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'accept-language': 'fa-IR,fa;q=0.9',
                    'cookie': `x-access-token=${this.currentToken}; farazSession=${this.farazSession}`,
                    'origin': 'https://faraz.io',
                    'referer': 'https://faraz.io/',
                    'user-agent': 'Mozilla/5.0'
                },
                timeout: 30000
            });
            
            if (res.data.result?.t && Array.isArray(res.data.result.t)) {
                const r = res.data.result;
                const candles = r.t.map((t, i) => ({
                    time: t,
                    open: parseFloat(r.o[i]),
                    high: parseFloat(r.h[i]),
                    low: parseFloat(r.l[i]),
                    close: parseFloat(r.c[i]),
                    volume: r.v ? parseFloat(r.v[i]) : undefined
                })).filter(c => !isNaN(c.close));
                
                if ((candles as any).length > 5000) {
                    this.candlesCache[timeframe] = candles.slice(-5000);
                } else {
                    this.candlesCache[timeframe] = candles;
                }
                this.lastUpdateTime[timeframe] = Date.now();
                console.log(`📊 ${this.candlesCache[timeframe].length} کندل برای تایم ${timeframe} دقیقه ذخیره شد`);
                return this.candlesCache[timeframe];
            }
        } catch (e) {
            if (e.response?.status === 401) {
                console.error(`⚠️ توکن منقضی (تایم ${timeframe}) - در انتظار رفرش بعدی`);
            } else {
                console.error(`خطا در دریافت داده تایم ${timeframe}:`, e.message);
            }
            return this.candlesCache[timeframe] || [];
        }
        return [];
    }

    async updateAllTimeframes() {
        console.log("🔄 در حال دریافت داده‌های تایم فریم‌ها...");
        await Promise.all([
            this.fetchCandles('1', 1000),
            this.fetchCandles('2', 1000),
            this.fetchCandles('3', 1000),
            this.fetchCandles('5', 1000),
            this.fetchCandles('10', 1000),
            this.fetchCandles('15', 1000),
            this.fetchCandles('60', 2000)
        ]);
        console.log(`✅ همه تایم فریم‌ها به‌روز شدند`);
    }

    getCandles(timeframe) {
        return this.candlesCache[timeframe] || [];
    }

    getAllCandlesMap() {
        return { ...this.candlesCache };
    }

    getYesterdayHighLow(timeframe = '60') {
        const candles = this.candlesCache[timeframe];
        if (!candles || (candles as any).length === 0) return { high: null, low: null, majorHigh: null, majorLow: null, minorHigh: null, minorLow: null };
        
        const now = Date.now() / 1000;
        const oneDayAgo = now - (24 * 60 * 60);
        
        const yesterdayCandles = candles.filter(c => c.time >= oneDayAgo && c.time < now);
        
        if (yesterdayCandles.length === 0) return { high: null, low: null, majorHigh: null, majorLow: null, minorHigh: null, minorLow: null };
        
        const high = Math.max(...yesterdayCandles.map(c => c.high));
        const low = Math.min(...yesterdayCandles.map(c => c.low));
        
        const sortedByHigh = [...yesterdayCandles].sort((a, b) => b.high - a.high);
        const sortedByLow = [...yesterdayCandles].sort((a, b) => a.low - b.low);
        
        const majorHigh = sortedByHigh[0]?.high || high;
        const majorLow = sortedByLow[0]?.low || low;
        const minorHigh = sortedByHigh[1]?.high || high;
        const minorLow = sortedByLow[1]?.low || low;
        
        return { high, low, majorHigh, majorLow, minorHigh, minorLow };
    }

    get15MinLevels() {
        const candles = this.candlesCache['15'];
        if (!candles || (candles as any).length === 0) return { high: null, low: null };
        
        const recentCandles = candles.slice(-20);
        const high = Math.max(...recentCandles.map(c => c.high));
        const low = Math.min(...recentCandles.map(c => c.low));
        
        return { high, low };
    }
}

// ============================================================
// کلاس BitcoinEngine - موتور اصلی ربات بیت‌کوین
// ============================================================
class BitcoinEngine {
    price = 0;
    mainTimeframe = '5';
    confirmationTimeframes = ['2', '3', '5'];
    candles = [];
    signals = [];
    ws = null;
    strategy = new TradingStrategy();
    marketAnalyzer = new MarketAnalyzer();
    multiTimeframeManager = null;
    liveStrategyType = 'FIB382_618_RSI_DIVERGENCE';
    brokerName = 'BTC/USD';
    isEnabled = true;
    lastStatusMessageTime = 0;
    activeTrades = [];
    completedTrades = [];
    pendingSignal = null;
    lastCandleCloseTimes = { '2': 0, '3': 0, '5': 0 };
    lastTargetNotificationTimes = new Map();
    nextTradeNumber = 1;

    tradeStats = {
        totalTrades: 0,
        successfulTrades: 0,
        failedTrades: 0,
        buyTrades: 0,
        buySuccessful: 0,
        buyFailed: 0,
        sellTrades: 0,
        sellSuccessful: 0,
        sellFailed: 0,
        tp1Hits: 0,
        tp2Hits: 0,
        tp3Hits: 0,
        tp4Hits: 0,
        tp5Hits: 0,
        totalBuyProfit: 0,
        totalBuyLoss: 0,
        totalSellProfit: 0,
        totalSellLoss: 0,
        lastReportDate: null,
        lastReportPeriod: {
            startTime: this.getSixAMToday(),
            buyCount: 0,
            sellCount: 0,
            buyFullTarget: 0,
            buyTP2Hit: 0,
            buyTP3Hit: 0,
            buyTP4Hit: 0,
            buyFailed: 0,
            sellFullTarget: 0,
            sellTP2Hit: 0,
            sellTP3Hit: 0,
            sellTP4Hit: 0,
            sellFailed: 0,
            buyPartialProfit: 0,
            sellPartialProfit: 0
        }
    };

    currentToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OGYwMDk2YzIxZjM0N2RhOTMyMzIzZTgiLCJjcmVkaXQiOjE3ODA1NzE3MzA2ODYsImFjdGl2ZSI6dHJ1ZSwicm9sZSI6ImN1c3RvbWVyIiwibGFzdFVwZGF0ZVRpbWUiOjE3Nzg4Njg2OTE4MDEsImlhdCI6MTc3ODg2ODY5MSwiZXhwIjoxNzc4ODc1ODkxfQ.4avguG9tyGq2JFWQkNmivFSD5quBR5gcdj6VCGPFn4s";
    farazSession = "s%3AIOMPjESaRChioBmpMfZZHUbDdGaKuEQA.NuYpPcEPXmu9AFqHcx2U6RUCUfpZ%2Fd%2BmCvrmGDBuUrQ";
    baleToken = "1027559519:0oxROXSkZMB3eXzYjv5535r2gwqTYNDRDaY";
    baleChatId = "4370708307";
    
    candleConfirmations = {
        legacy: true,
        salvation: true,
        nameless: true,
        engulfing: true,
        darkCloud: true
    };

    settingsFile = path.join(process.cwd(), 'bitcoin_settings.json');
    tradesFile = path.join(process.cwd(), 'bitcoin_trades.json');
    statsFile = path.join(process.cwd(), 'bitcoin_stats.json');

    getSixAMToday() {
        const now = new Date();
        now.setHours(6, 0, 0, 0);
        return now.getTime();
    }

    getPersianDayName() {
        const days = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];
        const now = new Date();
        return days[now.getDay()];
    }

    getTradeNumberText(tradeNumber) {
        const numbers = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم'];
        if (tradeNumber <= 10) {
            return numbers[tradeNumber - 1];
        }
        return `${tradeNumber}ام`;
    }

    constructor() {
        this.loadSettings();
        this.loadActiveTrades();
        this.loadTradeStats();
        this.multiTimeframeManager = new MultiTimeframeDataManager(this.currentToken, this.farazSession);
        if (!this.tradeStats.lastReportPeriod.startTime || this.tradeStats.lastReportPeriod.startTime < this.getSixAMToday()) {
            this.tradeStats.lastReportPeriod.startTime = this.getSixAMToday();
        }
    }

    loadSettings() {
        try {
            if (fs.existsSync(this.settingsFile)) {
                const content = fs.readFileSync(this.settingsFile, 'utf8');
                const s = JSON.parse(content);
                if (s.baleToken) this.baleToken = s.baleToken;
                if (s.baleChatId) this.baleChatId = s.baleChatId;
                if (s.currentToken) this.currentToken = s.currentToken;
                if (s.farazSession) this.farazSession = s.farazSession;
                if (s.isEnabled !== undefined) this.isEnabled = s.isEnabled;
                if (s.liveStrategyType) this.liveStrategyType = s.liveStrategyType;
                if (s.nextTradeNumber) this.nextTradeNumber = s.nextTradeNumber;
                console.log("تنظیمات بیت‌کوین با موفقیت بارگذاری شد");
            } else {
                console.log("فایل تنظیمات بیت‌کوین وجود ندارد");
                this.saveSettings();
            }
        } catch (e) {
            console.error("خطا در بارگذاری تنظیمات:", e.message);
        }
    }

    saveSettings() {
        try {
            const s = {
                baleToken: this.baleToken,
                baleChatId: this.baleChatId,
                currentToken: this.currentToken,
                farazSession: this.farazSession,
                candleConfirmations: this.candleConfirmations,
                isEnabled: this.isEnabled,
                liveStrategyType: this.liveStrategyType,
                nextTradeNumber: this.nextTradeNumber
            };
            fs.writeFileSync(this.settingsFile, JSON.stringify(s, null, 2));
            console.log("تنظیمات بیت‌کوین ذخیره شد");
        } catch (e) {
            console.error("خطا در ذخیره تنظیمات:", e.message);
        }
    }

    saveActiveTrades() {
        try {
            const data = this.activeTrades.map(trade => ({
                signalId: trade.signalId,
                type: trade.type,
                entryPrice: trade.entryPrice,
                sl: trade.sl,
                tp1: trade.tp1,
                tp2: trade.tp2,
                tp3: trade.tp3,
                tp4: trade.tp4,
                tp5: trade.tp5,
                entryTime: trade.entryTime,
                reachedTargets: trade.reachedTargets,
                targetNotificationSent: trade.targetNotificationSent,
                isCompleted: trade.isCompleted,
                isStopped: trade.isStopped,
                isReentry: trade.isReentry,
                originalTradeId: trade.originalTradeId,
                reentryCount: trade.reentryCount,
                activeLevel: trade.activeLevel,
                signalType: trade.signalType,
                pipsToTP1: trade.pipsToTP1,
                pipsToTP2: trade.pipsToTP2,
                pipsToTP3: trade.pipsToTP3,
                pipsToTP4: trade.pipsToTP4,
                pipsToTP5: trade.pipsToTP5,
                isSecondEntry: trade.isSecondEntry,
                tradeNumber: trade.tradeNumber
            }));
            fs.writeFileSync(this.tradesFile, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error("خطا در ذخیره معاملات فعال:", e.message);
        }
    }

    loadActiveTrades() {
        try {
            if (fs.existsSync(this.tradesFile)) {
                const content = fs.readFileSync(this.tradesFile, 'utf8');
                const data = JSON.parse(content);
                this.activeTrades = data.map(tradeData => {
                    const signal = {
                        time: tradeData.signalId,
                        type: tradeData.type,
                        entry: tradeData.entryPrice,
                        sl: tradeData.sl,
                        tp1: tradeData.tp1,
                        tp2: tradeData.tp2,
                        tp3: tradeData.tp3,
                        tp4: tradeData.tp4,
                        tp5: tradeData.tp5,
                        activeLevel: tradeData.activeLevel,
                        signalType: tradeData.signalType,
                        pipsToTP1: tradeData.pipsToTP1,
                        pipsToTP2: tradeData.pipsToTP2,
                        pipsToTP3: tradeData.pipsToTP3,
                        pipsToTP4: tradeData.pipsToTP4,
                        pipsToTP5: tradeData.pipsToTP5,
                        isSecondEntry: tradeData.isSecondEntry
                    };
                    const trade = new ActiveTrade(signal, tradeData.isReentry, tradeData.originalTradeId, tradeData.tradeNumber);
                    trade.reachedTargets = tradeData.reachedTargets;
                    trade.targetNotificationSent = tradeData.targetNotificationSent || { TP1: false, TP2: false, TP3: false, TP4: false, TP5: false };
                    trade.isCompleted = tradeData.isCompleted;
                    trade.isStopped = tradeData.isStopped;
                    trade.reentryCount = tradeData.reentryCount || 0;
                    trade.isSecondEntry = tradeData.isSecondEntry || false;
                    return trade;
                });
                if (this.activeTrades.length > 0) {
                    const maxTradeNumber = Math.max(...this.activeTrades.map(t => t.tradeNumber));
                    this.nextTradeNumber = maxTradeNumber + 1;
                }
                console.log(`${this.activeTrades.length} معامله فعال بارگذاری شد`);
            }
        } catch (e) {
            console.error("خطا در بارگذاری معاملات فعال:", e.message);
        }
    }

    loadTradeStats() {
        try {
            if (fs.existsSync(this.statsFile)) {
                const content = fs.readFileSync(this.statsFile, 'utf8');
                const loadedStats = JSON.parse(content);
                this.tradeStats = { ...this.tradeStats, ...loadedStats };
                if (!this.tradeStats.lastReportPeriod.startTime || this.tradeStats.lastReportPeriod.startTime < this.getSixAMToday()) {
                    this.tradeStats.lastReportPeriod.startTime = this.getSixAMToday();
                }
                console.log("آمار معاملات بارگذاری شد");
            }
        } catch (e) {
            console.error("خطا در بارگذاری آمار:", e.message);
        }
    }

    saveTradeStats() {
        try {
            fs.writeFileSync(this.statsFile, JSON.stringify(this.tradeStats, null, 2));
        } catch (e) {
            console.error("خطا در ذخیره آمار:", e.message);
        }
    }

    updateTradeStats(trade, isSuccessful, profitPips, isLoss = false) {
        const period = this.tradeStats.lastReportPeriod;
        
        if (trade.type === 'BUY') {
            this.tradeStats.buyTrades++;
            period.buyCount++;
            
            if (isSuccessful) {
                this.tradeStats.buySuccessful++;
                this.tradeStats.totalBuyProfit += profitPips;
                period.buyPartialProfit += profitPips;
                
                if (trade.reachedTargets.includes('TP5')) period.buyFullTarget++;
                else if (trade.reachedTargets.includes('TP4')) period.buyTP4Hit++;
                else if (trade.reachedTargets.includes('TP3')) period.buyTP3Hit++;
                else if (trade.reachedTargets.includes('TP2')) period.buyTP2Hit++;
            } else if (isLoss) {
                this.tradeStats.buyFailed++;
                this.tradeStats.totalBuyLoss += Math.abs(profitPips);
                period.buyFailed++;
            }
        } else {
            this.tradeStats.sellTrades++;
            period.sellCount++;
            
            if (isSuccessful) {
                this.tradeStats.sellSuccessful++;
                this.tradeStats.totalSellProfit += profitPips;
                period.sellPartialProfit += profitPips;
                
                if (trade.reachedTargets.includes('TP5')) period.sellFullTarget++;
                else if (trade.reachedTargets.includes('TP4')) period.sellTP4Hit++;
                else if (trade.reachedTargets.includes('TP3')) period.sellTP3Hit++;
                else if (trade.reachedTargets.includes('TP2')) period.sellTP2Hit++;
            } else if (isLoss) {
                this.tradeStats.sellFailed++;
                this.tradeStats.totalSellLoss += Math.abs(profitPips);
                period.sellFailed++;
            }
        }

        if (isSuccessful) {
            this.tradeStats.successfulTrades++;
        } else if (isLoss) {
            this.tradeStats.failedTrades++;
        }

        this.saveTradeStats();
    }

    updateTargetHits(targetName) {
        if (targetName === 'TP1') this.tradeStats.tp1Hits++;
        else if (targetName === 'TP2') this.tradeStats.tp2Hits++;
        else if (targetName === 'TP3') this.tradeStats.tp3Hits++;
        else if (targetName === 'TP4') this.tradeStats.tp4Hits++;
        else if (targetName === 'TP5') this.tradeStats.tp5Hits++;
        this.saveTradeStats();
    }

    checkActiveTrades() {
        if (this.activeTrades.length === 0) return;
        
        const completedToRemove = [];
        
        for (let i = 0; i < this.activeTrades.length; i++) {
            const trade = this.activeTrades[i];
            const result = trade.checkTargets(this.price);
            
            for (const hitTarget of result.hitTargets) {
                this.updateTargetHits(hitTarget.target);
                this.sendTargetHitMessage(trade, hitTarget.target, hitTarget.price);
            }
            
            if (result.hitStop) {
                const lossPips = trade.calculateTotalProfitPips(result.finalPrice);
                const hasHitTargets = trade.reachedTargets.length > 0;
                let isSuccessfulTrade = false;
                let profitPips = 0;
                
                if (hasHitTargets) {
                    const targetProfits = trade.getTargetProfits();
                    let totalProfitFromTargets = 0;
                    
                    if (trade.reachedTargets.includes('TP1')) totalProfitFromTargets += targetProfits.TP1Pips;
                    if (trade.reachedTargets.includes('TP2')) totalProfitFromTargets += targetProfits.TP2Pips;
                    if (trade.reachedTargets.includes('TP3')) totalProfitFromTargets += targetProfits.TP3Pips;
                    if (trade.reachedTargets.includes('TP4')) totalProfitFromTargets += targetProfits.TP4Pips;
                    
                    profitPips = totalProfitFromTargets;
                    isSuccessfulTrade = true;
                    console.log(`✅ معامله ${this.getTradeNumberText(trade.tradeNumber)} با وجود حد ضرر موفق محسوب می‌شود چون تارگت ${trade.reachedTargets.join(', ')} زده شده بود (سود: ${Math.round(profitPips)} واحد)`);
                } else {
                    profitPips = lossPips;
                    isSuccessfulTrade = false;
                }
                
                this.updateTradeStats(trade, isSuccessfulTrade, profitPips, !isSuccessfulTrade);
                this.sendTradeClosedMessage(trade, result.finalPrice, isSuccessfulTrade);
                completedToRemove.push(i);
            }
            else if (result.fullTargets || (trade.reachedTargets.length >= 2 && trade.isCompleted)) {
                const profitPips = trade.calculateTotalProfitPips(trade.tp5);
                this.updateTradeStats(trade, true, profitPips, false);
                this.sendTradeClosedMessage(trade, trade.tp5, true);
                completedToRemove.push(i);
            }
        }
        
        for (let i = completedToRemove.length - 1; i >= 0; i--) {
            const idx = completedToRemove[i];
            const trade = this.activeTrades[idx];
            this.completedTrades.push(trade);
            this.activeTrades.splice(idx, 1);
        }
        
        if (completedToRemove.length > 0) {
            this.saveActiveTrades();
        }
    }

    sendTargetHitMessage(trade, targetName, targetPrice) {
        const direction = trade.type === 'BUY' ? 'خرید 🟢' : 'فروش 🔴';
        const targetEmojis = { TP1: '🎯', TP2: '🎯🎯', TP3: '🎯🎯🎯', TP4: '🎯🎯🎯🎯', TP5: '⚠️🎯' };
        const emoji = targetEmojis[targetName] || '🎯';
        const moneyEmoji = '💰💰💰';
        const tradeNumberText = this.getTradeNumberText(trade.tradeNumber);
        
        let message = `${emoji} **${targetName} معامله ${tradeNumberText} زده شد!** ${emoji} ${moneyEmoji}\n\n`;
        message += `💰 **${direction}**\n`;
        message += `📍 قیمت هدف: ${targetPrice.toLocaleString()}\n`;
        message += `✅ تارگت های زده شده: ${trade.reachedTargets.join(' - ')}\n\n`;
        
        message += `⏱ زمان: ${new Date().toLocaleString('fa-IR')}\n\n`;
        message += `「 🥇 کانال سیگنال بیت‌کوین ⏱ 」\n`;
        message += `سیگنال آب شده\n`;
        message += `بیت کوین _ انس طلا_ اتریوم _ نفت\n`;
        message += `پیام رسان ها 09926821263\n`;
        message += `مدیر کانال   ‎@tradeer2\n`;
        message += `🆔 شناسه:\n`;
        message += `https://ble.ir/signal_time\n\n`;
        message += `🔹 bit22 🔹`;
        
        this.sendDirectBaleMessage(message);
    }

    async sendTradeClosedMessage(trade, finalPrice, isSuccessful) {
        const direction = trade.type === 'BUY' ? 'خرید 🟢' : 'فروش 🔴';
        const targetsHit = trade.reachedTargets.length > 0 ? trade.reachedTargets.join(' - ') : 'هیچکدام';
        const tradeNumberText = this.getTradeNumberText(trade.tradeNumber);
        
        let message = '';
        
        if (isSuccessful) {
            const targetProfits = trade.getTargetProfits();
            let totalProfitPips = 0;
            
            if (trade.reachedTargets.includes('TP1')) totalProfitPips += targetProfits.TP1Pips;
            if (trade.reachedTargets.includes('TP2')) totalProfitPips += targetProfits.TP2Pips;
            if (trade.reachedTargets.includes('TP3')) totalProfitPips += targetProfits.TP3Pips;
            if (trade.reachedTargets.includes('TP4')) totalProfitPips += targetProfits.TP4Pips;
            if (trade.reachedTargets.includes('TP5')) totalProfitPips = targetProfits.TP5Pips;
            
            message = `✅ **پوزیشن ${direction} (معامله ${tradeNumberText}) با موفقیت بسته شد** ✅\n\n`;
            message += `🎯 تارگت های زده شده: ${targetsHit}\n`;
            
            if (trade.isStopped && trade.reachedTargets.length > 0) {
                message += `⚠️ معامله با حد ضرر بسته شد اما تارگت ${targetsHit} قبلاً زده شده بود، بنابراین معامله موفق محسوب می‌شود\n`;
            } else if (!trade.reachedTargets.includes('TP5')) {
                message += `⚠️ تارگت ۵ پرریسک بود و زده نشد، اما معامله موفق محسوب می‌شود\n`;
            }
            message += `✅ معامله موفق بوده است\n\n`;
        } else {
            message = `❌ **پوزیشن ${direction} (معامله ${tradeNumberText}) با حد ضرر بسته شد** ❌\n\n`;
            message += `🎯 تارگت های زده شده: ${targetsHit}\n`;
            if (trade.reachedTargets.length > 0) {
                message += `⚠️ با وجود زدن تارگت ${targetsHit}، معامله در نهایت با حد ضرر بسته شد\n`;
            }
            message += `❌ معامله ناموفق بوده است\n\n`;
        }
        
        message += `📍 قیمت نهایی: ${finalPrice.toLocaleString()}\n`;
        message += `⏱ زمان: ${new Date().toLocaleString('fa-IR')}\n\n`;
        message += `「 🥇 کانال سیگنال بیت‌کوین ⏱ 」\n`;
        message += `سیگنال آب شده\n`;
        message += `بیت کوین _ انس طلا_ اتریوم _ نفت\n`;
        message += `پیام رسان ها 09926821263\n`;
        message += `مدیر کانال   ‎@tradeer2\n`;
        message += `🆔 شناسه:\n`;
        message += `https://ble.ir/signal_time\n\n`;
        message += `🔹 bit22 🔹`;
        
        await this.sendDirectBaleMessage(message);
    }

    async sendDetailedPeriodicReport() {
        return;
    }

    async sendStatusMessage(isStartup = true) {
        const now = Date.now();
        
        if (!isStartup && (now - this.lastStatusMessageTime) < 10800000) {
            return;
        }
        
        this.lastStatusMessageTime = now;
        
        const levels = await this.getKeyLevelsForTimeframes();
        const rangeStatus = this.getRangeStatus();
        const yesterdayLevels = await this.getYesterdayLevels();
        const priceAlert = this.checkPriceLevels();
        
        let message = `🤖 **ربات بیت‌کوین (BTC/USD) فعال است** 🤖\n\n`;
        message += `✅ ربات با موفقیت روشن شد و در حال پایش بازار بیت‌کوین است\n`;
        message += `📊 استراتژی شکار روند (۵ تارگت)\n`;
        message += `⏱ تایم فریم اصلی: ${this.mainTimeframe} دقیقه\n`;
        message += `✅ تایم‌های تاییدیه: ۲، ۳، ۵ دقیقه\n`;
        message += `📊 تایم‌های بررسی: ۱، ۲، ۳، ۵، ۱۰، ۱۵، ۶۰ دقیقه\n`;
        message += `📊 **تشخیص روند در تایم ۱۵ دقیقه**\n`;
        message += `📊 **ورود به معامله در تایم ۲ دقیقه (بر اساس واگرایی)**\n\n`;
        
        message += `📊 **سطوح روز گذشته (تایم ۱ ساعته)**\n`;
        if (yesterdayLevels.一小时.major.high) {
            message += `└ سقف ماژور: ${yesterdayLevels.一小时.major.high.toLocaleString()}\n`;
            message += `└ کف ماژور: ${yesterdayLevels.一小时.major.low.toLocaleString()}\n`;
            message += `└ سقف مینور: ${yesterdayLevels.一小时.minor.high.toLocaleString()}\n`;
            message += `└ کف مینور: ${yesterdayLevels.一小时.minor.low.toLocaleString()}\n`;
        }
        
        message += `\n📊 **سطوح تایم ۱۵ دقیقه**\n`;
        if (yesterdayLevels.十五分钟.high) {
            message += `└ سقف جاری: ${yesterdayLevels.十五分钟.high.toLocaleString()}\n`;
            message += `└ کف جاری: ${yesterdayLevels.十五分钟.low.toLocaleString()}\n`;
        }
        
        if (priceAlert) {
            message += `\n${priceAlert.message}\n`;
        }
        
        message += `\n📐 وضعیت بازار: ${rangeStatus.message}\n`;
        if (rangeStatus.isRanging) {
            message += `├ قدرت رنج: ${rangeStatus.strength}%\n`;
        }
        
        message += `\n💰 قیمت لحظه بیت‌کوین: ${this.price.toLocaleString()} USD\n`;
        
        message += `\n📅 زمان: ${new Date().toLocaleString('fa-IR')}\n\n`;
        message += `「 🥇 کانال سیگنال بیت‌کوین ⏱ 」\n`;
        message += `سیگنال آب شده\n`;
        message += `بیت کوین _ انس طلا_ اتریوم _ نفت\n`;
        message += `پیام رسان ها 09926821263\n`;
        message += `مدیر کانال   ‎@tradeer2\n`;
        message += `🆔 شناسه:\n`;
        message += `https://ble.ir/signal_time\n\n`;
        message += `🔹 bit22 🔹`;
        
        await this.sendDirectBaleMessage(message);
    }

    async sendBaleNotification(sig) {
        const tradeNumberText = this.getTradeNumberText(this.nextTradeNumber);
        
        let message = `🌟 **سیگنال جدید - استراتژی شکار روند بیت‌کوین** 🌟\n\n`;
        message += `📊 BTC/USD (بیت‌کوین)\n`;
        message += `📌 **معامله ${tradeNumberText}**\n`;
        message += `⏱ تایم فریم اصلی: ${this.mainTimeframe} دقیقه\n`;
        message += `✅ تایید شده با تایم‌های ۲، ۳، ۵ دقیقه\n`;
        message += `📊 جهت: ${(sig as any).type === 'BUY' ? 'خرید 🟢' : 'فروش 🔴'}\n`;
        message += `💰 نقطه ورود اول: ${(sig as any).entry.toLocaleString()}\n`;
        
        if ((sig as any).isSecondEntry) {
            message += `📍 **نقطه ورود دوم**\n`;
        } else if ((sig as any).activeLevel === 38.2 && !(sig as any).isSecondEntry) {
            const fibLevels = this.strategy.calculateFibLevelsForSignal(this.candles, (sig as any).type);
            if (fibLevels && fibLevels.fib618) {
                message += `📍 **نقطه ورود دوم**: ${fibLevels.fib618.toLocaleString()}\n`;
            }
        }
        
        message += `🛡 حد ضرر: ${(sig as any).sl.toLocaleString()}\n`;
        message += `🎯 TP1: ${(sig as any).tp1.toLocaleString()}\n`;
        message += `🎯 TP2: ${(sig as any).tp2.toLocaleString()}\n`;
        message += `🎯 TP3: ${(sig as any).tp3.toLocaleString()}\n`;
        message += `🎯 TP4: ${(sig as any).tp4.toLocaleString()}\n`;
        message += `🎯 TP5: ${(sig as any).tp5.toLocaleString()} ⚠️ پرریسک\n\n`;
        
        if ((sig as any).signalType) {
            message += `🔍 نوع سیگنال: ${(sig as any).signalType}\n`;
            message += `📊 قدرت سیگنال: ${(sig as any).signalStrength === 'very_strong' ? 'بسیار قوی 💪💪' : (sig as any).signalStrength === 'strong' ? 'قوی 💪' : (sig as any).signalStrength === 'moderate' ? 'متوسط 📊' : 'ضعیف 📉'}\n`;
        }
        
        message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        message += `📊 **تحلیل روند:**\n`;
        const trendEmoji = (sig as any).trendAnalysis.overall === 'bullish' ? '📈' : 
                          ((sig as any).trendAnalysis.overall === 'bearish' ? '📉' : '⚖️');
        message += `└ روند کلی: ${trendEmoji} ${(sig as any).trendAnalysis.overall === 'bullish' ? 'صعودی' : ((sig as any).trendAnalysis.overall === 'bearish' ? 'نزولی' : 'خنثی')}\n`;
        message += `└ قدرت روند: ${(sig as any).trendAnalysis.strength}%\n`;
        message += `└ اطمینان: ${(sig as any).trendAnalysis.confidence}%\n`;
        
        if ((sig as any).trendAnalysis.trend15Min) {
            const trend15Emoji = (sig as any).trendAnalysis.trend15Min.overall === 'bullish' ? '📈' : 
                               ((sig as any).trendAnalysis.trend15Min.overall === 'bearish' ? '📉' : '⚖️');
            message += `└ روند تایم ۱۵ دقیقه: ${trend15Emoji} ${(sig as any).trendAnalysis.trend15Min.overall === 'bullish' ? 'صعودی' : ((sig as any).trendAnalysis.trend15Min.overall === 'bearish' ? 'نزولی' : 'خنثی')} (${(sig as any).trendAnalysis.trend15Min.strength}%)\n`;
        }
        
        if ((sig as any).trendAnalysis.warnings && (sig as any).trendAnalysis.warnings.length > 0) {
            message += `└ ⚠️ ${(sig as any).trendAnalysis.warnings[0]}\n`;
        }
        
        if ((sig as any).trendAnalysis.reasons && (sig as any).trendAnalysis.reasons.length > 0) {
            message += `└ ${(sig as any).trendAnalysis.reasons[0]}\n`;
        }
        
        message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        message += `📐 ریسک به ریوارد TP2: ${(sig as any).riskReward2}\n`;
        message += `⭐ اعتبار سیگنال: ${(sig as any).confidence}%\n`;
        message += `🏷 کیفیت سیگنال: ${(sig as any).signalQuality || 'متوسط'}\n\n`;
        message += `📅 زمان: ${new Date((sig as any).time).toLocaleString('fa-IR')}\n\n`;
        message += `「 🥇 کانال سیگنال بیت‌کوین ⏱ 」\n`;
        message += `سیگنال آب شده\n`;
        message += `بیت کوین _ انس طلا_ اتریوم _ نفت\n`;
        message += `پیام رسان ها 09926821263\n`;
        message += `مدیر کانال   ‎@tradeer2\n`;
        message += `🆔 شناسه:\n`;
        message += `https://ble.ir/signal_time\n\n`;
        message += `🔹 bit22 🔹`;

        await this.sendDirectBaleMessage(message);
    }

    async sendDirectBaleMessage(message) {
        const url = `https://tapi.bale.ai/bot${this.baleToken}/sendMessage`;
        
        try {
            await axios.post(url, {
                chat_id: parseInt(this.baleChatId),
                text: message
            }, { timeout: 10000 });
            console.log("✅ پیام به بله ارسال شد");
            return true;
        } catch (e) {
            console.error("❌ خطا در ارسال پیام به بله:", e.message);
            return false;
        }
    }

    isRefreshing = false;

    async refreshToken() {
        if (this.isRefreshing) return false;
        try {
            this.isRefreshing = true;
            console.log("🔄 در حال رفرش توکن فاراز...");
            const res = await axios.get("https://faraz.io/api/public/authentication/me", {
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'accept-language': 'en-US,en;q=0.9',
                    'cookie': `x-access-token=${this.currentToken}; farazSession=${this.farazSession}`,
                    'origin': 'https://faraz.io',
                    'referer': 'https://faraz.io/dashboard?s=INDEX_BTCUSD&i=1&a=draft&adj=2',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
                },
                timeout: 15000
            });

            if (res.data && res.data.token) {
                const newToken = res.data.token;
                if (newToken !== this.currentToken) {
                    this.currentToken = newToken;
                    // به‌روزرسانی توکن در MultiTimeframeDataManager
                    if (this.multiTimeframeManager) {
                        this.multiTimeframeManager.currentToken = newToken;
                    }
                    this.saveSettings();
                    console.log("✅ توکن فاراز با موفقیت رفرش شد");
                } else {
                    console.log("ℹ️ توکن فاراز هنوز معتبر است، نیازی به رفرش نبود");
                }
                this.isRefreshing = false;
                return true;
            } else {
                console.error("❌ پاسخ رفرش توکن نامعتبر است:", JSON.stringify(res.data).slice(0, 200));
                // Retry in 1 minute
                this.isRefreshing = false;
                setTimeout(() => this.refreshToken(), 60000);
                return false;
            }
        } catch (e: any) {
            this.isRefreshing = false;
            if (e.response?.status === 401 || e.response?.status === 403) {
                console.error("❌ سشن فاراز منقضی شده است! لطفاً farazSession را در تنظیمات به‌روز کنید.");
            } else {
                console.error("❌ خطا در رفرش توکن فاراز:", e.message);
                // Retry in 1 minute on network error
                setTimeout(() => this.refreshToken(), 60000);
            }
            return false;
        }
    }

    async start() {
        if (!this.isEnabled) return console.log("⚠️ موتور بیت‌کوین غیرفعال است");
        
        if (!this.currentToken || !this.farazSession) {
            console.error("❌ توکن یا سشن فاراز در تنظیمات وجود ندارد!");
            console.log("📝 لطفاً توکن و سشن را در فایل bitcoin_settings.json وارد کنید");
            return;
        }
        
        console.log("🚀 شروع موتور بیت‌کوین با استراتژی شکار روند");
        console.log(`⏱ تایم فریم اصلی: ${this.mainTimeframe} دقیقه`);
        console.log(`✅ تایم‌های تاییدیه: ${this.confirmationTimeframes.join(', ')} دقیقه`);
        console.log(`📊 تایم‌های بررسی: 1، 2، 3، 5، 10، 15، 60 دقیقه`);
        console.log(`📊 **تشخیص روند در تایم ۱۵ دقیقه**`);
        console.log(`📊 **ورود به معامله در تایم ۲ دقیقه (بر اساس واگرایی)**`);
        console.log("📍 سطح ورود: منتظر سیگنال ورود");
        console.log("📍 نقطه ورود دوم: اصلاح فیبوناچی");
        console.log("🔍 انواع واگرایی: مخفی (اولویت اول) و همگرایی (اولویت دوم)");
        console.log("🔍 شرط ورود: همخوانی روند تایم ۱۵ دقیقه با واگرایی تایم ۲ دقیقه");
        console.log("🛡 حد ضرر جدید: 299% محدوده فیب (2.99)");
        console.log("🎯 اهداف: 5 تارگت (تارگت 5 پرریسک)");
        console.log("📍 نقطه ورود دوم: اصلاح فیبوناچی");
        console.log("📊 تحلیل روند: EMA، MACD، ADX، ساختار، چند تایم فریم");
        
        // رفرش اولیه توکن قبل از شروع
        await this.refreshToken();

        await this.multiTimeframeManager.updateAllTimeframes();
        await this.fetchHistory();
        await this.sendStatusMessage(true);
        this.connectWS();
        
        /* interval removed */

        // رفرش خودکار توکن هر ۱۵ دقیقه (توکن‌های فاراز معمولاً ۲ ساعت اعتبار دارند)
        setInterval(async () => {
            if (this.isEnabled) {
                const success = await this.refreshToken();
                if (success && this.ws && this.ws.readyState === 1) {
                    // اگر WebSocket باز است، سوکت را با توکن جدید reconnect کن
                    console.log("🔄 reconnect WebSocket با توکن جدید...");
                    this.ws.terminate();
                }
            }
        }, 15 * 60 * 1000);
    }

    async fetchHistory() {
        try {
            const now = Math.floor(Date.now() / 1000);
            const from = now - (5000 * 60);
            const url = `https://ir3.faraz.io/api/customer/trading-view/history?symbolName=INDEX_BTCUSD&resolution=${this.mainTimeframe}&from=${from}&to=${now}&countback=5000&firstDataRequest=true&latest=true&adjustType=2&json=true`;
            
            console.log("🔄 در حال دریافت تاریخچه قیمت بیت‌کوین...");
            
            const res = await axios.get(url, {
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'accept-language': 'fa-IR,fa;q=0.9',
                    'cookie': `x-access-token=${this.currentToken}; farazSession=${this.farazSession}`,
                    'origin': 'https://faraz.io',
                    'referer': 'https://faraz.io/',
                    'user-agent': 'Mozilla/5.0'
                },
                timeout: 30000
            });
            
            if (res.data.result?.t && Array.isArray(res.data.result.t)) {
                const r = res.data.result;
                this.candles = r.t.map((t, i) => ({
                    time: t,
                    open: parseFloat(r.o[i]),
                    high: parseFloat(r.h[i]),
                    low: parseFloat(r.l[i]),
                    close: parseFloat(r.c[i])
                })).filter(c => !isNaN(c.close));
                
                if (this.candles.length > 0) {
                    this.price = this.candles[this.candles.length - 1].close;
                    console.log(`✅ ${this.candles.length} کندل تاریخچه بیت‌کوین بارگذاری شد`);
                    console.log(`💰 قیمت فعلی بیت‌کوین: ${this.price.toLocaleString()} USD`);
                    console.log(`⏱ تایم فریم اصلی: ${this.mainTimeframe} دقیقه`);
                    
                    const rangeStatus = this.getRangeStatus();
                    console.log(`📐 وضعیت بازار بیت‌کوین: ${rangeStatus.message}`);
                }
            }
        } catch (e) {
            console.error("❌ خطا در دریافت تاریخچه بیت‌کوین:", e.message);
            if (e.response?.status === 401) {
                console.error("⚠️ توکن منقضی شده است! تلاش برای رفرش...");
                const refreshed = await this.refreshToken();
                if (refreshed) {
                    console.log("🔄 تلاش مجدد برای دریافت تاریخچه پس از رفرش توکن...");
                    await this.fetchHistory();
                }
            }
        }
    }

    connectWS() {
        if (!this.isEnabled) return;
        const url = "wss://ir3.faraz.io/srv09/realtime/?EIO=4&transport=websocket";
        this.ws = new WebSocket(url, {
            origin: "https://faraz.io",
            headers: { "User-Agent": "Mozilla/5.0" }
        });

        this.ws.on('open', () => console.log("✅ WebSocket بیت‌کوین متصل شد"));

        this.ws.on('message', (data) => {
            const msg = data.toString();
            if (msg === '2') return this.ws?.send('3');
            if (msg.startsWith('0{')) return this.ws?.send(`40/customer,${JSON.stringify({ token: this.currentToken })}`);
            if (msg.startsWith('40/customer,')) {
                this.ws?.send(`42/customer,["join-room","symbol-room-@INDEX_BTCUSD@1@0"]`);
            }
            if (msg.startsWith('42')) {
                const commaIdx = msg.indexOf(',');
                if (commaIdx === -1) return;
                try {
                    const parsed = JSON.parse(msg.substring(commaIdx + 1));
                    if (parsed[0] === 'symbol-room-@INDEX_BTCUSD@1@0') this.updateFromTick(parsed[1]);
                } catch (e) {}
            }
        });

        this.ws.on('close', () => {
            console.log("🔌 WebSocket بیت‌کوین قطع شد. تلاش مجدد در 5 ثانیه...");
            setTimeout(() => this.connectWS(), 5000);
        });
        this.ws.on('error', (err) => console.error("❌ خطای WebSocket بیت‌کوین:", err.message));
    }

    updateFromTick(tick) {
        try {
            const { time, open, high, low, close } = tick;
            this.price = close;

            const last = this.candles[this.candles.length - 1];
            if (last && last.time === time) {
                this.candles[this.candles.length - 1] = { time, open, high, low, close };
            } else {
                this.candles.push({ time, open, high, low, close });
                if (this.candles.length > 5000) this.candles.shift();
                
                this.checkCandleCloseForConfirmation(time);
                this.runStrategy();
            }
            
            this.checkActiveTrades();
        } catch (e) {
            console.error("❌ خطا در پردازش تیک بیت‌کوین:", e.message);
        }
    }

    checkCandleCloseForConfirmation(candleTime) {
        for (const tf of this.confirmationTimeframes) {
            const tfSeconds = parseInt(tf) * 60;
            const currentCandleCloseTime = Math.floor(candleTime / tfSeconds) * tfSeconds;
            
            if (this.lastCandleCloseTimes[tf] !== currentCandleCloseTime && this.lastCandleCloseTimes[tf] !== 0) {
                console.log(`✅ کندل تایم ${tf} دقیقه بسته شد: ${new Date(currentCandleCloseTime * 1000).toLocaleString('fa-IR')}`);
                
                if (this.pendingSignal && this.checkCandlePatternsForConfirmation(tf)) {
                    this.confirmAndSendSignal(this.pendingSignal);
                    this.pendingSignal = null;
                    break;
                }
            }
            
            this.lastCandleCloseTimes[tf] = currentCandleCloseTime;
        }
    }

    checkCandlePatternsForConfirmation(timeframe) {
        const candles = this.multiTimeframeManager.getCandles(timeframe);
        if ((candles as any).length < 5) return true;
        
        const lastCandle = candles[(candles as any).length - 1];
        const prevCandle = candles[(candles as any).length - 2];
        const prev2Candle = candles[(candles as any).length - 3];
        
        if (!lastCandle || !prevCandle) return true;
        
        const body = Math.abs(lastCandle.close - lastCandle.open);
        const totalRange = lastCandle.high - lastCandle.low;
        const upperWick = lastCandle.high - Math.max(lastCandle.close, lastCandle.open);
        const lowerWick = Math.min(lastCandle.close, lastCandle.open) - lastCandle.low;
        
        const isPinBar = (upperWick > body * 2 && lowerWick < body * 0.5) || 
                         (lowerWick > body * 2 && upperWick < body * 0.5);
        
        const isStrongBullish = (lastCandle.close > lastCandle.open) && (body > totalRange * 0.7);
        const isStrongBearish = (lastCandle.close < lastCandle.open) && (body > totalRange * 0.7);
        
        let isMorningStar = false;
        if (prev2Candle && prevCandle && lastCandle) {
            const firstBearish = prev2Candle.close < prev2Candle.open;
            const secondSmall = Math.abs(prevCandle.close - prevCandle.open) < (prev2Candle.high - prev2Candle.low) * 0.3;
            const thirdBullish = lastCandle.close > lastCandle.open && lastCandle.close > (prev2Candle.high + prev2Candle.low) / 2;
            isMorningStar = firstBearish && secondSmall && thirdBullish;
        }
        
        let isEveningStar = false;
        if (prev2Candle && prevCandle && lastCandle) {
            const firstBullish = prev2Candle.close > prev2Candle.open;
            const secondSmall = Math.abs(prevCandle.close - prevCandle.open) < (prev2Candle.high - prev2Candle.low) * 0.3;
            const thirdBearish = lastCandle.close < lastCandle.open && lastCandle.close < (prev2Candle.high + prev2Candle.low) / 2;
            isEveningStar = firstBullish && secondSmall && thirdBearish;
        }
        
        const patternDetected = isPinBar || isStrongBullish || isStrongBearish || isMorningStar || isEveningStar;
        
        if (patternDetected) {
            console.log(`✅ الگوی کندلی در تایم ${timeframe} تشخیص داده شد!`);
        }
        
        return patternDetected;
    }

    async confirmAndSendSignal(signal) {
        console.log(`\n🔍 تاییدیه کندلی برای سیگنال ${signal.type} دریافت شد`);
        
        const confirmationCandles1min = this.multiTimeframeManager.getCandles('1');
        if (confirmationCandles1min.length > 0) {
            const lastConfirmedCandle = confirmationCandles1min[confirmationCandles1min.length - 1];
            console.log(`✅ تایید نهایی: قیمت ${lastConfirmedCandle.close.toLocaleString()}`);
            signal.entry = lastConfirmedCandle.close;
            
            if (signal.type === 'BUY') {
                signal.pipsToTP1 = Math.round(signal.tp1 - signal.entry);
                signal.pipsToTP2 = Math.round(signal.tp2 - signal.entry);
                signal.pipsToTP3 = Math.round(signal.tp3 - signal.entry);
                signal.pipsToTP4 = Math.round(signal.tp4 - signal.entry);
                signal.pipsToTP5 = Math.round(signal.tp5 - signal.entry);
                signal.riskPips = Math.round(signal.entry - signal.sl);
            } else {
                signal.pipsToTP1 = Math.round(signal.entry - signal.tp1);
                signal.pipsToTP2 = Math.round(signal.entry - signal.tp2);
                signal.pipsToTP3 = Math.round(signal.entry - signal.tp3);
                signal.pipsToTP4 = Math.round(signal.entry - signal.tp4);
                signal.pipsToTP5 = Math.round(signal.entry - signal.tp5);
                signal.riskPips = Math.round(signal.sl - signal.entry);
            }
        }
        
        const newTrade = new ActiveTrade(signal, false, null, this.nextTradeNumber);
        this.activeTrades.push(newTrade);
        this.tradeStats.totalTrades++;
        this.nextTradeNumber++;
        this.saveActiveTrades();
        this.saveTradeStats();
        this.saveSettings();
        
        this.printSignal(signal);
        await this.sendBaleNotification(signal);
    }

    async runStrategy() {
        const multiTimeframeData = {
            candlesMap: this.multiTimeframeManager.getAllCandlesMap()
        };
        
        const sig = await this.strategy.analyze(
            this.candles,
            this.mainTimeframe,
            this.liveStrategyType,
            this.candleConfirmations,
            this.price,
            multiTimeframeData
        );
        if (!sig) return;

        const last = this.signals[0];
        if ((!last || Math.abs(last.time - (sig as any).time) > 60000) && !this.pendingSignal) {
            this.signals.unshift(sig);
            if (this.signals.length > 20) this.signals.pop();
            
            console.log(`\n⏳ سیگنال جدید تشخیص داده شد! منتظر بسته شدن کندل‌های ${this.confirmationTimeframes.join(', ')} دقیقه برای تایید...`);
            console.log(`📊 جهت: ${(sig as any).type === 'BUY' ? 'خرید' : 'فروش'} | سطح ورود: ${(sig as any).entry.toLocaleString()}`);
            if ((sig as any).isSecondEntry) {
                console.log(`📍 نقطه ورود دوم`);
            } else if ((sig as any).activeLevel === 38.2) {
                const fibLevels = this.strategy.calculateFibLevelsForSignal(this.candles, (sig as any).type);
                if (fibLevels && fibLevels.fib618) {
                    console.log(`📍 نقطه ورود دوم: ${fibLevels.fib618.toLocaleString()}`);
                }
            }
            console.log(`🔍 نوع سیگنال: ${(sig as any).signalType || 'نامشخص'}`);
            console.log(`🏷 کیفیت: ${(sig as any).signalQuality || 'متوسط'} | اعتماد: ${(sig as any).confidence}%`);
            console.log(`📊 تحلیل روند: ${(sig as any).trendAnalysis.overall} با قدرت ${(sig as any).trendAnalysis.strength}%`);
            if ((sig as any).trendAnalysis.trend15Min) {
                console.log(`📊 روند تایم ۱۵ دقیقه: ${(sig as any).trendAnalysis.trend15Min.overall} (${(sig as any).trendAnalysis.trend15Min.strength}%)`);
            }
            
            this.pendingSignal = sig;
        }
    }

    printSignal(sig) {
        const tradeNumberText = this.getTradeNumberText(this.nextTradeNumber);
        
        console.log(`\n${'='.repeat(70)}`);
        console.log(`📢 سیگنال تایید شده - استراتژی شکار روند بیت‌کوین (تایم ${(sig as any).timeframe} دقیقه)`);
        console.log(`📌 معامله ${tradeNumberText}`);
        console.log(`${'='.repeat(70)}`);
        console.log(`📊 جهت: ${(sig as any).type === 'BUY' ? '🟢 خرید (Long)' : '🔴 فروش (Short)'}`);
        console.log(`💰 نقطه ورود اول: ${(sig as any).entry.toLocaleString()}`);
        
        if ((sig as any).isSecondEntry) {
            console.log(`📍 نقطه ورود دوم`);
        } else if ((sig as any).activeLevel === 38.2) {
            const fibLevels = this.strategy.calculateFibLevelsForSignal(this.candles, (sig as any).type);
            if (fibLevels && fibLevels.fib618) {
                console.log(`📍 نقطه ورود دوم: ${fibLevels.fib618.toLocaleString()}`);
            }
        }
        
        console.log(`🛡 حد ضرر: ${(sig as any).sl.toLocaleString()}`);
        console.log(`🎯 TP1: ${(sig as any).tp1.toLocaleString()}`);
        console.log(`🎯 TP2: ${(sig as any).tp2.toLocaleString()}`);
        console.log(`🎯 TP3: ${(sig as any).tp3.toLocaleString()}`);
        console.log(`🎯 TP4: ${(sig as any).tp4.toLocaleString()}`);
        console.log(`🎯 TP5: ${(sig as any).tp5.toLocaleString()} ⚠️ پرریسک`);
        console.log(`📐 ریسک: ${(sig as any).riskPercent}%`);
        console.log(`\n🔍 نوع سیگنال: ${(sig as any).signalType || 'نامشخص'} (${(sig as any).signalStrength || 'متوسط'})`);
        console.log(`🏷 کیفیت سیگنال: ${(sig as any).signalQuality || 'متوسط'}`);
        console.log(`📊 RSI فعلی: ${(sig as any).rsi.toFixed(1)}`);
        console.log(`📊 تحلیل روند: ${(sig as any).trendAnalysis.overall} (قدرت: ${(sig as any).trendAnalysis.strength}%, اطمینان: ${(sig as any).trendAnalysis.confidence}%)`);
        if ((sig as any).trendAnalysis.trend15Min) {
            console.log(`📊 روند تایم ۱۵ دقیقه: ${(sig as any).trendAnalysis.trend15Min.overall} (قدرت: ${(sig as any).trendAnalysis.trend15Min.strength}%)`);
            console.log(`   ${(sig as any).trendAnalysis.trend15Min.message}`);
        }
        console.log(`⭐ اعتماد سیگنال: ${(sig as any).confidence}%`);
        console.log(`📊 معاملات فعال: ${this.activeTrades.length}`);
        console.log(`🔹 bit22 🔹`);
        console.log(`${'='.repeat(70)}\n`);
    }

    getState() {
        return {
            price: this.price,
            totalCandles: this.candles.length,
            signalsCount: this.signals.length,
            activeTradesCount: this.activeTrades.length,
            strategy: this.liveStrategyType,
            timeframe: this.mainTimeframe,
            nextTradeNumber: this.nextTradeNumber
        };
    }
    
    async getYesterdayLevels() {
        const yesterday60min = this.multiTimeframeManager.getYesterdayHighLow('60');
        const yesterday15min = this.multiTimeframeManager.getYesterdayHighLow('15');
        const current15minLevels = this.multiTimeframeManager.get15MinLevels();
        
        return {
           一小时: {
                major: { high: yesterday60min.majorHigh, low: yesterday60min.majorLow },
                minor: { high: yesterday60min.minorHigh, low: yesterday60min.minorLow }
            },
           十五分钟: {
                high: current15minLevels.high,
                low: current15minLevels.low,
                yesterdayHigh: yesterday15min.majorHigh,
                yesterdayLow: yesterday15min.majorLow
            }
        };
    }

    checkPriceLevels() {
        const levels = this.multiTimeframeManager.get15MinLevels();
        if (!levels.high || !levels.low || !this.price) return null;
        
        const distanceToHigh = ((levels.high - this.price) / this.price) * 100;
        const distanceToLow = ((this.price - levels.low) / this.price) * 100;
        
        if (distanceToHigh >= 0 && distanceToHigh < 0.15) {
            return { type: 'resistance', message: `⚠️ قیمت زیر مقاومت تایم ۱۵ دقیقه (${levels.high.toLocaleString()}) - مراقب باشید!` };
        }
        if (distanceToLow >= 0 && distanceToLow < 0.15) {
            return { type: 'support', message: `⚠️ قیمت روی حمایت تایم ۱۵ دقیقه (${levels.low.toLocaleString()}) - مراقب باشید!` };
        }
        return null;
    }

    async getKeyLevelsForTimeframes() {
        const timeframes = ['3', '5', '10', '15'];
        const levels = {};
        
        for (const tf of timeframes) {
            const candles = this.multiTimeframeManager.getCandles(tf);
            if ((candles as any).length > 0) {
                const keyLevels = this.strategy.findKeyLevels(candles);
                levels[tf] = keyLevels;
            } else {
                levels[tf] = { high: null, low: null };
            }
        }
        
        return levels;
    }

    getRangeStatus() {
        if (this.candles.length < 50) {
            return {
                isRanging: false,
                strength: 0,
                message: "در حال جمع آوری داده..."
            };
        }
        return this.marketAnalyzer.analyzeMarket(this.candles, this.price);
    }
}

console.log("=".repeat(70));
console.log("🤖 ربات سیگنال دهنده بیت‌کوین (BTC/USD) - استراتژی شکار روند");
console.log("⏱ تایم فریم اصلی: 5 دقیقه (تولید سیگنال)");
console.log("✅ تایم‌های تاییدیه: 2، 3، 5 دقیقه (با الگوهای کندلی)");
console.log("📊 تایم‌های بررسی: 1، 2، 3، 5، 10، 15، 60 دقیقه");
console.log("📊 **تشخیص روند در تایم ۱۵ دقیقه**");
console.log("📊 **ورود به معامله در تایم ۲ دقیقه (بر اساس واگرایی)**");
console.log("📍 سطح ورود: منتظر سیگنال ورود");
console.log("📍 نقطه ورود دوم: اصلاح فیبوناچی");
console.log("🔍 انواع واگرایی: مخفی (اولویت اول) و همگرایی (اولویت دوم)");
console.log("🔍 شرط اصلی: همخوانی روند تایم ۱۵ دقیقه با واگرایی تایم ۲ دقیقه");
console.log("🛡 حد ضرر پویا (299% بالای سقف/زیر کف)");
console.log("🎯 تارگت: 5 تارگت (تارگت 5 پرریسک)");
console.log("📊 تحلیل روند: EMA، MACD، ADX، ساختار، چند تایم فریم");
console.log("📊 نمایش سقف و کف روز گذشته (ماژور و مینور)");
console.log("⚠️ هشدار نزدیکی به سقف/کف تایم ۱۵ دقیقه");
console.log("📌 شماره‌گذاری معاملات: معامله اول، دوم، سوم، ...");
console.log("🔹 bit22 🔹");
console.log("=".repeat(70));


export { TrendAnalyzer, MarketAnalyzer, DivergenceDetector, TradingStrategy as BitRangeTradingStrategy, ActiveTrade, MultiTimeframeDataManager, BitcoinEngine as BitRangeEngine };
