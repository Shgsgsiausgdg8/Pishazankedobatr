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
    riskFreeHits: number;
    bestHour: number;
    bestDay: string;
    trades: {
        type: 'BUY' | 'SELL';
        entry: number;
        exit: number;
        profit: number;
        result: 'WIN' | 'LOSS' | 'BREAKEVEN';
        entryTime: number;
        exitTime: number;
        outcomeType: string;
        maxTpReached: number;
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
        let losses = 0;
        let peak = 0;
        let maxDrawdown = 0;
        let tpHits = 0;
        let slHits = 0;
        let riskFreeHits = 0;

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

                    const trade: any = {
                        type: signal.type,
                        entry: signal.entry,
                        exit: outcome.price,
                        profit: outcome.profit,
                        result: (outcome.profit > 0 || outcome.maxTpReached > 0) ? 'WIN' : (outcome.profit < 0 ? 'LOSS' : 'BREAKEVEN'),
                        entryTime: entryMs,
                        exitTime: exitMs,
                        outcomeType: outcome.outcomeType,
                        maxTpReached: outcome.maxTpReached
                    };
                    trades.push(trade);
                    if (trade.type === 'BUY') buyTradesCount++;
                    else sellTradesCount++;

                    // Count as TP hit if any TP was reached during trade's life
                    if (trade.maxTpReached > 0) tpHits++;
                    
                    if (trade.outcomeType === 'SL') slHits++;
                    else if (trade.outcomeType.startsWith('RISK_FREE')) riskFreeHits++;

                    totalProfit += outcome.profit;
                    if (trade.result === 'WIN') wins++;
                    else if (trade.result === 'LOSS') losses++;
                    
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
            riskFreeHits: riskFreeHits,
            bestHour,
            bestDay,
            trades: trades as any // Array elements are checked against trade: any above
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
        let riskFreeAt = 0; // The TP level index that triggered risk-free

        for (const c of future) {
            if (signal.type === 'BUY') {
                // Check for TP hits
                if (c.high >= signal.tp1 && maxTpReached < 1) { 
                    maxTpReached = 1; exitPrice = signal.tp1; time = c.time; outcomeType = 'TP1'; 
                    riskFreeAt = 1;
                }
                if (signal.tp2 && c.high >= signal.tp2 && maxTpReached < 2) { 
                    maxTpReached = 2; exitPrice = signal.tp2; time = c.time; outcomeType = 'TP2'; 
                    riskFreeAt = 2; // User mentioned TP1 or TP2
                }
                if (signal.tp3 && c.high >= signal.tp3 && maxTpReached < 3) { maxTpReached = 3; exitPrice = signal.tp3; time = c.time; outcomeType = 'TP3'; }
                if (signal.tp4 && c.high >= signal.tp4 && maxTpReached < 4) { maxTpReached = 4; exitPrice = signal.tp4; time = c.time; outcomeType = 'TP4'; }
                if (signal.tp5 && c.high >= signal.tp5 && maxTpReached < 5) { maxTpReached = 5; exitPrice = signal.tp5; time = c.time; outcomeType = 'TP5'; }
                if (signal.tp6 && c.high >= signal.tp6 && maxTpReached < 6) { maxTpReached = 6; exitPrice = signal.tp6; time = c.time; outcomeType = 'TP6'; }
                if (signal.tp7 && c.high >= signal.tp7) { 
                    maxTpReached = 7; exitPrice = signal.tp7; time = c.time; outcomeType = 'TP7'; 
                    break; 
                }

                // Check for SL or Risk-Free exit
                if (riskFreeAt > 0) {
                    if (c.low <= signal.entry) {
                        exitPrice = signal.entry;
                        time = c.time;
                        outcomeType = `RISK_FREE_AT_TP${riskFreeAt}`;
                        break;
                    }
                } else {
                    if (c.low <= signal.sl) {
                        exitPrice = signal.sl;
                        time = c.time;
                        outcomeType = 'SL';
                        break;
                    }
                }
            } else { // SELL
                if (c.low <= signal.tp1 && maxTpReached < 1) { 
                    maxTpReached = 1; exitPrice = signal.tp1; time = c.time; outcomeType = 'TP1'; 
                    riskFreeAt = 1;
                }
                if (signal.tp2 && c.low <= signal.tp2 && maxTpReached < 2) { 
                    maxTpReached = 2; exitPrice = signal.tp2; time = c.time; outcomeType = 'TP2'; 
                    riskFreeAt = 2;
                }
                if (signal.tp3 && c.low <= signal.tp3 && maxTpReached < 3) { maxTpReached = 3; exitPrice = signal.tp3; time = c.time; outcomeType = 'TP3'; }
                if (signal.tp4 && c.low <= signal.tp4 && maxTpReached < 4) { maxTpReached = 4; exitPrice = signal.tp4; time = c.time; outcomeType = 'TP4'; }
                if (signal.tp5 && c.low <= signal.tp5 && maxTpReached < 5) { maxTpReached = 5; exitPrice = signal.tp5; time = c.time; outcomeType = 'TP5'; }
                if (signal.tp6 && c.low <= signal.tp6 && maxTpReached < 6) { maxTpReached = 6; exitPrice = signal.tp6; time = c.time; outcomeType = 'TP6'; }
                if (signal.tp7 && c.low <= signal.tp7) { 
                    maxTpReached = 7; exitPrice = signal.tp7; time = c.time; outcomeType = 'TP7'; 
                    break; 
                }

                if (riskFreeAt > 0) {
                    if (c.high >= signal.entry) {
                        exitPrice = signal.entry;
                        time = c.time;
                        outcomeType = `RISK_FREE_AT_TP${riskFreeAt}`;
                        break;
                    }
                } else {
                    if (c.high >= signal.sl) {
                        exitPrice = signal.sl;
                        time = c.time;
                        outcomeType = 'SL';
                        break;
                    }
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
