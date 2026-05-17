import { Candle } from '../types.js';

export function calculateSMA(candles: Candle[], period: number) {
    if (candles.length < period) return null;
    let sum = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
        sum += candles[i].close;
    }
    return sum / period;
}

export function calculateEMA(candles: Candle[], period: number) {
    const data = candles.slice(-200); 
    if (data.length === 0) return [];
    
    const k = 2 / (period + 1);
    let ema = data[0].close;
    const emaArray = [ema];

    for (let i = 1; i < data.length; i++) {
        ema = (data[i].close * k) + (ema * (1 - k));
        emaArray.push(ema);
    }
    return emaArray;
}

export function calculateATR(candles: Candle[], period: number = 14) {
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

export function calculateRSICustom(values: number[], period: number) {
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

export function calculateCRSI(candles: Candle[], rsiPeriod = 3, streakPeriod = 2, rocPeriod = 100) {
    let values = candles.map(c => c.close);
    let crsi = new Array(values.length).fill(50); // Pad start

    if (values.length < rocPeriod + 5) return crsi;

    // 1. Calculate price RSI
    const priceRSI = calculateRSICustom(values, rsiPeriod);

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
    const streakRSI = calculateRSICustom(streaks, streakPeriod);

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

export function checkCRSIDivergence(candles: Candle[], type: "BUY" | "SELL", strictness: 'low' | 'medium' | 'high' = 'medium') {
    const crsi = calculateCRSI(candles);
    if (!crsi || crsi.length < 10) return false;

    // Apply Strictness levels
    const currentCRSI = crsi[crsi.length - 1];
    let depth = 5;
    if (strictness === 'medium') {
        if (type === "BUY" && currentCRSI > 40) return false;
        if (type === "SELL" && currentCRSI < 60) return false;
    } else if (strictness === 'high') {
        if (type === "BUY" && currentCRSI > 30) return false;
        if (type === "SELL" && currentCRSI < 70) return false;
        depth = 7;
    } else if (strictness === 'low') {
        depth = 3;
    }

    const closes = candles.map(c => c.close);
    
    // Simple lookback comparison based on trader's original logic
    const priceLast = closes[closes.length - 1];
    const pricePrev = closes[closes.length - 1 - depth];
    
    const rsiLast = crsi[crsi.length - 1];
    const rsiPrev = crsi[crsi.length - 1 - depth];

    if (type === "BUY") {
        return priceLast < pricePrev && rsiLast > rsiPrev;
    } else {
        return priceLast > pricePrev && rsiLast < rsiPrev;
    }
}

export function findPivotsInRange(candles: Candle[], depth: number, start: number, end: number, levelType: 'major' | 'minor') {
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

export function getSwingPivots(candles: Candle[], majorDepth: number = 10, minorDepth: number = 3) {
    if (candles.length < 20) return [];

    const pivots: { type: 'high' | 'low', price: number, index: number, time: number, levelType: 'major' | 'minor' | 'live' }[] = [];

    // 1. شناسایی سطوح تایید شده
    const majorPivots = findPivotsInRange(candles, majorDepth, 0, candles.length - majorDepth, 'major');
    const minorPivots = findPivotsInRange(candles, minorDepth, Math.max(0, candles.length - 60), candles.length - minorDepth, 'minor');

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
