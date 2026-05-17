import { Candle, StrategyConfig } from '../types.js';
import { checkCRSIDivergence } from './utils.js';

export class Strategy5Detector {
    public detect(candles: Candle[], config: StrategyConfig) {
        if (!candles || candles.length < 50) return null;
        
        const kaf = config.customKaf;
        const saghf = config.customSaghf;
        if (!kaf || !saghf || saghf <= kaf) return null;

        const R = saghf - kaf;
        const lastPrice = candles[candles.length - 1].close;

        const buyLevel = kaf - 0.618 * R;
        const sellLevel = saghf + 0.618 * R;
        const tolerance = R * 0.05;

        if (Math.abs(lastPrice - buyLevel) < tolerance || lastPrice <= buyLevel) {
            const hasDiv = checkCRSIDivergence(candles, "BUY", config.strategy3Strictness);
            if (hasDiv) {
                return {
                    type: "BUY",
                    signalPrice: lastPrice,
                    high: saghf,
                    low: kaf,
                    range: R,
                    isStrategy5: true,
                    confidence: 85
                };
            }
        } else if (Math.abs(lastPrice - sellLevel) < tolerance || lastPrice >= sellLevel) {
            const hasDiv = checkCRSIDivergence(candles, "SELL", config.strategy3Strictness);
            if (hasDiv) {
                return {
                    type: "SELL",
                    signalPrice: lastPrice,
                    high: saghf,
                    low: kaf,
                    range: R,
                    isStrategy5: true,
                    confidence: 85
                };
            }
        }
        return null;
    }
}
