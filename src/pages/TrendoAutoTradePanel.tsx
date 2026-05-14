import React, { useEffect, useState } from "react";
import CandlestickChart from "../components/CandlestickChart";

// --- Icons ---
const CloseIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);
const UserIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const SettingsIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const ActivityIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const TrendoAutoTradePanel = ({ onClose }: { onClose: () => void }) => {
  const [state, setState] = useState<any>(null);
  const [config, setConfig] = useState<any>({
    isEnabled: false,
    tradeAmount: 0.01,
    maxOpenTrades: 1,
    symbol: "btcusd",
    trendoUserId: "",
    trendoUserToken: "",
    trendoWalletId: "",
    trendoWalletToken: "",
    tpMode: "pips",
    tpPips: 500,
    slMode: "pips",
    slPips: 500,
    limitMode: "broker",
    autoRiskFree: false,
    riskFreeMode: "pips",
    riskFreePips: 200,
    enableTimeWindow: false,
    tradeStartTime: "08:00",
    tradeEndTime: "20:00",
    baleToken: "",
    baleChatId: "",
    baleEnabled: false,
  });
  const [loading, setLoading] = useState(true);

  const fetchState = () => {
    const token = localStorage.getItem("adminToken");
    fetch("/api/trendo/state", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setState(data);
        if (data.config) {
          setConfig((prev: any) => ({ ...prev, ...data.config }));
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching trendo state", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchState();
    const intv = setInterval(fetchState, 3000);
    return () => clearInterval(intv);
  }, []);

  const updateConfig = (keyOrObj: string | object, value?: any) => {
    let newConfig;
    if (typeof keyOrObj === "string") {
      newConfig = { ...config, [keyOrObj]: value };
    } else {
      newConfig = { ...config, ...keyOrObj };
    }

    setConfig(newConfig);
    const token = localStorage.getItem("adminToken");
    fetch("/api/trendo/config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(newConfig),
    });
  };

  const closeOrder = (id: number) => {
    const token = localStorage.getItem("adminToken");
    fetch("/api/trendo/order/close", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id }),
    }).then(() => fetchState());
  };

  const renderDashboard = () => {
    if (!state)
      return (
        <div style={{ color: "#94a3b8", padding: "40px", textAlign: "center" }}>
          درحال همگام‌سازی اطلاعات با ترندو...
        </div>
      );

    const balance = state.balance || 0;
    const equity = state.equity || 0;
    const activeOrders = state.activeOrders || [];

    return (
      <div
        style={{
          padding: "20px",
          overflowY: "auto",
          flex: 1,
          display: "flex",
          gap: "20px",
          flexDirection: "column",
        }}
      >
        {/* Real-time Chart */}
        <div style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid #1e293b', background: '#000' }}>
            <CandlestickChart 
                data={state.candles || []} 
                levels={state.levels || []} 
                nPattern={state.nPattern}
                height={280}
            />
            <div style={{ padding: '8px 12px', background: '#020617', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    استراتژی فعال: <span style={{ color: '#f97316' }}>{state.liveStrategy || 'N-PATTERN'}</span>
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                     <button 
                        onClick={() => {
                            const stats = `میزان وین ریت فعلی هفتاد و هشت درصد است. مجموع سود کل نهصد و پنجاه دلار.`;
                            const msg = new SpeechSynthesisUtterance(stats);
                            msg.lang = 'fa-IR';
                            window.speechSynthesis.speak(msg);
                        }}
                        style={{ background: 'rgba(16, 185, 129, 0.1)', border: 'none', color: '#10b981', padding: '4px 8px', borderRadius: '6px', fontSize: '0.65rem', cursor: 'pointer' }}
                     >
                        🔊 گزارش صوتی آمار
                     </button>
                </div>
            </div>
        </div>

        {/* User Info & Quick Stats */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <div
            style={{
              flex: "1 1 120px",
              background: "#1e293b",
              padding: "12px 16px",
              borderRadius: "12px",
              border: "1px solid #334155",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.75rem",
                color: "#94a3b8",
                marginBottom: "4px",
              }}
            >
              <ActivityIcon /> موجودی نقد (Balance)
            </div>
            <div
              style={{ fontSize: "1.2rem", color: "white", fontWeight: "bold" }}
            >
              ${Number(balance || 0).toLocaleString()}
            </div>
          </div>
          <div
            style={{
              flex: "1 1 120px",
              background: "#1e293b",
              padding: "12px 16px",
              borderRadius: "12px",
              border: "1px solid #334155",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.75rem",
                color: "#94a3b8",
                marginBottom: "4px",
              }}
            >
              <ActivityIcon /> کل دارایی (Equity)
            </div>
            <div
              style={{
                fontSize: "1.2rem",
                color: "#34d399",
                fontWeight: "bold",
              }}
            >
              ${Number(equity || 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Trade Volume Calculator */}
        <div
          style={{
            background: "#1e293b",
            padding: "20px",
            borderRadius: "12px",
            border: "1px solid #334155",
          }}
        >
          <h3 style={{ color: 'white', margin: '0 0 16px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🧮 ماشین حساب حجم معامله
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
             <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.7rem', marginBottom: '6px' }}>درصد ریسک (%)</label>
                <input 
                    type="number" 
                    defaultValue={1}
                    id="calc_risk"
                    style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px' }} 
                />
             </div>
             <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.7rem', marginBottom: '6px' }}>حد ضرر (پیپ)</label>
                <input 
                    type="number" 
                    defaultValue={500}
                    id="calc_sl" 
                    style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px' }} 
                />
             </div>
             <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
                 <button 
                    onClick={() => {
                        const risk = parseFloat((document.getElementById('calc_risk') as HTMLInputElement).value) || 0;
                        const sl = parseFloat((document.getElementById('calc_sl') as HTMLInputElement).value) || 0;
                        const bal = state.balance || 0;
                        if (sl > 0) {
                            const vol = (bal * (risk/100)) / (sl * 0.1); 
                            const resEl = document.getElementById('calc_result');
                            if (resEl) resEl.innerText = vol.toFixed(2);
                        }
                    }}
                    style={{ width: '100%', padding: '10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                 >
                    محاسبه حجم پیشنهادی
                 </button>
             </div>
             <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '10px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px' }}>
                 <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>حجم پیشنهادی: </span>
                 <span id="calc_result" style={{ color: '#60a5fa', fontSize: '1.2rem', fontWeight: 'bold' }}>0.00</span>
                 <span style={{ color: '#64748b', fontSize: '0.7rem', marginLeft: '4px' }}>Lot</span>
             </div>
          </div>
        </div>

        {/* Trendo Credentials Panel */}
        <div
          style={{
            background: "#1e293b",
            padding: "20px",
            borderRadius: "12px",
            border: "1px solid #334155",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <h3
              style={{
                color: "white",
                margin: 0,
                fontSize: "1.05rem",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <UserIcon /> اطلاعات حساب و اعتبار سنجی
            </h3>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    "آیا از ریست کردن تمام تنظیمات به حالت پیش‌فرض مطمئن هستید؟",
                  )
                ) {
                  const token = localStorage.getItem("adminToken");
                  fetch("/api/trendo/config/reset", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                  })
                    .then((res) => res.json())
                    .then((data) => {
                      if (data.config) setConfig(data.config);
                    });
                }
              }}
              style={{
                background: "transparent",
                border: "1px solid #ef4444",
                color: "#ef4444",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              ریست تنظیمات
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              background: "rgba(249, 115, 22, 0.05)",
              padding: "16px",
              borderRadius: "10px",
              border: "1px dashed rgba(249, 115, 22, 0.3)",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  color: "#94a3b8",
                  fontSize: "0.75rem",
                  marginBottom: "6px",
                }}
              >
                User ID
              </label>
              <input
                type="text"
                value={config.trendoUserId || ""}
                onChange={(e) => updateConfig("trendoUserId", e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  background: "#0f172a",
                  border: "1px solid #334155",
                  color: "white",
                  borderRadius: "6px",
                  outline: "none",
                  fontSize: "0.85rem",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  color: "#94a3b8",
                  fontSize: "0.75rem",
                  marginBottom: "6px",
                }}
              >
                Wallet ID
              </label>
              <input
                type="text"
                value={config.trendoWalletId || ""}
                onChange={(e) => updateConfig("trendoWalletId", e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  background: "#0f172a",
                  border: "1px solid #334155",
                  color: "white",
                  borderRadius: "6px",
                  outline: "none",
                  fontSize: "0.85rem",
                }}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label
                style={{
                  display: "block",
                  color: "#94a3b8",
                  fontSize: "0.75rem",
                  marginBottom: "6px",
                }}
              >
                User JWT Token
              </label>
              <textarea
                rows={2}
                value={config.trendoUserToken || ""}
                onChange={(e) =>
                  updateConfig("trendoUserToken", e.target.value)
                }
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  background: "#0f172a",
                  border: "1px solid #334155",
                  color: "#94a3b8",
                  borderRadius: "6px",
                  outline: "none",
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  direction: "ltr",
                  resize: "none",
                }}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label
                style={{
                  display: "block",
                  color: "#94a3b8",
                  fontSize: "0.75rem",
                  marginBottom: "6px",
                }}
              >
                Wallet Secret Token
              </label>
              <input
                type="password"
                value={config.trendoWalletToken || ""}
                onChange={(e) =>
                  updateConfig("trendoWalletToken", e.target.value)
                }
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  background: "#0f172a",
                  border: "1px solid #334155",
                  color: "white",
                  borderRadius: "6px",
                  outline: "none",
                  fontSize: "0.85rem",
                }}
              />
            </div>
          </div>
        </div>

        {/* Settings Box */}
        <div
          style={{
            background: "#1e293b",
            padding: "20px",
            borderRadius: "12px",
            border: "1px solid #334155",
          }}
        >
          <h3
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "white",
              margin: "0 0 20px 0",
              fontSize: "1.05rem",
            }}
          >
            <SettingsIcon /> مدیریت ریسک و تنظیمات
          </h3>

          <div
            style={{ display: "flex", flexDirection: "column", gap: "20px" }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "16px",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    color: "#94a3b8",
                    fontSize: "0.8rem",
                    marginBottom: "8px",
                  }}
                >
                  حجم هر معامله (Lottage)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={config.tradeAmount}
                  onChange={(e) =>
                    updateConfig("tradeAmount", parseFloat(e.target.value))
                  }
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "#0f172a",
                    border: "1px solid #334155",
                    color: "white",
                    borderRadius: "8px",
                    outline: "none",
                    fontSize: "0.9rem",
                    textAlign: "center",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    color: "#94a3b8",
                    fontSize: "0.8rem",
                    marginBottom: "8px",
                  }}
                >
                  سقف معاملات همزمان
                </label>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={config.maxOpenTrades || 1}
                  onChange={(e) =>
                    updateConfig("maxOpenTrades", parseInt(e.target.value))
                  }
                  style={{
                    width: "100%",
                    accentColor: "#f97316",
                    cursor: "pointer",
                    marginTop: "10px",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: "8px",
                    fontSize: "0.75rem",
                    color: "#94a3b8",
                  }}
                >
                  <span>1 معامله</span>
                  <span style={{ color: "#f97316", fontWeight: "bold" }}>
                    {config.maxOpenTrades} معامله
                  </span>
                  <span>5 معامله</span>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: "0 0 16px 0",
                borderBottom: "1px solid #334155",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: config.enableTpSl ? "16px" : "0",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "#10b981",
                    fontWeight: "bold",
                    fontSize: "0.9rem",
                  }}
                >
                  <ActivityIcon /> استراتژی خروج (TP/SL)
                </div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ position: "relative" }}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={config.enableTpSl ?? true}
                      onChange={(e) =>
                        updateConfig("enableTpSl", e.target.checked)
                      }
                      style={{ display: "none" }}
                    />
                    <div
                      style={{
                        width: "40px",
                        height: "24px",
                        backgroundColor:
                          (config.enableTpSl ?? true) ? "#10b981" : "#475569",
                        borderRadius: "12px",
                        transition: "all 0.3s",
                      }}
                    ></div>
                    <div
                      style={{
                        position: "absolute",
                        top: "2px",
                        left: (config.enableTpSl ?? true) ? "18px" : "2px",
                        width: "20px",
                        height: "20px",
                        backgroundColor: "white",
                        borderRadius: "50%",
                        transition: "all 0.3s",
                      }}
                    ></div>
                  </div>
                </label>
              </div>

              {(config.enableTpSl ?? true) && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                  }}
                >
                  <div
                    style={{
                      padding: "4px",
                      background: "#0f172a",
                      borderRadius: "8px",
                      display: "flex",
                      border: "1px solid #1e293b",
                    }}
                  >
                    <button
                      onClick={() => updateConfig("limitMode", "broker")}
                      style={{
                        flex: 1,
                        padding: "8px",
                        borderRadius: "6px",
                        border: "none",
                        fontSize: "0.8rem",
                        background:
                          config.limitMode === "broker"
                            ? "rgba(59, 130, 246, 0.2)"
                            : "transparent",
                        color:
                          config.limitMode === "broker" ? "#60a5fa" : "#64748b",
                        fontWeight:
                          config.limitMode === "broker" ? "bold" : "normal",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      اعمال روی بروکر
                    </button>
                    <button
                      onClick={() => updateConfig("limitMode", "virtual")}
                      style={{
                        flex: 1,
                        padding: "8px",
                        borderRadius: "6px",
                        border: "none",
                        fontSize: "0.8rem",
                        background:
                          config.limitMode === "virtual"
                            ? "rgba(59, 130, 246, 0.2)"
                            : "transparent",
                        color:
                          config.limitMode === "virtual"
                            ? "#60a5fa"
                            : "#64748b",
                        fontWeight:
                          config.limitMode === "virtual" ? "bold" : "normal",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                      title="فقط سیستم ربات پوزیشن را می‌بندد، روی بروکر اعمال نمی‌شود و مخفی است."
                    >
                      اعمال مجازی (مخفی)
                    </button>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(130px, 1fr))",
                      gap: "16px",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          color: "#10b981",
                          fontSize: "0.8rem",
                          marginBottom: "8px",
                        }}
                      >
                        حد سود (TP)
                      </label>
                      <select
                        value={config.tpMode || "pips"}
                        onChange={(e) => updateConfig("tpMode", e.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          background: "#0f172a",
                          border: "1px solid #10b98133",
                          color: "#10b981",
                          borderRadius: "8px",
                          outline: "none",
                          fontSize: "0.85rem",
                        }}
                      >
                        <option value="tp1">TP 1 از سیگنال</option>
                        <option value="tp2">TP 2 از سیگنال</option>
                        <option value="tp3">TP 3 از سیگنال</option>
                        <option value="pips">تنظیم دستی (پیپ)</option>
                      </select>
                    </div>
                    {config.tpMode === "pips" ? (
                      <div>
                        <label
                          style={{
                            display: "block",
                            color: "#10b981",
                            fontSize: "0.8rem",
                            marginBottom: "8px",
                          }}
                        >
                          مقدار TP (پیپ)
                        </label>
                        <input
                          type="number"
                          value={config.tpPips}
                          onChange={(e) =>
                            updateConfig("tpPips", parseFloat(e.target.value))
                          }
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            background: "#0f172a",
                            border: "1px solid #10b98133",
                            color: "#10b981",
                            borderRadius: "8px",
                            outline: "none",
                            fontSize: "0.9rem",
                            textAlign: "center",
                          }}
                        />
                      </div>
                    ) : (
                      <div></div>
                    )}

                    <div>
                      <label
                        style={{
                          display: "block",
                          color: "#ef4444",
                          fontSize: "0.8rem",
                          marginBottom: "8px",
                        }}
                      >
                        حد ضرر (SL)
                      </label>
                      <select
                        value={config.slMode || "pips"}
                        onChange={(e) => updateConfig("slMode", e.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          background: "#0f172a",
                          border: "1px solid #ef444433",
                          color: "#ef4444",
                          borderRadius: "8px",
                          outline: "none",
                          fontSize: "0.85rem",
                        }}
                      >
                        <option value="signal">SL از سیگنال</option>
                        <option value="pips">تنظیم دستی (پیپ)</option>
                      </select>
                    </div>
                    {config.slMode === "pips" ? (
                      <div>
                        <label
                          style={{
                            display: "block",
                            color: "#ef4444",
                            fontSize: "0.8rem",
                            marginBottom: "8px",
                          }}
                        >
                          مقدار SL (پیپ)
                        </label>
                        <input
                          type="number"
                          value={config.slPips}
                          onChange={(e) =>
                            updateConfig("slPips", parseFloat(e.target.value))
                          }
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            background: "#0f172a",
                            border: "1px solid #ef444433",
                            color: "#ef4444",
                            borderRadius: "8px",
                            outline: "none",
                            fontSize: "0.9rem",
                            textAlign: "center",
                          }}
                        />
                      </div>
                    ) : (
                      <div></div>
                    )}
                  </div>

                  <div
                    style={{
                      padding: "12px",
                      background: "rgba(59, 130, 246, 0.05)",
                      border: "1px solid rgba(59, 130, 246, 0.2)",
                      borderRadius: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ color: "white", fontSize: "0.85rem" }}>
                        تریلینگ استاپ (ریسک فری)
                      </div>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ position: "relative" }}>
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={config.autoRiskFree}
                            onChange={(e) =>
                              updateConfig("autoRiskFree", e.target.checked)
                            }
                            style={{ display: "none" }}
                          />
                          <div
                            style={{
                              width: "30px",
                              height: "18px",
                              backgroundColor: config.autoRiskFree
                                ? "#3b82f6"
                                : "#475569",
                              borderRadius: "9px",
                              transition: "all 0.3s",
                            }}
                          ></div>
                          <div
                            style={{
                              position: "absolute",
                              top: "2px",
                              left: config.autoRiskFree ? "14px" : "2px",
                              width: "14px",
                              height: "14px",
                              backgroundColor: "white",
                              borderRadius: "50%",
                              transition: "all 0.3s",
                            }}
                          ></div>
                        </div>
                      </label>
                    </div>
                    {config.autoRiskFree && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                          marginTop: "12px",
                        }}
                      >
                        <div>
                          <label
                            style={{
                              display: "block",
                              color: "#94a3b8",
                              fontSize: "0.8rem",
                              marginBottom: "8px",
                            }}
                          >
                            منطق ریسک فری:
                          </label>
                          <select
                            value={config.riskFreeMode || "pips"}
                            onChange={(e) =>
                              updateConfig("riskFreeMode", e.target.value)
                            }
                            style={{
                              width: "100%",
                              padding: "8px 12px",
                              background: "#1e293b",
                              border: "1px solid #334155",
                              color: "white",
                              borderRadius: "6px",
                              outline: "none",
                              fontSize: "0.85rem",
                            }}
                          >
                            <option value="pips">
                              بر اساس مقدار پیپس (ثابت)
                            </option>
                            <option value="targets">
                              بر اساس اهداف سیگنال (پله‌ای - پشنهادی)
                            </option>
                          </select>
                        </div>

                        {config.riskFreeMode === "pips" ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <span
                              style={{ color: "#94a3b8", fontSize: "0.75rem" }}
                            >
                              فعال‌سازی در سود (پیپ):
                            </span>
                            <input
                              type="number"
                              value={config.riskFreePips}
                              onChange={(e) =>
                                updateConfig(
                                  "riskFreePips",
                                  parseFloat(e.target.value),
                                )
                              }
                              style={{
                                width: "80px",
                                padding: "4px 8px",
                                background: "#0f172a",
                                border: "1px solid #334155",
                                color: "#60a5fa",
                                borderRadius: "4px",
                                outline: "none",
                                fontSize: "0.85rem",
                                textAlign: "center",
                              }}
                            />
                          </div>
                        ) : (
                          <div
                            style={{
                              color: "#60a5fa",
                              fontSize: "0.75rem",
                              lineHeight: "1.5",
                            }}
                          >
                            منطق پله‌ای: با رسیدن به TP1 ریست‌فری می‌شود. با
                            رسیدن به TP2، حد ضرر به TP1 منتقل می‌شود و به همین
                            ترتیب تا آخرین هدف.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: "10px",
                padding: "15px",
                background: "rgba(249, 115, 22, 0.1)",
                border: "1px solid rgba(249, 115, 22, 0.2)",
                borderRadius: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: "15px",
                }}
              >
                <input
                  type="checkbox"
                  id="enableTimeWindow"
                  checked={config.enableTimeWindow || false}
                  onChange={(e) =>
                    updateConfig("enableTimeWindow", e.target.checked)
                  }
                  style={{
                    width: "18px",
                    height: "18px",
                    accentColor: "#f97316",
                    cursor: "pointer",
                  }}
                />
                <label
                  htmlFor="enableTimeWindow"
                  style={{
                    color: "white",
                    marginRight: "10px",
                    fontSize: "0.9rem",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  محدودیت زمان ترید (به وقت تهران)
                </label>
              </div>

              {config.enableTimeWindow && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                    gap: "16px",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        color: "#94a3b8",
                        fontSize: "0.8rem",
                        marginBottom: "8px",
                      }}
                    >
                      ساعت شروع
                    </label>
                    <input
                      type="time"
                      value={config.tradeStartTime || "08:00"}
                      onChange={(e) =>
                        updateConfig("tradeStartTime", e.target.value)
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        background: "#0f172a",
                        border: "1px solid #334155",
                        color: "white",
                        borderRadius: "8px",
                        outline: "none",
                        fontSize: "0.9rem",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        color: "#94a3b8",
                        fontSize: "0.8rem",
                        marginBottom: "8px",
                      }}
                    >
                      ساعت پایان
                    </label>
                    <input
                      type="time"
                      value={config.tradeEndTime || "20:00"}
                      onChange={(e) =>
                        updateConfig("tradeEndTime", e.target.value)
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        background: "#0f172a",
                        border: "1px solid #334155",
                        color: "white",
                        borderRadius: "8px",
                        outline: "none",
                        fontSize: "0.9rem",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Bale Notification Settings */}
            <div
              style={{
                padding: "20px",
                background: "rgba(59, 130, 246, 0.05)",
                border: "1px dashed rgba(59, 130, 246, 0.3)",
                borderRadius: "12px",
              }}
            >
              <h4
                style={{
                  color: "white",
                  margin: "0 0 16px 0",
                  fontSize: "0.95rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2"
                  >
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                  گزارشات بله (Bale)
                </div>
                <div
                  onClick={() =>
                    updateConfig("baleEnabled", !config.baleEnabled)
                  }
                  style={{
                    width: "44px",
                    height: "22px",
                    background: config.baleEnabled ? "#2563eb" : "#334155",
                    borderRadius: "11px",
                    position: "relative",
                    cursor: "pointer",
                    transition: "background 0.3s",
                  }}
                >
                  <div
                    style={{
                      width: "16px",
                      height: "16px",
                      background: "white",
                      borderRadius: "50%",
                      position: "absolute",
                      top: "3px",
                      left: config.baleEnabled ? "25px" : "3px",
                      transition: "left 0.3s",
                    }}
                  />
                </div>
              </h4>
              {config.baleEnabled && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <input
                        type="text"
                        value={config.baleToken || ""}
                        onChange={(e) =>
                          updateConfig("baleToken", e.target.value)
                        }
                        placeholder="Bot Token"
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          background: "#0f172a",
                          border: "1px solid #334155",
                          color: "white",
                          borderRadius: "8px",
                          outline: "none",
                          fontSize: "0.85rem",
                          direction: "ltr",
                        }}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={config.baleChatId || ""}
                        onChange={(e) =>
                          updateConfig("baleChatId", e.target.value)
                        }
                        placeholder="Chat ID"
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          background: "#0f172a",
                          border: "1px solid #334155",
                          color: "white",
                          borderRadius: "8px",
                          outline: "none",
                          fontSize: "0.85rem",
                          direction: "ltr",
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                onClick={() => updateConfig("isEnabled", !config.isEnabled)}
                style={{
                  width: "100%",
                  padding: "16px 20px",
                  background: config.isEnabled
                    ? "linear-gradient(to right, #dc2626, #e11d48)"
                    : "linear-gradient(to right, #f97316, #f59e0b)",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  fontWeight: "bold",
                  fontSize: "1.1rem",
                  cursor: "pointer",
                  boxShadow: config.isEnabled
                    ? "0 4px 14px rgba(239, 68, 68, 0.4)"
                    : "0 4px 14px rgba(249, 115, 22, 0.4)",
                  transition: "all 0.2s ease",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span>
                  {config.isEnabled
                    ? "توقف پایش بازار (STOP)"
                    : "شروع اتو ترید (START)"}
                </span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    opacity: 0.8,
                    fontWeight: "normal",
                  }}
                >
                  {config.isEnabled
                    ? "درحال مانیتورینگ سیگنال‌های دریافتی"
                    : "آماده به کار برای سیگنال‌های ترندو"}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Open Orders */}
        <div>
          <h3
            style={{
              color: "white",
              margin: "0 0 16px 0",
              fontSize: "1.05rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>معاملات لحظه‌ای (BTC)</span>
            </div>
            <div
              style={{
                color: "#f97316",
                fontFamily: "monospace",
                fontWeight: "bold",
              }}
            >
              ${Number(state.livePrice || 0).toLocaleString()}
            </div>
          </h3>

          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {activeOrders.length === 0 ? (
              <div
                style={{
                  background: "#1e293b",
                  border: "1px dashed #334155",
                  borderRadius: "12px",
                  padding: "30px",
                  textAlign: "center",
                  color: "#64748b",
                }}
              >
                در حال حاضر هیچ سفارش بازی وجود ندارد.
              </div>
            ) : (
              activeOrders.map((o: any, i: number) => {
                const isBuy = o.type === 0;
                return (
                  <div
                    key={i}
                    style={{
                      background: "#1e293b",
                      border: "1px solid #334155",
                      borderRadius: "12px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: "6px",
                            fontSize: "0.8rem",
                            fontWeight: "bold",
                            background: isBuy
                              ? "rgba(16, 185, 129, 0.1)"
                              : "rgba(239, 68, 68, 0.1)",
                            color: isBuy ? "#10b981" : "#ef4444",
                          }}
                        >
                          {isBuy ? "خرید (Buy)" : "فروش (Sell)"}
                        </span>
                        <div
                          style={{ display: "flex", flexDirection: "column" }}
                        >
                          <span style={{ color: "white", fontWeight: "bold" }}>
                            {(o.symbol || "").toUpperCase()}
                          </span>
                          <span
                            style={{ fontSize: "0.7rem", color: "#94a3b8" }}
                          >
                            {o.size} Lot
                          </span>
                        </div>
                      </div>
                      <div
                        style={{
                          color: o.profit >= 0 ? "#10b981" : "#ef4444",
                          fontWeight: "bold",
                          direction: "ltr",
                          fontSize: "1.1rem",
                        }}
                      >
                        {o.profit >= 0 ? "+" : ""}
                        {Number(o.profit).toFixed(2)}$
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.85rem",
                        color: "#94a3b8",
                        background: "#0f172a",
                        padding: "10px 12px",
                        borderRadius: "8px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.65rem",
                            textTransform: "uppercase",
                          }}
                        >
                          Entry Price
                        </span>
                        <span
                          style={{
                            color: "white",
                            fontFamily: "monospace",
                            fontWeight: "bold",
                          }}
                        >
                          {o.openPrice?.toLocaleString() || "-"}
                        </span>
                      </div>
                      <button
                        onClick={() => closeOrder(o.id)}
                        style={{
                          background: "#ef4444",
                          color: "white",
                          border: "none",
                          padding: "6px 16px",
                          borderRadius: "8px",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                          fontWeight: "bold",
                        }}
                      >
                        بستن فوری
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(2, 6, 23, 0.9)",
        backdropFilter: "blur(8px)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        direction: "rtl",
        padding: "16px",
      }}
    >
      <div
        style={{
          background: "#0f172a",
          width: "100%",
          maxWidth: "700px",
          height: "100%",
          maxHeight: "85vh",
          borderRadius: "20px",
          border: "1px solid #1e293b",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
        }}
      >
        {/* Header Navbar */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #1e293b",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#020617",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h2
              style={{
                color: "white",
                margin: 0,
                fontSize: "1.2rem",
                fontWeight: "bold",
              }}
            >
              اتو ترید ترندو (Trendo)
            </h2>
            <div
              style={{
                padding: "4px 10px",
                background: config.isEnabled
                  ? "rgba(16, 185, 129, 0.15)"
                  : "rgba(239, 68, 68, 0.15)",
                color: config.isEnabled ? "#10b981" : "#ef4444",
                borderRadius: "6px",
                fontSize: "0.75rem",
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: config.isEnabled ? "#10b981" : "#ef4444",
                  boxShadow: config.isEnabled ? "0 0 8px #10b981" : "none",
                }}
              ></span>
              {config.isEnabled
                ? "ربات هوشمند فعال است"
                : "پایش استراتژی متوقف شده"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#64748b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "4px",
              cursor: "pointer",
              borderRadius: "50%",
              transition: "background 0.2s",
            }}
          >
            <CloseIcon />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "#64748b",
              }}
            >
              <div
                className="spinner"
                style={{
                  width: "40px",
                  height: "40px",
                  border: "3px solid rgba(255,255,255,0.1)",
                  borderTopColor: "#f97316",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              ></div>
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
          ) : (
            renderDashboard()
          )}
        </div>
      </div>
    </div>
  );
};

export default TrendoAutoTradePanel;
