import WebSocket from 'ws';
import { TradingStrategy, Candle, Signal } from './strategy.js';

export class AlphaGoldEngine {
    price = 0;
    timeframe = '1';
    candles: Candle[] = [];
    levels: any[] = [];
    signals: Signal[] = [];
    strategy = new TradingStrategy();
    ws: WebSocket | null = null;

    async start() {
        this.fetchHistory();
        this.connectWS();
    }

    async fetchHistory() {
        console.log(`[AlphaEngine] Fetching history for timeframe: ${this.timeframe}`);
        // دریافت دیتا برای حدود ۵۰۰ کندل
        const limit = 500;
        const url = `https://chrt.alphagoldx.com/api/data/histoday/?e=ALPHAGOLDX&fsym=XAU&tsym=USD&limit=${limit}&resolution=${this.timeframe}`;
        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const json = await res.json();
            if (json.Data && Array.isArray(json.Data)) {
                this.candles = json.Data.map((b: any) => ({
                    time: b.time,
                    open: parseFloat(b.open),
                    high: parseFloat(b.high),
                    low: parseFloat(b.low),
                    close: parseFloat(b.close)
                })).sort((a: any, b: any) => a.time - b.time);
                
                console.log(`[AlphaEngine] Loaded ${this.candles.length} bars.`);
                this.detectLevels();
                this.runStrategy();
            } else {
                console.warn(`[AlphaEngine] API returned no Data.`);
            }
        } catch (e: any) {
            console.error(`[AlphaEngine] History fetch error: ${e.message}`);
        }
    }

    connectWS() {
        const url = 'wss://chrt.alphagoldx.com/ohlc/';
        this.ws = new WebSocket(url);
        this.ws.on('message', (data: any) => {
            const msg = JSON.parse(data.toString());
            if (msg.P) this.updatePrice(parseFloat(msg.P));
        });
        this.ws.on('close', () => setTimeout(() => this.connectWS(), 5000));
    }

    updatePrice(newPrice: number) {
        if (newPrice > 10000 || newPrice < 1000) return;
        this.price = newPrice;
        const now = Date.now();
        const tf = parseInt(this.timeframe) * 60000;
        const cTime = Math.floor(now / tf) * tf;
        const last = this.candles[this.candles.length - 1];

        if (!last || cTime > last.time * 1000) {
            this.candles.push({ time: cTime / 1000, open: newPrice, high: newPrice, low: newPrice, close: newPrice });
            if (this.candles.length > 1000) this.candles.shift();
            this.detectLevels();
            this.runStrategy();
        } else {
            last.high = Math.max(last.high, newPrice);
            last.low = Math.min(last.low, newPrice);
            last.close = newPrice;
        }
    }

    runStrategy() {
        const sig = this.strategy.analyze(this.candles, this.timeframe, 'N-PATTERN');
        if (sig) {
            if (this.signals.length === 0 || Math.abs(this.signals[0].time - sig.time) > 60000) {
                this.signals.unshift(sig);
            }
        }
    }

    detectLevels() {
        if (this.candles.length < 50) return;
        const range = this.strategy.getNearestLevels(this.candles, this.price);
        this.levels = [
            { type: 'RESISTANCE', price: range.resistance, time: Date.now() },
            { type: 'SUPPORT', price: range.support, time: Date.now() }
        ];
    }

    getState() {
        return { broker: 'alpha', price: this.price, timeframe: this.timeframe, candles: this.candles.slice(-300), levels: this.levels, signals: this.signals };
    }

    setTimeframe(tf: string) {
        this.timeframe = tf;
        this.candles = [];
        this.fetchHistory();
    }
}
