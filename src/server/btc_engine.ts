import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { TradingStrategy, Signal, Candle } from './strategy.js';
import { saveCandles, getCandles, getSetting, setSetting, getCandleCount } from './db.js';

export class BtcEngine {
    price = 0;
    timeframe = '1';
    candles: Candle[] = [];
    signals: Signal[] = [];
    levels: any[] = [];
    
    ws: WebSocket | null = null;
    strategy = new TradingStrategy();
    liveStrategyType = 'N-PATTERN';
    brokerName = 'بیتکوین (BTCUSDT)';
    isEnabled = true;
    chartSource: 'faraz' | 'trendo' = 'faraz';
    lastLevelsUpdate: number = 0;
    
    onSignalCallback: ((sig: Signal, msgId?: number) => void) | null = null;
    
    trendoOffsetApplied: boolean = false;
    
    // Auth & Settings
    currentToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OWVjMDg4Nzk1N2EyZjBlZTQzOTFkMjQiLCJjcmVkaXQiOjE3Nzg4NTgyMzMxMDksImFjdGl2ZSI6dHJ1ZSwicm9sZSI6ImN1c3RvbWVyIiwibGFzdFVwZGF0ZVRpbWUiOjE3Nzg3NzE4NTAwNjYsImlhdCI6MTc3ODc3MTg1MCwiZXhwIjoxNzc4Nzc5MDUwfQ.e3YSHrGw8BSMaBkRuZfWYNUCVvlxxWprOUxoOlOcTvM";
    farazSession = "s%3AqtLAXqstFZBfc3FbaqL8tuT-l0FKkzYx.Q83hKwWdAyyYVt3BNxadSXhoIvXy%2BWZDkQ5Pr0svnkI";
    baleToken = "1892918835:dxRdPwhkUUgmFogKzLD7B8xmygvnRKq_DOA";
    baleChatId = "6211548865";
    candleConfirmations = {
        legacy: true,
        salvation: true,
        nameless: true,
        engulfing: true,
        darkCloud: true
    };
    
    private refreshTimer: NodeJS.Timeout | null = null;
    
    pingInterval: NodeJS.Timeout | null = null;
    
    settingsFile = path.join(process.cwd(), 'btc_settings.json');

    constructor() {
        this.loadSettings();
    }

    scheduleTokenRefresh() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
        
        if (!this.currentToken) return;
        
        try {
            const parts = this.currentToken.split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
                if (payload && payload.exp) {
                    const expiresAtMs = payload.exp * 1000;
                    const now = Date.now();
                    const refreshTime = expiresAtMs - (5 * 60 * 1000); // 5 minutes before expiration
                    const delay = refreshTime - now;
                    
                    if (delay > 0) {
                        console.log(`[BTCEngine] Token will expire at ${new Date(expiresAtMs).toLocaleString()}. Scheduling refresh in ${Math.round(delay / 60000)} minutes.`);
                        this.refreshTimer = setTimeout(() => {
                            this.refreshFarazToken();
                        }, delay);
                    } else {
                        console.log(`[BTCEngine] Token is already expired or close to expiration. Refreshing now.`);
                        this.refreshFarazToken();
                    }
                }
            }
        } catch (e) {
            console.error("[BTCEngine] Failed to parse JWT token for refresh scheduling: ", e);
        }
    }

    async refreshFarazToken() {
        if (!this.currentToken || !this.farazSession) return;
        try {
            console.log("[BTCEngine] Attempting to refresh faraz token...");
            const url = 'https://faraz.io/api/public/authentication/me';
            const headers: any = {
                'accept': 'application/json, text/plain, */*',
                'cookie': `x-access-token=${this.currentToken}; farazSession=${this.farazSession}`
            };

            const res = await fetch(url, { headers });
            if (res.ok) {
                const data: any = await res.json();
                if (data && data.token) {
                    this.currentToken = data.token;
                    this.saveSettings();
                    console.log("[BTCEngine] Successfully refreshed Faraz token.");
                    this.scheduleTokenRefresh(); // Schedule the next refresh
                }
            } else {
                console.error(`[BTCEngine] Failed to refresh token: status ${res.status}`);
            }
        } catch (e: any) {
            console.error(`[BTCEngine] Error refreshing Faraz token: ${e.message}`);
        }
    }

    loadSettings() {
        try {
            const s = getSetting('btc_settings');
            if (s) {
                if (s.baleToken) this.baleToken = s.baleToken;
                if (s.baleChatId) this.baleChatId = s.baleChatId;
                if (s.currentToken) this.currentToken = s.currentToken;
                if (s.farazSession) this.farazSession = s.farazSession;
                if (s.candleConfirmations) this.candleConfirmations = s.candleConfirmations;
                if (s.isEnabled !== undefined) this.isEnabled = s.isEnabled;
                if (s.chartSource !== undefined) this.chartSource = s.chartSource;
                if (s.liveStrategyType) this.liveStrategyType = s.liveStrategyType;
                if (s.strategyConfig) this.strategy.updateConfig(s.strategyConfig);
            }
        } catch (e) {}
    }

    saveSettings() {
        try {
            const s = {
                baleToken: this.baleToken,
                baleChatId: this.baleChatId,
                currentToken: this.currentToken,
                farazSession: this.farazSession,
                candleConfirmations: this.candleConfirmations,
                isEnabled: this.isEnabled,
                chartSource: this.chartSource,
                liveStrategyType: this.liveStrategyType,
                strategyConfig: (this.strategy as any).config
            };
            setSetting('btc_settings', s);
        } catch (e) {}
    }

    async start() {
        if (!this.isEnabled) return;
        this.scheduleTokenRefresh();
        
        // Always fetch history initially so we have past candles for calculating pivots/structures
        await this.fetchHistory();
        
        if (this.chartSource === 'faraz') {
            this.connectWS();
        } else {
            console.log("[BTCEngine] Started with Trendo as source. History loaded from Faraz, awaiting live ticks...");
        }
    }

    getFullCandles() {
        return getCandles('btc', this.timeframe, 5000);
    }

    async fetchHistory(targetDays = 2) {
        try {
            const resolution = this.timeframe || '1';
            const targetTotalCandles = Math.floor((targetDays * 24 * 60) / (parseInt(resolution) || 1));
            
            // Check SQLite first
            const existingCount = getCandleCount('btc', resolution);
            let needsNetworkFetch = true;
            
            if (existingCount >= targetTotalCandles) {
                const cached = getCandles('btc', resolution, 2000);
                if (cached && cached.length > 100) {
                    const lastCandleTime = cached[cached.length - 1].time;
                    const nowMs = Date.now();
                    const ageMinutes = (nowMs - lastCandleTime) / 60000;
                    
                    if (ageMinutes < 5) {
                        this.candles = cached;
                        this.price = cached[cached.length - 1].close;
                        this.detectLevels();
                        console.log(`[BTCEngine] Loaded ${cached.length} candles from DB cache. Very recent. Skipping network.`);
                        needsNetworkFetch = false;
                        return;
                    } else {
                        console.log(`[BTCEngine] DB cache exists but is ${Math.round(ageMinutes)} mins old. Fetching latest from network to bridge gap...`);
                        this.candles = cached; // load existing to have smooth transition, network fetch will append/replace
                    }
                }
            }

            if (!needsNetworkFetch) return;

            let to = Math.floor(Date.now() / 1000);
            const barsCount = 1000;
            const timeframeSeconds = (parseInt(resolution) || 1) * 60;
            let totalFetched = 0;
            
            console.log(`[BTCEngine] Deep history fetch: ${targetDays} days (${targetTotalCandles} bars)...`);

            for (let i = 0; i < Math.ceil(targetTotalCandles / barsCount); i++) {
                const from = to - (barsCount * timeframeSeconds); 
                const url = `https://ir5.faraz.io/api/customer/trading-view/history?symbolName=INDEX_BTCUSD&resolution=${resolution}&from=${from}&to=${to}&countback=${barsCount}&firstDataRequest=true&latest=true&adjustType=2&json=true`;
                
                const headers: any = {
                    'accept': 'application/json, text/plain, */*',
                    'user-agent': 'Mozilla/5.0'
                };

                if (this.currentToken) {
                    headers['cookie'] = `x-access-token=${this.currentToken}; farazSession=${this.farazSession}`;
                }

                const res = await fetch(url, { headers });
                if (!res.ok) break;

                const data: any = await res.json();
                const r = data.result ? data.result : data;
                
                if (r && r.t && Array.isArray(r.t) && r.t.length > 0) {
                    const chunk: any[] = [];
                    for (let j = 0; j < r.t.length; j++) {
                        const t = r.t[j];
                        const close = parseFloat(r.c[j]);
                        if (!isNaN(close)) {
                            chunk.push({
                                time: t > 20000000000 ? t : t * 1000,
                                open: parseFloat(r.o[j]),
                                high: parseFloat(r.h[j]),
                                low: parseFloat(r.l[j]),
                                close: close
                            });
                        }
                    }

                    if (chunk.length === 0) break;
                    
                    saveCandles('btc', resolution, chunk);
                    totalFetched += chunk.length;
                    to = Math.floor(chunk[0].time / 1000) - 1;
                    if (r.t.length < barsCount) break;
                } else {
                    break;
                }
            }

            const finalCache = getCandles('btc', resolution, 2000);
            if (finalCache.length > 0) {
                this.candles = finalCache;
                this.price = this.candles[this.candles.length - 1].close;
                this.detectLevels();
                console.log(`[BTCEngine] Backfill complete. Total in DB: ${getCandleCount('btc', resolution)}`);
            }
        } catch (e: any) {
            console.error(`[BTCEngine] Error fetching history: ${e.message}`);
        }
    }

    connectWS() {
        if (!this.isEnabled) return;
        const url = "wss://ir5.faraz.io/srv05/realtime/?EIO=4&transport=websocket";
        this.ws = new WebSocket(url, {
            origin: "https://faraz.io",
            referer: "https://faraz.io/",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
                "Cache-Control": "no-cache",
                "Accept-Language": "en-US,en;q=0.9",
                "Pragma": "no-cache",
            }
        });

        this.ws.on('open', () => {
            console.log("[BTC-Engine] WS Connected.");
            // Keep-alive ping interval
            this.pingInterval = setInterval(() => {
                if (this.ws && this.ws.readyState === 1) {
                    this.ws.send('2');
                }
            }, 25000);
        });

        this.ws.on('message', (data) => {
            const msg = data.toString();
            if (msg === '2') { this.ws?.send('3'); return; }
            
            if (msg.startsWith('0{')) {
                this.ws?.send(`40/customer,${JSON.stringify({ token: this.currentToken, UserId: null })}`);
                return;
            }

            if (msg.startsWith('40/customer,')) {
                this.ws?.send(`43/customer,0[]`);
                this.ws?.send(`42/customer,["join-room","term-room-@INDEX_BTCUSD"]`);
                this.ws?.send(`42/customer,["join-room","symbol-room-@INDEX_BTCUSD@1D@0"]`);
                this.ws?.send(`42/customer,["join-room","symbol-room-@INDEX_BTCUSD@${this.timeframe}@0"]`);
                return;
            }

            if (msg.startsWith('42')) {
                const commaIdx = msg.indexOf(',');
                if (commaIdx === -1) return;
                const jsonPart = msg.substring(commaIdx + 1);
                try {
                    const parsed = JSON.parse(jsonPart);
                    if (parsed[0] === `symbol-room-@INDEX_BTCUSD@${this.timeframe}@0`) {
                        const raw = parsed[1];
                        this.updateFromTick(raw);
                    } else if (parsed[0] === 'term-room-@INDEX_BTCUSD') {
                        const raw = parsed[1];
                        if (raw.price) {
                            this.updatePrice(parseFloat(raw.price));
                        }
                    }
                } catch (e) {}
            }
        });

        this.ws.on('close', () => {
            console.log("[BTC-Engine] WS Closed. Reconnecting...");
            if (this.pingInterval) clearInterval(this.pingInterval);
            setTimeout(() => this.connectWS(), 5000);
        });
    }

    updatePrice(newPrice: number) {
        if (!newPrice || isNaN(newPrice)) return;
        this.price = newPrice;
        
        const tfMs = (parseInt(this.timeframe) || 1) * 60000;
        const now = Date.now();
        const candleTime = Math.floor(now / tfMs) * tfMs;

        if (this.candles.length === 0) {
            this.candles.push({
                time: candleTime,
                open: newPrice,
                high: newPrice,
                low: newPrice,
                close: newPrice
            });
            return;
        }

        const last = this.candles[this.candles.length - 1];
        if (candleTime > last.time) {
            this.candles.push({
                time: candleTime,
                open: newPrice,
                high: newPrice,
                low: newPrice,
                close: newPrice
            });
            if (this.candles.length > 2000) this.candles.shift();
        } else {
            last.high = Math.max(last.high, newPrice);
            last.low = Math.min(last.low, newPrice);
            last.close = newPrice;
        }

        if (!this.lastLevelsUpdate || now - this.lastLevelsUpdate > 1000) {
            this.detectLevels();
            this.runStrategy();
            this.lastLevelsUpdate = now;
        }
    }

    updateFromTick(tick: any) {
        if (this.chartSource !== 'faraz') return;
        if (!tick || !tick.time) return;
        let time = tick.time > 20000000000 ? tick.time : tick.time * 1000;
        
        // Normalize
        const tfMs = (parseInt(this.timeframe) || 1) * 60000;
        time = Math.floor(time / tfMs) * tfMs;

        const open = parseFloat(tick.open || tick.close);
        const high = parseFloat(tick.high || tick.close);
        const low = parseFloat(tick.low || tick.close);
        const close = parseFloat(tick.close);
        this.price = close;

        const existingIdx = this.candles.findIndex(c => c.time === time);
        if (existingIdx !== -1) {
            const existing = this.candles[existingIdx];
            existing.open = open;
            existing.high = Math.max(existing.high, high);
            existing.low = Math.min(existing.low, low);
            existing.close = close;
        } else {
            const c = { time, open, high, low, close };
            this.candles.push(c);
            this.candles.sort((a, b) => a.time - b.time);
            if (this.candles.length > 2000) this.candles.shift();
            this.detectLevels();
            saveCandles('btc', this.timeframe, [c]); // Save latest
        }
        this.runStrategy();
    }

    detectLevels() {
        if (this.candles.length < 10) return; // Allow running even with fewer candles
        const pivots = this.strategy.getSwingPivots(this.candles, 6, 2);
        this.levels = pivots.map((p: any) => ({
            type: p.type === 'high' ? 'RESISTANCE' : 'SUPPORT',
            price: p.price,
            time: p.time
        })).slice(-30);
    }

    onSignal(callback: (sig: Signal, msgId?: number) => void) {
        this.onSignalCallback = callback;
    }

    runStrategy() {
        const sig = this.strategy.analyze(this.candles, this.timeframe, this.liveStrategyType, this.candleConfirmations);
        if (!sig) return;
        const last = this.signals[0];
        if (!last || Math.abs(last.time - sig.time) > 60000) {
            this.signals.unshift(sig);
            if (this.signals.length > 20) this.signals.pop();
            this.sendBaleNotification(sig);
            if (this.onSignalCallback) this.onSignalCallback(sig);
        }
    }

    private async sendBaleNotification(sig: Signal) {
        const url = `https://tapi.bale.ai/bot${this.baleToken}/sendMessage`;
        const date = new Date(sig.time).toLocaleDateString('fa-IR');
        const time = new Date(sig.time).toLocaleTimeString('fa-IR');
        
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
⏳ **تایم‌فریم:** ${sig.timeframe}m

🛑 **نوع معامله:** ${sig.type === 'BUY' ? 'خرید (BUY) 🟢' : 'فروش (SELL) 🔴'}

💵 **نقطه ورود:** ${sig.entry.toLocaleString()}
🛡 **حد ضرر (SL):** ${sig.sl.toLocaleString()}

💰 **تارگت ۱:** ${sig.tp1.toLocaleString()}
💰 **تارگت ۲:** ${sig.tp2.toLocaleString()}
💰 **تارگت ۳:** ${sig.tp3.toLocaleString()}

--------------------------
🔍 **وضعیت ساختار:**
📏 سقف (Saghf): ${sig.saghf?.toLocaleString() || '---'}
📏 کف (Kaf): ${sig.kaf?.toLocaleString() || '---'}
--------------------------
⚠️ مدیریت سرمایه فراموش نشود!
`;
        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: parseInt(this.baleChatId), text: message })
            });
        } catch (e) {}
    }

    updateBaleConfig(token: string, chatId: string) {
        this.baleToken = token;
        this.baleChatId = chatId;
        this.saveSettings();
    }

    async setTimeframe(tf: string) {
        if (this.timeframe === tf) return;
        this.timeframe = tf;
        this.candles = [];
        this.levels = [];
        this.signals = [];
        this.trendoOffsetApplied = false;
        
        await this.fetchHistory();
        
        if (this.chartSource === 'faraz') {
            if (this.ws && this.ws.readyState === 1) { // 1 is WebSocket.OPEN
                this.ws.send(`42/customer,["join-room","symbol-room-@INDEX_BTCUSD@${this.timeframe}@0"]`);
            }
        }
    }

    getState() {
        const nPattern = this.strategy.getNPatternDrawing(this.candles);
        return {
            broker: 'btc',
            price: this.price,
            timeframe: this.timeframe,
            liveStrategy: this.liveStrategyType,
            candles: this.candles.slice(-400),
            levels: this.levels,
            signals: this.signals,
            totalCandles: this.candles.length,
            nPattern,
            baleToken: this.baleToken,
            baleChatId: this.baleChatId,
            currentToken: this.currentToken,
            farazSession: this.farazSession,
            candleConfirmations: this.candleConfirmations,
            isEnabled: this.isEnabled,
            chartSource: this.chartSource,
            strategyConfig: (this.strategy as any).config
        };
    }

    processTrendoTick(price: number) {
        if (this.chartSource !== 'trendo' || !this.isEnabled) return;
        
        if (!this.trendoOffsetApplied && this.candles.length > 0) {
            const historyClose = this.candles[this.candles.length - 1].close;
            const diff = price - historyClose;
            
            // Adjust all historical candles to match Trendo's pricing level
            for (let c of this.candles) {
                c.open += diff;
                c.high += diff;
                c.low += diff;
                c.close += diff;
            }
            this.trendoOffsetApplied = true;
            this.detectLevels(); 
            console.log(`[BTCEngine] Applied Trendo offset: ${diff.toFixed(2)} to align Faraz history with Trendo live ticks.`);
        }

        this.updatePrice(price);
    }

    setStrategyConfig(config: any) {
        this.strategy.updateConfig(config);
        this.saveSettings();
    }
}
