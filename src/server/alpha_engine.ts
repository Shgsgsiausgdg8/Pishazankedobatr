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

    strategy = new TradingStrategy();
    liveStrategyType = 'N-PATTERN'; 
    lastLevelsUpdate = 0;
    brokerName = 'آلفا گلد (انس جهانی)';
    isEnabled = true;
    settingsFile = path.join(process.cwd(), 'alpha_settings.json');

    // Bale Config
    baleToken: string = '1892918835:dxRdPwhkUUgmFogKzLD7B8xmygvnRKq_DOA';
    baleChatId: string = '6211548865';
    candleConfirmations = {
        legacy: true,
        salvation: true,
        nameless: true,
        engulfing: true,
        darkCloud: true
    };

    constructor() {
        console.log("\n[AlphaGoldEngine] Syncing with chrt.alphagoldx.com logic...");
        this.loadSettings();
    }

    loadSettings() {
        try {
            if (fs.existsSync(this.settingsFile)) {
                const settings = JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'));
                if (settings.baleToken) this.baleToken = settings.baleToken;
                if (settings.baleChatId) this.baleChatId = settings.baleChatId;
                if (settings.candleConfirmations) this.candleConfirmations = settings.candleConfirmations;
                if (settings.isEnabled !== undefined) this.isEnabled = settings.isEnabled;
                if (settings.liveStrategyType) this.liveStrategyType = settings.liveStrategyType;
                if (settings.strategyConfig) this.strategy.updateConfig(settings.strategyConfig);
            }
        } catch (e) {
            console.error("Error loading Alpha settings:", e);
        }
    }

    saveSettings() {
        try {
            const settings = {
                baleToken: this.baleToken,
                baleChatId: this.baleChatId,
                candleConfirmations: this.candleConfirmations,
                isEnabled: this.isEnabled,
                liveStrategyType: this.liveStrategyType,
                strategyConfig: (this.strategy as any).config
            };
            fs.writeFileSync(this.settingsFile, JSON.stringify(settings, null, 2));
        } catch (e) {
            console.error("Error saving Alpha settings:", e);
        }
    }

    async start() {
        if (!this.isEnabled) return;
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

    async fetchHistoricalCandles(targetDays = 2) {
        try {
            const fs = await import('fs');
            const path = await import('path');
            const cacheFile = path.join(process.cwd(), `alpha_history_${this.timeframe}_${targetDays}.json`);
            
            if (fs.existsSync(cacheFile)) {
                const stats = fs.statSync(cacheFile);
                if (Date.now() - stats.mtimeMs < 12 * 60 * 60 * 1000) { // Cache valid for 12 hours
                    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
                    this.candles = cached;
                    console.log(`[AlphaEngine] Loaded ${cached.length} candles from cache.`);
                    return;
                }
            }

            const resolution = this.timeframe;
            let toTs = Math.floor(Date.now() / 1000);
            const limit = 2000;
            const targetTotalCandles = Math.floor((targetDays * 24 * 60) / parseInt(resolution));
            
            let allCandles: any[] = [];
            
            console.log(`[AlphaEngine] Starting deep history fetch for ${targetDays} days (${targetTotalCandles} candles)...`);

            for (let i = 0; i < Math.ceil(targetTotalCandles / limit); i++) {
                const fromTs = toTs - (limit * parseInt(resolution) * 60);

                // Try different variants of the API
                const apiVariants = [
                    `https://chrt.alphagoldx.com/api/data/histoday/?e=ALPHAGOLDX&fsym=XAU&tsym=USD&toTs=${toTs}&fromTs=${fromTs}&resolution=${resolution}&limit=${limit}`,
                    `https://light.alphagoldx.com/api/data/histoday/?e=ALPHAGOLDX&fsym=XAU&tsym=USD&toTs=${toTs}&fromTs=${fromTs}&resolution=${resolution}&limit=${limit}`
                ];

                let json: any = null;
                for (const url of apiVariants) {
                    try {
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
                    const chunk = json.Data
                        .map((item: any) => ({
                            time: item.time > 20000000000 ? item.time : item.time * 1000,
                            open: parseFloat(item.open),
                            high: parseFloat(item.high),
                            low: parseFloat(item.low),
                            close: parseFloat(item.close)
                        }))
                        .filter((c: any) => c.close > 1000 && c.close < 10000);
                        
                    if (chunk.length === 0) break; // no more data
                    
                    allCandles = [...chunk, ...allCandles];
                    toTs = Math.floor(chunk[0].time / 1000) - 1; // move backwards
                } else {
                    break; // Request failed, stop fetching older data
                }
            }

            if (allCandles.length > 0) {
                // sort chronologically just in case
                allCandles.sort((a: any, b: any) => a.time - b.time);
                
                // Remove duplicates
                allCandles = allCandles.filter((c: any, i: number, arr: any[]) => i === 0 || c.time !== arr[i-1].time);
                
                this.candles = allCandles;
                try {
                    const fs = await import('fs');
                    fs.writeFileSync(cacheFile, JSON.stringify(allCandles));
                } catch (e) {}

                const last = this.candles[this.candles.length - 1];
                this.lastCandleTime = last.time;
                this.price = last.close;
                this.detectLevels();
                console.log(`[AlphaEngine] Loaded ${this.candles.length} clean historical candles successfully.`);
            }
        } catch (err: any) {
            console.error("[AlphaEngine] History fetch error:", err.message);
        }
    }

    connectWS() {
        if (!this.isEnabled) return;
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
        if (newPrice > 10000 || newPrice < 1000) {
            return;
        }

        this.price = newPrice;

        const now = Date.now();
        const tf = (parseInt(this.timeframe) || 1) * 60000;
        const cTime = Math.floor(now / tf) * tf;

        if (this.candles.length === 0) {
            this.createNewCandle(cTime, newPrice);
            return;
        }

        // Optimization: Only check the last few candles, not 50,000!
        const lastIndex = this.candles.length - 1;
        let found = false;
        for (let i = lastIndex; i >= Math.max(0, lastIndex - 5); i--) {
            if (this.candles[i].time === cTime) {
                this.candles[i].high = Math.max(this.candles[i].high, newPrice);
                this.candles[i].low = Math.min(this.candles[i].low, newPrice);
                this.candles[i].close = newPrice;
                found = true;
                break;
            }
        }

        if (!found) {
            if (cTime > this.candles[lastIndex].time) {
                this.createNewCandle(cTime, newPrice);
            }
        }

        if (now - this.lastLevelsUpdate > 1000) {
            this.detectLevels();
            this.runStrategy(); 
            this.lastLevelsUpdate = now;
        }
    }

    createNewCandle(time: number, price: number) {
        const c = { time, open: price, high: price, low: price, close: price };
        this.candles.push(c);
        if (this.candles.length > 50000) this.candles.shift();
        this.lastCandleTime = time;
        this.detectLevels();
        this.runStrategy();
    }

    detectLevels() {
        if (this.candles.length < 50) return;
        
        // استفاده از الگوریتم شناسایی هوشمند با حساسیت بالا برای سقف و کف لحظه‌ای
        const pivots = this.strategy.getSwingPivots(this.candles, 6, 2);
        
        this.levels = pivots.map(p => ({
            type: (p.type === 'high' ? 'RESISTANCE' : 'SUPPORT') as 'SUPPORT' | 'RESISTANCE',
            price: p.price,
            time: p.time,
            hits: 1,
            pivots: pivots // کل پیوت‌ها را برای ترسیم خطوط N می‌فرستیم
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

    private async sendBaleNotification(signal: Signal) {
        const botToken = this.baleToken;
        const chatId = this.baleChatId;
        const url = `https://tapi.bale.ai/bot${botToken}/sendMessage`;

        const date = new Date(signal.time).toLocaleDateString('fa-IR');
        const time = new Date(signal.time).toLocaleTimeString('fa-IR');
        
        const strategyNames: Record<string, string> = {
            'N-PATTERN': 'الگوی N',
            'FIB-38': 'فیبوناتچی ۳۸٪',
            'STRATEGY_3': 'استراتژی فراز',
            'STRATEGY_4': 'استراتژی چهارم'
        };

        const message = `
🌟 **سیگنال جدید ربات فراز گلد** 🌟

📊 **بازار:** ${this.brokerName}
📌 **استراتژی:** ${strategyNames[this.liveStrategyType] || this.liveStrategyType}
🕒 **زمان:** ${time}
📅 **تاریخ:** ${date}
⏳ **تایم‌فریم:** ${signal.timeframe}m

🛑 **نوع معامله:** ${signal.type === 'BUY' ? 'خرید (BUY) 🟢' : 'فروش (SELL) 🔴'}
🎯 **اطمینان:** ${signal.confidence || 99}%

💵 **نقطه ورود:** ${signal.entry.toFixed(2)}
🛡 **حد ضرر (SL):** ${signal.sl.toFixed(2)}

💰 **تارگت ۱:** ${signal.tp1.toFixed(2)}
💰 **تارگت ۲:** ${signal.tp2.toFixed(2)}
💰 **تارگت ۳:** ${signal.tp3.toFixed(2)}

--------------------------
🔍 **وضعیت ساختار:**
📏 سقف (Saghf): ${signal.saghf?.toFixed(2) || '---'}
📏 کف (Kaf): ${signal.kaf?.toFixed(2) || '---'}
--------------------------
⚠️ مدیریت سرمایه فراموش نشود!
`;

        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: parseInt(chatId),
                    text: message
                })
            });
            console.log(`[Notification-Alpha] Signal sent to Bale.`);
        } catch (error) {
            console.error(`[Notification-Alpha] Failed to send to Bale:`, error);
        }
    }

    runStrategy() {
        const sig = this.strategy.analyze(this.candles, this.timeframe, this.liveStrategyType, this.candleConfirmations);
        if (!sig) return;
        const last = this.signals[0];
        if (!last || Math.abs(last.time - sig.time) > 60000) {
            this.signals.unshift(sig);
            if (this.signals.length > 20) this.signals.pop();
            
            // ارسال به بله
            this.sendBaleNotification(sig);
            if (this.onSignalCallback) this.onSignalCallback(sig);
        }
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
        const nPattern = this.strategy.getNPatternDrawing(this.candles);
        return {
            broker: 'alpha', // Explicitly include broker name in state
            price: this.price,
            timeframe: this.timeframe,
            liveStrategy: this.liveStrategyType,
            candles: this.candles.slice(-400), // Cap at 400 for UI performance
            levels: this.levels,
            signals: this.signals,
            totalCandles: this.candles.length,
            nPattern: nPattern,
            baleToken: this.baleToken,
            baleChatId: this.baleChatId,
            candleConfirmations: this.candleConfirmations,
            isEnabled: this.isEnabled,
            strategyConfig: (this.strategy as any).config
        };
    }

    setStrategyConfig(config: any) {
        this.strategy.updateConfig(config);
        this.saveSettings();
    }

    updateBaleConfig(token: string, chatId: string) {
        this.baleToken = token;
        this.baleChatId = chatId;
        this.saveSettings();
    }

    onSignalCallback: ((signal: Signal) => void) | null = null;
    onSignal(callback: (signal: Signal) => void) {
        this.onSignalCallback = callback;
    }

    cleanupCandles() {
        if (this.candles.length > 60000) this.candles = this.candles.slice(-50000);
    }
}
