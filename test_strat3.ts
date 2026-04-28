import { TradingStrategy } from './src/server/strategy';

const strategy = new TradingStrategy();
strategy.updateConfig({ strategy3Strictness: 'low', fibMinRange: 0.1 });

const candles: any[] = [];
let price = 1000;
let time = Date.now() - 200 * 60000;

// Need a HIGH then LOW then RETRACE UP to 71-88%
for(let i=0; i<200; i++) {
    if (i < 140) price += 2; // Up to High
    else if (i < 190) price -= 2; // Down to Low
    else price += 8; // Retrace up (10 candles of 8 = 80 up)
    
    // Smooth NOISE using sin
    let nprice = price + Math.sin(i) * 2;

    candles.push({
        time: time + i * 60000,
        open: nprice,
        high: nprice + 2,
        low: nprice - 2,
        close: nprice,
        volume: 100
    });
}

function debugStrategy3(candles: any[]) {
    const lookback = strategy.config.fibLookback;
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
    
    console.log("High:", high, "Low:", low, "Range:", fibRange);
    
    if (highIdx < lowIdx) {
        console.log("Mode: SELL");
        const fib71 = low + fibRange * 0.71;
        const fib88 = low + fibRange * 0.88;
        console.log("Fib71:", fib71, "Fib88:", fib88);
        console.log("Last candle: Low =", last.low, "High =", last.high);
        
        const inZone = last.low <= fib88 && last.high >= fib71;
        console.log("In Zone?", inZone);
        
        if (inZone) {
            const hasDiv = strategy['checkCRSIDivergence'](candles, "SELL");
            const crsi = strategy['calculateCRSI'](candles);
            console.log("CRSI length:", crsi.length);
            console.log("CRSI last 5:", crsi.slice(-5));
            console.log("Has Divergence?", hasDiv);
        }
    }
}
debugStrategy3(candles);


