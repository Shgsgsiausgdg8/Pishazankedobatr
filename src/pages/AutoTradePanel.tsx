import React, { useEffect, useState } from 'react';

// --- Icons ---
const CloseIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>;
const PhoneIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
const LockIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const UserIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const SettingsIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;
const ActivityIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;

const AutoTradePanel = ({ onClose }: { onClose: () => void }) => {
    const [state, setState] = useState<any>(null);
    const [userInfo, setUserInfo] = useState<any>(null);
    
    // Auth Flow states
    const [authStep, setAuthStep] = useState<'LOADING' | 'PHONE' | 'OTP' | 'DASHBOARD'>('LOADING');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [authLoading, setAuthLoading] = useState(false);
    const [authError, setAuthError] = useState('');

    const [config, setConfig] = useState<any>({
        demoNumber: '',
        isEnabled: false,
        tradeAmount: 1,
        tpMode: 'pips',
        tpPips: 200,
        slMode: 'pips',
        slPips: 200,
        limitMode: 'virtual',
        autoRiskFree: false,
        riskFreePips: 100,
        portfoType: 1
    });
    
    // Fetch user info to see if authenticated
    const fetchUser = async () => {
        try {
            const res = await fetch('/api/autotrade/user');
            if (res.ok) {
                const data = await res.json();
                if (data && (data.phone_number || data.username || data.demo_number)) {
                    setUserInfo(data);
                    setAuthStep('DASHBOARD');
                    return true;
                }
            }
            setAuthStep('PHONE');
            return false;
        } catch (e) {
            setAuthStep('PHONE');
            return false;
        }
    };

    const fetchState = () => {
        if (authStep !== 'DASHBOARD') return;
        fetch('/api/autotrade/state')
            .then(res => res.json())
            .then(data => {
                setState(data);
                setConfig(data.config);
            })
            .catch(err => console.error("Error fetching autotrade state", err));
    };

    useEffect(() => {
        fetchUser();
    }, []);

    useEffect(() => {
        if (authStep === 'DASHBOARD') {
            fetchState();
            const intv = setInterval(fetchState, 3000);
            return () => clearInterval(intv);
        }
    }, [authStep]);

    const updateConfig = (key: string, value: any) => {
        const newConfig = { ...config, [key]: value };
        setConfig(newConfig);
        fetch('/api/autotrade/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newConfig)
        });
    };

    const closeOrder = (id: string) => {
        fetch('/api/autotrade/order/close', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        }).then(() => fetchState());
    };

    const requestOtp = async () => {
        if (!phone) return;
        setAuthLoading(true);
        setAuthError('');
        try {
            const res = await fetch('/api/autotrade/auth/request', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({phone})
            });
            const data = await res.json();
            if (res.ok) {
                setAuthStep('OTP');
            } else {
                setAuthError(data.error || 'خطا در ارسال کد');
            }
        } catch(e: any) {
            setAuthError(e.message);
        } finally {
            setAuthLoading(false);
        }
    };

    const confirmOtp = async () => {
        if (!otp) return;
        setAuthLoading(true);
        setAuthError('');
        try {
            const res = await fetch('/api/autotrade/auth/confirm', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({phone, code: otp})
            });
            const data = await res.json();
            if (res.ok && data.access_token) {
                await fetchUser(); // Will switch to dashboard if success
            } else {
                setAuthError(data.error || 'کد نامعتبر است');
            }
        } catch(e: any) {
            setAuthError(e.message);
        } finally {
            setAuthLoading(false);
        }
    };

    const logout = () => {
        updateConfig('accessToken', '');
        updateConfig('demoNumber', '');
        setUserInfo(null);
        setAuthStep('PHONE');
    };

    // --- Renders ---

    const renderAuth = () => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '24px' }}>
            <div style={{ width: '100%', maxWidth: '360px', background: '#1e293b', padding: '32px 24px', borderRadius: '16px', border: '1px solid #334155', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
                <h2 style={{ color: 'white', margin: '0 0 24px 0', textAlign: 'center', fontSize: '1.5rem' }}>
                    ورود به آلفاگلد
                </h2>
                
                {authError && <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', textAlign: 'center' }}>{authError}</div>}

                {authStep === 'PHONE' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '0.9rem', marginBottom: '8px' }}>
                                <PhoneIcon /> شماره موبایل
                            </label>
                            <input 
                                type="tel" 
                                value={phone} 
                                onChange={e => setPhone(e.target.value)}
                                placeholder="09xxxxxxxxx"
                                style={{ width: '100%', padding: '12px 16px', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '8px', outline: 'none', fontSize: '1rem', textAlign: 'left', direction: 'ltr' }}
                            />
                        </div>
                        <button 
                            onClick={requestOtp}
                            disabled={authLoading || !phone}
                            style={{ width: '100%', padding: '14px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '1rem', cursor: (authLoading || !phone) ? 'not-allowed' : 'pointer', opacity: (authLoading || !phone) ? 0.7 : 1, marginTop: '8px' }}
                        >
                            {authLoading ? 'درحال ارسال...' : 'دریافت کد تایید'}
                        </button>
                    </div>
                )}

                {authStep === 'OTP' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '0.9rem', marginBottom: '8px' }}>
                                <LockIcon /> کد تایید
                            </label>
                            <input 
                                type="number" 
                                value={otp} 
                                onChange={e => setOtp(e.target.value)}
                                placeholder="XXXXX"
                                style={{ width: '100%', padding: '12px 16px', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '8px', outline: 'none', fontSize: '1.2rem', textAlign: 'center', letterSpacing: '8px' }}
                            />
                        </div>
                        <button 
                            onClick={confirmOtp}
                            disabled={authLoading || !otp}
                            style={{ width: '100%', padding: '14px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '1rem', cursor: (authLoading || !otp) ? 'not-allowed' : 'pointer', opacity: (authLoading || !otp) ? 0.7 : 1, marginTop: '8px' }}
                        >
                            {authLoading ? 'درحال بررسی...' : 'تایید و ورود'}
                        </button>
                        <button 
                            onClick={() => setAuthStep('PHONE')}
                            style={{ width: '100%', padding: '14px', background: 'transparent', color: '#94a3b8', border: 'none', fontSize: '0.9rem', cursor: 'pointer' }}
                        >
                            تغییر شماره موبایل
                        </button>
                    </div>
                )}
            </div>
        </div>
    );

    const renderDashboard = () => {
        if (!state) return <div style={{color: '#94a3b8', padding: '40px', textAlign: 'center'}}>درحال همگام‌سازی اطلاعات...</div>;
        
        const { portfo, openOrders, livePrice } = state;

        return (
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', gap: '20px', flexDirection: 'column' }}>
                
                {/* User Info & Quick Stats */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {userInfo && (
                        <div style={{ flex: '1 1 200px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e293b', padding: '12px 16px', borderRadius: '12px', border: '1px solid #334155' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: '#3b82f6', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                    <UserIcon />
                                </div>
                                <div>
                                    <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.95rem' }}>{userInfo.first_name ? `${userInfo.first_name} ${userInfo.last_name || ''}` : userInfo.username || userInfo.phone_number}</div>
                                    <div style={{ color: userInfo.is_authenticated ? '#10b981' : '#f59e0b', fontSize: '0.75rem', marginTop: '2px' }}>
                                        {userInfo.is_authenticated ? 'احراز هویت شده' : 'وضعیت نامشخص'}
                                    </div>
                                </div>
                            </div>
                            <button onClick={logout} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '0.8rem', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.1)', fontWeight: 'bold' }}>
                                خروج
                            </button>
                        </div>
                    )}
                    
                    <div style={{ flex: '1 1 120px', background: '#1e293b', padding: '12px 16px', borderRadius: '12px', border: '1px solid #334155' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                            <ActivityIcon /> موجودی حساب
                        </div>
                        <div style={{ fontSize: '1.2rem', color: 'white', fontWeight: 'bold' }}>{Number(portfo?.balance || 0).toLocaleString()} <span style={{fontSize: '0.7rem', color: '#94a3b8'}}>تومان</span></div>
                    </div>
                </div>

                {/* Settings Box */}
                <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'white', margin: '0 0 20px 0', fontSize: '1.05rem' }}>
                        <SettingsIcon /> تنظیمات استراتژی اتو ترید
                    </h3>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ padding: '0 0 16px 0', borderBottom: '1px solid #334155' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '0.85rem', marginBottom: '8px' }}>
                                <LockIcon /> Demo ID (آیدی حساب دمو)
                            </label>
                            <input 
                                type="text" 
                                value={config.demoNumber} 
                                onChange={e => updateConfig('demoNumber', e.target.value)}
                                placeholder="فقط در صورتی که دمو به صورت خودکار شناسایی نشد وارد کنید..."
                                style={{ width: '100%', padding: '10px 14px', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '8px', outline: 'none', fontSize: '0.9rem' }}
                            />
                        </div>

                        <div style={{ padding: '0 0 16px 0', borderBottom: '1px solid #334155' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: config.enableTpSl ? '16px' : '0' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'white', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '4px' }}>
                                        <ActivityIcon /> فعال‌سازی حد سود و ضرر (TP/SL)
                                    </div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>در صورت روشن بودن، هنگام دریافت سیگنال محدوده‌ها ثبت می‌شوند.</div>
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                    <div style={{ position: 'relative' }}>
                                        <input type="checkbox" className="sr-only" checked={config.enableTpSl ?? true} onChange={(e) => updateConfig('enableTpSl', e.target.checked)} style={{ display: 'none' }} />
                                        <div style={{ width: '40px', height: '24px', backgroundColor: (config.enableTpSl ?? true) ? '#10b981' : '#475569', borderRadius: '12px', transition: 'all 0.3s' }}></div>
                                        <div style={{ position: 'absolute', top: '2px', left: (config.enableTpSl ?? true) ? '18px' : '2px', width: '20px', height: '20px', backgroundColor: 'white', borderRadius: '50%', transition: 'all 0.3s' }}></div>
                                    </div>
                                </label>
                            </div>

                            {(config.enableTpSl ?? true) && (
                                <>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '0.85rem', marginBottom: '8px' }}>
                                        <SettingsIcon /> نحوه اعمال حد سود و ضرر به صرافی
                                    </label>
                                    <select 
                                        value={config.limitMode}
                                        onChange={e => updateConfig('limitMode', e.target.value)}
                                        style={{ width: '100%', padding: '10px 14px', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '8px', outline: 'none', fontSize: '0.9rem' }}
                                    >
                                        <option value="virtual">حالت مجازی / مخفی (پیشنهادی - بدون خطای فاصله صرافی)</option>
                                        <option value="broker">حالت ارسال مستقیم به سرور صرافی (ممکن است بخاطر فاصله لیمیت خطا دهد)</option>
                                    </select>
                                    {config.limitMode === 'virtual' && (
                                        <div style={{ marginTop: '8px', color: '#10b981', fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', padding: '8px', borderRadius: '6px' }}>
                                            در حالت مجازی، صرافی لیمیت‌های شما را نمی‌بیند. ربات به صورت زنده قیمت را بررسی کرده و به محض رسیدن به لیمیت، دستور بستن معامله را در لحظه صادر می‌کند تا محدودیت‌های صرافی خنثی شوند.
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.8rem', marginBottom: '8px' }}>حجم (لات)</label>
                                <input 
                                    type="number" 
                                    value={config.tradeAmount} 
                                    onChange={e => updateConfig('tradeAmount', parseFloat(e.target.value))}
                                    style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '8px', outline: 'none', fontSize: '0.9rem' }}
                                />
                            </div>
                            {(config.enableTpSl ?? true) && (
                                <>
                                    <div>
                                        <label style={{ display: 'block', color: '#10b981', fontSize: '0.8rem', marginBottom: '8px' }}>حد سود (TP)</label>
                                <select 
                                    value={config.tpMode}
                                    onChange={e => updateConfig('tpMode', e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #10b98133', color: '#10b981', borderRadius: '8px', outline: 'none', fontSize: '0.85rem' }}
                                >
                                    <option value="tp1">TP 1 از سیگنال</option>
                                    <option value="tp2">TP 2 از سیگنال</option>
                                    <option value="tp3">TP 3 از سیگنال</option>
                                    <option value="pips">تنظیم دستی (پیپ)</option>
                                </select>
                            </div>
                            {config.tpMode === 'pips' && (
                                <div>
                                    <label style={{ display: 'block', color: '#10b981', fontSize: '0.8rem', marginBottom: '8px' }}>مقدار TP (پیپ)</label>
                                    <input 
                                        type="number" 
                                        value={config.tpPips} 
                                        onChange={e => updateConfig('tpPips', parseFloat(e.target.value))}
                                        style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #10b98133', color: '#10b981', borderRadius: '8px', outline: 'none', fontSize: '0.9rem' }}
                                    />
                                </div>
                            )}
                            <div>
                                <label style={{ display: 'block', color: '#ef4444', fontSize: '0.8rem', marginBottom: '8px' }}>حد ضرر (SL)</label>
                                <select 
                                    value={config.slMode}
                                    onChange={e => updateConfig('slMode', e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #ef444433', color: '#ef4444', borderRadius: '8px', outline: 'none', fontSize: '0.85rem' }}
                                >
                                    <option value="signal">SL از سیگنال</option>
                                    <option value="pips">تنظیم دستی (پیپ)</option>
                                </select>
                            </div>
                            {config.slMode === 'pips' && (
                                <div>
                                    <label style={{ display: 'block', color: '#ef4444', fontSize: '0.8rem', marginBottom: '8px' }}>مقدار SL (پیپ)</label>
                                    <input 
                                        type="number" 
                                        value={config.slPips} 
                                        onChange={e => updateConfig('slPips', parseFloat(e.target.value))}
                                        style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #ef444433', color: '#ef4444', borderRadius: '8px', outline: 'none', fontSize: '0.9rem' }}
                                    />
                                </div>
                            )}
                                </>
                            )}
                        </div>

                        <div style={{ padding: '16px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '4px' }}>تریلینگ استاپ (ریسک فری)</div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>با رسیدن به سود مشخص، حد ضرر خودکار به قیمت ورود منتقل میشود</div>
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                    <div style={{ position: 'relative' }}>
                                        <input type="checkbox" className="sr-only" checked={config.autoRiskFree} onChange={(e) => updateConfig('autoRiskFree', e.target.checked)} style={{ display: 'none' }} />
                                        <div style={{ width: '40px', height: '24px', backgroundColor: config.autoRiskFree ? '#3b82f6' : '#475569', borderRadius: '12px', transition: 'all 0.3s' }}></div>
                                        <div style={{ position: 'absolute', top: '2px', left: config.autoRiskFree ? '18px' : '2px', width: '20px', height: '20px', backgroundColor: 'white', borderRadius: '50%', transition: 'all 0.3s' }}></div>
                                    </div>
                                </label>
                            </div>
                            {config.autoRiskFree && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                                    <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>فعال‌سازی در سود (پیپ):</div>
                                    <input 
                                        type="number" 
                                        value={config.riskFreePips} 
                                        onChange={e => updateConfig('riskFreePips', parseFloat(e.target.value))}
                                        style={{ width: '80px', padding: '6px 10px', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px', outline: 'none', fontSize: '0.9rem' }}
                                    />
                                </div>
                            )}
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button 
                                onClick={() => updateConfig('isEnabled', !config.isEnabled)}
                                style={{
                                    width: '100%',
                                    maxWidth: '300px',
                                    padding: '14px 20px', 
                                    background: config.isEnabled ? '#ef4444' : '#10b981', 
                                    color: 'white', 
                                    border: 'none', 
                                    borderRadius: '8px', 
                                    fontWeight: 'bold', 
                                    fontSize: '1rem',
                                    cursor: 'pointer',
                                    boxShadow: config.isEnabled ? '0 4px 14px rgba(239, 68, 68, 0.4)' : '0 4px 14px rgba(16, 185, 129, 0.4)',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {config.isEnabled ? 'توقف اتو ترید' : 'شروع اتو ترید'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Open Orders */}
                <div>
                    <h3 style={{ color: 'white', margin: '0 0 16px 0', fontSize: '1.05rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>سفارشات باز</span>
                        <span style={{ background: '#3b82f6', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>{openOrders.length}</span>
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {openOrders.length === 0 ? (
                            <div style={{ background: '#1e293b', border: '1px dashed #334155', borderRadius: '12px', padding: '30px', textAlign: 'center', color: '#64748b' }}>
                                در حال حاضر هیچ سفارش بازی وجود ندارد.
                            </div>
                        ) : openOrders.map((o: any, i: number) => {
                            const isBuy = o.side === 1;
                            const diff = isBuy ? o.sale_price - o.price : o.price - o.sale_price;
                            const pips = diff * 100;
                            const pnl = pips * 50000 * o.amount;

                            return (
                                <div key={i} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold', background: isBuy ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: isBuy ? '#10b981' : '#ef4444' }}>
                                                {isBuy ? 'خرید (Buy)' : 'فروش (Sell)'}
                                            </span>
                                            <span style={{ color: 'white', fontWeight: 'bold' }}>{o.amount} <span style={{fontSize: '0.7rem', color: '#94a3b8'}}>لات</span></span>
                                        </div>
                                        <div style={{ color: pnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 'bold', direction: 'ltr' }}>
                                            {pnl >= 0 ? '+' : ''}{pnl.toLocaleString()} <span style={{fontSize: '0.7rem'}}>T</span>
                                        </div>
                                    </div>
                                    
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8', background: '#0f172a', padding: '10px 12px', borderRadius: '8px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <span>قیمت ورود: <span style={{color: 'white', fontFamily: 'monospace'}}>{o.price.toFixed(2)}</span></span>
                                            <span>تاریخ: {new Date(o.created_at).toLocaleTimeString('fa-IR')}</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                                            <span>قیمت فعلی: <span style={{color: 'white', fontFamily: 'monospace'}}>{o.sale_price.toFixed(2)}</span></span>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <button onClick={() => closeOrder(o.id)} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', transition: 'all 0.2s' }}>
                                            بستن معامله به قیمت بازار
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

            </div>
        );
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.9)', backdropFilter: 'blur(8px)', zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl', padding: '16px'
        }}>
            <div style={{
                background: '#0f172a', width: '100%', maxWidth: '700px', height: '100%', maxHeight: '85vh',
                borderRadius: '20px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column',
                overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)'
            }}>
                {/* Header Navbar */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#020617', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h2 style={{ color: 'white', margin: 0, fontSize: '1.2rem', fontWeight: 'bold' }}>
                            اتو ترید آلفاگلد
                        </h2>
                        {authStep === 'DASHBOARD' && (
                            <div style={{ padding: '4px 10px', background: config.isEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: config.isEnabled ? '#10b981' : '#ef4444', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: config.isEnabled ? '#10b981' : '#ef4444', boxShadow: config.isEnabled ? '0 0 8px #10b981' : 'none' }}></span>
                                {config.isEnabled ? 'ربات فعال است' : 'ربات خاموش است'}
                            </div>
                        )}
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', cursor: 'pointer', borderRadius: '50%', transition: 'background 0.2s' }}>
                        <CloseIcon />
                    </button>
                </div>

                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {authStep === 'LOADING' ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
                            <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                        </div>
                    ) : authStep === 'DASHBOARD' ? (
                        renderDashboard()
                    ) : (
                        renderAuth()
                    )}
                </div>
            </div>
        </div>
    );
};

export default AutoTradePanel;
