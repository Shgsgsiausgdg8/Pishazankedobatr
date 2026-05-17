
export interface ReportStats {
    totalTrades: number;
    winTrades: number;
    lossTrades: number;
    totalProfit: number;
    broker: string;
}

export class Messenger {
    private token: string = '';
    private chatId: string = '';

    constructor(token?: string, chatId?: string) {
        if (token) this.token = token;
        if (chatId) this.chatId = chatId;
    }

    updateConfig(token: string, chatId: string) {
        this.token = token;
        this.chatId = chatId;
    }

    private async send(text: string, replyToId?: number): Promise<number | null> {
        if (!this.token || !this.chatId) return null;

        const url = `https://tapi.bale.ai/bot${this.token}/sendMessage`;
        try {
            const payload: any = {
                chat_id: this.chatId,
                text: text
            };
            if (replyToId) {
                payload.reply_to_message_id = replyToId;
            }

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const json: any = await res.json();
                return json.result?.message_id || null;
            } else {
                console.error(`[Messenger] Bale error: ${res.statusText}`);
                return null;
            }
        } catch (e: any) {
            console.error(`[Messenger] Failed to send message: ${e.message}`);
            return null;
        }
    }

    private async sendPhoto(imageUrl: string, caption: string, replyToId?: number): Promise<number | null> {
        if (!this.token || !this.chatId) return null;

        const url = `https://tapi.bale.ai/bot${this.token}/sendPhoto`;
        try {
            const payload: any = {
                chat_id: this.chatId,
                photo: imageUrl,
                caption: caption
            };
            if (replyToId) {
                payload.reply_to_message_id = replyToId;
            }

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const json: any = await res.json();
                return json.result?.message_id || null;
            } else {
                return await this.send(caption, replyToId); // Fallback to text
            }
        } catch (e: any) {
            return await this.send(caption, replyToId); // Fallback to text
        }
    }

    async sendTradeOpen(order: any, accountMode: string, replyToSignalId?: number): Promise<number | null> {
        const side = String(order.side).toLowerCase() === '1' || String(order.side).toLowerCase() === 'buy' ? 'خرید (BUY) 🟢' : 'فروش (SELL) 🔴';
        const modeText = accountMode === 'real' ? 'حساب واقعی (REAL) 💰' : 'حساب دمو (DEMO) 🧪';
        const message = `
 🚀 **معامله جدید باز شد**

🏦 **نوع حساب:** ${modeText}
🔹 **نوع معامله:** ${side}
💰 **قیمت ورود:** ${order.price}
⚖️ **حجم:** ${order.amount}
🆔 **شناسه:** ${order.id}
🕒 **زمان:** ${new Date().toLocaleTimeString('fa-IR')}

💎 در حال مانیتورینگ تارگت‌ها و استاپ...
`;
        return await this.send(message.trim(), replyToSignalId);
    }

    async sendTradeClose(order: any, reason: string, profit: number, accountMode: string, replyToOpenId?: number): Promise<number | null> {
        const symbol = profit >= 0 ? '✅' : '❌';
        const status = profit >= 0 ? 'با سود بسته شد' : 'با ضرر بسته شد';
        const modeText = accountMode === 'real' ? 'حساب واقعی (REAL) 💰' : 'حساب دمو (DEMO) 🧪';
        
        const message = `
${symbol} **معامله بسته شد**

🏦 **نوع حساب:** ${modeText}
📝 **وضعیت:** ${status}
🎯 **دلیل:** ${reason === 'TP' ? 'تارگت (TP) 🎯' : reason === 'SL' ? 'استاپ (SL) 🛑' : 'بستن دستی ✋'}
📈 **سود/زیان:** ${profit.toFixed(2)}
🆔 **شناسه:** ${order.id}
🕒 **زمان:** ${new Date().toLocaleTimeString('fa-IR')}
--------------------------
🔄 در حال تحلیل موقعیت‌های بعدی...
`;
        return await this.send(message.trim(), replyToOpenId);
    }

    async sendSLUpdate(order: any, newSl: string, progress: number, currentPrice: number, replyToOpenId?: number) {
        const message = `
🛡 **آپدیت حد ضرر (Risk-Free)**

🎯 **مرحله:** TP${progress} رویت شد
💸 **قیمت فعلی:** ${currentPrice}
🛡 **حد ضرر جدید:** ${newSl}
🆔 **شناسه:** ${order.id}
🕒 **زمان:** ${new Date().toLocaleTimeString('fa-IR')}

✅ معامله امن شد.
`;
        
        let tpValue = newSl;
        // Generate a very light quickchart showing entry, sl, and current
        const chartConfig = {
            type: 'line',
            data: {
                labels: ['Start', 'Entry', 'Current Target'],
                datasets: [{
                    label: 'قیمت',
                    data: [order.price, order.price, currentPrice],
                    borderColor: 'rgb(75, 192, 192)',
                    fill: false
                }, {
                     label: 'SL جدید',
                     data: [newSl, newSl, newSl],
                     borderColor: 'red',
                     borderDash: [5, 5]
                }]
            }
        };
        const encodedUrl = `https://quickchart.io/chart?w=400&h=200&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
        await this.sendPhoto(encodedUrl, message.trim(), replyToOpenId);
    }

    async sendPeriodicReport(stats: ReportStats, accountMode: string) {
        const winRate = stats.totalTrades > 0 ? (stats.winTrades / stats.totalTrades * 100).toFixed(1) : '0';
        const profitSymbol = stats.totalProfit >= 0 ? '📈' : '📉';
        const modeText = accountMode === 'real' ? 'حساب واقعی (REAL) 👑' : 'حساب دمو (DEMO) 🧪';

        const message = `
📊 **گزارش ۳۰ دقیقه‌ای عملکرد**

🏦 **نوع حساب:** ${modeText}
🏛 **بروکر:** ${stats.broker}
🔄 **تعداد کل معاملات:** ${stats.totalTrades}
✅ **معاملات موفق:** ${stats.winTrades}
❌ **معاملات ناموفق:** ${stats.lossTrades}
🎯 **وین‌ریت:** ${winRate}%

${profitSymbol} **کل سود/زیان:** ${stats.totalProfit.toFixed(2)}

--------------------------
🕒 **زمان گزارش:** ${new Date().toLocaleTimeString('fa-IR')}
✅ ربات در حال فعالیت است.
`;
        await this.send(message.trim());
    }
}
