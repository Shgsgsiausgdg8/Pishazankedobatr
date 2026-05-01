import { TradingStrategy, Candle, Signal } from "./strategy.js";

export interface BacktestResult {
    totalTrades: number;
    buyTrades: number;
    sellTrades: number;
    winRate: number;
    totalProfit: number;
    maxDrawdown: number;
    tpHits: number;
    slHits: number;
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
        outcomeType: 'TP' | 'SL';
    }[];
}

export class BacktestEngine {
    constructor() {}

    /**
     * Executes a simulation on historical candles
     */
    run(candles: Candle[], timeframe: string, strategyType: string, config?: any): BacktestResult {
        const strategy = new TradingStrategy(); // Create fresh instance for each run
        if (config) {
            strategy.updateConfig(config);
        }
        const trades = [];
        let buyTradesCount = 0;
        let sellTradesCount = 0;
        let totalProfit = 0;
        let wins = 0;
        let peak = 0;
        let maxDrawdown = 0;
        let tpHits = 0;
        let slHits = 0;

        // Statistics for best hour/day
        const hourStats: Record<number, number> = {};
        const dayStats: Record<string, number> = {};
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        // Iterate through candles to find signals
        for (let i = 50; i < candles.length - 10; i++) {
            // Optimization: avoid slicing large datasets repeatedly where possible
            const window = candles.slice(Math.max(0, i - 1000), i + 1);
            const signal = strategy.analyze(window, timeframe, strategyType);

            if (signal) {
                const outcome = this.findOutcome(candles.slice(i + 1), signal);
                if (outcome) {
                    const entryMs = candles[i].time > 20000000000 ? candles[i].time : candles[i].time * 1000;
                    const exitMs = outcome.time > 20000000000 ? outcome.time : outcome.time * 1000;

                    const trade = {
                        type: signal.type,
                        entry: signal.entry,
                        exit: outcome.price,
                        profit: outcome.profit,
                        result: outcome.profit > 0 ? 'WIN' : 'LOSS' as 'WIN' | 'LOSS',
                        entryTime: entryMs,
                        exitTime: exitMs,
                        outcomeType: outcome.outcomeType as 'TP' | 'SL'
                    };
                    trades.push(trade);
                    if (trade.type === 'BUY') buyTradesCount++;
                    else sellTradesCount++;

                    if (trade.outcomeType === 'TP') tpHits++;
                    else if (trade.outcomeType === 'SL') slHits++;

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
            tpHits,
            slHits,
            bestHour,
            bestDay,
            trades: trades
        };
    }

    /**
     * Runs all available strategies and compares them
     */
    runGlobalComparison(candles: Candle[], timeframe: string, config?: any): { strategy: string, results: BacktestResult }[] {
        const types = [
            { id: 'N-PATTERN', name: 'الگوی N' },
            { id: 'FIB-38', name: 'فیبوناتچی ۳۸٪' },
            { id: 'STRATEGY_3', name: 'استراتژی فراز (Fib+CRSI)' },
            { id: 'STRATEGY_4', name: 'استراتژی چهارم (ساده)' },
            { id: 'STRATEGY_5', name: 'استراتژی پنجم (کف و سقف)' }
        ];
        const comparison = types.map(type => {
            return {
                strategy: type.name,
                results: this.run(candles, timeframe, type.id, config)
            };
        });
        
        return comparison.sort((a, b) => b.results.totalProfit - a.results.totalProfit);
    }

    private findOutcome(future: Candle[], signal: Signal) {
        for (const c of future) {
            if (signal.type === 'BUY') {
                if (c.high >= signal.tp1) return { price: signal.tp1, profit: signal.tp1 - signal.entry, time: c.time, outcomeType: 'TP' };
                if (c.low <= signal.sl) return { price: signal.sl, profit: signal.sl - signal.entry, time: c.time, outcomeType: 'SL' };
            } else {
                if (c.low <= signal.tp1) return { price: signal.tp1, profit: signal.entry - signal.tp1, time: c.time, outcomeType: 'TP' };
                if (c.high >= signal.sl) return { price: signal.sl, profit: signal.entry - signal.sl, time: c.time, outcomeType: 'SL' };
            }
        }
        return null;
    }
}
