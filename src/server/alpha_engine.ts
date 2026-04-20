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

    // Throttle for detectLevels (ms)
    lastLevelsUpdate = 0;

    constructor() {
        console.log("\n[AlphaGoldEngine] Initialized - XAUUSD (Ounce)");
    }

    // -----------------------------------------------------
    //                 START ENGINE
    // -----------------------------------------------------
    async start() {
        console.log("[AlphaGoldEngine] Starting engine...");
        // ابتدا دیتای تاریخی را بر اساس تایم‌فریم فعلی می‌گیریم
        await this.fetchHistoricalCandles();
        // سپس WebSocket را برای دیتای لحظه‌ای وصل می‌کنیم
        this.connectWS();

        // Fallback REST every 30 sec if WS disconnected
        setInterval(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                this.fetchPriceAPI();
            }
        }, 30000);

        setInterval(() => this.cleanupCandles(), 60000);
    }

    // -----------------------------------------------------
    //         FETCH HISTORICAL CANDLES (AlphaGoldX API)
    // -----------------------------------------------------
    async fetchHistoricalCandles() {
        try {
            const resolution = parseInt(this.timeframe) || 1;
            // محاسبه timestamps: 500 کندل قبلی
            const now = Math.floor(Date.now() / 1000);
            const limit = 500;
            const fromTs = now - (limit * resolution * 60);
            const toTs = now;

            const url = `https://chrt.alphagoldx.com/api/data/histoday/?e=ALPHAGOLDX&fsym=XAU&tsym=USD&toTs=${toTs}&fromTs=${fromTs}&resolution=${resolution}&limit=${limit}`;
            console.log(`[AlphaEngine] Fetching history: ${url}`);

            const res = await fetch(url, {
                headers: {
                    "accept": "*/*",
                    "origin": "https://light.alphagoldx.com",
                    "referer": "https://light.alphagoldx.com/",
                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36"
                }
            });

            if (!res.ok) {
                console.error(`[AlphaEngine] History API error: ${res.status}`);
                return;
            }

            const json: any = await res.json();
            if (json && json.Data && Array.isArray(json.Data)) {
                const rawCandles = json.Data.map((item: any) => ({
                    time: item.time,
                    open: item.open,
                    high: item.high,
                    low: item.low,
                    close: item.close
                })).sort((a: any, b: any) => a.time - b.time);

                // Filter duplicates by timestamp
                const newCandles = [];
                const seenTimes = new Set();
                for (const c of rawCandles) {
                    if (!seenTimes.has(c.time)) {
                        newCandles.push(c);
                        seenTimes.add(c.time);
                    }
                }

                if (newCandles.length > 0) {
                    this.candles = newCandles;
                    this.lastCandleTime = this.candles[this.candles.length - 1].time * 1000;
                    this.detectLevels();
                    console.log(`[AlphaEngine] Loaded ${this.candles.length} historical candles (${resolution}m)`);
                }
            } else {
                console.warn("[AlphaEngine] No historical data received");
            }
        } catch (err: any) {
            console.error("[AlphaEngine] History fetch error:", err.message);
        }
    }

    // -----------------------------------------------------
    //                   CONNECT WS (Real-time)
    // -----------------------------------------------------
    connectWS() {
        const url = "wss://chrt.alphagoldx.com/ohlc/";

        if (this.reconnecting) return;
        this.reconnecting = true;

        console.log(`[AlphaWS] Connecting → ${url}`);

        const ws = new WebSocket(url, {
            headers: {
                "Origin": "https://light.alphagoldx.com",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
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
                const p = msg.P || msg.p || msg.price;
                if (p) this.updatePrice(parseFloat(p));
            } catch (err) {
                // ignore
            }
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

    // -----------------------------------------------------
    //                  REST FALLBACK
    // -----------------------------------------------------
    async fetchPriceAPI() {
        try {
            const res = await fetch("https://chrt.alphagoldx.com/api/data/v3/all/exchanges/");
            const json: any = await res.json();
            const p = json.Data?.ALPHAGOLDX?.pairs?.XAUUSD?.price ??
                      json.Data?.ALPHAGOLDX?.pairs?.XAUUSD?.last;
            if (p) this.updatePrice(parseFloat(p));
        } catch (e) {
            // silent
        }
    }

    // -----------------------------------------------------
    //               PRICE → CANDLE BUILDER
    // -----------------------------------------------------
    updatePrice(newPrice: number) {
        if (!newPrice || Number.isNaN(newPrice)) return;

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

        // Throttled level detection (every 10 seconds)
        if (now - this.lastLevelsUpdate > 10000) {
            this.detectLevels();
            this.lastLevelsUpdate = now;
        }
    }

    createNewCandle(time: number, price: number) {
        const c = {
            time,
            open: price,
            high: price,
            low: price,
            close: price
        };

        this.candles.push(c);
        if (this.candles.length > 2000) this.candles.shift();

        this.lastCandleTime = time * 1000;

        this.detectLevels();
        this.runStrategy();
        this.recordData(c);
    }

    // =====================================================
    //   SUPPORT & RESISTANCE – FIXED (ATR + CLUSTERING)
    // =====================================================
    detectLevels() {
        if (this.candles.length < 30) return;

        const candles = this.candles;
        const lookback = 8;
        const atr = this.calcATR(14) || 2.0;
        const minDistance = Math.max(atr * 0.6, 0.5);   // فاصله خوشه‌بندی بهینه

        const rawLevels: { type: 'SUPPORT' | 'RESISTANCE', price: number, time: number }[] = [];

        for (let i = lookback; i < candles.length - lookback; i++) {
            const c = candles[i];
            let isHigh = true, isLow = true;
            for (let j = 1; j <= lookback; j++) {
                if (candles[i - j].high >= c.high || candles[i + j].high >= c.high) isHigh = false;
                if (candles[i - j].low <= c.low || candles[i + j].low <= c.low) isLow = false;
            }
            if (isHigh) rawLevels.push({ type: "RESISTANCE", price: c.high, time: c.time });
            if (isLow) rawLevels.push({ type: "SUPPORT", price: c.low, time: c.time });
        }

        // خوشه‌بندی
        const clustered: { type: 'SUPPORT' | 'RESISTANCE', price: number, hits: number, latest: number }[] = [];
        for (const lvl of rawLevels) {
            const near = clustered.find(
                x => x.type === lvl.type && Math.abs(x.price - lvl.price) < minDistance
            );
            if (!near) {
                clustered.push({
                    type: lvl.type,
                    price: lvl.price,
                    hits: 1,
                    latest: lvl.time
                });
            } else {
                near.price = (near.price * near.hits + lvl.price) / (near.hits + 1);
                near.hits++;
                near.latest = lvl.time;
            }
        }

        // نمایش همه سطح‌ها (بدون شرط hits>=2) و مرتب‌سازی بر اساس hits
        this.levels = clustered
            .sort((a, b) => b.hits - a.hits)
            .slice(0, 40);
    }

    calcATR(period = 14) {
        if (this.candles.length < period + 2) return 0;
        let sum = 0;
        for (let i = 1; i <= period; i++) {
            const c = this.candles[this.candles.length - i];
            const p = this.candles[this.candles.length - i - 1];
            const tr = Math.max(
                c.high - c.low,
                Math.abs(c.high - p.close),
                Math.abs(c.low - p.close)
            );
            sum += tr;
        }
        return sum / period;
    }

    // -----------------------------------------------------
    //                   STRATEGY EXEC (N Pattern)
    // -----------------------------------------------------
    runStrategy() {
        const sig = this.strategy.analyze(this.candles, this.timeframe);
        if (!sig) return;

        const last = this.signals[0];
        if (!last || Math.abs(last.time - sig.time) > 60000) {
            this.signals.unshift(sig);
            if (this.signals.length > 20) this.signals.pop();
            console.log(`[AlphaSignal] ${sig.type} @ ${sig.entry}`);
        }
    }

    // -----------------------------------------------------
    //                     RECORDER
    // -----------------------------------------------------
    startRecording() {
        this.isRecording = true;
        console.log("[AlphaRecorder] Started");
    }
    stopRecording() {
        this.isRecording = false;
        console.log("[AlphaRecorder] Stopped");
    }
    recordData(c: Candle) {
        if (!this.isRecording) return;
        fs.appendFileSync(
            this.dataFile,
            JSON.stringify({ ...c, recordedAt: Date.now() }) + "\n"
        );
    }

    // -----------------------------------------------------
    //                CHANGE TIMEFRAME (با ریست کامل)
    // -----------------------------------------------------
    async setTimeframe(tf: string) {
        if (this.timeframe === tf) return;
        console.log(`[AlphaEngine] Timeframe → ${tf}`);
        this.timeframe = tf;
        this.candles = [];
        this.levels = [];
        this.signals = [];
        this.lastCandleTime = 0;
        // بارگذاری مجدد دیتای تاریخی با تایم‌فریم جدید
        await this.fetchHistoricalCandles();
    }

    // -----------------------------------------------------
    //                     EXPORT STATE
    // -----------------------------------------------------
    getState() {
        return {
            price: this.price,
            timeframe: this.timeframe,
            candles: this.candles.slice(-600),
            levels: this.levels,
            signals: this.signals,
            isRecording: this.isRecording
        };
    }

    cleanupCandles() {
        if (this.candles.length > 1500) {
            this.candles = this.candles.slice(-800);
        }
    }
}
