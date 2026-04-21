import { TradingStrategy, Candle, Signal } from "./strategy.js";

export interface BacktestResult {
    totalTrades: number;
    winRate: number;
    totalProfit: number;
    maxDrawdown: number;
    trades: {
        type: 'BUY' | 'SELL';
        entry: number;
        exit: number;
        profit: number;
        result: 'WIN' | 'LOSS';
        entryTime: number;
        exitTime: number;
    }[];
}

export class BacktestEngine {
    private strategy = new TradingStrategy();

    constructor() {}

    /**
     * Executes a simulation on historical candles
     */
    run(candles: Candle[], timeframe: string, strategyType: string): BacktestResult {
        const trades = [];
        let totalProfit = 0;
        let wins = 0;
        let peak = 0;
        let maxDrawdown = 0;

        // Iterate through candles to find signals
        // Use a window of 50 candles to simulate "current state"
        for (let i = 50; i < candles.length - 10; i++) {
            const window = candles.slice(0, i + 1);
            const signal = this.strategy.analyze(window, timeframe, strategyType);

            if (signal) {
                // Find outcome (TP or SL) in the future candles
                const outcome = this.findOutcome(candles.slice(i + 1), signal);
                if (outcome) {
                    trades.push({
                        type: signal.type,
                        entry: signal.entry,
                        exit: outcome.price,
                        profit: outcome.profit,
                        result: outcome.profit > 0 ? 'WIN' : 'LOSS',
                        entryTime: candles[i].time,
                        exitTime: outcome.time
                    });

                    totalProfit += outcome.profit;
                    if (outcome.profit > 0) wins++;
                    
                    // Basic drawdown calculation
                    if (totalProfit > peak) peak = totalProfit;
                    const dd = peak - totalProfit;
                    if (dd > maxDrawdown) maxDrawdown = dd;

                    // Skip candles until exit to avoid multiple signals for same move
                    const exitIdx = candles.findIndex(c => c.time === outcome.time);
                    if (exitIdx > i) i = exitIdx;
                }
            }
        }

        return {
            totalTrades: trades.length,
            winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
            totalProfit: totalProfit,
            maxDrawdown: maxDrawdown,
            trades: trades
        };
    }

    private findOutcome(future: Candle[], signal: Signal) {
        for (const c of future) {
            if (signal.type === 'BUY') {
                if (c.high >= signal.tp1) return { price: signal.tp1, profit: signal.tp1 - signal.entry, time: c.time };
                if (c.low <= signal.sl) return { price: signal.sl, profit: signal.sl - signal.entry, time: c.time };
            } else {
                if (c.low <= signal.tp1) return { price: signal.tp1, profit: signal.entry - signal.tp1, time: c.time };
                if (c.high >= signal.sl) return { price: signal.sl, profit: signal.entry - signal.sl, time: c.time };
            }
        }
        return null;
    }
}
