import WebSocket from "ws";
import fs from "fs";
import path from "path";
import { TradingStrategy, Signal, Candle } from "./strategy.js";

export class AlphaGoldEngine {
    price = 0;
    timeframe = "1"; 
    candles: Candle[] = [];
    signals: Signal[] = [];
    levels: { type: 'SUPPORT' | 'RESISTANCE', price: number, time?: number, hits?: number, latest?: number }[] = [];

    ws: WebSocket | null = null;
    reconnecting = false;
    lastCandleTime = 0;

    isRecording = false;
    dataFile = path.join(process.cwd(), "alpha_recorded.jsonl");

    strategy = new TradingStrategy();
    lastLevelsUpdate = 0;

    // AlphaGold Details from logs
    demoNumber = "bd466596-0007-4a11-8dc9-257e5a2c69c8";

    constructor() {
        console.log("\n[AlphaGoldEngine] Initialized - XAUUSD (Ounce Mode)");
    }

    async start() {
        console.log("[AlphaGoldEngine] Starting...");
        await this.fetchHistoricalCandles();
        this.connectWS();
        
        // Fallback: Fetch price from last candle every 15s if WS is slow
        setInterval(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                this.fetchHistoricalCandles(); 
            }
        }, 15000);

        setInterval(() => this.cleanupCandles(), 60000);
    }

    async fetchHistoricalCandles() {
        try {
            const resolution = this.timeframe; // '1', '5', '15', etc.
            const now = Math.floor(Date.now() / 1000);
            const limit = 300;
            const fromTs = now - (limit * parseInt(resolution) * 60);
            const toTs = now;

            // EXACT URL from your logs
            const url = `https://chrt.alphagoldx.com/api/data/histoday/?e=ALPHAGOLDX&fsym=XAU&tsym=USD&toTs=${toTs}&fromTs=${fromTs}&resolution=${resolution}&limit=${limit}`;
            console.log(`[AlphaEngine] Loading History (${resolution}m): ${url}`);
            
            const res = await fetch(url, {
                headers: {
                    "authority": "chrt.alphagoldx.com",
                    "accept": "*/*",
                    "accept-language": "en-US,en;q=0.9",
                    "origin": "https://light.alphagoldx.com",
                    "referer": "https://light.alphagoldx.com/",
                    "sec-ch-ua": "\"Not_A Brand\";v=\"99\", \"Google Chrome\";v=\"109\", \"Chromium\";v=\"109\"",
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": "\"Windows\"",
                    "sec-fetch-dest": "empty",
                    "sec-fetch-mode": "cors",
                    "sec-fetch-site": "same-site",
                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36"
                }
            });

            if (!res.ok) return;

            const json: any = await res.json();
            if (json && json.Response === "Success" && Array.isArray(json.Data)) {
                // Map fields exactly: time, open, high, low, close
                const rawCandles = json.Data.map((item: any) => ({
                    time: item.time,
                    open: parseFloat(item.open),
                    high: parseFloat(item.high),
                    low: parseFloat(item.low),
                    close: parseFloat(item.close)
                })).sort((a: any, b: any) => a.time - b.time);

                // Dedup and Clean
                const cleaned = [];
                const seen = new Set();
                for (const c of rawCandles) {
                    if (!seen.has(c.time) && !Number.isNaN(c.close)) {
                        cleaned.push(c);
                        seen.add(c.time);
                    }
                }

                if (cleaned.length > 0) {
                    this.candles = cleaned;
                    const last = cleaned[cleaned.length - 1];
                    this.lastCandleTime = last.time * 1000;
                    this.price = last.close;
                    this.detectLevels();
                    this.runStrategy();
                    console.log(`[AlphaEngine] Sync Complete: ${cleaned.length} candles at price ${this.price}`);
                }
            }
        } catch (err: any) {
            console.error("[AlphaEngine] Sync Error:", err.message);
        }
    }

    connectWS() {
        // EXACT WS URL from your logs
        const wsUrl = `wss://demo.alphagoldx.com/ounce/orders/?user_id=${this.demoNumber}`;

        if (this.reconnecting) return;
        this.reconnecting = true;

        console.log(`[AlphaWS] Connecting to Ounce Socket: ${wsUrl}`);

        const ws = new WebSocket(wsUrl, {
            headers: {
                "Origin": "https://alphagoldx.com",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36"
            }
        });

        ws.on("open", () => {
            console.log("[AlphaWS] Connected to Ounce Market.");
            this.ws = ws;
            this.reconnecting = false;
        });

        ws.on("message", (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                // Extract price from Ounce socket message (usually in 'price', 'P', or 'last_price')
                const p = msg.price || msg.last_price || msg.P || msg.close;
                if (p && !Number.isNaN(parseFloat(p))) {
                    this.updatePrice(parseFloat(p));
                }
            } catch (err) { }
        });

        ws.on("close", () => {
            this.ws = null;
            this.reconnecting = false;
            setTimeout(() => this.connectWS(), 5000);
        });

        ws.on("error", () => {
            this.reconnecting = false;
        });
    }

    updatePrice(newPrice: number) {
        if (!newPrice || Number.isNaN(newPrice) || newPrice > 10000) return; // Guard: Ounce is around 2k-5k, Mazane is 80k+

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

        if (now - this.lastLevelsUpdate > 10000) {
            this.detectLevels();
            this.lastLevelsUpdate = now;
        }
    }

    createNewCandle(time: number, price: number) {
        const c = { time, open: price, high: price, low: price, close: price };
        this.candles.push(c);
        if (this.candles.length > 1000) this.candles.shift();
        this.lastCandleTime = time * 1000;
        this.detectLevels();
        this.runStrategy();
        this.recordData(c);
    }

    detectLevels() {
        if (this.candles.length < 30) return;
        const lookback = 8;
        const rawLevels: any[] = [];
        for (let i = lookback; i < this.candles.length - lookback; i++) {
            const c = this.candles[i];
            let isHigh = true, isLow = true;
            for (let j = 1; j <= lookback; j++) {
                if (this.candles[i - j].high >= c.high || this.candles[i + j].high >= c.high) isHigh = false;
                if (this.candles[i - j].low <= c.low || this.candles[i + j].low <= c.low) isLow = false;
            }
            if (isHigh) rawLevels.push({ type: "RESISTANCE", price: c.high, time: c.time });
            if (isLow) rawLevels.push({ type: "SUPPORT", price: c.low, time: c.time });
        }
        const clustered: any[] = [];
        for (const lvl of rawLevels) {
            const near = clustered.find(x => x.type === lvl.type && Math.abs(x.price - lvl.price) < 0.5);
            if (!near) clustered.push({ ...lvl, hits: 1 });
            else { near.price = (near.price * near.hits + lvl.price) / (near.hits + 1); near.hits++; }
        }
        this.levels = clustered.sort((a, b) => b.hits - a.hits).slice(0, 20);
    }

    runStrategy() {
        const sig = this.strategy.analyze(this.candles, this.timeframe);
        if (!sig) return;
        const last = this.signals[0];
        if (!last || Math.abs(last.time - sig.time) > 60000) {
            this.signals.unshift(sig);
            if (this.signals.length > 10) this.signals.pop();
        }
    }

    startRecording() { this.isRecording = true; }
    stopRecording() { this.isRecording = false; }
    recordData(c: Candle) {
        if (!this.isRecording) return;
        fs.appendFileSync(this.dataFile, JSON.stringify({ ...c, recordedAt: Date.now() }) + "\n");
    }

    async setTimeframe(tf: string) {
        this.timeframe = tf;
        this.candles = [];
        this.lastCandleTime = 0;
        await this.fetchHistoricalCandles();
    }

    getState() {
        return {
            price: this.price,
            timeframe: this.timeframe,
            candles: this.candles.slice(-300),
            levels: this.levels,
            signals: this.signals,
            isRecording: this.isRecording
        };
    }

    cleanupCandles() {
        if (this.candles.length > 1500) this.candles = this.candles.slice(-800);
    }
}
