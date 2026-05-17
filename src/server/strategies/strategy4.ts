import { Candle, StrategyConfig } from '../strategy.js';
import { calculateSMA } from './utils.js';

export class Strategy4Detector {
    public detect(candles: Candle[], config: StrategyConfig) {
        const ma20 = calculateSMA(candles, 20);
        const lastPrice = candles[candles.length - 1].close;
        if (!ma20) return null;

        if (lastPrice > ma20) {
            return { type: 'BUY', signalPrice: lastPrice, confidence: 60, label: 'MA-UP' };
        } else if (lastPrice < ma20) {
            return { type: 'SELL', signalPrice: lastPrice, confidence: 60, label: 'MA-DOWN' };
        }
        return null;
    }
}
