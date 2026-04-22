import WebSocket from "ws";
import fs from "fs";
import path from "path";
import { TradingStrategy, Signal, Candle } from "./strategy.js";

export class AlphaGoldEngine {
    price = 0;
    timeframe = "1"; // minutes
    candles: Candle[] = [];
    signals: Signal[] = [];
    levels: { type: 'SUPPORT' | 'RESISTANCE', price: number, time?: number, hits?: number, latest?: number }[] = [];

    ws: WebSocket | null = null;
    reconnecting = false;
    lastCandleTime = 0;

    isRecording = false;
    dataFile = path.join(process.cwd(), "alpha_recorded.jsonl");

    strategy = new TradingStrategy();
    liveStrategyType = 'SCALP-ADV'; 
    lastLevelsUpdate = 0;

    constructor() {
        console.log("\n[AlphaGoldEngine] Syncing with chrt.alphagoldx.com logic...");
    }

    async start() {
        console.log("[AlphaGoldEngine] Starting engine...");
        await this.fetchHistoricalCandles();
        this.connectWS();

        // Fallback REST every 30 sec
        setInterval(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                this.fetchPriceAPI();
            }
        }, 30000);

        setInterval(() => this.cleanupCandles(), 60000);
    }

    async fetchHistoricalCandles() {
        try {
            const resolution = this.timeframe;
            const now = Math.floor(Date.now() / 1000);
            const limit = 2000;
            const fromTs = now - (limit * parseInt(resolution) * 60);
            const toTs = now;

            // Try different variants of the API
            const apiVariants = [
                `https://chrt.alphagoldx.com/api/data/histoday/?e=ALPHAGOLDX&fsym=XAU&tsym=USD&toTs=${toTs}&fromTs=${fromTs}&resolution=${resolution}&limit=${limit}`,
                `https://light.alphagoldx.com/api/data/histoday/?e=ALPHAGOLDX&fsym=XAU&tsym=USD&toTs=${toTs}&fromTs=${fromTs}&resolution=${resolution}&limit=${limit}`
            ];

            let json: any = null;
            for (const url of apiVariants) {
                try {
                    console.log(`[AlphaEngine] Trying history fetch: ${url}`);
                    const res = await fetch(url, {
                        headers: {
                            "accept": "application/json, text/plain, */*",
                            "origin": "https://light.alphagoldx.com",
                            "referer": "https://light.alphagoldx.com/",
                            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                        }
                    });
                    
                    const text = await res.text();
                    if (text.startsWith('{')) {
                        json = JSON.parse(text);
                        if (json.Data) break;
                    }
                } catch (e) { }
            }
            
            if (json && json.Data && Array.isArray(json.Data)) {
                // IMPORTANT: Filter out any Mazane data (above 10k) that might be in the history API
                const rawCandles = json.Data
                    .map((item: any) => ({
                        time: item.time,
                        open: parseFloat(item.open),
                        high: parseFloat(item.high),
                        low: parseFloat(item.low),
                        close: parseFloat(item.close)
                    }))
                    .filter((c: any) => c.close > 1000 && c.close < 10000)
                    .sort((a: any, b: any) => a.time - b.time);

                if (rawCandles.length > 0) {
                    this.candles = rawCandles;
                    const last = this.candles[this.candles.length - 1];
                    this.lastCandleTime = last.time * 1000;
                    this.price = last.close;
                    this.detectLevels();
                    console.log(`[AlphaEngine] Loaded ${this.candles.length} clean historical candles`);
                }
            }
        } catch (err: any) {
            console.error("[AlphaEngine] History fetch error:", err.message);
        }
    }

    connectWS() {
        // EXACT URL from your provided file
        const url = "wss://chrt.alphagoldx.com/ohlc/";

        if (this.reconnecting) return;
        this.reconnecting = true;

        console.log(`[AlphaWS] Connecting to: ${url}`);

        const ws = new WebSocket(url, {
            headers: {
                "Origin": "https://light.alphagoldx.com",
                "User-Agent": "Mozilla/5.0",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache"
            }
        });

        ws.on("open", () => {
            console.log("[AlphaWS] Connected.");
            this.ws = ws;
            this.reconnecting = false;
        });

        ws.on("message", (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                // EXACT key from your provided file: 'P'
                if (msg.P) {
                    this.updatePrice(parseFloat(msg.P));
                }
            } catch (err) { }
        });

        ws.on("close", () => {
            console.log("[AlphaWS] Closed → Reconnecting...");
            this.ws = null;
            this.reconnecting = false;
            setTimeout(() => this.connectWS(), 5000);
        });

        ws.on("error", (err) => {
            console.log("[AlphaWS] Error:", err.message);
            this.reconnecting = false;
        });
    }

    async fetchPriceAPI() {
        try {
            const res = await fetch("https://chrt.alphagoldx.com/api/data/v3/all/exchanges/");
            const json: any = await res.json();
            const p = json.Data?.ALPHAGOLDX?.pairs?.XAUUSD?.price ??
                      json.Data?.ALPHAGOLDX?.pairs?.XAUUSD?.last;
            if (p) this.updatePrice(parseFloat(p));
        } catch (e) { }
    }

    updatePrice(newPrice: number) {
        if (!newPrice || Number.isNaN(newPrice)) return;
        
        // STRICT PRICE GUARD: Alpha Ounce must be between 1000 and 10000.
        // Mazane (80k+) is rejected to prevent chart scale jumping.
        if (newPrice > 10000 || newPrice < 1000) {
            return;
        }

        this.price = newPrice;

        const now = Date.now();
        const tf = (parseInt(this.timeframe) || 1) * 60000;
        const cTime = Math.floor(now / tf) * tf;
        const sec = Math.floor(cTime / 1000);

        if (this.candles.length === 0) {
            this.createNewCandle(sec, newPrice);
            return;
        }

        const last = this.candles[this.candles.length - 1];

        if (sec > last.time) {
            this.createNewCandle(sec, newPrice);
        } else {
            last.high = Math.max(last.high, newPrice);
            last.low = Math.min(last.low, newPrice);
            last.close = newPrice;
        }

        if (now - this.lastLevelsUpdate > 2000) {
            this.detectLevels();
            this.lastLevelsUpdate = now;
        }
    }

    createNewCandle(time: number, price: number) {
        const c = { time, open: price, high: price, low: price, close: price };
        this.candles.push(c);
        if (this.candles.length > 2000) this.candles.shift();
        this.lastCandleTime = time * 1000;
        this.detectLevels();
        this.runStrategy();
        this.recordData(c);
    }

    detectLevels() {
        if (this.candles.length < 50) return;
        
        // استفاده از الگوریتم شناسایی هوشمند با حساسیت بالا برای سقف و کف لحظه‌ای
        const pivots = this.strategy.getSwingPivots(this.candles, 6, 2);
        
        this.levels = pivots.map(p => ({
            type: (p.type === 'high' ? 'RESISTANCE' : 'SUPPORT') as 'SUPPORT' | 'RESISTANCE',
            price: p.price,
            time: p.time,
            hits: 1 
        })).slice(-30);
    }

    calcATR(period = 14) {
        if (this.candles.length < period + 2) return 0;
        let sum = 0;
        for (let i = 1; i <= period; i++) {
            const c = this.candles[this.candles.length - i];
            const p = this.candles[this.candles.length - i - 1];
            const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
            sum += tr;
        }
        return sum / period;
    }

    runStrategy() {
        const sig = this.strategy.analyze(this.candles, this.timeframe, this.liveStrategyType);
        if (!sig) return;
        const last = this.signals[0];
        if (!last || Math.abs(last.time - sig.time) > 60000) {
            this.signals.unshift(sig);
            if (this.signals.length > 20) this.signals.pop();
        }
    }

    startRecording() { this.isRecording = true; }
    stopRecording() { this.isRecording = false; }
    recordData(c: any) {
        if (!this.isRecording) return;
        fs.appendFileSync(this.dataFile, JSON.stringify({ ...c, recordedAt: Date.now() }) + "\n");
    }

    async setTimeframe(tf: string) {
        if (this.timeframe === tf) return;
        this.timeframe = tf;
        this.candles = [];
        this.levels = [];
        this.signals = [];
        this.lastCandleTime = 0;
        await this.fetchHistoricalCandles();
    }

    getState() {
        return {
            broker: 'alpha', // Explicitly include broker name in state
            price: this.price,
            timeframe: this.timeframe,
            liveStrategy: this.liveStrategyType,
            candles: this.candles.slice(-400), // Cap at 400 for UI performance
            levels: this.levels,
            signals: this.signals,
            isRecording: this.isRecording
        };
    }

    cleanupCandles() {
        if (this.candles.length > 3000) this.candles = this.candles.slice(-2000);
    }
}
