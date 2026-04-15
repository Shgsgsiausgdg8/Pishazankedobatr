import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

export class FarazGoldEngine {
  price: number = 0;
  timeframe: string = '1'; // Default to 1m
  candles: any[] = [];
  levels: { type: 'SUPPORT' | 'RESISTANCE', price: number, time: number }[] = [];
  isRecording: boolean = false;
  recordingStartTime: number | null = null;
  
  // Auth State
  accessToken: string | null = null;
  refreshToken: string | null = null;
  sessionId: string | null = 'njmnqc7hfkeyayowprwheqc73lvp98as';
  csrfToken: string | null = 'GTiZlvd8jNoMuko3nkjjU0lhC8m6Yy3m';
  
  private ws: WebSocket | null = null;
  private dataFile: string = path.join(process.cwd(), 'recorded_data.jsonl');
  private settingsFile: string = path.join(process.cwd(), 'settings.json');
  private lastCandleTime: number = 0;

  constructor() {
    this.loadSettings();
  }

  private async fetchHistory() {
    try {
      const baseUrl = process.env.FARAZGOLD_BASEURL || 'https://demo.farazgold.com';
      const resolution = this.timeframe; // '1', '5', '15', '60'
      
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
      
      if (this.accessToken) {
        headers['authorization'] = `Bearer ${this.accessToken}`;
      }

      const cookies = [];
      if (this.sessionId) cookies.push(`sessionid=${this.sessionId}`);
      if (this.csrfToken) cookies.push(`csrftoken=${this.csrfToken}`);
      if (cookies.length > 0) headers['cookie'] = cookies.join('; ');
      
      if (this.csrfToken) {
        headers['X-CSRFToken'] = this.csrfToken;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.error(`[Engine] History API failed: ${res.status}`);
        return;
      }
      
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          this.candles = data.map((b: any) => ({
            time: b.time,
            open: parseFloat(b.open || b.close),
            high: parseFloat(b.high || b.close),
            low: parseFloat(b.low || b.close),
            close: parseFloat(b.close)
          })).sort((a: any, b: any) => a.time - b.time);
          
          if (this.candles.length > 0) {
            this.lastCandleTime = this.candles[this.candles.length - 1].time * 1000;
            this.detectLevels();
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

  private async probeOldHistory() {
    const baseUrl = process.env.FARAZGOLD_BASEURL || 'https://demo.farazgold.com';
    const timeframe = this.timeframe === '60' ? '60' : this.timeframe;
    const paths = [`/api/room/api/get-history/`, `/api/room/get-history/` ];
    
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
            })).sort((a: any, b: any) => a.time - b.time);
            this.lastCandleTime = this.candles[this.candles.length - 1].time * 1000;
            this.detectLevels();
            return;
          }
        }
      } catch (e) {}
    }
  }

  private loadHistory() {
    this.fetchHistory();
  }

  private loadSettings() {
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

  private saveSettings() {
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
      const data = await res.json();
      
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
    // Wait a bit for session/csrf before first history fetch
    setTimeout(() => this.fetchHistory(), 2000);
    setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.fetchPriceAPI();
      }
    }, 30000);
  }

  private async connectWS() {
    const baseUrl = process.env.FARAZGOLD_BASEURL || 'https://demo.farazgold.com';
    // New WebSocket endpoint from inspiration project
    const resolution = Math.floor((parseInt(this.timeframe) || 1));
    const wsUrl = `wss://demo.farazgold.com/room/api/get-bars-ws/?symbol=mazane&resolution=${resolution}&history=300`;
    
    // Pre-flight check to get session and CSRF if needed
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
      } catch (e) {}
    }

    const tokenToUse = this.accessToken || '';
    const finalWsUrl = tokenToUse ? `${wsUrl}&token=${tokenToUse}` : wsUrl;

    console.log(`[Engine] Connecting to WS: ${finalWsUrl.split('&token=')[0]}`);

    try {
      const options: any = {
        headers: {
          'accept-language': 'en-US,en;q=0.9,fa;q=0.8',
          'cache-control': 'no-cache',
          'pragma': 'no-cache',
          'referer': `${baseUrl}/room/`,
          'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
          'Origin': baseUrl,
          'X-Requested-With': 'XMLHttpRequest'
        }
      };

      const cookies = [];
      if (this.sessionId) cookies.push(`sessionid=${this.sessionId}`);
      if (this.csrfToken) cookies.push(`csrftoken=${this.csrfToken}`);
      if (cookies.length > 0) options.headers['cookie'] = cookies.join('; ');
      
      if (this.csrfToken) {
        options.headers['x-csrftoken'] = this.csrfToken;
      }

      this.ws = new WebSocket(finalWsUrl, options);

      // CRITICAL: Handle error event to prevent process crash
      this.ws.on('error', (err) => {
        console.error(`[Engine] WebSocket Error: ${err.message}`);
      });

      this.ws.on('open', () => {
        console.log("[Engine] WebSocket Connected");
        this.ws?.send(JSON.stringify({
          action: 'SubAdd',
          subs: [`0~farazgold~mazane~gold~${this.timeframe}`]
        }));
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.action === 'Update' && msg.data?.price) {
            this.updatePrice(parseFloat(msg.data.price));
          }
          if (msg.bars && msg.bars[this.timeframe]) {
            this.processBar(msg.bars[this.timeframe]);
          }
        } catch (e) {}
      });

      this.ws.on('close', () => setTimeout(() => this.connectWS(), 5000));
    } catch (e) {
      setTimeout(() => this.connectWS(), 5000);
    }
  }

  private async fetchPriceAPI() {
    try {
      const res = await fetch('https://demo.farazgold.com/api/room/api/get-last-price/?symbol=mazane');
      const data = await res.json();
      if (data && data.price) {
        this.updatePrice(parseFloat(data.price));
      }
    } catch (e) {}
  }

  private updatePrice(newPrice: number) {
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
      this.detectLevels();
      this.recordData(newCandle);
    } else {
      const last = this.candles[this.candles.length - 1];
      if (last.time === candleTimeSec) {
        last.high = Math.max(last.high, newPrice);
        last.low = Math.min(last.low, newPrice);
        last.close = newPrice;
      }
    }
  }

  private processBar(bar: any) {
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
  }

  private detectLevels() {
    if (this.candles.length < 10) return;
    const lookback = 5;
    const lastIdx = this.candles.length - lookback - 1;
    if (lastIdx < lookback) return;

    const current = this.candles[lastIdx];
    let isHigh = true, isLow = true;
    for (let i = 1; i <= lookback; i++) {
      if (this.candles[lastIdx - i].high >= current.high || this.candles[lastIdx + i].high > current.high) isHigh = false;
      if (this.candles[lastIdx - i].low <= current.low || this.candles[lastIdx + i].low < current.low) isLow = false;
    }
    if (isHigh) this.addLevel('RESISTANCE', current.high, current.time * 1000);
    if (isLow) this.addLevel('SUPPORT', current.low, current.time * 1000);
  }

  private addLevel(type: 'SUPPORT' | 'RESISTANCE', price: number, time: number) {
    const exists = this.levels.some(l => l.type === type && Math.abs(l.price - price) < 10);
    if (!exists) {
      this.levels.push({ type, price, time });
      if (this.levels.length > 50) this.levels.shift();
    }
  }

  startRecording() { this.isRecording = true; this.recordingStartTime = Date.now(); }
  stopRecording() { this.isRecording = false; this.recordingStartTime = null; }

  private recordData(candle: any) {
    if (!this.isRecording) return;
    fs.appendFileSync(this.dataFile, JSON.stringify({ ...candle, recordedAt: Date.now() }) + '\n');
  }

  setTimeframe(tf: string) {
    if (this.timeframe === tf) return;
    this.timeframe = tf;
    this.candles = []; this.levels = []; this.lastCandleTime = 0;
    this.fetchHistory();
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'SubRemoveAll' }));
      this.ws.send(JSON.stringify({ action: 'SubAdd', subs: [`0~farazgold~mazane~gold~${this.timeframe}`] }));
    }
  }

  getState() {
    return { price: this.price, timeframe: this.timeframe, candles: this.candles.slice(-300), levels: this.levels, isRecording: this.isRecording };
  }
}
