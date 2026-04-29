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

    constructor(demoNumber?: string) {
        if (demoNumber) {
            this.demoNumber = demoNumber;
        }
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

    // ----------------------- DEMO ORDERS -----------------------
    /**
     * باز کردن معامله سریع در محیط دمو
     */
    async openFastOrderDemo(side: number, amount: number, loss: number | string = '', profit: number | string = '') {
        if (!this.demoNumber) throw new Error("Demo number is missing.");
        
        const form = new FormData();
        form.append('side', side);
        form.append('amount', amount);
        form.append('price', '');      // قیمت لحظه‌ای
        form.append('loss_limit', loss);
        form.append('profit_limit', profit);

        const { data } = await axios.post(
            `${DEMO_BASE}/api/order/ounce/fast/?demo_number=${this.demoNumber}`,
            form,
            { headers: form.getHeaders() }
        );
        return data;
    }

    /**
     * بستن یک سفارش باز در محیط دمو
     */
    async closeOrderDemo(orderId: string) {
        if (!this.demoNumber) throw new Error("Demo number is missing.");
        const { data } = await axios.get(
            `${DEMO_BASE}/api/order/ounce/close/${orderId}/?demo_number=${this.demoNumber}`
        );
        return data;
    }

    /**
     * ویرایش حد سود و ضرر یک سفارش باز (دمو)
     */
    async editOrderDemo(orderId: string, loss: number | string = '', profit: number | string = '') {
        if (!this.demoNumber) throw new Error("Demo number is missing.");
        const { data } = await axios.put(
            `${DEMO_BASE}/api/order/ounce/edit/opened/orders/${orderId}/?demo_number=${this.demoNumber}`,
            {
                profit_limit: String(profit),
                loss_limit: String(loss)
            },
            { headers: { 'Content-Type': 'application/json' } }
        );
        return data;
    }

    // ----------------------- WEBSOCKET (LIVE DATA) -----------------------
    connectWebSocketDemo(callbacks: {
        onPrice?: (price: string) => void;
        onOpenOrders?: (orders: any[]) => void;
        onPortfo?: (portfo: any) => void;
        onClosedOrders?: (orders: any[]) => void;
        onAlert?: (alert: any[]) => void;
        onOpen?: () => void;
        onClose?: () => void;
        onError?: (err: Error) => void;
    }) {
        if (!this.demoNumber) throw new Error("Demo number is missing.");
        
        const wsUrl = `wss://demo.alphagoldx.com/ounce/orders/?user_id=${this.demoNumber}`;
        const ws = new WebSocket(wsUrl, {
            headers: {
                'Origin': 'https://alphagoldx.com',
                'User-Agent': 'Mozilla/5.0'
            }
        });

        ws.on('open', () => {
            console.log('[AlphaGold-WS] متصل شد');
            if (callbacks.onOpen) callbacks.onOpen();
        });

        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.orders?.price && callbacks.onPrice) callbacks.onPrice(msg.orders.price);
                if (msg.open_orders && callbacks.onOpenOrders) callbacks.onOpenOrders(msg.open_orders);
                if (msg.portfo && callbacks.onPortfo) callbacks.onPortfo(msg.portfo);
                if (msg.closed_orders && callbacks.onClosedOrders) callbacks.onClosedOrders(msg.closed_orders);
                if (msg.alert && callbacks.onAlert) callbacks.onAlert(msg.alert);
            } catch (e: any) {
                console.error('[AlphaGold-WS] خطای پردازش پیام:', e.message);
            }
        });

        ws.on('error', (err) => {
            console.error('[AlphaGold-WS] خطا:', err.message);
            if (callbacks.onError) callbacks.onError(err);
        });

        ws.on('close', (code, reason) => {
            console.log('[AlphaGold-WS] بسته شد:', code, reason.toString());
            if (callbacks.onClose) callbacks.onClose();
        });

        return ws;
    }

    // ----------------------- PORTFOLIO MANAGEMENT -----------------------
    /**
     * افزایش یا کاهش موجودی پرتفو (دمو)
     */
    async adjustPortfolioBalance(amount: number) {
        if (!this.demoNumber) throw new Error("Demo number is missing.");
        const { data } = await axios.post(
            `${DEMO_BASE}/api/wallet/balance/add/portfo/?demo_number=${this.demoNumber}`,
            {
                symbol: 1,
                amount: amount
            },
            { headers: { 'Content-Type': 'application/json' } }
        );
        return data;
    }

    /**
     * تغییر نوع پرتفو بین معمولی و کم‌ریسک
     */
    async switchPortfolioType(portfoType: 1 | 2) {
        if (!this.demoNumber) throw new Error("Demo number is missing.");
        const { data } = await axios.post(
            `${DEMO_BASE}/api/wallet/portfo/type/select/?demo_number=${this.demoNumber}`,
            {
                portfo_type: portfoType
            },
            { headers: { 'Content-Type': 'application/json' } }
        );
        return data;
    }

    /**
     * دریافت بالانس جاری و موجودی پرتفو
     */
    async getBalance() {
        if (!this.demoNumber) throw new Error("Demo number is missing.");
        const { data } = await axios.get(
            `${DEMO_BASE}/api/wallet/balance/?demo_number=${this.demoNumber}`
        );
        return data;
    }

    /**
     * دریافت قیمت ضمانت شده
     */
    async getGuaranteePrice() {
        if (!this.demoNumber) throw new Error("Demo number is missing.");
        const { data } = await axios.get(
             `${DEMO_BASE}/api/wallet/balance/guarantee/price/?demo_number=${this.demoNumber}`
        );
        return data;
    }
}
