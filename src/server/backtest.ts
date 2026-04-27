import { TradingStrategy, Candle, Signal } from "./strategy.js";

export interface BacktestResult {
    totalTrades: number;
    buyTrades: number;
    sellTrades: number;
    winRate: number;
    totalProfit: number;
    maxDrawdown: number;
    bestHour: number;
    bestDay: string;
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
    constructor() {}

    /**
     * Executes a simulation on historical candles
     */
    run(candles: Candle[], timeframe: string, strategyType: string): BacktestResult {
        const strategy = new TradingStrategy(); // Create fresh instance for each run
        const trades = [];
        let buyTradesCount = 0;
        let sellTradesCount = 0;
        let totalProfit = 0;
        let wins = 0;
        let peak = 0;
        let maxDrawdown = 0;

        // Statistics for best hour/day
        const hourStats: Record<number, number> = {};
        const dayStats: Record<string, number> = {};
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        // Iterate through candles to find signals
        for (let i = 50; i < candles.length - 10; i++) {
            // Optimization: avoid slicing large datasets repeatedly where possible
            const window = candles.slice(Math.max(0, i - 300), i + 1);
            const signal = strategy.analyze(window, timeframe, strategyType);

            if (signal) {
                const outcome = this.findOutcome(candles.slice(i + 1), signal);
                if (outcome) {
                    const trade = {
                        type: signal.type,
                        entry: signal.entry,
                        exit: outcome.price,
                        profit: outcome.profit,
                        result: outcome.profit > 0 ? 'WIN' : 'LOSS' as 'WIN' | 'LOSS',
                        entryTime: candles[i].time,
                        exitTime: outcome.time
                    };
                    trades.push(trade);
                    if (trade.type === 'BUY') buyTradesCount++;
                    else sellTradesCount++;

                    totalProfit += outcome.profit;
                    if (outcome.profit > 0) wins++;
                    
                    const date = new Date(trade.entryTime);
                    const hour = date.getHours();
                    const day = days[date.getDay()];
                    
                    hourStats[hour] = (hourStats[hour] || 0) + outcome.profit;
                    dayStats[day] = (dayStats[day] || 0) + outcome.profit;

                    if (totalProfit > peak) peak = totalProfit;
                    const dd = peak - totalProfit;
                    if (dd > maxDrawdown) maxDrawdown = dd;

                    // Safety exit indexing to prevent infinite loops
                    const exitIdx = candles.findIndex(c => c.time === outcome.time);
                    if (exitIdx > i) {
                        i = exitIdx;
                    } else {
                        // If something went wrong, just move to next candle
                        continue;
                    }
                }
            }
        }

        // Find best hour and day
        let bestHour = -1;
        let maxHProfit = -Infinity;
        for (const h in hourStats) {
            if (hourStats[h] > maxHProfit) {
                maxHProfit = hourStats[h];
                bestHour = parseInt(h);
            }
        }

        let bestDay = 'N/A';
        let maxDProfit = -Infinity;
        for (const d in dayStats) {
            if (dayStats[d] > maxDProfit) {
                maxDProfit = dayStats[d];
                bestDay = d;
            }
        }

        return {
            totalTrades: trades.length,
            buyTrades: buyTradesCount,
            sellTrades: sellTradesCount,
            winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
            totalProfit: totalProfit,
            maxDrawdown: maxDrawdown,
            bestHour,
            bestDay,
            trades: trades
        };
    }

    /**
     * Runs all available strategies and compares them
     */
    runGlobalComparison(candles: Candle[], timeframe: string): { strategy: string, results: BacktestResult }[] {
        const types = ['N-PATTERN', 'FIB-38'];
        const comparison = types.map(type => {
            return {
                strategy: type,
                results: this.run(candles, timeframe, type)
            };
        });
        
        return comparison.sort((a, b) => b.results.totalProfit - a.results.totalProfit);
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
