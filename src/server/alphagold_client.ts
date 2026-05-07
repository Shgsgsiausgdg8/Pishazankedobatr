import axios from 'axios';

// Set a browser-like User-Agent to prevent ArvanCloud/WAF from blocking requests
axios.defaults.headers.common['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
axios.defaults.headers.common['Accept'] = 'application/json, text/plain, */*';
axios.defaults.headers.common['Origin'] = 'https://alphagoldx.com';
axios.defaults.headers.common['Referer'] = 'https://alphagoldx.com/';

import WebSocket from 'ws';
import FormData from 'form-data';

// ======================= CONFIGURATION =======================
const API_BASE = 'https://api.alphagoldx.com';        // سرور اصلی
const DEMO_BASE = 'https://demo.alphagoldx.com';      // سرور دمو
const CHART_BASE = 'https://chrt.alphagoldx.com';     // سرور نمودارها

// اطلاعات پرتفو (مقادیر تومانی)
export const PORTFOLIO_TYPES = {
    NORMAL: {
        margin: 800000,        // وجه تضمین هر واحد (تومان)
        pipValue: 50000        // ارزش هر پیپ (حرکت 0.01) به تومان
    },
    LOW_RISK: {
        margin: 400000,
        pipValue: 25000
    }
};

export class AlphaGoldClient {
    private demoNumber: string | null = null;
    private accessToken: string | null = null;
    private mode: 'demo' | 'real' = 'demo';

    constructor(demoNumber?: string) {
        if (demoNumber) {
            this.demoNumber = demoNumber;
        }
    }

    setMode(mode: 'demo' | 'real') {
        this.mode = mode;
    }

    setTokens(accessToken: string) {
        this.accessToken = accessToken;
    }

    setDemoNumber(demoNumber: string) {
        this.demoNumber = demoNumber;
    }

    // ----------------------- AUTHENTICATION -----------------------
    /**
     * ارسال شماره موبایل برای دریافت کد تأیید (OTP)
     */
    async requestOtp(phoneNumber: string) {
        console.log(`[AlphaGold] requestOtp for: ${phoneNumber}`);
        try {
            const { data } = await axios.post(`${API_BASE}/api/authenticate/`, {
                username: phoneNumber
            });
            console.log(`[AlphaGold] requestOtp response:`, data);
            return data; 
        } catch (error: any) {
            console.error(`[AlphaGold] requestOtp error:`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * تأیید کد OTP و دریافت توکن‌های JWT
     */
    async confirmOtp(phoneNumber: string, code: string, ref = '') {
        console.log(`[AlphaGold] confirmOtp for: ${phoneNumber}, code: ${code}`);
        try {
            const response = await axios.post(`${API_BASE}/api/authenticate/comfirm/otp/`, {
                username: phoneNumber,
                code: code,
                ref: ref
            });
            console.log(`[AlphaGold] confirmOtp response:`, response.data);


        const tokens = {
            access_token: null as string | null,
            refresh_token: null as string | null,
            user_id: null as string | null
        };

        if (response.data.access_token) {
            tokens.access_token = response.data.access_token;
            tokens.refresh_token = response.data.refresh_token;
            tokens.user_id = response.data.user_id;
        } else if (response.data.access) { // Standard Django SimpleJWT
            tokens.access_token = response.data.access;
            tokens.refresh_token = response.data.refresh;
            tokens.user_id = response.data.user_id;
        }

        const setCookie = response.headers['set-cookie'];
        if (setCookie) {
            const cookieStr = setCookie.join(';');
            const accessMatch = cookieStr.match(/access_token=([^;]+)/);
            if (accessMatch) tokens.access_token = accessMatch[1];
            const refreshMatch = cookieStr.match(/access_refresh=([^;]+)/);
            if (refreshMatch) tokens.refresh_token = refreshMatch[1];
        }

        return tokens;
        } catch (error: any) {
            console.error(`[AlphaGold] confirmOtp error:`, error.response?.data || error.message);
            throw error;
        }
    }

    // ----------------------- USER INFO -----------------------
    /**
     * دریافت اطلاعات کاربر با استفاده از توکن دسترسی
     */
    async getUserInfo(accessToken: string = this.accessToken!) {
        if (!accessToken) throw new Error("Access token is missing.");
        const { data } = await axios.get(`${API_BASE}/api/user/info/`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        return Array.isArray(data) ? data[0] : data;
    }

    /**
     * بررسی وضعیت احراز هویت (KYC)
     */
    async getKycStatus(accessToken: string = this.accessToken!) {
        if (!accessToken) throw new Error("Access token is missing.");
        const { data } = await axios.get(`${API_BASE}/api/kyc/status/`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        return data;
    }

    // ----------------------- REQUEST HELPERS -----------------------
    private getRequestOptions(options: any = {}) {
        const reqOptions = { ...options };
        if (this.mode === 'real') {
            if (!this.accessToken) throw new Error("Access token missing for real account.");
            reqOptions.headers = {
                ...reqOptions.headers,
                'Authorization': `Bearer ${this.accessToken}`
            };
        }
        return reqOptions;
    }

    private getRequestUrl(path: string) {
        if (this.mode === 'real') {
            return `${API_BASE}${path}`;
        } else {
            if (!this.demoNumber) throw new Error("Demo number missing.");
            const separator = path.includes('?') ? '&' : '?';
            return `${DEMO_BASE}${path}${separator}demo_number=${this.demoNumber}`;
        }
    }

    getUserId(): string | null {
        if (!this.accessToken) return null;
        try {
            const payload = JSON.parse(Buffer.from(this.accessToken.split('.')[1], 'base64').toString());
            return payload.user_id || payload.sub || null;
        } catch {
            return null;
        }
    }

    // ----------------------- ORDERS -----------------------
    /**
     * باز کردن معامله سریع
     */
    async openFastOrder(side: number, amount: number, loss: number | string = '', profit: number | string = '') {
        const form = new FormData();
        form.append('side', side);
        form.append('amount', amount);
        form.append('price', '');      // قیمت لحظه‌ای
        form.append('loss_limit', loss);
        form.append('profit_limit', profit);

        const options = this.getRequestOptions({ headers: form.getHeaders() });
        const { data } = await axios.post(
            this.getRequestUrl('/api/order/ounce/fast/'),
            form,
            options
        );
        return data;
    }

    /**
     * بستن یک سفارش باز
     */
    async closeOrder(orderId: string) {
        const options = this.getRequestOptions();
        const { data } = await axios.get(
            this.getRequestUrl(`/api/order/ounce/close/${orderId}/`),
            options
        );
        return data;
    }

    /**
     * ویرایش حد سود و ضرر یک سفارش باز
     */
    async editOrder(orderId: string, loss: number | string = '', profit: number | string = '') {
        const url = this.getRequestUrl(`/api/order/ounce/edit/opened/orders/${orderId}/`);
        const body = {
            loss_limit: typeof loss === 'number' ? loss.toFixed(2) : String(loss),
            profit_limit: typeof profit === 'number' ? profit.toFixed(2) : String(profit)
        };

        console.log(`[AlphaClient] EDIT REQUEST (JSON): ${url}`);

        try {
            const options = this.getRequestOptions({ headers: { 'Content-Type': 'application/json' } });
            const { data } = await axios.post(url, body, options);
            console.log(`[AlphaClient] EDIT SUCCESS:`, JSON.stringify(data));
            return data;
        } catch (error: any) {
            console.error(`[AlphaClient] EDIT FAILED:`, error.response?.data || error.message);
            throw error;
        }
    }

    // ----------------------- WEBSOCKET (LIVE DATA) -----------------------
    connectWebSocket(callbacks: {
        onPrice?: (price: string) => void;
        onOpenOrders?: (orders: any[]) => void;
        onPortfo?: (portfo: any) => void;
        onClosedOrders?: (orders: any[]) => void;
        onAlert?: (alert: any[]) => void;
        onOpen?: () => void;
        onClose?: () => void;
        onError?: (err: Error) => void;
    }) {
        let wsUrl = '';
        if (this.mode === 'real') {
            const userId = this.getUserId();
            if (!userId) throw new Error("Token or User ID missing for real websocket.");
            wsUrl = `wss://api.alphagoldx.com/ounce/orders/?user_id=${userId}`;
        } else {
            if (!this.demoNumber) throw new Error("Demo number is missing.");
            wsUrl = `wss://demo.alphagoldx.com/ounce/orders/?user_id=${this.demoNumber}`;
        }
        
        const ws = new WebSocket(wsUrl, {
            headers: {
                'Origin': 'https://alphagoldx.com',
                'User-Agent': 'Mozilla/5.0'
            }
        });

        let pingInterval: NodeJS.Timeout;
        let lastMessageTime = Date.now();

        ws.on('open', () => {
            console.log(`[AlphaGold-WS] ${this.mode} متصل شد`);
            if (callbacks.onOpen) callbacks.onOpen();

            pingInterval = setInterval(() => {
                if (Date.now() - lastMessageTime > 60000) {
                    console.log(`[AlphaGold-WS] No message received in 60s, closing socket to reconnect...`);
                    ws.close();
                    return;
                }
                if (ws.readyState === WebSocket.OPEN) {
                    ws.ping();
                }
            }, 30000);
        });

        let loggedKeys = false;
        ws.on('message', (raw) => {
            lastMessageTime = Date.now();
            try {
                const msg = JSON.parse(raw.toString());
                if (!loggedKeys && Math.random() < 0.1) {
                    console.log('[AlphaGold-WS] MSG KEYS:', Object.keys(msg));
                    if (msg.orders) console.log('[AlphaGold-WS] MSG.ORDERS:', JSON.stringify(msg.orders));
                    if (msg.portfo) console.log('[AlphaGold-WS] MSG.PORTFO:', JSON.stringify(msg.portfo));
                    loggedKeys = true;
                }
                
                const livePrice = msg.orders?.price || msg.portfo?.price || msg.portfo?.asset_price || msg.price;
                if (livePrice && callbacks.onPrice) {
                    callbacks.onPrice(String(livePrice));
                }
                
                if (msg.open_orders && callbacks.onOpenOrders) callbacks.onOpenOrders(msg.open_orders);
                if (msg.portfo && callbacks.onPortfo) callbacks.onPortfo(msg.portfo);
                if (msg.closed_orders && callbacks.onClosedOrders) callbacks.onClosedOrders(msg.closed_orders);
                if (msg.alert && callbacks.onAlert) callbacks.onAlert(msg.alert);
            } catch (e: any) {
                console.error('[AlphaGold-WS] خطای پردازش پیام:', e.message);
            }
        });

        ws.on('close', (code, reason) => {
            clearInterval(pingInterval);
            console.log('[AlphaGold-WS] بسته شد:', code, reason.toString());
            if (callbacks.onClose) callbacks.onClose();
        });

        ws.on('error', (err) => {
            clearInterval(pingInterval);
            console.error('[AlphaGold-WS] خطا:', err.message);
            if (callbacks.onError) callbacks.onError(err);
        });

        return ws;
    }

    // ----------------------- PORTFOLIO MANAGEMENT -----------------------
    /**
     * افزایش یا کاهش موجودی پرتفو
     */
    async adjustPortfolioBalance(amount: number) {
        const options = this.getRequestOptions({ headers: { 'Content-Type': 'application/json' } });
        const { data } = await axios.post(
            this.getRequestUrl('/api/wallet/balance/add/portfo/'),
            { symbol: 1, amount: amount },
            options
        );
        return data;
    }

    /**
     * تغییر نوع پرتفو بین معمولی و کم‌ریسک
     */
    async switchPortfolioType(portfoType: 1 | 2) {
        const options = this.getRequestOptions({ headers: { 'Content-Type': 'application/json' } });
        const { data } = await axios.post(
            this.getRequestUrl('/api/wallet/portfo/type/select/'),
            { portfo_type: portfoType },
            options
        );
        return data;
    }

    /**
     * دریافت بالانس جاری و موجودی پرتفو
     */
    async getBalance() {
        const options = this.getRequestOptions();
        const { data } = await axios.get(
            this.getRequestUrl('/api/wallet/balance/'),
            options
        );
        return data;
    }

    /**
     * دریافت قیمت ضمانت شده
     */
    async getGuaranteePrice() {
        const options = this.getRequestOptions();
        const { data } = await axios.get(
             this.getRequestUrl('/api/wallet/balance/guarantee/price/'),
             options
        );
        return data;
    }
}
