import WebSocket from "ws";
import fs from "fs";
import path from "path";
import { TradingStrategy, Signal, Candle } from "./strategy.js";
import { saveCandles, getCandles, getSetting, setSetting, getCandleCount } from './db.js';

export class AlphaGoldEngine {
    price = 0;
    timeframe = "1"; // minutes
    candles: Candle[] = [];
    signals: Signal[] = [];
    signalBaleIds = new Map<Signal, number>();
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
            const settings = getSetting('alpha_settings');
            if (settings) {
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
            setSetting('alpha_settings', settings);
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

    getFullCandles() {
        return getCandles('alpha', this.timeframe, 5000);
    }

    async fetchHistoricalCandles(targetDays = 2) {
        try {
            const resolution = this.timeframe || '1';
            const targetTotalCandles = Math.floor((targetDays * 24 * 60) / (parseInt(resolution) || 1));
            
            // 1. Check SQLite
            const existingCount = getCandleCount('alpha', resolution);
            
            if (existingCount >= targetTotalCandles) {
                const cached = getCandles('alpha', resolution, 2000);
                if (cached && cached.length > 100) {
                    this.candles = cached;
                    this.lastCandleTime = cached[cached.length - 1].time;
                    this.price = cached[cached.length - 1].close;
                    console.log(`[AlphaEngine] Loaded ${cached.length} candles from DB cache.`);
                    return;
                }
            }

            let toTs = Math.floor(Date.now() / 1000);
            const limit = 2000;
            let totalFetched = 0;
            
            console.log(`[AlphaEngine] Deep history fetch: ${targetDays} days (${targetTotalCandles} bars)...`);

            for (let i = 0; i < Math.ceil(targetTotalCandles / limit); i++) {
                const fromTs = toTs - (limit * (parseInt(resolution) || 1) * 60);
                const baseUrl = "https://chrt.alphagoldx.com";
                const url = `${baseUrl}/api/data/histoday/?e=ALPHAGOLDX&fsym=XAU&tsym=USD&toTs=${toTs}&fromTs=${fromTs}&resolution=${resolution}&limit=${limit}`;

                const res = await fetch(url, {
                    headers: {
                        "accept": "application/json, text/plain, */*",
                        "user-agent": "Mozilla/5.0"
                    }
                });
                
                if (!res.ok) break;
                const json: any = await res.json();
                
                if (json && json.Data && Array.isArray(json.Data) && json.Data.length > 0) {
                    const chunk = json.Data.map((item: any) => ({
                        time: item.time > 20000000000 ? item.time : item.time * 1000,
                        open: parseFloat(item.open),
                        high: parseFloat(item.high),
                        low: parseFloat(item.low),
                        close: parseFloat(item.close)
                    })).filter((c: any) => c.close > 1000);
                        
                    if (chunk.length === 0) break;
                    
                    saveCandles('alpha', resolution, chunk);
                    totalFetched += chunk.length;
                    toTs = Math.floor(chunk[0].time / 1000) - 1;
                    if (json.Data.length < limit) break;
                } else {
                    break;
                }
            }

            const finalCache = getCandles('alpha', resolution, 2000);
            if (finalCache.length > 0) {
                this.candles = finalCache;
                this.lastCandleTime = this.candles[this.candles.length - 1].time;
                this.price = this.candles[this.candles.length - 1].close;
                this.detectLevels();
                console.log(`[AlphaEngine] Backfill complete. Total in DB: ${getCandleCount('alpha', resolution)}`);
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
        if (this.candles.length > 2000) this.candles.shift();
        this.lastCandleTime = time;
        this.detectLevels();
        this.runStrategy();
        
        saveCandles('alpha', this.timeframe, [c]); // Save latest to DB
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

    private async sendBaleNotification(signal: Signal): Promise<number | null> {
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
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: parseInt(chatId),
                    text: message
                })
            });
            if (res.ok) {
                const json: any = await res.json();
                console.log(`[Notification-Alpha] Signal sent to Bale.`);
                return json.result?.message_id || null;
            } else {
                console.error(`[Notification-Alpha] Bale response error: ${res.statusText}`);
                return null;
            }
        } catch (error: any) {
            const isNetworkError = error.message.includes('EAI_AGAIN') || error.message.includes('fetch failed');
            if (isNetworkError) {
                console.warn(`[Notification-Alpha] Bale server temporarily unreachable (Network error).`);
            } else {
                console.error(`[Notification-Alpha] Failed to send to Bale:`, error.message);
            }
            return null;
        }
    }

    async runStrategy() {
        const sig = this.strategy.analyze(this.candles, this.timeframe, this.liveStrategyType, this.candleConfirmations);
        if (!sig) return;
        const last = this.signals[0];
        if (!last || Math.abs(last.time - sig.time) > 60000) {
            this.signals.unshift(sig);
            if (this.signals.length > 20) this.signals.pop();
            
            // ارسال به بله و ذخیره آیدی پیام
            const msgId = await this.sendBaleNotification(sig);
            if (msgId) {
                this.signalBaleIds.set(sig, msgId);
            }
            if (this.onSignalCallback) this.onSignalCallback(sig, msgId || undefined);
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

    onSignalCallback: ((signal: Signal, baleMessageId?: number) => void) | null = null;
    onSignal(callback: (signal: Signal, baleMessageId?: number) => void) {
        this.onSignalCallback = callback;
    }

    cleanupCandles() {
        if (this.candles.length > 2000) this.candles = this.candles.slice(-2000);
    }
}
