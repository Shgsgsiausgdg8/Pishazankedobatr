import { BacktestEngine } from './src/server/backtest';
import { FarazGoldEngine } from './src/server/faraz_engine';

async function test() {
    const engine = new FarazGoldEngine(); 
    await engine.fetchHistory();
    
    console.log("Candles:", engine.candles.length);
    
    const be = new BacktestEngine();
    const config = { strategy3Strictness: 'low', fibMinRange: 0.1 };
    
    const res = be.run(engine.candles, '15m', 'STRATEGY_3', config);
    console.log("Strategy 3 - LOW trades:", res.trades.length);

    const configMedium = { strategy3Strictness: 'medium', fibMinRange: 0.1 };
    const res2 = be.run(engine.candles, '15m', 'STRATEGY_3', configMedium);
    console.log("Strategy 3 - MEDIUM trades:", res2.trades.length);
}

test();
