import axios from "axios";
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';

// ============================================================
// کلاس SessionManager - مدیریت سشن‌های لندن و نیویورک
// ============================================================
class SessionManager {
    sessions = {
        asia: { start: "01:30", end: "09:30", name: "Asia" },
        londonBackas: { start: "11:30", end: "13:30", name: "بکاس لندن (نقدینگی اول)" },
        londonMid: { start: "13:30", end: "16:30", name: "لندن میانی" },
        nyBackas: { start: "16:30", end: "18:30", name: "بکاس نیویورک (نقدینگی اول)" },
        nyLate: { start: "18:30", end: "00:30", name: "نیویورک پایانی" }
    };

    getCurrentSession() {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        
        if (this.isTimeBetween(currentTime, this.sessions.londonBackas.start, this.sessions.londonBackas.end)) {
            return { session: 'londonBackas', ...this.sessions.londonBackas, isActive: true };
        }
        if (this.isTimeBetween(currentTime, this.sessions.nyBackas.start, this.sessions.nyBackas.end)) {
            return { session: 'nyBackas', ...this.sessions.nyBackas, isActive: true };
        }
        return { session: 'other', isActive: false, name: "خارج از سشن معاملاتی" };
    }

    isTimeBetween(current: string, start: string, end: string) {
        const toMinutes = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };
        const curr = toMinutes(current);
        const s = toMinutes(start);
        const e = toMinutes(end);
        if (s <= e) return curr >= s && curr <= e;
        return curr >= s || curr <= e;
    }

    getAsiaHighLow(candles: any[]) {
        if (!candles || candles.length === 0) return { high: null, low: null };
        const asiaStart = this.toTimestamp("01:30");
        const asiaEnd = this.toTimestamp("09:30");
        const asiaCandles = candles.filter(c => c.time >= asiaStart && c.time <= asiaEnd);
        if (asiaCandles.length === 0) return { high: null, low: null };
        return {
            high: Math.max(...asiaCandles.map(c => c.high)),
            low: Math.min(...asiaCandles.map(c => c.low))
        };
    }

    getLondonHighLow(candles: any[], isEarly = true) {
        if (!candles || candles.length === 0) return { high: null, low: null };
        const start = isEarly ? "11:30" : "13:30";
        const end = isEarly ? "13:30" : "16:30";
        const startTs = this.toTimestamp(start);
        const endTs = this.toTimestamp(end);
        const londonCandles = candles.filter(c => c.time >= startTs && c.time <= endTs);
        if (londonCandles.length === 0) return { high: null, low: null };
        return {
            high: Math.max(...londonCandles.map(c => c.high)),
            low: Math.min(...londonCandles.map(c => c.low))
        };
    }

    toTimestamp(timeStr: string) {
        const now = new Date();
        const [h, m] = timeStr.split(':').map(Number);
        const d = new Date(now);
        d.setHours(h, m, 0, 0);
        return Math.floor(d.getTime() / 1000);
    }

    isLiquidityTaken(currentPrice: number, asiaLevels: any, londonLevels: any, sessionType: string) {
        if (sessionType === 'londonBackas') {
            if (asiaLevels.high && currentPrice > asiaLevels.high) return { taken: 'نقدینگی آسیا (High)', direction: 'bullish' };
            if (asiaLevels.low && currentPrice < asiaLevels.low) return { taken: 'نقدینگی آسیا (Low)', direction: 'bearish' };
        }
        if (sessionType === 'nyBackas') {
            if (londonLevels.high && currentPrice > londonLevels.high) return { taken: 'نقدینگی لندن (High)', direction: 'bullish' };
            if (londonLevels.low && currentPrice < londonLevels.low) return { taken: 'نقدینگی لندن (Low)', direction: 'bearish' };
        }
        return null;
    }
}

class TrendAnalyzer {
    analyzeFullTrend(candles: any[], multiTimeframeData: any) {
        const results = { overall: 'neutral', strength: 0, confidence: 0, reasons: [] as string[], warnings: [] as string[] };
        if (!candles || candles.length < 50) { results.warnings.push("⚠️ داده کافی نیست"); return results; }

        const ema = this.analyzeEMA(candles);
        if (ema.trend) { results.reasons.push(ema.reason); ema.trend === 'bullish' ? results.strength += 25 : results.strength -= 25; }

        const macd = this.analyzeMACD(candles);
        if (macd.trend) { results.reasons.push(macd.reason); macd.trend === 'bullish' ? results.strength += 20 : results.strength -= 20; }

        const adx = this.analyzeADXDirection(candles);
        if (adx.trend) { results.reasons.push(adx.reason); adx.trend === 'bullish' ? results.strength += adx.strength : results.strength -= adx.strength; }

        if (multiTimeframeData?.candlesMap) {
            const multi = this.analyzeMultiTimeframeTrend(multiTimeframeData);
            if (multi.trend) { results.reasons.push(multi.reason); multi.trend === 'bullish' ? results.strength += 15 : results.strength -= 15; }
        }

        if (results.strength >= 30) { results.overall = 'bullish'; results.confidence = Math.min(100, results.strength + 20); }
        else if (results.strength <= -30) { results.overall = 'bearish'; results.confidence = Math.min(100, Math.abs(results.strength) + 20); }
        else { results.overall = 'neutral'; results.confidence = 100 - Math.abs(results.strength); }

        return results;
    }

    analyzeEMA(candles: any[]) {
        const closes = candles.map(c => c.close), ema50 = this.calculateEMA(closes, 50), ema200 = this.calculateEMA(closes, 200);
        const last50 = ema50[ema50.length - 1], last200 = ema200[ema200.length - 1], price = closes[closes.length - 1];
        if (!last50 || !last200) return { trend: null as string | null, reason: "⚖️ داده کافی برای EMA", alignment: 'mixed' };
        let bull = 0, bear = 0;
        if (last50 > last200) bull++; else bear++;
        if (price > last50) bull++; else bear++;
        if (bull >= 2) return { trend: 'bullish', strength: 20, reason: "✅ EMA صعودی", alignment: 'aligned' };
        if (bear >= 2) return { trend: 'bearish', strength: 20, reason: "🔻 EMA نزولی", alignment: 'aligned' };
        return { trend: null, reason: "⚖️ EMA خنثی", alignment: 'mixed' };
    }

    analyzeMACD(candles: any[]) {
        const closes = candles.map(c => c.close), fast = this.calculateEMA(closes, 12), slow = this.calculateEMA(closes, 26);
        const macd = fast.map((f, i) => f && slow[i] ? f - slow[i] : 0), signal = this.calculateEMA(macd, 9);
        const lastM = macd[macd.length - 1], lastS = signal[signal.length - 1];
        if (lastM > lastS) return { trend: 'bullish', reason: "📊 MACD صعودی" };
        if (lastM < lastS) return { trend: 'bearish', reason: "📊 MACD نزولی" };
        return { trend: null, reason: "⚖️ MACD خنثی" };
    }

    analyzeADXDirection(candles: any[], period = 14) {
        if (candles.length < period * 2) return { trend: null, strength: 0, reason: "⚖️ داده کم", adx: 25 };
        const plusDI = [], minusDI = [];
        for (let i = 1; i < candles.length; i++) {
            const hDiff = candles[i].high - candles[i-1].high, lDiff = candles[i-1].low - candles[i].low;
            const plusDM = (hDiff > lDiff && hDiff > 0) ? hDiff : 0, minusDM = (lDiff > hDiff && lDiff > 0) ? lDiff : 0;
            const tr = Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i-1].close), Math.abs(candles[i].low - candles[i-1].close));
            plusDI.push(tr > 0 ? plusDM / tr * 100 : 0); minusDI.push(tr > 0 ? minusDM / tr * 100 : 0);
        }
        const avgP = plusDI.slice(-period).reduce((a,b)=>a+b,0)/period, avgM = minusDI.slice(-period).reduce((a,b)=>a+b,0)/period;
        const dx = Math.abs(avgP - avgM) / (avgP + avgM + 0.001) * 100;
        if (dx > 25) {
            if (avgP > avgM + 5) return { trend: 'bullish', strength: Math.min(35, dx), reason: `📈 ADX صعودی`, adx: dx };
            if (avgM > avgP + 5) return { trend: 'bearish', strength: Math.min(35, dx), reason: `📉 ADX نزولی`, adx: dx };
        }
        return { trend: null, strength: 0, reason: "📊 ADX ضعیف", adx: dx };
    }

    analyzeMultiTimeframeTrend(multi: any) {
        let bull = 0, bear = 0;
        for (const tf of ['5','15','60']) {
            const candles = multi.candlesMap[tf];
            if (!candles) continue;
            const closes = candles.map((c:any)=>c.close), ema = this.calculateEMA(closes, 20);
            if (closes[closes.length-1] > ema[ema.length-1]) bull++; else bear++;
        }
        if (bull >= 2) return { trend: 'bullish', reason: "🕐 همراستایی صعودی" };
        if (bear >= 2) return { trend: 'bearish', reason: "🕐 همراستایی نزولی" };
        return { trend: null, reason: "🕐 عدم همراستایی" };
    }

    calculateEMA(data: number[], period: number) {
        if (data.length < period) return new Array(data.length).fill(null);
        const ema = new Array(data.length).fill(null), mult = 2 / (period + 1);
        ema[period - 1] = data.slice(0, period).reduce((a,b)=>a+b,0) / period;
        for (let i = period; i < data.length; i++) ema[i] = (data[i] - ema[i-1]) * mult + ema[i-1];
        return ema;
    }
}

class MarketAnalyzer {
    analyzeMarket(candles: any[], price: number) {
        const recent = candles.slice(-20);
        const high = Math.max(...recent.map(c=>c.high)), low = Math.min(...recent.map(c=>c.low));
        const adx = new TrendAnalyzer().analyzeADXDirection(candles).adx || 25;
        const isR = adx < 25;
        return { isRanging: isR, strength: isR ? 70 : 20, upperBound: high, lowerBound: low, message: isR ? "بازار رنج" : "بازار رونددار" };
    }
}

class DivergenceDetector {
    getPriceSwings(candles: any[], look=60, win=2) {
        const swings = [];
        for (let i = candles.length - look; i < candles.length - win; i++) {
            let isH = true, isL = true;
            for (let j = 1; j <= win; j++) { if (candles[i-j]?.high>=candles[i].high || candles[i+j]?.high>=candles[i].high) isH = false; if (candles[i-j]?.low<=candles[i].low || candles[i+j]?.low<=candles[i].low) isL = false; }
            if (isH) swings.push({ type: 'high', price: candles[i].high, index: i }); if (isL) swings.push({ type: 'low', price: candles[i].low, index: i });
        }
        return swings.slice(-5);
    }
    getRSISwings(rsi: number[], look=60, win=2) {
        const swings = [];
        for (let i = rsi.length - look; i < rsi.length - win; i++) {
            let isH = true, isL = true;
            for (let j = 1; j <= win; j++) { if (rsi[i-j]>=rsi[i] || rsi[i+j]>=rsi[i]) isH=false; if (rsi[i-j]<=rsi[i] || rsi[i+j]<=rsi[i]) isL=false; }
            if (isH) swings.push({ type: 'high', value: rsi[i], index: i }); if (isL) swings.push({ type: 'low', value: rsi[i], index: i });
        }
        return swings.slice(-5);
    }
    checkMulti(candlesMap: any, rsiMap: any) {
        for (const tf of ['15','10','5']) {
            const c = candlesMap[tf], r = rsiMap[tf]; if (!c || !r) continue;
            const ps = this.getPriceSwings(c), rs = this.getRSISwings(r);
            if (ps.length < 2 || rs.length < 2) continue;
            const lp = ps[ps.length-1], pp = ps[ps.length-2];
            const lr = rs.find(x => Math.abs(x.index - lp.index) <= 3), pr = rs.find(x => Math.abs(x.index - pp.index) <= 3);
            if (lr && pr && lp.type === pp.type) {
                if (lp.type==='low' && lp.price > pp.price && lr.value < pr.value) return { found: true, direction: 'bullish', name: `Hidden Bullish ${tf}` };
                if (lp.type==='high' && lp.price < pp.price && lr.value > pr.value) return { found: true, direction: 'bearish', name: `Hidden Bearish ${tf}` };
            }
        }
        return { found: false };
    }
}

class TradingStrategy {
    divergence = new DivergenceDetector();
    trend = new TrendAnalyzer();
    async analyze(candles: any[], tf: string, type: string, conf: any, price: number, multi: any) {
        const rsiMap: any = {}; Object.keys(multi.candlesMap).forEach(k => rsiMap[k] = this.rsi(multi.candlesMap[k]));
        const sig: any = this.divergence.checkMulti(multi.candlesMap, rsiMap);
        if (!sig.found) return null;
        const fib = this.calcFib(candles, sig.direction === 'bullish'); if (!fib) return null;
        const tol = fib.range * 0.03;
        const is3 = Math.abs(price - fib.f3) <= tol, is6 = Math.abs(price - fib.f6) <= tol;
        if (!is3 && !is6) return null;
        return { type: sig.direction==='bullish'?'BUY':'SELL', entry: is3?fib.f3:fib.f6, sl: fib.sl, tp1: is3?fib.tp1:fib.tp2, tp2: fib.tp2, tp3: fib.tp3, tp4: fib.tp4, tp5: fib.tp5, activeLevel: is3?38.2:61.8, signalType: sig.name, confidence: 85, trendAnalysis: this.trend.analyzeFullTrend(candles, multi) };
    }
    calcFib(candles: any[], isBull: boolean) {
        const recent = candles.slice(-60); if (!recent.length) return null;
        const high = Math.max(...recent.map(c=>c.high)), low = Math.min(...recent.map(c=>c.low)), range = high - low;
        return { f3: isBull?high-range*0.382:low+range*0.382, f6: isBull?high-range*0.618:low+range*0.618, sl: isBull?low-range*2.99:high+range*2.99, tp1: isBull?high+range*0.12:low-range*0.12, tp2: isBull?high+range*0.24:low-range*0.24, tp3: isBull?high+range*0.38:low-range*0.38, tp4: isBull?high+range*0.5:low-range*0.5, tp5: isBull?high+range*0.618:low-range*0.618, range };
    }
    rsi(candles: any[]) {
        const prices = candles.map(c=>c.close), rsi = new Array(prices.length).fill(50); if (prices.length < 15) return rsi;
        let g = 0, l = 0; for (let i=1; i<=14; i++) { const d = prices[i]-prices[i-1]; if (d>=0) g+=d; else l-=d; }
        let ag = g/14, al = l/14;
        for (let i=15; i<prices.length; i++) { const d = prices[i]-prices[i-1], gn = d>=0?d:0, ls = d<0?-d:0; ag=(ag*13+gn)/14; al=(al*13+ls)/14; rsi[i]=100-(100/(1+ag/(al||1))); }
        return rsi;
    }
}

class ActiveTrade {
    signalId: number; type: string; entry: number; sl: number; tp1: number; tp2: number; tp3: number; tp4: number; tp5: number;
    reached: string[] = []; sent: any = {}; isCompleted = false;
    constructor(sig: any) { Object.assign(this, sig); this.signalId = sig.time || Date.now(); }
    checkTargets(price: number) {
        const newly = [], tps = [this.tp1, this.tp2, this.tp3, this.tp4, this.tp5];
        tps.forEach((tp, i) => { const n = `TP${i+1}`; if (!this.reached.includes(n) && (this.type==='BUY'?price>=tp:price<=tp)) { this.reached.push(n); if (!this.sent[n]) { newly.push({ target: n, price: tp }); this.sent[n] = true; } } });
        if (this.type==='BUY'?price<=this.sl:price>=this.sl) return { hitStop: true, hitTargets: newly, finalPrice: this.sl };
        if (this.reached.length === 5) this.isCompleted = true;
        return { hitStop: false, hitTargets: newly, fullTargets: this.isCompleted };
    }
}

class MultiTimeframeDataManager {
    currentToken: string; farazSession: string; cache: any = {};
    constructor(token: string, session: string) { this.currentToken = token; this.farazSession = session; }
    async fetch(tf: string, count = 200) {
        try {
            const to = Math.floor(Date.now()/1000), from = to - (count*60*parseInt(tf));
            const res = await axios.get(`https://ir3.faraz.io/api/customer/trading-view/history?symbolName=INDEX_BTCUSD&resolution=${tf}&from=${from}&to=${to}&countback=${count}&firstDataRequest=true&latest=true&adjustType=2&json=true`, { headers: { 'cookie': `x-access-token=${this.currentToken}; farazSession=${this.farazSession}`, 'user-agent': 'Mozilla/5.0' } });
            if (res.data.result?.t) this.cache[tf] = res.data.result.t.map((t:any, i:any) => ({ time: t, open: parseFloat(res.data.result.o[i]), high: parseFloat(res.data.result.h[i]), low: parseFloat(res.data.result.l[i]), close: parseFloat(res.data.result.c[i]) }));
            return this.cache[tf] || [];
        } catch(e) { return this.cache[tf] || []; }
    }
}

class BitcoinEngine {
    price = 0; candles: any[] = []; activeTrades: ActiveTrade[] = []; currentToken = ""; farazSession = ""; baleToken = ""; baleChatId = ""; isEnabled = true;
    settingsFile = path.join(process.cwd(), 'new', 'bitcoin_settings.json');
    multi: MultiTimeframeDataManager; strategy = new TradingStrategy(); session = new SessionManager(); market = new MarketAnalyzer();

    constructor() {
        this.loadSettings();
        this.multi = new MultiTimeframeDataManager(this.currentToken, this.farazSession);
    }

    loadSettings() {
        try { if (fs.existsSync(this.settingsFile)) { const s = JSON.parse(fs.readFileSync(this.settingsFile, 'utf8')); this.currentToken = s.currentToken; this.farazSession = s.farazSession; this.baleToken = s.baleToken; this.baleChatId = s.baleChatId; this.isEnabled = s.isEnabled ?? true; } } catch(e) {}
    }
    saveSettings() { try { fs.writeFileSync(this.settingsFile, JSON.stringify({ currentToken: this.currentToken, farazSession: this.farazSession, baleToken: this.baleToken, baleChatId: this.baleChatId, isEnabled: this.isEnabled }, null, 2)); } catch(e) {} }

    async refreshToken() {
        try {
            const res = await axios.get('https://faraz.io/api/public/authentication/me', { headers: { 'authority':'faraz.io', 'cookie': `x-access-token=${this.currentToken}; farazSession=${this.farazSession}`, 'user-agent': 'Mozilla/5.0' } });
            if (res.data?.token) { this.currentToken = res.data.token; this.multi.currentToken = this.currentToken; this.saveSettings(); console.log("✅ توکن رفرش شد"); return true; }
        } catch(e) { console.error("❌ خطا در رفرش:", e.message); }
        return false;
    }

    async checkToken() {
        if (!this.currentToken) return;
        try { const d: any = jwt.decode(this.currentToken); if (d?.exp) { if (d.exp - Math.floor(Date.now()/1000) < 1800) await this.refreshToken(); } } catch(e) {}
    }

    async start() {
        if (!this.isEnabled) return;
        await this.checkToken(); await this.multi.fetch('5'); await this.fetchHistory(); this.connect();
        setInterval(async () => { await this.checkToken(); await this.multi.fetch('5'); }, 60000);
    }

    async fetchHistory() {
        try {
            const to = Math.floor(Date.now()/1000), from = to - 3600;
            const res = await axios.get(`https://ir3.faraz.io/api/customer/trading-view/history?symbolName=INDEX_BTCUSD&resolution=5&from=${from}&to=${to}&countback=500&firstDataRequest=true&latest=true&adjustType=2&json=true`, { headers: { 'cookie': `x-access-token=${this.currentToken}; farazSession=${this.farazSession}`, 'user-agent': 'Mozilla/5.0' } });
            if (res.data.result?.t) this.candles = res.data.result.t.map((t:any, i:any) => ({ time: t, open: parseFloat(res.data.result.o[i]), high: parseFloat(res.data.result.h[i]), low: parseFloat(res.data.result.l[i]), close: parseFloat(res.data.result.c[i]) }));
            if (this.candles.length) this.price = this.candles[this.candles.length-1].close;
        } catch(e) {}
    }

    connect() {
        const ws = new WebSocket("wss://ir3.faraz.io/srv09/realtime/?EIO=4&transport=websocket", { origin: "https://faraz.io" });
        ws.on('message', (m: any) => {
            const s = m.toString(); if (s === '2') ws.send('3');
            else if (s.startsWith('42')) {
                try {
                    const p = JSON.parse(s.substring(s.indexOf('[')));
                    if (p[0] === 'symbol-room-@INDEX_BTCUSD@1@0') {
                        const t = p[1]; this.price = t.close;
                        const l = this.candles[this.candles.length-1]; if (l && l.time === t.time) this.candles[this.candles.length-1] = t; else { this.candles.push(t); if (this.candles.length > 500) this.candles.shift(); this.run(); }
                        this.check();
                    }
                } catch(e) {}
            } else if (s.startsWith('0{')) ws.send(`40/customer,${JSON.stringify({ token: this.currentToken })}`);
            else if (s.startsWith('40/customer,')) ws.send(`42/customer,["join-room","symbol-room-@INDEX_BTCUSD@1@0"]`);
        });
    }

    async run() {
        if (!this.session.getCurrentSession().isActive) return;
        const s: any = await this.strategy.analyze(this.candles, '5', '', {}, this.price, { candlesMap: this.multi.cache });
        if (s && this.session.isLiquidityTaken(this.price, this.session.getAsiaHighLow(this.candles), null, 'londonBackas')) {
            this.activeTrades.push(new ActiveTrade(s)); await this.send(s);
        }
    }

    check() {
        this.activeTrades = this.activeTrades.filter(t => {
            const r = t.checkTargets(this.price); r.hitTargets.forEach(h => this.send({ type: 'TARGET', ...h })); return !r.hitStop && !r.fullTargets;
        });
    }

    async send(m: any) { try { await axios.post(`https://tapi.bale.ai/bot${this.baleToken}/sendMessage`, { chat_id: this.baleChatId, text: JSON.stringify(m, null, 2) }); } catch(e) {} }
}

new BitcoinEngine().start();
