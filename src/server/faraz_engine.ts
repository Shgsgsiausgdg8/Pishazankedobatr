import WebSocket from 'ws';
import { TradingStrategy, Candle, Signal } from './strategy.js';

export class FarazGoldEngine {
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
        const baseUrl = 'https://demo.farazgold.com';
        const now = Math.floor(Date.now() / 1000);
        // درخواست داده‌های بیشتری برای اطمینان از محاسبات صحیح (۲۰۰۰ کندل)
        const from = now - (2000 * parseInt(this.timeframe) * 60);
        const url = `${baseUrl}/api/room/api/get-bars/?symbol=mazane&from=${from}&to=${now}&resolution=${this.timeframe}`;
        
        console.log(`[FarazEngine] Fetching history: ${url}`);
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const data = await res.json();
            
            let rawBars = [];
            if (Array.isArray(data)) rawBars = data;
            else if (data && Array.isArray(data.bars)) rawBars = data.bars;

            if (rawBars.length > 0) {
                this.candles = rawBars.map((b: any) => ({
                    time: b.time,
                    open: parseFloat(b.open || b.close),
                    high: parseFloat(b.high || b.close),
                    low: parseFloat(b.low || b.close),
                    close: parseFloat(b.close)
                })).sort((a: any, b: any) => a.time - b.time);
                
                console.log(`[FarazEngine] Loaded ${this.candles.length} bars.`);
                this.detectLevels();
                this.runStrategy();
            } else {
                console.warn(`[FarazEngine] No bars returned from API.`);
            }
        } catch (e: any) {
            console.error(`[FarazEngine] History fetch error: ${e.message}`);
        }
    }

    connectWS() {
        const wsUrl = 'wss://demo.farazgold.com/ws/';
        this.ws = new WebSocket(wsUrl);
        this.ws.on('open', () => {
            this.ws?.send(JSON.stringify({ action: 'SubAdd', subs: [`0~farazgold~mazane~gold~${this.timeframe}`] }));
        });
        this.ws.on('message', (data: any) => {
            const msg = JSON.parse(data.toString());
            if (msg.action === 'Update' && msg.data?.price) this.updatePrice(parseFloat(msg.data.price));
            if (msg.price) this.updatePrice(parseFloat(msg.price));
        });
        this.ws.on('close', () => setTimeout(() => this.connectWS(), 5000));
    }

    updatePrice(newPrice: number) {
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
                if (this.signals.length > 5) this.signals.pop();
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
        return { broker: 'faraz', price: this.price, timeframe: this.timeframe, candles: this.candles.slice(-300), levels: this.levels, signals: this.signals };
    }

    setTimeframe(tf: string) {
        this.timeframe = tf;
        this.candles = [];
        this.fetchHistory();
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'SubRemoveAll' }));
            this.ws.send(JSON.stringify({ action: 'SubAdd', subs: [`0~farazgold~mazane~gold~${this.timeframe}`] }));
        }
    }
}
