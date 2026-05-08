import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { TradingStrategy, Signal, Candle } from './strategy.js';
import { saveCandles, getCandles, getSetting, setSetting, getCandleCount } from './db.js';

export class FarazGoldEngine {
    price = 0;
    timeframe = '1'; // Default to 1m
    candles: Candle[] = [];
    levels: { type: 'SUPPORT' | 'RESISTANCE', price: number, time: number }[] = [];
    signals: Signal[] = [];
    strategy = new TradingStrategy();
    liveStrategyType = 'N-PATTERN';
    brokerName = 'فراز گلد (مظنه)';
    isEnabled = true;

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

    // Auth State
    accessToken: string | null = null;
    refreshToken: string | null = null;
    sessionId: string | null = 'njmnqc7hfkeyayowprwheqc73lvp98as';
    csrfToken: string | null = 'GTiZlvd8jNoMuko3nkjjU0lhC8m6Yy3m';
    wsConnectionId: number | null = null;  // برای جلوگیری از رویدادهای اتصال قدیمی
    ws: WebSocket | null = null;

    settingsFile = path.join(process.cwd(), 'settings.json');
    lastCandleTime = 0;
    lastLevelsUpdate = 0;

    constructor() {
        this.loadSettings();
    }

    getFullCandles() {
        return getCandles('faraz', this.timeframe, 5000);
    }

    async fetchHistory(targetDays = 2) {
        try {
            const resolution = this.timeframe || '1';
            const targetTotalCandles = Math.floor((targetDays * 24 * 60) / (parseInt(resolution) || 1));
            
            // 1. Check SQLite for available candles
            const existingCount = getCandleCount('faraz', resolution);
            
            // If we already have enough in DB, just load from DB into RAM (limited)
            if (existingCount >= targetTotalCandles) {
                const cached = getCandles('faraz', resolution, 2000); 
                if (cached && cached.length > 100) {
                    this.candles = cached;
                    this.lastCandleTime = cached[cached.length - 1].time;
                    this.detectLevels();
                    this.runStrategy();
                    console.log(`[FarazEngine] Loaded ${cached.length} candles from DB into RAM cache.`);
                    return;
                }
            }

            const baseUrl = 'https://demo.farazgold.com';
            let to = Math.floor(Date.now() / 1000);
            const barsCount = 2000;
            const timeframeSeconds = (parseInt(resolution) || 1) * 60;
            let totalFetched = 0;

            console.log(`[FarazEngine] Fetching ${targetDays} days (${targetTotalCandles} bars)...`);

            // Fetch in chunks to avoid overwhelming the provider and memory
            for (let i = 0; i < Math.ceil(targetTotalCandles / barsCount); i++) {
                const from = to - (barsCount * timeframeSeconds);
                const url = `${baseUrl}/api/room/api/get-bars/?symbol=mazane&from=${from}&to=${to}&resolution=${resolution}`;
                
                const headers: any = {
                    'accept': 'application/json, text/plain, */*',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'X-Requested-With': 'XMLHttpRequest'
                };
                if (this.accessToken) headers['authorization'] = `Bearer ${this.accessToken}`;
                if (this.sessionId) headers['cookie'] = `sessionid=${this.sessionId}; csrftoken=${this.csrfToken}`;

                const res = await fetch(url, { headers });
                if (!res.ok) {
                    console.log(`[FarazEngine] Fetch failed at chunk ${i}: ${res.status}`);
                    break;
                }

                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    const chunk = data.map((b: any) => ({
                        time: b.time > 20000000000 ? b.time : b.time * 1000,
                        open: parseFloat(b.open || b.close),
                        high: parseFloat(b.high || b.close),
                        low: parseFloat(b.low || b.close),
                        close: parseFloat(b.close)
                    }));
                    
                    saveCandles('faraz', resolution, chunk);
                    totalFetched += chunk.length;
                    to = Math.floor(data[0].time / 1000) - 1;
                    
                    if (data.length < barsCount) break; // End of history
                } else {
                    break;
                }
            }

            // Sync RAM with latest 2000 from DB
            const finalCache = getCandles('faraz', resolution, 2000);
            if (finalCache.length > 0) {
                this.candles = finalCache;
                this.lastCandleTime = this.candles[this.candles.length - 1].time;
                this.detectLevels();
                this.runStrategy();
                console.log(`[FarazEngine] Backfill complete. Total items in DB for ${resolution}m: ${getCandleCount('faraz', resolution)}`);
            }
        } catch (e: any) {
            console.error(`[FarazEngine] Error fetching history: ${e.message}`);
        }
    }

    async probeOldHistory() {
        const baseUrl = process.env.FARAZGOLD_BASEURL || 'https://demo.farazgold.com';
        const timeframe = this.timeframe === '60' ? '60' : this.timeframe;
        const paths = [`/api/room/api/get-history/`, `/api/room/get-history/`];
        for (const p of paths) {
            const url = `${baseUrl}${p}?symbol=mazane&timeframe=${timeframe}&count=300`;
            console.log(`[Engine] Probing fallback history: ${url}`);
            try {
                const res = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                        'Origin': baseUrl,
                        'Referer': `${baseUrl}/room/`
                    }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        this.candles = data.map((b: any) => ({
                            time: b.time > 20000000000 ? b.time : b.time * 1000,
                            open: parseFloat(b.open),
                            high: parseFloat(b.high),
                            low: parseFloat(b.low),
                            close: parseFloat(b.close)
                        })).sort((a, b) => a.time - b.time);
                        this.lastCandleTime = this.candles[this.candles.length - 1].time;
                        this.detectLevels();
                        this.runStrategy();
                        return;
                    }
                }
            } catch (e) { }
        }
    }

    loadHistory() {
        this.fetchHistory();
    }

    loadSettings() {
        try {
            const settings = getSetting('faraz_settings');
            if (settings) {
                this.accessToken = settings.accessToken || null;
                this.refreshToken = settings.refreshToken || null;
                this.sessionId = settings.sessionId || null;
                this.csrfToken = settings.csrfToken || null;
                if (settings.baleToken) this.baleToken = settings.baleToken;
                if (settings.baleChatId) this.baleChatId = settings.baleChatId;
                if (settings.candleConfirmations) this.candleConfirmations = settings.candleConfirmations;
                if (settings.isEnabled !== undefined) this.isEnabled = settings.isEnabled;
                if (settings.liveStrategyType) this.liveStrategyType = settings.liveStrategyType;
                if (settings.strategyConfig) this.strategy.updateConfig(settings.strategyConfig);
            }
        } catch (e) {
            console.error("Error loading settings:", e);
        }
    }

    saveSettings() {
        try {
            const settings = {
                accessToken: this.accessToken,
                refreshToken: this.refreshToken,
                sessionId: this.sessionId,
                csrfToken: this.csrfToken,
                baleToken: this.baleToken,
                baleChatId: this.baleChatId,
                candleConfirmations: this.candleConfirmations,
                isEnabled: this.isEnabled,
                liveStrategyType: this.liveStrategyType,
                strategyConfig: (this.strategy as any).config
            };
            setSetting('faraz_settings', settings);
        } catch (e) {
            console.error("Error saving settings:", e);
        }
    }

    async refreshAuthToken() {
        if (!this.refreshToken) return false;
        try {
            const baseUrl = process.env.FARAZGOLD_BASEURL || 'https://demo.farazgold.com';
            const res = await fetch(`${baseUrl}/api/User/api/token/refresh/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                },
                body: JSON.stringify({ refresh: this.refreshToken })
            });
            const data: any = await res.json();
            if (data && data.access) {
                this.accessToken = data.access;
                if (data.refresh) this.refreshToken = data.refresh;
                this.saveSettings();
                return true;
            }
        } catch (e: any) {
            console.error(`Token refresh failed: ${e.message}`);
        }
        return false;
    }

    start() {
        if (!this.isEnabled) return;
        this.connectWS();
        setInterval(() => this.refreshAuthToken(), 12 * 60 * 60 * 1000);
        setTimeout(() => this.fetchHistory(), 2000);
        setInterval(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                this.fetchPriceAPI();
            }
        }, 30000);
    }

    async connectWS() {
        if (!this.isEnabled) return;
        // جلوگیری از چند اتصال همزمان
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            console.log("[Engine] WebSocket already connecting or open, skipping...");
            return;
        }

        const baseUrl = process.env.FARAZGOLD_BASEURL || 'https://demo.farazgold.com';
        const wsUrl = 'wss://demo.farazgold.com/ws/';
        const resolution = this.timeframe;

        if (!this.sessionId || !this.csrfToken) {
            try {
                const res = await fetch(`${baseUrl}/room/`, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36' }
                });
                const text = await res.text();
                const cookie = res.headers.get('set-cookie');
                if (cookie) {
                    const sMatch = cookie.match(/sessionid=([^;]+)/);
                    if (sMatch) this.sessionId = sMatch[1];
                    const cMatch = cookie.match(/csrftoken=([^;]+)/);
                    if (cMatch) this.csrfToken = cMatch[1];
                }
                if (!this.csrfToken) {
                    const csrfMatch = text.match(/name="csrfmiddlewaretoken" value="([^"]+)"/);
                    if (csrfMatch) this.csrfToken = csrfMatch[1];
                }
            } catch (e) { }
        }

        const tokenToUse = this.accessToken || '';
        const finalWsUrl = tokenToUse ? `${wsUrl}?token=${tokenToUse}` : wsUrl;
        console.log(`[Engine] Connecting to standard WS: ${wsUrl}`);

        const options: any = {
            headers: {
                'accept-language': 'en-US,en;q=0.9,fa;q=0.8',
                'cache-control': 'no-cache',
                'pragma': 'no-cache',
                'referer': `${baseUrl}/room/`,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
                'Origin': baseUrl
            }
        };
        const cookies = [];
        if (this.sessionId) cookies.push(`sessionid=${this.sessionId}`);
        if (this.csrfToken) cookies.push(`csrftoken=${this.csrfToken}`);
        if (cookies.length > 0) options.headers['cookie'] = cookies.join('; ');
        if (this.csrfToken) options.headers['x-csrftoken'] = this.csrfToken;

        const ws: any = new WebSocket(finalWsUrl, options);
        const connectionId = Date.now();
        ws.connectionId = connectionId;
        this.ws = ws;
        this.wsConnectionId = connectionId;

        ws.on('error', (err: any) => {
            console.error(`[Engine] WebSocket Error: ${err.message}`);
        });

        ws.on('open', () => {
            if (this.ws !== ws || this.wsConnectionId !== connectionId) {
                console.log("[Engine] Ignoring open event from stale connection");
                return;
            }
            console.log("[Engine] WebSocket Connected. Subscribing...");
            ws.send(JSON.stringify({
                action: 'SubAdd',
                subs: [`0~farazgold~mazane~gold~${resolution}`]
            }));
        });

        ws.on('message', (data: any) => {
            if (this.ws !== ws || this.wsConnectionId !== connectionId) return;
            try {
                const msg = JSON.parse(data.toString());
                if (msg.action === 'Update' && msg.data?.price) {
                    this.updatePrice(parseFloat(msg.data.price));
                }
                if (msg.bars && msg.bars[this.timeframe]) {
                    const bar = msg.bars[this.timeframe];
                    this.processBar(Array.isArray(bar) ? bar[0] : bar);
                }
                if (msg.price) {
                    this.updatePrice(parseFloat(msg.price));
                }
            } catch (e) { }
        });

        ws.on('close', (code: any, reason: any) => {
            if (this.ws !== ws || this.wsConnectionId !== connectionId) return;
            console.log(`[Engine] WebSocket Closed (${code}). Reconnecting in 5s...`);
            this.ws = null;
            this.wsConnectionId = null;
            setTimeout(() => this.connectWS(), 5000);
        });
    }

    async fetchPriceAPI() {
        try {
            const res = await fetch('https://demo.farazgold.com/api/room/api/get-last-price/?symbol=mazane');
            const data: any = await res.json();
            if (data && data.price) {
                this.updatePrice(parseFloat(data.price));
            }
        } catch (e) { }
    }

    updatePrice(newPrice: number) {
        if (!newPrice || isNaN(newPrice)) return;
        this.price = newPrice;
        const now = Date.now();
        const timeframeMs = (parseInt(this.timeframe) || 1) * 60000;
        const candleTime = Math.floor(now / timeframeMs) * timeframeMs;

        if (this.candles.length === 0 || candleTime > this.lastCandleTime) {
            // Check if we already have a candle for this time (e.g. from processBar)
            const existing = this.candles.find(c => c.time === candleTime);
            if (existing) {
                existing.close = newPrice;
                existing.high = Math.max(existing.high, newPrice);
                existing.low = Math.min(existing.low, newPrice);
            } else {
                const newCandle = { time: candleTime, open: newPrice, high: newPrice, low: newPrice, close: newPrice };
                this.candles.push(newCandle);
                this.candles.sort((a, b) => a.time - b.time);
                // Reduce from 25000 to 2000
                if (this.candles.length > 2000) this.candles.shift();
            }
            this.lastCandleTime = Math.max(this.lastCandleTime, candleTime);
        } else {
            const last = this.candles[this.candles.length - 1];
            if (last && last.time === candleTime) {
                last.high = Math.max(last.high, newPrice);
                last.low = Math.min(last.low, newPrice);
                last.close = newPrice;
            }
        }

        // بروزرسانی سطوح سقف و کف به صورت لحظه‌ای با تراتل 1 ثانیه
        if (!this.lastLevelsUpdate || now - this.lastLevelsUpdate > 1000) {
            this.detectLevels();
            this.runStrategy();
            this.lastLevelsUpdate = now;
        }
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

💵 **نقطه ورود:** ${signal.entry.toLocaleString()}
🛡 **حد ضرر (SL):** ${signal.sl.toLocaleString()}

💰 **تارگت ۱:** ${signal.tp1.toLocaleString()}
💰 **تارگت ۲:** ${signal.tp2.toLocaleString()}
💰 **تارگت ۳:** ${signal.tp3.toLocaleString()}

--------------------------
🔍 **وضعیت ساختار:**
📏 سقف (Saghf): ${signal.saghf?.toLocaleString() || '---'}
📏 کف (Kaf): ${signal.kaf?.toLocaleString() || '---'}
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
            console.log(`[Notification] Signal sent to Bale.`);
        } catch (error) {
            console.error(`[Notification] Failed to send to Bale:`, error);
        }
    }

    runStrategy() {
        const signal = this.strategy.analyze(this.candles, this.timeframe, this.liveStrategyType, this.candleConfirmations);
        if (signal) {
            const lastSignal = this.signals[0];
            if (!lastSignal || lastSignal.timeframe !== signal.timeframe || Math.abs(lastSignal.time - signal.time) > 60000) {
                this.signals.unshift(signal);
                if (this.signals.length > 4) this.signals.pop();
                console.log(`[Strategy] New Signal: ${signal.type} at ${signal.entry}`);
                
                // ارسال اعلان به بله
                this.sendBaleNotification(signal);
            }
        }
    }

    processBar(bar: any) {
        if (!bar || !bar.time) return;
        let time = bar.time > 20000000000 ? bar.time : bar.time * 1000;
        
        // Normalize time to timeframe boundary to match updatePrice
        const tfMs = (parseInt(this.timeframe) || 1) * 60000;
        time = Math.floor(time / tfMs) * tfMs;

        const open = parseFloat(bar.open || bar.close);
        const high = parseFloat(bar.high || bar.close);
        const low = parseFloat(bar.low || bar.close);
        const close = parseFloat(bar.close);
        if (isNaN(close)) return;

        const existingIdx = this.candles.findIndex(c => c.time === time);
        if (existingIdx !== -1) {
            // Combine with existing instead of blind overwrite to keep tick info
            const existing = this.candles[existingIdx];
            existing.open = open;
            existing.high = Math.max(existing.high, high);
            existing.low = Math.min(existing.low, low);
            existing.close = close;
        } else {
            this.candles.push({ time, open, high, low, close });
            this.candles.sort((a, b) => a.time - b.time);
            
            // Limit to 2000 in RAM
            if (this.candles.length > 2000) this.candles.shift();
            
            this.lastCandleTime = Math.max(this.lastCandleTime, time);
            this.detectLevels();
            
            // Periodically sync to DB (e.g. at close)
            saveCandles('faraz', this.timeframe, [this.candles[this.candles.length - 1]]);
        }
        this.runStrategy(); 
    }

    detectLevels() {
        if (this.candles.length < 50) return;
        
        // استفاده از الگوریتم شناسایی هوشمند با حساسیت بالا برای سقف و کف لحظه‌ای
        const pivots = this.strategy.getSwingPivots(this.candles, 6, 2);
        
        this.levels = pivots.map(p => ({
            type: p.type === 'high' ? 'RESISTANCE' : 'SUPPORT' as 'SUPPORT' | 'RESISTANCE',
            price: p.price,
            time: p.time
        })).slice(-30);
    }

    addLevel(type: 'SUPPORT' | 'RESISTANCE', price: number, time: number) {
        const exists = this.levels.some(l => l.type === type && Math.abs(l.price - price) < 10);
        if (!exists) {
            this.levels.push({ type, price, time });
            if (this.levels.length > 50) this.levels.shift();
        }
    }

    async setTimeframe(tf: string) {
        if (this.timeframe === tf) return;
        this.timeframe = tf;
        this.candles = [];
        this.levels = [];
        this.lastCandleTime = 0;
        await this.fetchHistory();  // منتظر بارگذاری تاریخچه می‌ماند
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'SubRemoveAll' }));
            this.ws.send(JSON.stringify({ action: 'SubAdd', subs: [`0~farazgold~mazane~gold~${this.timeframe}`] }));
        } else {
            this.connectWS();
        }
    }

    getState() {
        const nPattern = this.strategy.getNPatternDrawing(this.candles);
        return {
            broker: 'faraz',
            price: this.price,
            timeframe: this.timeframe,
            liveStrategy: this.liveStrategyType,
            candles: this.candles.slice(-400), // Cap at 400 candles for the UI
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
}
