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
    profitFactor: number;
    expectancy: number;
    tradesPerDay: number;
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

        const spread = 0.5; // Average spread in gold points for more realistic results

        // Iterate through candles to find signals
        for (let i = 50; i < candles.length - 2; i++) {
            // Optimization: avoid slicing large datasets repeatedly where possible
            const window = candles.slice(Math.max(0, i - 500), i + 1);
            const signal = strategy.analyze(window, timeframe, strategyType);

            if (signal) {
                // Determine Entry: Realistic entry is at the OPEN of the NEXT candle
                const entryCandle = candles[i + 1];
                if (!entryCandle) continue;

                const actualEntry = signal.type === 'BUY' ? entryCandle.open + spread : entryCandle.open - spread;
                
                // If the next candle opens beyond SL, skip or count as instant SL
                if (signal.type === 'BUY' && entryCandle.open <= signal.sl) continue;
                if (signal.type === 'SELL' && entryCandle.open >= signal.sl) continue;

                const updatedSignal = { ...signal, entry: actualEntry };
                const outcome = this.findOutcome(candles.slice(i + 1), updatedSignal);
                
                if (outcome) {
                    const entryMs = entryCandle.time > 20000000000 ? entryCandle.time : entryCandle.time * 1000;
                    const exitMs = outcome.time > 20000000000 ? outcome.time : outcome.time * 1000;

                    const trade = {
                        type: signal.type,
                        entry: actualEntry,
                        exit: outcome.price,
                        profit: outcome.profit,
                        result: outcome.profit > 0 ? 'WIN' : 'LOSS' as 'WIN' | 'LOSS',
                        entryTime: entryMs,
                        exitTime: exitMs,
                        outcomeType: outcome.outcomeType,
                        maxTpReached: outcome.maxTpReached
                    };
                    
                    trades.push(trade);
                    if (trade.type === 'BUY') buyTradesCount++;
                    else sellTradesCount++;

                    if (trade.outcomeType.startsWith('TP')) tpHits++;
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

                    // Skip processed candles
                    const exitIdx = candles.findIndex(c => c.time === outcome.time);
                    if (exitIdx > i) {
                        i = exitIdx;
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

        // Calculate Profit Factor & Expectancy
        let grossWins = 0;
        let grossLosses = 0;
        trades.forEach(t => {
            if (t.profit > 0) grossWins += t.profit;
            else grossLosses += Math.abs(t.profit);
        });

        const profitFactor = grossLosses === 0 ? (grossWins > 0 ? 99 : 0) : grossWins / grossLosses;
        const expectancy = trades.length > 0 ? totalProfit / trades.length : 0;
        
        // Trades per day calculation
        let tradesPerDay = 0;
        if (candles.length > 0 && trades.length > 0) {
            const firstCandleTime = candles[0].time > 20000000000 ? candles[0].time : candles[0].time * 1000;
            const lastCandleTime = candles[candles.length - 1].time > 20000000000 ? candles[candles.length - 1].time : candles[candles.length - 1].time * 1000;
            const daysInRange = Math.max(1, (lastCandleTime - firstCandleTime) / (1000 * 60 * 60 * 24));
            tradesPerDay = trades.length / daysInRange;
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
            profitFactor,
            expectancy,
            tradesPerDay,
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
        let maxTpReached = 0;
        let exitPrice = 0;
        let time = 0;
        let outcomeType = '';

        for (const c of future) {
            if (signal.type === 'BUY') {
                // Check for SL first or simultaneously in the same candle (CONSERVATIVE)
                // If the candle low hits SL, check if we might have hit TP before SL.
                // Without tick data, if both hit in one candle, we assume SL to be safe.
                const hitsSL = c.low <= signal.sl;
                const hitsTP1 = c.high >= signal.tp1;

                if (hitsSL) {
                    // Even if it hit TP1, if it also hit SL in the same candle, we count SL as the most likely outcome 
                    // unless we want to be aggressive. Being conservative is more "accurate" for backtesting.
                    if (maxTpReached === 0 || hitsSL) {
                        exitPrice = signal.sl;
                        time = c.time;
                        outcomeType = 'SL';
                        maxTpReached = 0; // Reset just in case
                        break;
                    }
                }

                // Check for TPs
                if (c.high >= signal.tp1 && maxTpReached < 1) { maxTpReached = 1; exitPrice = signal.tp1; time = c.time; outcomeType = 'TP1'; }
                if (signal.tp2 && c.high >= signal.tp2 && maxTpReached < 2) { maxTpReached = 2; exitPrice = signal.tp2; time = c.time; outcomeType = 'TP2'; }
                if (signal.tp3 && c.high >= signal.tp3 && maxTpReached < 3) { maxTpReached = 3; exitPrice = signal.tp3; time = c.time; outcomeType = 'TP3'; }
                if (signal.tp4 && c.high >= signal.tp4 && maxTpReached < 4) { maxTpReached = 4; exitPrice = signal.tp4; time = c.time; outcomeType = 'TP4'; }
                if (signal.tp5 && c.high >= signal.tp5 && maxTpReached < 5) { maxTpReached = 5; exitPrice = signal.tp5; time = c.time; outcomeType = 'TP5'; }
                if (signal.tp6 && c.high >= signal.tp6 && maxTpReached < 6) { maxTpReached = 6; exitPrice = signal.tp6; time = c.time; outcomeType = 'TP6'; }
                if (signal.tp7 && c.high >= signal.tp7) { 
                    maxTpReached = 7; exitPrice = signal.tp7; time = c.time; outcomeType = 'TP7'; 
                    break; 
                }
            } else {
                // SELL Outcome
                const hitsSL = c.high >= signal.sl;
                const hitsTP1 = c.low <= signal.tp1;

                if (hitsSL) {
                    if (maxTpReached === 0 || hitsSL) {
                        exitPrice = signal.sl;
                        time = c.time;
                        outcomeType = 'SL';
                        maxTpReached = 0;
                        break;
                    }
                }

                // Check for TPs
                if (c.low <= signal.tp1 && maxTpReached < 1) { maxTpReached = 1; exitPrice = signal.tp1; time = c.time; outcomeType = 'TP1'; }
                if (signal.tp2 && c.low <= signal.tp2 && maxTpReached < 2) { maxTpReached = 2; exitPrice = signal.tp2; time = c.time; outcomeType = 'TP2'; }
                if (signal.tp3 && c.low <= signal.tp3 && maxTpReached < 3) { maxTpReached = 3; exitPrice = signal.tp3; time = c.time; outcomeType = 'TP3'; }
                if (signal.tp4 && c.low <= signal.tp4 && maxTpReached < 4) { maxTpReached = 4; exitPrice = signal.tp4; time = c.time; outcomeType = 'TP4'; }
                if (signal.tp5 && c.low <= signal.tp5 && maxTpReached < 5) { maxTpReached = 5; exitPrice = signal.tp5; time = c.time; outcomeType = 'TP5'; }
                if (signal.tp6 && c.low <= signal.tp6 && maxTpReached < 6) { maxTpReached = 6; exitPrice = signal.tp6; time = c.time; outcomeType = 'TP6'; }
                if (signal.tp7 && c.low <= signal.tp7) { 
                    maxTpReached = 7; exitPrice = signal.tp7; time = c.time; outcomeType = 'TP7'; 
                    break; 
                }
            }
        }

        if (outcomeType) {
            const profit = signal.type === 'BUY' ? (exitPrice - signal.entry) : (signal.entry - exitPrice);
            return { price: exitPrice, profit, time, outcomeType, maxTpReached };
        }
        
        return null;
    }
}
