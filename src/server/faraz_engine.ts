import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { TradingStrategy, Signal, Candle } from './strategy.js';

export class FarazGoldEngine {
    price = 0;
    timeframe = '1'; // Default to 1m
    candles: Candle[] = [];
    levels: { type: 'SUPPORT' | 'RESISTANCE', price: number, time: number }[] = [];
    signals: Signal[] = [];
    isRecording = false;
    strategy = new TradingStrategy();
    liveStrategyType = 'SCALP-ADV';
    recordingStartTime: number | null = null;

    // Auth State
    accessToken: string | null = null;
    refreshToken: string | null = null;
    sessionId: string | null = 'njmnqc7hfkeyayowprwheqc73lvp98as';
    csrfToken: string | null = 'GTiZlvd8jNoMuko3nkjjU0lhC8m6Yy3m';
    ws: WebSocket | null = null;
    wsConnectionId: number | null = null;  // برای جلوگیری از رویدادهای اتصال قدیمی

    dataFile = path.join(process.cwd(), 'recorded_data.jsonl');
    settingsFile = path.join(process.cwd(), 'settings.json');
    lastCandleTime = 0;
    lastLevelsUpdate = 0;

    constructor() {
        this.loadSettings();
    }

    async fetchHistory() {
        try {
            const baseUrl = process.env.FARAZGOLD_BASEURL || 'https://demo.farazgold.com';
            const resolution = this.timeframe;
            const now = Math.floor(Date.now() / 1000);
            const barsCount = 300;
            const timeframeSeconds = (parseInt(resolution) || 1) * 60;
            const from = now - (barsCount * timeframeSeconds);
            const to = now;
            const url = `${baseUrl}/api/room/api/get-bars/?symbol=mazane&from=${from}&to=${to}&resolution=${resolution}`;
            console.log(`[Engine] Fetching history: ${url}`);

            const headers: any = {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7',
                'cache-control': 'no-cache',
                'pragma': 'no-cache',
                'referer': `${baseUrl}/room/`,
                'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest'
            };
            if (this.accessToken) headers['authorization'] = `Bearer ${this.accessToken}`;

            const cookies = [];
            if (this.sessionId) cookies.push(`sessionid=${this.sessionId}`);
            if (this.csrfToken) cookies.push(`csrftoken=${this.csrfToken}`);
            if (cookies.length > 0) headers['cookie'] = cookies.join('; ');
            if (this.csrfToken) headers['X-CSRFToken'] = this.csrfToken;

            const res = await fetch(url, { headers });
            if (!res.ok) {
                console.error(`[Engine] History API failed: ${res.status}`);
                return;
            }
            const text = await res.text();
            try {
                const data = JSON.parse(text);
                if (Array.isArray(data)) {
                    this.candles = data.map((b) => ({
                        time: b.time,
                        open: parseFloat(b.open || b.close),
                        high: parseFloat(b.high || b.close),
                        low: parseFloat(b.low || b.close),
                        close: parseFloat(b.close)
                    })).sort((a, b) => a.time - b.time);
                    if (this.candles.length > 0) {
                        this.lastCandleTime = this.candles[this.candles.length - 1].time * 1000;
                        this.detectLevels();
                        this.runStrategy();   // اجرای استراتژی روی داده‌های تاریخی
                    }
                    console.log(`[Engine] Successfully loaded ${this.candles.length} candles.`);
                }
            } catch (e) {
                console.error("[Engine] Failed to parse history JSON.");
            }
        } catch (e: any) {
            console.error(`[Engine] Error fetching history: ${e.message}`);
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
                            time: b.time,
                            open: parseFloat(b.open),
                            high: parseFloat(b.high),
                            low: parseFloat(b.low),
                            close: parseFloat(b.close)
                        })).sort((a, b) => a.time - b.time);
                        this.lastCandleTime = this.candles[this.candles.length - 1].time * 1000;
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
            if (fs.existsSync(this.settingsFile)) {
                const settings = JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'));
                this.accessToken = settings.accessToken || null;
                this.refreshToken = settings.refreshToken || null;
                this.sessionId = settings.sessionId || null;
                this.csrfToken = settings.csrfToken || null;
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
                csrfToken: this.csrfToken
            };
            fs.writeFileSync(this.settingsFile, JSON.stringify(settings, null, 2));
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
        this.price = newPrice;
        const now = Date.now();
        const timeframeMs = (parseInt(this.timeframe) || 1) * 60000;
        const candleTime = Math.floor(now / timeframeMs) * timeframeMs;
        const candleTimeSec = candleTime / 1000;

        if (this.candles.length === 0 || candleTime > this.lastCandleTime) {
            const newCandle = { time: candleTimeSec, open: newPrice, high: newPrice, low: newPrice, close: newPrice };
            this.candles.push(newCandle);
            this.candles.sort((a, b) => a.time - b.time);
            this.lastCandleTime = candleTime;
            if (this.candles.length > 1000) this.candles.shift();
            this.recordData(newCandle);
        } else {
            const last = this.candles[this.candles.length - 1];
            if (last && last.time === candleTimeSec) {
                last.high = Math.max(last.high, newPrice);
                last.low = Math.min(last.low, newPrice);
                last.close = newPrice;
            }
        }

        // بروزرسانی سطوح سقف و کف به صورت لحظه‌ای با تراتل 2 ثانیه
        if (!this.lastLevelsUpdate || now - this.lastLevelsUpdate > 2000) {
            this.detectLevels();
            this.runStrategy();
            this.lastLevelsUpdate = now;
        }
    }

    runStrategy() {
        const signal = this.strategy.analyze(this.candles, this.timeframe, this.liveStrategyType);
        if (signal) {
            const lastSignal = this.signals[0];
            if (!lastSignal || lastSignal.timeframe !== signal.timeframe || Math.abs(lastSignal.time - signal.time) > 60000) {
                this.signals.unshift(signal);
                if (this.signals.length > 4) this.signals.pop();
                console.log(`[Strategy] New Signal: ${signal.type} at ${signal.entry}`);
            }
        }
    }

    processBar(bar: any) {
        if (!bar || !bar.time) return;
        const time = bar.time;
        const open = parseFloat(bar.open || bar.close);
        const high = parseFloat(bar.high || bar.close);
        const low = parseFloat(bar.low || bar.close);
        const close = parseFloat(bar.close);
        if (isNaN(close)) return;

        const existingIdx = this.candles.findIndex(c => c.time === time);
        if (existingIdx !== -1) {
            this.candles[existingIdx] = { time, open, high, low, close };
        } else {
            this.candles.push({ time, open, high, low, close });
            this.candles.sort((a, b) => a.time - b.time);
            if (this.candles.length > 1000) this.candles.shift();
            this.lastCandleTime = time * 1000;
            this.detectLevels();
            this.recordData({ time, open, high, low, close });
        }
        this.runStrategy(); // اجرای استراتژی پس از بروزرسانی شمع
    }

    detectLevels() {
        if (this.candles.length < 50) return;
        
        // استفاده از منطق هوشمند برای تشخیص سقف و کف آخر
        const smart = this.strategy.getSmartPivots(this.candles);
        
        // ترکیب پیوت‌های ماژور و مینور برای نمایش در چارت و پنل
        const allPivots = [...smart.major, ...smart.minor];
        
        this.levels = allPivots.map(p => ({
            type: p.type === 'high' ? 'RESISTANCE' : 'SUPPORT' as 'SUPPORT' | 'RESISTANCE',
            price: p.price,
            time: p.time * 1000
        }))
        .sort((a,b) => a.time - b.time)
        .slice(-30); // نمایش ۳۰ سطح اخیر
    }

    addLevel(type: 'SUPPORT' | 'RESISTANCE', price: number, time: number) {
        const exists = this.levels.some(l => l.type === type && Math.abs(l.price - price) < 10);
        if (!exists) {
            this.levels.push({ type, price, time });
            if (this.levels.length > 50) this.levels.shift();
        }
    }

    startRecording() { this.isRecording = true; this.recordingStartTime = Date.now(); }
    stopRecording() { this.isRecording = false; this.recordingStartTime = null; }

    recordData(candle: any) {
        if (!this.isRecording) return;
        fs.appendFileSync(this.dataFile, JSON.stringify({ ...candle, recordedAt: Date.now() }) + '\n');
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
        return {
            broker: 'faraz',
            price: this.price,
            timeframe: this.timeframe,
            liveStrategy: this.liveStrategyType,
            candles: this.candles.slice(-2000),
            levels: this.levels,
            signals: this.signals,
            isRecording: this.isRecording
        };
    }
}
