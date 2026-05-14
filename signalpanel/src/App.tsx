import React, { useState, useEffect, useRef } from 'react';
import { LogOut, CheckCircle, XCircle, ArrowRight, Activity, AlertCircle, RefreshCw, Volume2, VolumeX, Calculator, PieChart, TrendingUp, TrendingDown, Percent, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

function App() {
  const [isLogged, setIsLogged] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [signals, setSignals] = useState<any[]>([]);
  const [btcPrice, setBtcPrice] = useState(0);
  const [alphaPrice, setAlphaPrice] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const soundEnabledRef = useRef(soundEnabled);
  
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('clientToken');
    if (token) {
      setIsLogged(true);
      fetchData();
      startPolling();
    }
  }, []);
  
  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  };

  const playBeep = (freq = 800, duration = 0.2, type: OscillatorType = 'sine') => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.5, ctx.currentTime + duration - 0.05);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + duration);
  };
  
  const playNewSignalSound = () => {
    if (!soundEnabledRef.current) return;
    initAudio();
    playBeep(900, 0.1, 'sine');
    setTimeout(() => playBeep(1200, 0.2, 'sine'), 150);
  };
  
  const playExpiredSound = () => {
    if (!soundEnabledRef.current) return;
    initAudio();
    playBeep(400, 0.3, 'triangle');
  };

  const speakText = (text: string) => {
    if (!soundEnabledRef.current || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fa-IR'; // Persian
    utterance.rate = 1.0;
    speechSynthesis.speak(utterance);
  };

  const API_BASE = import.meta.env.VITE_API_URL || '';

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/client/data`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('clientToken')}` }
      });
      if (res.ok) {
        const data = await res.json();
        
        setSignals(prev => {
          if (prev.length > 0 && data.signals && data.signals.length > 0) {
            const latestPrev = prev[0];
            const latestNew = data.signals[0];
            if (latestNew.time > latestPrev.time) {
              playNewSignalSound();
              speakText(`سیگنال جدید ${latestNew.broker === 'btc' ? 'بیت کوین' : 'طلا'}. ${latestNew.type === 'BUY' ? 'خرید' : 'فروش'}`);
            } else if (latestPrev.status === 'ACTIVE' && latestNew.status !== 'ACTIVE') {
              playExpiredSound();
            }
          }
          return data.signals || [];
        });
        
        setBtcPrice(data.btcPrice || 0);
        setAlphaPrice(data.alphaPrice || 0);
      } else {
        if (res.status === 401) {
            handleLogout();
        }
      }
    } catch (e) {
      console.error('Error fetching data:', e);
    }
  };

  const startPolling = () => {
    const int = setInterval(fetchData, 3000);
    return () => clearInterval(int);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ text: '', type: '' });
    initAudio();

    try {
      const res = await fetch(`${API_BASE}/api/client/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        if (data.status === 'pending') {
          setMessage({ text: 'درخواست شما ثبت شد. در حال بررسی توسط پشتیبانی...', type: 'warning' });
        } else if (data.status === 'active') {
          localStorage.setItem('clientToken', data.token);
          setIsLogged(true);
          fetchData();
          startPolling();
        }
      } else {
        setMessage({ text: data.error || 'خطا در ورود', type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'خطای شبکه', type: 'error' });
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('clientToken');
    setIsLogged(false);
    setSignals([]);
  };

  if (!isLogged) {
    return (
      <div className="min-h-screen bg-[#020617] text-slate-200 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden" dir="rtl" style={{ fontFamily: 'Vazirmatn, Tahoma, sans-serif' }}>
        
        <div className="absolute top-[-10%] left-[-10%] w-[60%] sm:w-[40%] h-[60%] sm:h-[40%] rounded-full bg-blue-600/10 blur-[100px] sm:blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] sm:w-[40%] h-[60%] sm:h-[40%] rounded-full bg-emerald-600/10 blur-[100px] sm:blur-[120px] pointer-events-none"></div>

        <motion.div 
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-md bg-[#0f172a]/80 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-6 sm:p-8 border border-slate-700/50 relative z-10"
        >
          <div className="flex justify-center mb-6 sm:mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500 rounded-full blur-[20px] opacity-40 animate-pulse"></div>
              <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg transform rotate-3 relative z-10 border border-white/10">
                <Activity className="w-7 h-7 sm:w-8 sm:h-8 text-white -rotate-3" />
              </div>
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-center mb-2 text-white">لایپـاک مانیتـور</h2>
          <p className="text-slate-400 text-center mb-8 text-sm">لطفاً جهت ورود به سیستم، مشخصات خود را وارد کنید.</p>

          <AnimatePresence>
            {message.text && (
              <motion.div 
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className={`overflow-hidden rounded-xl text-sm ${message.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}
              >
                <div className="p-4 flex items-center gap-3">
                  {message.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <RefreshCw className="w-5 h-5 shrink-0 animate-spin" />}
                  <span className="font-medium">{message.text}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5 ml-1">کلمه کاربری / ایمیل</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  dir="ltr"
                  className="w-full bg-[#020617]/50 border border-slate-700/80 rounded-xl pl-4 pr-10 py-3.5 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono text-sm"
                  placeholder="user@example.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5 ml-1">رمز عبور</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  dir="ltr"
                  className="w-full bg-[#020617]/50 border border-slate-700/80 rounded-xl pl-4 pr-10 py-3.5 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono tracking-widest text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>
            <button 
              type="submit" 
              disabled={loading}
              className="mt-6 w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 transform active:scale-[0.98]"
            >
              {loading ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span className="tracking-wide">ورود امن</span>
                  <ArrowRight className="w-5 h-5 absolute left-4" />
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 pb-20 selection:bg-blue-500/30" dir="rtl" style={{ fontFamily: 'Vazirmatn, Tahoma, sans-serif' }}>
      {/* Header */}
      <header className="bg-[#0f172a]/80 backdrop-blur-xl border-b border-slate-800/80 sticky top-0 z-50 shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
             <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg sm:rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/20 border border-white/10">
                <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
             </div>
             <div>
               <h1 className="font-bold text-slate-100 leading-tight text-sm sm:text-base">لایپـاک مانیتـور</h1>
               <div className="flex items-center gap-1.5 mt-0.5 sm:mt-1">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                  <span className="text-[10px] sm:text-xs font-mono text-slate-400">اتصال زنده</span>
               </div>
             </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2">
            <button 
                onClick={() => {
                    const stats = `میزان وین ریت فعلی ${((signals.filter(s => ['TP1', 'TP2'].includes(s.status)).length / Math.max(1, signals.filter(s => ['TP1', 'TP2', 'SL'].includes(s.status)).length)) * 100).toFixed(0)} درصد است.`;
                    speakText(stats);
                }}
                className={`p-2 sm:p-2.5 text-emerald-400 hover:text-white hover:bg-emerald-500/10 hover:border-emerald-500/20 border border-transparent rounded-lg sm:rounded-xl transition-all`}
                title="گزارش صوتی آمار"
            >
                <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button 
                onClick={() => setCalculatorOpen(true)}
                className="p-2 sm:p-2.5 text-blue-400 hover:text-white hover:bg-blue-500/10 hover:border-blue-500/20 border border-transparent rounded-lg sm:rounded-xl transition-all"
                title="ماشین حساب حجم"
            >
                <Calculator className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button 
                onClick={() => {
                   setSoundEnabled(!soundEnabled);
                   if (!soundEnabled) {
                       initAudio();
                       playBeep(800, 0.1);
                   }
                }}
                className={`p-2 sm:p-2.5 ${soundEnabled ? 'text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/20' : 'text-slate-500 hover:bg-slate-800'} hover:text-white border border-transparent rounded-lg sm:rounded-xl transition-all`}
                title={soundEnabled ? 'صدا روشن' : 'صدا خاموش'}
            >
                {soundEnabled ? <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
            <button 
              onClick={handleLogout}
              className="p-2 sm:p-2.5 text-slate-400 hover:text-white hover:bg-rose-500/10 hover:border-rose-500/20 border border-transparent rounded-lg sm:rounded-xl transition-all"
              title="خروج"
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </header>
      
      <main className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-10">
            {/* Live Prices Header */}
            <div className="col-span-1 bg-[#0f172a]/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center shadow-lg relative overflow-hidden group hover:border-amber-500/30 transition-colors">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl -z-10 group-hover:bg-amber-500/10 transition-colors"></div>
                <span className="text-[10px] sm:text-[11px] text-slate-400 mb-1.5 font-medium tracking-wide">انس طلا (XAU)</span>
                <span className="text-lg sm:text-xl lg:text-2xl font-bold tracking-widest text-amber-400 font-mono drop-shadow-[0_0_12px_rgba(251,191,36,0.3)]">
                  {alphaPrice > 0 ? alphaPrice.toFixed(2) : '----.--'}
                </span>
            </div>
            <div className="col-span-1 bg-[#0f172a]/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center shadow-lg relative overflow-hidden group hover:border-sky-500/30 transition-colors">
                <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 rounded-full blur-3xl -z-10 group-hover:bg-sky-500/10 transition-colors"></div>
                <span className="text-[10px] sm:text-[11px] text-slate-400 mb-1.5 font-medium tracking-wide">بیت‌کوین (BTC)</span>
                <span className="text-lg sm:text-xl lg:text-2xl font-bold tracking-widest text-sky-400 font-mono drop-shadow-[0_0_12px_rgba(56,189,248,0.3)]">
                  {btcPrice > 0 ? btcPrice.toFixed(2) : '----.--'}
                 </span>
            </div>
            {/* Win Rate Stats */}
            <WinRateStats signals={signals} />
        </div>

        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
            <div className="p-1 sm:p-1.5 bg-blue-500/10 rounded-lg text-blue-400">
              <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            سیگنال‌های زنده و تاریخچه
          </h2>
        </div>

        <div className="space-y-3 sm:space-y-4">
            <AnimatePresence>
                {signals.map((sig, idx) => (
                    <SignalCard key={sig.time + '-' + idx} signal={sig} />
                ))}
            </AnimatePresence>
            {signals.length === 0 && (
                <div className="text-center py-16 text-slate-500 bg-[#0f172a]/40 rounded-3xl border border-slate-700/50 border-dashed backdrop-blur-sm">
                    <Activity className="w-12 h-12 mx-auto mb-4 text-slate-600 opacity-50" />
                    <p>در حال حاضر سیگنالی برای نمایش وجود ندارد</p>
                </div>
            )}
        </div>
        
        {/* Calculator Modal */}
        <AnimatePresence>
            {calculatorOpen && <RiskCalculator isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />}
        </AnimatePresence>
      </main>
    </div>
  );
}

function SignalCard({ signal }: { signal: any }) {
    const isBuy = signal.type === 'BUY';
    const bg = isBuy ? 'bg-[#0f172a]' : 'bg-[#0f172a]';
    const border = isBuy ? 'border-emerald-500/30' : 'border-rose-500/30';
    const text = isBuy ? 'text-emerald-500' : 'text-rose-500';
    const grad = isBuy ? 'from-emerald-500/10 to-transparent' : 'from-rose-500/10 to-transparent';

    const getStatusText = (status: string) => {
        switch(status) {
            case 'ACTIVE': return { text: 'فعال - در حال بررسی', style: 'text-blue-400 bg-blue-500/10 border border-blue-500/30', pulse: true };
            case 'TP1': return { text: 'تارگت ۱ تاچ شد!', style: 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/30', pulse: false };
            case 'TP2': return { text: 'تارگت ۲ تاچ شد 🚀', style: 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/30', pulse: false };
            case 'SL': return { text: 'استاپ لاس ❌', style: 'text-rose-400 bg-rose-500/10 border border-rose-500/30', pulse: false };
            case 'CLOSED': return { text: 'بسته شده', style: 'text-slate-400 bg-slate-800/50 border border-slate-700/50', pulse: false };
            default: return { text: 'نامشخص', style: 'text-slate-400 bg-slate-800/50 border border-slate-700/50', pulse: false };
        }
    };

    const statusInfo = getStatusText(signal.status || 'ACTIVE');

    return (
        <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`rounded-2xl border ${border} ${bg} relative overflow-hidden backdrop-blur-md shadow-lg`}
        >
            <div className={`absolute top-0 right-0 w-full h-full bg-gradient-to-b ${grad} pointer-events-none opacity-50`}></div>
            
            <div className="p-4 sm:p-5 relative z-10">
                <div className="flex justify-between items-start mb-4 sm:mb-5">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <span className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold tracking-wider shadow-sm ${isBuy ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'}`}>
                            {isBuy ? 'خرید (BUY)' : 'فروش (SELL)'}
                        </span>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                             <div className={`w-1.5 h-4 sm:h-6 rounded-full ${isBuy ? 'bg-emerald-500/50' : 'bg-rose-500/50'}`}></div>
                             <span className="text-white font-bold text-sm sm:text-base tracking-wide flex items-center">
                                 {signal.broker === 'btc' ? 'BTC/USDT' : 'XAU/USD'}
                             </span>
                        </div>
                    </div>
                    <div className="text-[10px] sm:text-xs font-mono text-slate-400 bg-slate-900/50 px-2 sm:px-2.5 py-1 rounded-md border border-slate-700/50">
                        {new Date(signal.time).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-5">
                    <div className="bg-[#020617]/50 p-2 sm:p-3 rounded-lg sm:rounded-xl border border-slate-800/80">
                        <div className="text-[10px] text-slate-500 mb-1">قیمت ورود</div>
                        <div className="font-mono text-sm sm:text-[15px] font-bold text-slate-200">{signal.price.toFixed(2)}</div>
                    </div>
                    <div className="bg-[#020617]/50 p-2 sm:p-3 rounded-lg sm:rounded-xl border border-emerald-900/30">
                        <div className="text-[10px] text-emerald-500/70 mb-1 flex justify-between">
                            <span>تارگت اول (TP1)</span>
                            {statusInfo.text.includes('1') && <CheckCircle className="w-3 h-3 text-emerald-500" />}
                        </div>
                        <div className="font-mono text-sm sm:text-[15px] font-bold text-emerald-400">{signal.tp?.toFixed(2) || '---'}</div>
                    </div>
                    <div className="bg-[#020617]/50 p-2 sm:p-3 rounded-lg sm:rounded-xl border border-emerald-900/30">
                        <div className="text-[10px] text-emerald-500/70 mb-1 flex justify-between">
                            <span>تارگت دوم (TP2)</span>
                            {statusInfo.text.includes('2') && <CheckCircle className="w-3 h-3 text-emerald-500" />}
                        </div>
                        <div className="font-mono text-sm sm:text-[15px] font-bold text-emerald-400">{signal.tp2?.toFixed(2) || '---'}</div>
                    </div>
                    <div className="bg-[#020617]/50 p-2 sm:p-3 rounded-lg sm:rounded-xl border border-rose-900/30">
                        <div className="text-[10px] text-rose-500/70 mb-1 flex justify-between">
                            <span>حد ضرر (SL)</span>
                            {statusInfo.text.includes('استاپ') && <XCircle className="w-3 h-3 text-rose-500" />}
                        </div>
                        <div className="font-mono text-sm sm:text-[15px] font-bold text-rose-400">{signal.sl?.toFixed(2) || '---'}</div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                   <div className={`text-[11px] sm:text-xs px-3 sm:px-3.5 py-1.5 rounded-lg inline-flex items-center gap-2 font-medium w-full sm:w-auto justify-center sm:justify-start ${statusInfo.style}`}>
                       {statusInfo.pulse && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0"></div>}
                       {statusInfo.text}
                   </div>
                   
                   <div className="text-[10px] text-slate-500 font-mono w-full sm:w-auto text-center sm:text-left mt-1 sm:mt-0">
                      ID: {signal.time.toString().slice(-6)}
                   </div>
                </div>
            </div>

            {/* Glowing top border indicator */}
            <div className={`absolute top-0 left-0 w-full h-[2px] ${isBuy ? 'bg-gradient-to-r from-transparent via-emerald-500 to-transparent' : 'bg-gradient-to-r from-transparent via-rose-500 to-transparent'}`}></div>
        </motion.div>
    );
}

function WinRateStats({ signals }: { signals: any[] }) {
    const closedSignals = signals.filter(s => ['TP1', 'TP2', 'SL'].includes(s.status));
    const wins = closedSignals.filter(s => ['TP1', 'TP2'].includes(s.status)).length;
    const losses = closedSignals.filter(s => s.status === 'SL').length;
    const total = closedSignals.length;
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(0) : '0';

    return (
        <div className="col-span-2 bg-[#0f172a]/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-4 sm:p-5 shadow-lg flex items-center justify-between group hover:border-emerald-500/30 transition-colors relative overflow-hidden">
             <div className="absolute bottom-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -z-10 group-hover:bg-emerald-500/10 transition-colors"></div>
             <div className="flex flex-col">
                 <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2 text-slate-300 font-bold text-sm sm:text-base">
                     <PieChart className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
                     <span>آمار وین‌ریت</span>
                 </div>
                 <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-4 text-[11px] sm:text-xs font-mono">
                    <div className="flex items-center gap-1 sm:gap-1.5 text-emerald-400">
                        <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span>{wins} پیروزی</span>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-1.5 text-rose-400">
                        <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span>{losses} شکست</span>
                    </div>
                 </div>
             </div>
             
             <div className="flex flex-col items-center pl-1">
                 <div className="text-2xl sm:text-3xl font-bold font-mono text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.3)]">
                     {winRate}%
                 </div>
                 <div className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5 sm:mt-1">از {total} معامله</div>
             </div>
        </div>
    );
}

function RiskCalculator({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
    const [balance, setBalance] = useState<string>('1000');
    const [riskPercent, setRiskPercent] = useState<string>('1');
    const [stopLossPips, setStopLossPips] = useState<string>('50');
    
    const riskAmount = (Number(balance) * Number(riskPercent)) / 100;
    const lotSize = stopLossPips && Number(stopLossPips) > 0 ? (riskAmount / (Number(stopLossPips) * 10)).toFixed(2) : '0.00';

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-[#020617]/80 backdrop-blur-sm"
        >
            <motion.div 
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-[#0f172a] border border-slate-700 w-full max-w-sm rounded-2xl sm:rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden"
            >
                <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-900/50">
                    <h3 className="font-bold text-slate-200 flex items-center gap-2 text-sm sm:text-base">
                        <Calculator className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
                        ماشین حساب حجم 
                    </h3>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                        <X className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                </div>
                
                <div className="p-4 sm:p-5 space-y-4">
                    <div>
                        <label className="block text-[11px] sm:text-xs font-medium text-slate-400 mb-1.5">موجودی حساب (دلار)</label>
                        <div className="relative">
                            <input 
                                type="number" 
                                value={balance} 
                                onChange={e => setBalance(e.target.value)}
                                className="w-full bg-[#020617] border border-slate-700 rounded-lg sm:rounded-xl px-4 py-2.5 sm:py-3 text-white focus:outline-none focus:border-blue-500 font-mono text-left text-sm"
                                dir="ltr"
                            />
                            <span className="absolute left-4 top-2.5 sm:top-3.5 text-slate-500">$</span>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] sm:text-xs font-medium text-slate-400 mb-1.5">ریسک (%)</label>
                            <div className="relative">
                                <input 
                                    type="number" 
                                    value={riskPercent} 
                                    onChange={e => setRiskPercent(e.target.value)}
                                    className="w-full bg-[#020617] border border-slate-700 rounded-lg sm:rounded-xl px-4 py-2.5 sm:py-3 text-white focus:outline-none focus:border-blue-500 font-mono text-left text-sm"
                                    dir="ltr"
                                />
                                <Percent className="w-3.5 h-3.5 sm:w-4 sm:h-4 absolute left-3 top-3 sm:top-3.5 text-slate-500" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[11px] sm:text-xs font-medium text-slate-400 mb-1.5">حد ضرر (پیپ)</label>
                            <input 
                                type="number" 
                                value={stopLossPips} 
                                onChange={e => setStopLossPips(e.target.value)}
                                className="w-full bg-[#020617] border border-slate-700 rounded-lg sm:rounded-xl px-4 py-2.5 sm:py-3 text-white focus:outline-none focus:border-blue-500 font-mono text-left text-sm"
                                dir="ltr"
                            />
                        </div>
                    </div>
                </div>
                
                <div className="p-4 sm:p-5 bg-blue-900/20 border-t border-blue-900/30 flex items-center justify-between">
                    <div>
                        <div className="text-[10px] text-slate-400 mb-0.5">مبلغ در ریسک: <span className="font-mono text-amber-400">${riskAmount.toFixed(2)}</span></div>
                        <div className="text-[11px] sm:text-xs font-bold text-slate-300">حجم پیشنهادی فارکس (Lot)</div>
                    </div>
                    <div className="text-2xl sm:text-3xl font-black font-mono text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]">
                        {lotSize}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

export default App;
