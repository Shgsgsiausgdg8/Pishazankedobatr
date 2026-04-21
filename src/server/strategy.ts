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
    sl: number;
    tp1: number;
    tp2: number;
    tp3: number;
    time: number;
    timeframe: string;
    isN?: boolean;
}

export class TradingStrategy {
    private lastPatternKey = '';
    private lastSignalTime = 0;

    public analyze(candles: Candle[], timeframe: string, strategyType: string): Signal | null {
        if (candles.length < 50) return null;
        return this.detectNPattern(candles, timeframe);
    }

    private detectNPattern(candles: Candle[], timeframe: string): Signal | null {
        const pivots = this.getSwingPivots(candles, 8, 3);
        if (pivots.length < 3) return null;

        const p3 = pivots[pivots.length - 1]; // C
        const p2 = pivots[pivots.length - 2]; // B
        const p1 = pivots[pivots.length - 3]; // A

        if (p1.type === 'low' && p2.type === 'high' && p3.type === 'low') {
            const A = p1.price;
            const B = p2.price;
            const C = p3.price;
            if (B > A && C < B && C > A) {
                const range = B - A;
                const signalPrice = B - (range * 0.03);
                const patternKey = `N_UP|${p1.index}|${p2.index}|${p3.index}`;
                if (this.lastPatternKey === patternKey) return null;
                this.lastPatternKey = patternKey;
                return this.createSignalFromPattern({ type: 'BUY', signalPrice, isNPattern: true }, timeframe);
            }
        }

        if (p1.type === 'high' && p2.type === 'low' && p3.type === 'high') {
            const A = p1.price;
            const B = p2.price;
            const C = p3.price;
            if (B < A && C > B && C < A) {
                const range = A - B;
                const signalPrice = B + (range * 0.03);
                const patternKey = `N_DOWN|${p1.index}|${p2.index}|${p3.index}`;
                if (this.lastPatternKey === patternKey) return null;
                this.lastPatternKey = patternKey;
                return this.createSignalFromPattern({ type: 'SELL', signalPrice, isNPattern: true }, timeframe);
            }
        }
        return null;
    }

    public getNearestLevels(candles: Candle[], currentPrice: number) {
        const pivots = this.getSwingPivots(candles, 4, 2);
        let resistance = 0;
        let support = 0;

        const highs = pivots.filter(p => p.type === 'high' && p.price > currentPrice).sort((a, b) => a.price - b.price);
        if (highs.length > 0) resistance = highs[0].price;

        const lows = pivots.filter(p => p.type === 'low' && p.price < currentPrice).sort((a, b) => b.price - a.price);
        if (lows.length > 0) support = lows[0].price;

        const recent = candles.slice(-50);
        if (resistance === 0) resistance = Math.max(...recent.map(c => c.high));
        if (support === 0) support = Math.min(...recent.map(c => c.low));

        return { support, resistance };
    }

    public getSwingPivots(candles: Candle[], majorDepth: number = 8, minorDepth: number = 3) {
        if (candles.length < minorDepth * 2) return [];
        const pivots: any[] = [];
        
        for (let i = minorDepth; i < candles.length - 1; i++) {
            const curr = candles[i];
            let isHigh = true;
            let isLow = true;

            // محاسبه عمق بررسی بر اساس فاصله‌ها
            const leftLimit = Math.min(i, majorDepth);
            const rightLimit = Math.min(candles.length - 1 - i, majorDepth);
            
            // استفاده از حداقل عمق برای تایید نقاط نزدیک لبه
            const currentDepth = Math.max(minorDepth, Math.min(leftLimit, rightLimit));

            for (let j = 1; j <= currentDepth; j++) {
                if (candles[i - j].high > curr.high) isHigh = false;
                if (candles[i + j].high > curr.high) isHigh = false;
                
                if (candles[i - j].low < curr.low) isLow = false;
                if (candles[i + j].low < curr.low) isLow = false;
            }

            if (isHigh) pivots.push({ type: 'high', price: curr.high, index: i, time: curr.time });
            else if (isLow) pivots.push({ type: 'low', price: curr.low, index: i, time: curr.time });
        }

        const zigzag: any[] = [];
        for (const p of pivots) {
            if (zigzag.length === 0) { zigzag.push(p); continue; }
            const last = zigzag[zigzag.length - 1];
            if (last.type === p.type) {
                if (last.type === 'high' && p.price >= last.price) zigzag[zigzag.length - 1] = p;
                else if (last.type === 'low' && p.price <= last.price) zigzag[zigzag.length - 1] = p;
            } else {
                zigzag.push(p);
            }
        }
        return zigzag;
    }

    private createSignalFromPattern(pattern: any, timeframe: string): Signal {
        const isBuy = pattern.type === 'BUY';
        const entry = pattern.signalPrice;
        return {
            type: pattern.type,
            entry,
            tp1: isBuy ? entry * 1.002 : entry * 0.998,
            tp2: isBuy ? entry * 1.0032 : entry * 0.9968,
            tp3: isBuy ? entry * 1.0038 : entry * 0.9962,
            sl: isBuy ? entry * 0.998 : entry * 1.002,
            time: Date.now(),
            timeframe,
            isN: true
        };
    }
}
