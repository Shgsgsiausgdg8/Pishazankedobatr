import { Candle, Signal } from "../strategy.js";
import { BitRangeTradingStrategy } from "./bitcoin_range_core.js";

export class BitRangeAnalyzer {
    private strategyInstance: any;
    private nextTradeNumber: number = 1;

    constructor() {
        this.strategyInstance = new BitRangeTradingStrategy({
            minCandles: 50,
            rsiPeriod: 14,
            fibLookback: 100,
            fib382Tolerance: 0.05,
            fib618Tolerance: 0.05,
        });
    }

    private aggregateCandles(candles1m: Candle[], periodMinutes: number): any[] {
        if (!candles1m || candles1m.length === 0) return [];
        const aggregated: any[] = [];
        
        let currentCandle: any = null;
        let currentBucketTime = 0;

        for (const c of candles1m) {
            const date = new Date(c.time);
            const m = date.getMinutes();
            const h = date.getHours();
            const d = date.getDate();
            const mo = date.getMonth();
            const y = date.getFullYear();
            
            const bucketMinute = m - (m % periodMinutes);
            const bucketDate = new Date(y, mo, d, h, bucketMinute, 0, 0);
            const bucketTime = bucketDate.getTime();

            if (!currentCandle || bucketTime !== currentBucketTime) {
                if (currentCandle) {
                    aggregated.push(currentCandle);
                }
                currentBucketTime = bucketTime;
                currentCandle = {
                    time: bucketTime,
                    open: c.open,
                    high: c.high,
                    low: c.low,
                    close: c.close,
                    volume: c.volume
                };
            } else {
                currentCandle.high = Math.max(currentCandle.high, c.high);
                currentCandle.low = Math.min(currentCandle.low, c.low);
                currentCandle.close = c.close;
                currentCandle.volume = (currentCandle.volume || 0) + (c.volume || 0);
            }
        }
        if (currentCandle) {
            aggregated.push(currentCandle);
        }

        return aggregated;
    }

    public analyzeBitRange(candles: Candle[]): any {
        if (!candles || candles.length < 80) return null;

        const candles2m = this.aggregateCandles(candles, 2);
        const candles15m = this.aggregateCandles(candles, 15);
        
        let lastId = 0;
        const addId = (c: any) => { c.id = ++lastId; return c; };

        const multiTimeframeData = {
            candlesMap: {
                '1': candles.map(addId),
                '2': candles2m.map(addId),
                '15': candles15m.map(addId)
            }
        };

        const currentPrice = candles[candles.length - 1].close;

        try {
            const result = this.strategyInstance.analyze(
                multiTimeframeData.candlesMap['1'], // base candles
                '1', // timeframe
                'FIB382_618_RSI_DIVERGENCE',
                null, // confirmations
                currentPrice,
                multiTimeframeData
            );

            if (result) {
                const tradeNum = this.nextTradeNumber++;
                return {
                    type: result.type,
                    signalPrice: result.entry,
                    kaf: result.sl < result.entry ? result.sl : result.tp1,
                    saghf: result.sl > result.entry ? result.sl : result.tp1,
                    confidence: result.confidence || 85,
                    isBitRange: true,
                    tradeNumber: tradeNum,
                    tp1: result.tp1,
                    tp2: result.tp2,
                    tp3: result.tp3,
                    tp4: result.tp4,
                    tp5: result.tp5,
                    sl: result.sl,
                    extras: result 
                };
            }
        } catch (e: any) {
             console.error("Error in BitRangeAnalyzer logic:", e?.message);
        }

        return null;
    }
}
