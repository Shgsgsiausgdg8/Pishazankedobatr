import { TrendoEngine } from './trendo_engine.js';

export class TrendoClient {
    engine: TrendoEngine;

    constructor(engine: TrendoEngine) {
        this.engine = engine;
    }

    setMode(mode: 'demo' | 'real') {
        // Trendo usually handles this via tokens/urls in config
    }

    setTrendoAuth(creds: { userId: string, userToken: string, walletId: string, walletToken: string }) {
        this.engine.userId = creds.userId || this.engine.userId;
        this.engine.userToken = creds.userToken || this.engine.userToken;
        this.engine.walletId = creds.walletId || this.engine.walletId;
        this.engine.walletToken = creds.walletToken || this.engine.walletToken;
        this.engine.saveSettings();
        this.engine.connect(); // Reconnect with new creds
    }

    connectWebSocket(callbacks: {
        onPrice: (p: string) => void,
        onOpenOrders: (orders: any[]) => void,
        onClosedOrders: (orders: any[]) => void,
        onPortfo: (p: any) => void,
        onAlert: (alert: any) => void,
        onClose: () => void,
        onError: (err: any) => void
    }) {
        let lastOpenOrdersStr = '';
        let lastClosedOrdersStr = '';
        let lastPriceStr = '';

        const interval = setInterval(() => {
            const state: any = this.engine.getState();
            
            // Format portfo
            callbacks.onPortfo({
                balance: state.balance,
                amount_ounce: state.equity, 
                blocked_amount_ounce: 0
            });

            // Format open orders
            const openOrders = state.activeOrders.map((o: any) => ({
                id: o.id,
                symbol: o.symbol,
                side: o.type === 0 ? 1 : 2, 
                amount_ounce: o.size,
                size: o.size,
                price: o.openPrice,
                openPrice: o.openPrice,
                loss_limit: o.sl,
                profit_limit: o.tp,
                profit: o.profit,
                type: o.type
            }));
            
            const openStr = JSON.stringify(openOrders);
            if (openStr !== lastOpenOrdersStr) {
                lastOpenOrdersStr = openStr;
                callbacks.onOpenOrders(openOrders);
            }

            // Format closed orders
            if (state.closedOrders) {
                const closedOrders = state.closedOrders.map((o: any) => ({
                    id: o.id,
                    symbol: o.symbol,
                    side: o.type === 0 ? 1 : 2,
                    amount_ounce: o.size,
                    size: o.size,
                    price: o.openPrice,
                    openPrice: o.openPrice,
                    profit: o.profit,
                    closePrice: o.closePrice,
                    type: o.type
                }));
                const closedStr = JSON.stringify(closedOrders);
                if (closedStr !== lastClosedOrdersStr) {
                    lastClosedOrdersStr = closedStr;
                    callbacks.onClosedOrders(closedOrders);
                }
            }

            // Price - Provide BTC price if available, otherwise xauusd
            const btcPrice = state.prices['btcusd']?.ask || state.prices['xauusd']?.ask || 0;
            const priceStr = String(btcPrice);
            if (priceStr !== lastPriceStr && btcPrice > 0) {
                lastPriceStr = priceStr;
                callbacks.onPrice(priceStr);
            }

        }, 1000);

        return {
            close: () => clearInterval(interval)
        };
    }

    async openFastOrder(side: number, amount: number, loss: number | string = '', profit: number | string = '', symbol = 'xauusd') {
        // side: 1 for Buy (Alpha), 2 for Sell (Alpha)
        // TrendoEngine openOrder expects: 0 for Buy, 1 for Sell
        const trendoType = side === 1 ? 0 : 1;
        const sl = loss === '' ? 0 : parseFloat(String(loss));
        const tp = profit === '' ? 0 : parseFloat(String(profit));

        await this.engine.openOrder(symbol, trendoType, amount, sl, tp);
        
        // Return a mock response that AutoTrader can parse to find an ID
        // The real ID will come later via order_change event
        return { success: true };
    }

    async closeOrder(orderId: string) {
        await this.engine.closeOrderById(parseInt(orderId));
        return { success: true };
    }

    async editOrder(orderId: string, loss: number | string = '', profit: number | string = '') {
        const sl = loss === '' ? undefined : parseFloat(String(loss));
        const tp = profit === '' ? undefined : parseFloat(String(profit));
        await this.engine.modifyOrder(parseInt(orderId), { sl, tp });
        return { success: true };
    }

    async getUserInfo() {
        return { balance: this.engine.balance, equity: this.engine.equity };
    }
}
