import { Candle, StrategyConfig } from '../strategy.js';
import { checkCRSIDivergence } from './utils.js';

export class Strategy3Detector {
    public detect(candles: Candle[], config: StrategyConfig) {
        if (!candles || candles.length < 110) return null;

        const lookback = config.fibLookback;
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
        if (fibRange < config.fibMinRange) return null;

        /* SELL: High -> Low (حرکت نزولی، بازگشت به سمت بالا - سیگنال فروش در سقف اصلاحی) */
        if (highIdx < lowIdx) {
            const fib71 = low + fibRange * 0.71;
            const fib88 = low + fibRange * 0.88;

            const inZone = last.low <= fib88 && last.high >= fib71;
            if (inZone) {
                const hasDiv = checkCRSIDivergence(candles, "SELL", config.strategy3Strictness);
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
                const hasDiv = checkCRSIDivergence(candles, "BUY", config.strategy3Strictness);
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
}
