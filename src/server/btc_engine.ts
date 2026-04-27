import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { TradingStrategy, Signal, Candle } from './strategy.js';

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
    
    // Auth & Settings
    currentToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OGYwMDk2YzIxZjM0N2RhOTMyMzIzZTgiLCJjcmVkaXQiOjE3Nzc1MjczNjU2NTIsImFjdGl2ZSI6dHJ1ZSwicm9sZSI6ImN1c3RvbWVyIiwibGFzdFVwZGF0ZVRpbWUiOjE3Nzc1MzMxMDIzNTIsImlhdCI6MTc3NzUzMzEwMiwiZXhwIjoxNzc3NTQwMzAyfQ.2P-2g2_R15Tz30XFqD_4lYn58OitL0G9Yp1NshqI1v4";
    farazSession = "s%3AIOMPjESaRChioBmpMfZZHUbDdGaKuEQA.NuYpPcEPXmu9AFqHcx2U6RUCUfpZ%2Fd%2BmCvrmGDBuUrQ";
    baleToken = "1892918835:dxRdPwhkUUgmFogKzLD7B8xmygvnRKq_DOA";
    baleChatId = "6211548865";
    candleConfirmations = {
        legacy: true,
        salvation: true,
        nameless: true,
        engulfing: true,
        darkCloud: true
    };
    
    settingsFile = path.join(process.cwd(), 'btc_settings.json');

    constructor() {
        this.loadSettings();
    }

    loadSettings() {
        try {
            if (fs.existsSync(this.settingsFile)) {
                const s = JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'));
                if (s.baleToken) this.baleToken = s.baleToken;
                if (s.baleChatId) this.baleChatId = s.baleChatId;
                if (s.currentToken) this.currentToken = s.currentToken;
                if (s.farazSession) this.farazSession = s.farazSession;
                if (s.candleConfirmations) this.candleConfirmations = s.candleConfirmations;
                if (s.isEnabled !== undefined) this.isEnabled = s.isEnabled;
                if (s.liveStrategyType) this.liveStrategyType = s.liveStrategyType;
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
                liveStrategyType: this.liveStrategyType
            };
            fs.writeFileSync(this.settingsFile, JSON.stringify(s, null, 2));
        } catch (e) {}
    }

    async start() {
        if (!this.isEnabled) return;
        await this.fetchHistory();
        this.connectWS();
    }

    async fetchHistory() {
        try {
            const now = Math.floor(Date.now() / 1000);
            const from = now - (1000 * 60); 
            const url = `https://ir3.faraz.io/api/customer/trading-view/history?symbolName=BTCUSDT_FUTURES&resolution=${this.timeframe}&from=${from}&to=${now}&countback=500&firstDataRequest=true&latest=true&adjustType=2&json=true`;
            
            console.log(`[BTC-Engine] Fetching history from: ${url}`);

            const res = await fetch(url, {
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'accept-language': 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7',
                    'cookie': `x-access-token=${this.currentToken}; farazSession=${this.farazSession}`,
                    'origin': 'https://faraz.io',
                    'referer': 'https://faraz.io/',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                }
            });

            if (!res.ok) {
                console.error(`[BTC-Engine] History HTTP error: ${res.status}`);
                return;
            }

            const data: any = await res.json();
            
            if (data.result && data.result.t && Array.isArray(data.result.t)) {
                const r = data.result;
                this.candles = r.t.map((t: number, i: number) => ({
                    time: t,
                    open: parseFloat(r.o[i]),
                    high: parseFloat(r.h[i]),
                    low: parseFloat(r.l[i]),
                    close: parseFloat(r.c[i])
                })).filter((c: any) => !isNaN(c.close));

                if (this.candles.length > 0) {
                    this.price = this.candles[this.candles.length - 1].close;
                    this.detectLevels();
                }
                console.log(`[BTC-Engine] Successfully loaded ${this.candles.length} history bars.`);
            } else {
                console.warn("[BTC-Engine] History response format unknown or empty:", JSON.stringify(data).substring(0, 200));
            }
        } catch (e: any) {
            console.error("[BTC-Engine] History fetch failed:", e.message);
        }
    }

    connectWS() {
        if (!this.isEnabled) return;
        const url = "wss://ir3.faraz.io/srv09/realtime/?EIO=4&transport=websocket";
        this.ws = new WebSocket(url, {
            origin: "https://faraz.io",
            referer: "https://faraz.io/",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });

        this.ws.on('open', () => {
            console.log("[BTC-Engine] WS Connected.");
        });

        this.ws.on('message', (data) => {
            const msg = data.toString();
            if (msg === '2') { this.ws?.send('3'); return; }
            
            if (msg.startsWith('0{')) {
                this.ws?.send(`40/customer,${JSON.stringify({ token: this.currentToken })}`);
                return;
            }

            if (msg.startsWith('40/customer,')) {
                this.ws?.send(`42/customer,["join-room","symbol-room-@BTCUSDT_FUTURES@1@0"]`);
                return;
            }

            if (msg.startsWith('42')) {
                const commaIdx = msg.indexOf(',');
                if (commaIdx === -1) return;
                const jsonPart = msg.substring(commaIdx + 1);
                try {
                    const parsed = JSON.parse(jsonPart);
                    if (parsed[0] === 'symbol-room-@BTCUSDT_FUTURES@1@0') {
                        const raw = parsed[1];
                        this.updateFromTick(raw);
                    }
                } catch (e) {}
            }
        });

        this.ws.on('close', () => {
            console.log("[BTC-Engine] WS Closed. Reconnecting...");
            setTimeout(() => this.connectWS(), 5000);
        });
    }

    updateFromTick(tick: any) {
        const time = tick.time;
        const open = tick.open;
        const high = tick.high;
        const low = tick.low;
        const close = tick.close;
        this.price = close;

        const last = this.candles[this.candles.length - 1];
        if (last && last.time === time) {
            this.candles[this.candles.length - 1] = { time, open, high, low, close };
        } else {
            this.candles.push({ time, open, high, low, close });
            if (this.candles.length > 1000) this.candles.shift();
            this.detectLevels();
        }
        this.runStrategy();
    }

    detectLevels() {
        if (this.candles.length < 50) return;
        const pivots = this.strategy.getSwingPivots(this.candles, 6, 2);
        this.levels = pivots.map((p: any) => ({
            type: p.type === 'high' ? 'RESISTANCE' : 'SUPPORT',
            price: p.price,
            time: p.time * 1000
        })).slice(-30);
    }

    runStrategy() {
        const sig = this.strategy.analyze(this.candles, this.timeframe, this.liveStrategyType, this.candleConfirmations);
        if (!sig) return;
        const last = this.signals[0];
        if (!last || Math.abs(last.time - sig.time) > 60000) {
            this.signals.unshift(sig);
            if (this.signals.length > 20) this.signals.pop();
            this.sendBaleNotification(sig);
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
            strategyConfig: (this.strategy as any).config
        };
    }

    setStrategyConfig(config: any) {
        this.strategy.updateConfig(config);
    }
}
