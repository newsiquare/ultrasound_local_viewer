"use client";

import { createContext, FormEvent, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";

import { Eye, EyeOff, Lock, LogOut, Shield, User } from "lucide-react";

// ─── Auth Context ──────────────────────────────────────────────────────────────

interface AdminAuthContextValue {
  user: string;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function useAdminAuth(): AdminAuthContextValue | null {
  return useContext(AdminAuthContext);
}

// ─── AuthGate ──────────────────────────────────────────────────────────────────

type GateState = "loading" | "unauthenticated" | "authenticated";

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [gateState, setGateState] = useState<GateState>("loading");
  const [currentUser, setCurrentUser] = useState("");

  // Login form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");

  const usernameRef = useRef<HTMLInputElement>(null);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const json = (await res.json()) as { ok: boolean; data: { user: string } };
        setCurrentUser(json.data.user);
        setGateState("authenticated");
      } else {
        setGateState("unauthenticated");
      }
    } catch {
      setGateState("unauthenticated");
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  // Focus username field when unauthenticated
  useEffect(() => {
    if (gateState === "unauthenticated") {
      setTimeout(() => usernameRef.current?.focus(), 100);
    }
  }, [gateState]);

  const handleLogin = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!username.trim() || !password) {
        setLoginError("請填寫使用者名稱與密碼");
        return;
      }
      setIsLoggingIn(true);
      setLoginError("");
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim(), password }),
        });
        const json = (await res.json()) as {
          ok: boolean;
          data?: { user: string };
          error?: { message: string };
        };
        if (res.ok && json.ok && json.data) {
          setCurrentUser(json.data.user);
          setPassword("");
          setGateState("authenticated");
        } else {
          setLoginError(json.error?.message ?? "登入失敗，請稍後再試");
        }
      } catch {
        setLoginError("網路錯誤，請稍後再試");
      } finally {
        setIsLoggingIn(false);
      }
    },
    [username, password]
  );

  const handleLogout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setGateState("unauthenticated");
    setCurrentUser("");
    setUsername("");
    setPassword("");
  }, []);

  // ── Loading screen ──
  if (gateState === "loading") {
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "8px 0" }}>
            <div style={logoCircleStyle}>
              <span style={{ fontSize: 22 }}>🫀</span>
            </div>
            <div style={{ color: "#9699b0", fontSize: 13 }}>驗證身份中…</div>
            <div style={spinnerStyle} />
          </div>
        </div>
        <style>{spinnerCSS}</style>
      </div>
    );
  }

  // ── Login form ──
  if (gateState === "unauthenticated") {
    return (
      <div style={overlayStyle}>
        {/* Decorative gradient blobs */}
        <div style={blobLeft} />
        <div style={blobRight} />

        <div style={cardStyle}>
          {/* Header */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 28 }}>
            <div style={logoCircleStyle}>
              <span style={{ fontSize: 22 }}>🫀</span>
            </div>
            <div style={{ textAlign: "center" }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e2e3f0", letterSpacing: 0.3 }}>
                超音波影像管理系統
              </h1>
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#9699b0" }}>
                請以管理員身份登入以存取後台管理功能
              </p>
            </div>
            <div style={badgeStyle}>
              <Shield size={11} />
              <span>管理員身份驗證</span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={(e) => void handleLogin(e)} autoComplete="on" noValidate>
            {/* Username */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle} htmlFor="auth-username">
                使用者名稱
              </label>
              <div style={inputWrapperStyle}>
                <User size={14} style={inputIconStyle} />
                <input
                  id="auth-username"
                  ref={usernameRef}
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setLoginError("");
                  }}
                  placeholder="輸入管理員帳號"
                  style={inputStyle}
                  disabled={isLoggingIn}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ ...fieldGroupStyle, marginBottom: loginError ? 12 : 20 }}>
              <label style={labelStyle} htmlFor="auth-password">
                密碼
              </label>
              <div style={inputWrapperStyle}>
                <Lock size={14} style={inputIconStyle} />
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setLoginError("");
                  }}
                  placeholder="輸入管理員密碼"
                  style={{ ...inputStyle, paddingRight: 40 }}
                  disabled={isLoggingIn}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={showPasswordBtnStyle}
                  tabIndex={-1}
                  title={showPassword ? "隱藏密碼" : "顯示密碼"}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {loginError && (
              <div style={errorBoxStyle}>
                <span style={{ fontSize: 15 }}>⚠️</span>
                <span>{loginError}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoggingIn}
              style={submitBtnStyle(isLoggingIn)}
            >
              {isLoggingIn ? (
                <>
                  <div style={smallSpinnerStyle} />
                  <span>驗證中…</span>
                </>
              ) : (
                <>
                  <Shield size={14} />
                  <span>登入管理後台</span>
                </>
              )}
            </button>
          </form>

          {/* Footer hint */}
          <p style={{ margin: "18px 0 0", fontSize: 11, color: "#585a78", textAlign: "center" }}>
            此系統僅供授權管理員使用。登入後操作均留有稽核記錄。
          </p>
        </div>

        <style>{spinnerCSS}</style>
      </div>
    );
  }

  // ── Authenticated: render children with admin context ──
  return (
    <AdminAuthContext.Provider value={{ user: currentUser, logout: handleLogout }}>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        {/* Admin session bar */}
        <div style={sessionBarStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Shield size={13} style={{ color: "#4f8cff" }} />
            <span style={{ fontSize: 12, color: "#9699b0" }}>管理後台</span>
            <span style={{ width: 1, height: 12, background: "#3c3e58" }} />
            <div style={avatarPillStyle}>
              <div style={avatarDotStyle}>{currentUser[0]?.toUpperCase()}</div>
              <span style={{ fontSize: 12, color: "#c8cae8" }}>{currentUser}</span>
            </div>
          </div>
          <button onClick={() => void handleLogout()} style={logoutBtnStyle} title="登出">
            <LogOut size={13} />
            <span>登出</span>
          </button>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {children}
        </div>
      </div>
    </AdminAuthContext.Provider>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#0a0b14",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  overflow: "hidden",
};

const blobLeft: React.CSSProperties = {
  position: "absolute",
  top: "10%",
  left: "5%",
  width: 400,
  height: 400,
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(79,140,255,0.07) 0%, transparent 70%)",
  pointerEvents: "none",
};

const blobRight: React.CSSProperties = {
  position: "absolute",
  bottom: "10%",
  right: "5%",
  width: 350,
  height: 350,
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(124,92,191,0.07) 0%, transparent 70%)",
  pointerEvents: "none",
};

const cardStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  background: "#0f1018",
  border: "1px solid #252638",
  borderRadius: 16,
  padding: "32px 36px",
  width: "100%",
  maxWidth: 400,
  boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
};

const logoCircleStyle: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 14,
  background: "linear-gradient(135deg, #4f8cff, #7c5cbf)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 4px 16px rgba(79,140,255,0.3)",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "3px 10px",
  borderRadius: 99,
  background: "rgba(79,140,255,0.1)",
  border: "1px solid rgba(79,140,255,0.2)",
  fontSize: 11,
  color: "#4f8cff",
};

const fieldGroupStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  marginBottom: 14,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#9699b0",
  fontWeight: 500,
};

const inputWrapperStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
};

const inputIconStyle: React.CSSProperties = {
  position: "absolute",
  left: 12,
  color: "#585a78",
  pointerEvents: "none",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px 10px 36px",
  borderRadius: 8,
  border: "1px solid #3c3e58",
  background: "#171824",
  color: "#e2e3f0",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  transition: "border-color 0.15s",
};

const showPasswordBtnStyle: React.CSSProperties = {
  position: "absolute",
  right: 10,
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "#585a78",
  padding: 4,
  display: "flex",
  alignItems: "center",
};

const errorBoxStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "9px 12px",
  borderRadius: 8,
  background: "rgba(248,113,113,0.08)",
  border: "1px solid rgba(248,113,113,0.2)",
  color: "#f87171",
  fontSize: 13,
  marginBottom: 14,
};

function submitBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    width: "100%",
    padding: "11px 16px",
    borderRadius: 8,
    background: disabled ? "#2a2d45" : "linear-gradient(135deg, #4f8cff, #7c5cbf)",
    color: disabled ? "#585a78" : "#fff",
    border: "none",
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "opacity 0.15s",
    boxShadow: disabled ? "none" : "0 2px 12px rgba(79,140,255,0.25)",
  };
}

// Session bar (shown when authenticated)
const sessionBarStyle: React.CSSProperties = {
  height: 36,
  background: "#0a0b14",
  borderBottom: "1px solid #1e2030",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  paddingLeft: 16,
  paddingRight: 16,
  flexShrink: 0,
};

const avatarPillStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const avatarDotStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: "50%",
  background: "linear-gradient(135deg, #4f8cff, #7c5cbf)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 10,
  fontWeight: 700,
  color: "#fff",
};

const logoutBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "3px 10px",
  borderRadius: 6,
  background: "transparent",
  border: "1px solid #3c3e58",
  color: "#9699b0",
  fontSize: 12,
  fontFamily: "inherit",
  cursor: "pointer",
  transition: "border-color 0.15s, color 0.15s",
};

// Spinner
const spinnerStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: "50%",
  border: "2px solid #3c3e58",
  borderTopColor: "#4f8cff",
  animation: "auth-spin 0.7s linear infinite",
};

const smallSpinnerStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: "50%",
  border: "2px solid rgba(255,255,255,0.25)",
  borderTopColor: "#fff",
  animation: "auth-spin 0.7s linear infinite",
};

const spinnerCSS = `
  @keyframes auth-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  #auth-username:focus,
  #auth-password:focus {
    border-color: #4f8cff !important;
    box-shadow: 0 0 0 3px rgba(79,140,255,0.12);
  }
`;
