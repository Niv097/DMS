import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import api from '../utils/api';
import PasswordField from '../components/PasswordField';

const SESSION_TIMEOUT_MESSAGE_KEY = 'auth_message';

const demoUsers = [
  { label: 'Bank Admin', email: 'admin@bankdemo.com' },
  { label: 'Super Admin', email: 'super.admin@bankdemo.com' },
  { label: 'Auditor', email: 'audit@bankdemo.com' },
  { label: 'Uploader', email: 'aditi.sharma@bankdemo.com' },
  { label: 'Recommender', email: 'rahul.mehta@bankdemo.com' },
  { label: 'Approver', email: 'neha.kapoor@bankdemo.com' }
];

const trimEdgeWhitespace = (value) => String(value ?? '').replace(/\u00A0/g, ' ').trim();
const trimPasswordEdges = (value) => String(value ?? '').replace(/\u00A0/g, ' ').replace(/^\s+|\s+$/g, '');
const OTP_TTL_MS = Math.max(60000, Number(import.meta.env.VITE_OTP_TTL_MS ?? 600000));
const OTP_RESEND_COOLDOWN_SECONDS = Math.max(1, Math.round(Number(import.meta.env.VITE_OTP_RESEND_COOLDOWN_MS ?? 60000) / 1000));
const injectSanitizedPaste = (event, sanitizer) => {
  const text = sanitizer(event.clipboardData?.getData('text') || '');
  event.preventDefault();
  const target = event.target;
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? target.value.length;
  target.setRangeText(text, start, end, 'end');
  target.dispatchEvent(new Event('input', { bubbles: true }));
};

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { branding } = useBranding();
  const { brandName, brandMark, logoUrl, subtitle } = branding;
  const recoveryHint = location.state?.recoveryHint || null;
  const showDemoFeatures = (import.meta.env.VITE_ENABLE_DEMO ?? import.meta.env.VITE_ENABLE_DEMO_FEATURES ?? 'true') !== 'false' && !import.meta.env.PROD;
  const otpLoginEnabled = (import.meta.env.VITE_OTP_LOGIN_ENABLED ?? 'true') !== 'false';
  const isOtpPage = location.pathname === '/login/otp';
  const bankCode = new URLSearchParams(location.search).get('bank') || '';
  const [identifier, setIdentifier] = useState(recoveryHint?.identifier || (showDemoFeatures ? 'aditi.sharma@bankdemo.com' : ''));
  const [password, setPassword] = useState(showDemoFeatures ? 'Password@123' : '');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState(() => sessionStorage.getItem(SESSION_TIMEOUT_MESSAGE_KEY) || '');
  const [info, setInfo] = useState(recoveryHint?.preferredMode === 'otp' ? 'Temporary password unavailable. Use OTP sign-in for controlled recovery.' : '');
  const [loading, setLoading] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [deliveryTarget, setDeliveryTarget] = useState('');
  const [otpCooldownUntil, setOtpCooldownUntil] = useState(0);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [otpExpiryUntil, setOtpExpiryUntil] = useState(0);
  const [otpExpirySecondsLeft, setOtpExpirySecondsLeft] = useState(0);
  const [demoPanelOpen, setDemoPanelOpen] = useState(false);
  const [authCapabilities, setAuthCapabilities] = useState({
    credential_delivery_enabled: false,
    otp_login_enabled: false
  });

  React.useEffect(() => {
    const message = sessionStorage.getItem(SESSION_TIMEOUT_MESSAGE_KEY);
    if (message) {
      setError(message);
      sessionStorage.removeItem(SESSION_TIMEOUT_MESSAGE_KEY);
    }
  }, []);

  React.useEffect(() => {
    if (!otpCooldownUntil) return undefined;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((otpCooldownUntil - Date.now()) / 1000));
      setOtpSecondsLeft(remaining);
      if (remaining <= 0) {
        setOtpCooldownUntil(0);
      }
    };
    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [otpCooldownUntil]);

  React.useEffect(() => {
    if (!otpExpiryUntil) return undefined;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((otpExpiryUntil - Date.now()) / 1000));
      setOtpExpirySecondsLeft(remaining);
      if (remaining <= 0) {
        setOtpExpiryUntil(0);
      }
    };
    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [otpExpiryUntil]);

  React.useEffect(() => {
    if (!isOtpPage || !location.state?.autoRequestOtp || !trimEdgeWhitespace(identifier)) return;
    handleRequestOtp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOtpPage]);

  React.useEffect(() => {
    let isCancelled = false;
    const cleanIdentifier = trimEdgeWhitespace(identifier);
    const shouldCheck = Boolean(cleanIdentifier || bankCode);
    if (!shouldCheck) {
      setAuthCapabilities({
        credential_delivery_enabled: false,
        otp_login_enabled: false
      });
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get('/auth/capabilities', {
          params: {
            ...(cleanIdentifier ? { identifier: cleanIdentifier } : {}),
            ...(bankCode ? { bank: bankCode } : {})
          }
        });
        if (!isCancelled) {
          setAuthCapabilities({
            credential_delivery_enabled: Boolean(response.data?.credential_delivery_enabled),
            otp_login_enabled: Boolean(response.data?.otp_login_enabled)
          });
        }
      } catch {
        if (!isCancelled) {
          setAuthCapabilities({
            credential_delivery_enabled: false,
            otp_login_enabled: false
          });
        }
      }
    }, 250);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [identifier, bankCode]);

  const effectiveOtpEnabled = otpLoginEnabled && authCapabilities.otp_login_enabled;

  const doLogin = async (identifierValue, passwordValue) => {
    setError('');
    setInfo('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', {
        identifier: trimEdgeWhitespace(identifierValue),
        password: trimPasswordEdges(passwordValue)
      });
      const { token, user } = response.data;
      login(user, {
        token,
        authContext: response.data?.authContext,
        requirePasswordChange: response.data?.requirePasswordChange || response.data?.passwordChangeRequired
      });
      navigate((response.data?.requirePasswordChange || response.data?.passwordChangeRequired) ? '/first-login' : '/dashboard');
    } catch (err) {
      const payload = err.response?.data || {};
      setError(payload.error || 'Login failed. Please check your credentials.');
      if (payload.otpFallbackAvailable) {
        setInfo('Use OTP sign-in if password recovery is required.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    const cleanIdentifier = trimEdgeWhitespace(identifier);
    if (!cleanIdentifier) {
      setError('Username or email is required.');
      return;
    }

    setError('');
    setInfo('');
    setLoading(true);

    try {
      const response = await api.post('/auth/otp/request', { identifier: cleanIdentifier });
      setIdentifier(cleanIdentifier);
      setOtpRequested(true);
      setDeliveryTarget(response.data?.delivery?.destination || '');
      setOtpCooldownUntil(Date.now() + (OTP_RESEND_COOLDOWN_SECONDS * 1000));
      setOtpExpiryUntil(Date.now() + OTP_TTL_MS);
      setInfo(response.data?.message || 'A one-time passcode has been issued for eligible access. Use only the latest code delivered to the registered email.');
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to send OTP right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event) => {
    event.preventDefault();
    const cleanIdentifier = trimEdgeWhitespace(identifier);
    const cleanOtp = otpCode.replace(/\D/g, '').trim();
    if (!cleanIdentifier) {
      setError('Username or email is required.');
      return;
    }
    if (!cleanOtp) {
      setError('OTP is required.');
      return;
    }

    setError('');
    setInfo('');
    setLoading(true);

    try {
      const response = await api.post('/auth/otp/verify', { identifier: cleanIdentifier, code: cleanOtp });
      const { token, user } = response.data;
      login(user, {
        token,
        authContext: response.data?.authContext,
        requirePasswordChange: response.data?.requirePasswordChange || response.data?.passwordChangeRequired
      });
      navigate((response.data?.requirePasswordChange || response.data?.passwordChangeRequired) ? '/first-login' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    await doLogin(identifier, password);
  };

  const handleOpenOtpPage = () => {
    navigate('/login/otp', {
      state: {
        identifier: trimEdgeWhitespace(identifier),
        autoRequestOtp: Boolean(trimEdgeWhitespace(identifier))
      }
    });
  };

  const handleQuickLogin = async (emailValue) => {
    if (loading) return;
    setIdentifier(emailValue);
    setPassword('Password@123');
    await doLogin(emailValue, 'Password@123');
  };

  const formattedOtpCountdown = `${String(Math.floor(otpExpirySecondsLeft / 60)).padStart(2, '0')}:${String(otpExpirySecondsLeft % 60).padStart(2, '0')}`;

  return (
    <div className="login-container">
      <style>{`
        .login-container {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 24px 16px;
          background:
            radial-gradient(circle at top left, rgba(59, 130, 246, 0.18), transparent 28%),
            linear-gradient(180deg, #203f6e 0%, #142f57 100%);
        }
        .login-card {
          width: min(460px, 100%);
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid rgba(207, 221, 239, 0.9);
          border-radius: 24px;
          padding: 28px 28px 24px;
          box-shadow: 0 30px 50px rgba(8, 22, 43, 0.24);
        }
        .login-brand {
          text-align: center;
          margin-bottom: 22px;
        }
        .login-brand-mark {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 58px;
          height: 58px;
          border-radius: 18px;
          background: linear-gradient(180deg, #1d4d8f 0%, #133b71 100%);
          color: #ffffff;
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 14px;
          box-shadow: 0 12px 24px rgba(29, 77, 143, 0.18);
        }
        .login-brand-logo {
          display: inline-block;
          width: 72px;
          height: 72px;
          object-fit: contain;
          margin-bottom: 14px;
        }
        .login-brand h1 {
          color: #12263d;
          font-size: 32px;
          line-height: 1;
          margin-bottom: 8px;
          letter-spacing: -0.04em;
        }
        .login-brand p {
          color: #60748c;
          font-size: 14px;
          line-height: 1.65;
        }
        .login-status-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 18px;
        }
        .login-status-chip {
          border-radius: 14px;
          border: 1px solid #d9e3ef;
          background: #f8fbff;
          padding: 11px 10px;
          text-align: center;
        }
        .login-status-chip span {
          display: block;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #70839b;
          margin-bottom: 5px;
        }
        .login-status-chip strong {
          color: #173c6d;
          font-size: 13px;
        }
        .login-alert {
          margin-bottom: 16px;
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid #d8e5f5;
          background: #f6faff;
          color: #23446f;
          font-size: 13px;
          line-height: 1.55;
        }
        .login-alert.error {
          background: #fff5f5;
          border-color: #f4c9c9;
          color: #a31d1d;
        }
        .login-panel {
          border-radius: 20px;
          border: 1px solid #dbe4ef;
          background: #ffffff;
          box-shadow: 0 14px 26px rgba(15, 35, 64, 0.06);
          overflow: hidden;
        }
        .login-panel-body {
          padding: 22px;
        }
        .login-panel-body + .login-panel-body {
          border-top: 1px solid #e8eef5;
        }
        .login-panel-title {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #5d7290;
          margin-bottom: 16px;
        }
        .login-otp-subtitle {
          margin: 0 0 12px 0;
          color: #66788f;
          font-size: 13px;
          line-height: 1.55;
        }
        .login-otp-heading {
          color: #173c6d;
          font-size: 22px;
          line-height: 1.2;
          font-weight: 700;
          margin: 0 0 4px 0;
        }
        .login-otp-validity {
          margin-top: 2px;
          color: #173c6d;
          font-size: 12px;
          font-weight: 700;
        }
        .login-otp-cooldown {
          margin-top: 4px;
          color: #6d7f96;
          font-size: 12px;
          line-height: 1.5;
        }
        .login-otp-resend-row {
          margin-top: 6px;
          color: #6d7f96;
          font-size: 12px;
          line-height: 1.5;
        }
        .login-otp-inline-actions {
          margin-top: 8px;
        }
        .login-otp-resend-link {
          appearance: none;
          border: 0;
          background: transparent;
          color: #1f4b8f;
          font-size: 12px;
          font-weight: 700;
          padding: 0;
          cursor: pointer;
          text-decoration: none;
        }
        .login-otp-resend-link:disabled {
          color: #90a1b9;
          cursor: default;
        }
        .login-otp-boxes {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 8px;
        }
        .login-otp-box {
          min-height: 44px;
          border-radius: 10px;
          border: 1px solid #c9d6e5;
          background: linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #173c6d;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 0.02em;
        }
        .login-otp-box.empty {
          color: #b1bdd0;
        }
        .login-otp-hidden-input {
          position: absolute;
          width: 1px;
          height: 1px;
          opacity: 0;
          pointer-events: none;
        }
        .login-panel .form-group {
          margin-bottom: 18px;
        }
        .login-panel .form-group:last-of-type {
          margin-bottom: 0;
        }
        .login-panel .form-group label {
          color: #334861;
          font-size: 12px;
          font-weight: 700;
          margin-bottom: 7px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .login-panel .required-marker {
          color: #dc2626;
        }
        .login-panel input {
          width: 100%;
          min-height: 48px;
          padding: 12px 14px;
          border: 1px solid #c9d6e5;
          border-radius: 14px;
          background: linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
          color: #12263d;
          font-size: 14px;
          font-weight: 500;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .login-panel input:focus {
          outline: none;
          border-color: #1d4d8f;
          box-shadow: 0 0 0 4px rgba(29, 77, 143, 0.10);
        }
        .login-panel input::placeholder {
          color: #97a6b8;
        }
        .login-panel .password-field input {
          background: linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
          color: #12263d;
        }
        .login-panel .password-toggle {
          right: 10px;
          background: #edf4fb;
          border-color: #c8d7ea;
          color: #173c6d;
        }
        .login-panel .password-toggle:hover {
          background: #dceafb;
          border-color: #9eb9db;
          color: #0f3270;
        }
        .login-panel .password-field-meta {
          color: #66788f;
        }
        .login-panel .password-field-meta.warning {
          color: #b45309;
        }
        .login-link-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin: 8px 0 18px;
          flex-wrap: wrap;
        }
        .login-link-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 40px;
          padding: 0 16px;
          border-radius: 999px;
          border: 1px solid #bfd2e7;
          background: linear-gradient(180deg, #ffffff 0%, #f4f8fd 100%);
          color: #173c6d;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          text-decoration: none;
          box-shadow: 0 10px 18px rgba(17, 46, 86, 0.08);
          transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease;
        }
        .login-link-btn:hover {
          color: #0f3270;
          border-color: #8eafd3;
          background: linear-gradient(180deg, #ffffff 0%, #eaf3ff 100%);
          transform: translateY(-1px);
          box-shadow: 0 14px 22px rgba(17, 46, 86, 0.14);
        }
        .login-link-btn:focus-visible {
          outline: none;
          box-shadow: 0 0 0 4px rgba(29, 77, 143, 0.12);
        }
        .login-link-btn[disabled] {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        .login-submit {
          width: 100%;
          min-height: 52px;
          border: none;
          border-radius: 16px;
          background: linear-gradient(180deg, #2d6fd1 0%, #1f5db9 100%);
          color: #ffffff;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 14px 22px rgba(29, 77, 143, 0.16);
          transition: transform 160ms ease, box-shadow 160ms ease;
        }
        .login-submit:hover {
          transform: translateY(-1px);
          box-shadow: 0 16px 24px rgba(29, 77, 143, 0.22);
        }
        .login-submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        .login-secondary-btn {
          width: 100%;
          min-height: 46px;
          border-radius: 14px;
          border: 1px solid #c9d8ea;
          background: #ffffff;
          color: #173c6d;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }
        .login-secondary-btn:hover {
          background: #f4f8fd;
          border-color: #a7bdd9;
        }
        .login-secondary-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #6d7f96;
          font-size: 12px;
          font-weight: 600;
          text-decoration: none;
          min-height: 20px;
        }
        .login-secondary-link:hover {
          color: #173c6d;
        }
        .login-demo-summary {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 16px;
          border: 1px dashed #c6d6e9;
          background: #f8fbff;
        }
        .login-demo-summary strong {
          display: block;
          color: #173c6d;
          font-size: 13px;
          margin-bottom: 3px;
        }
        .login-demo-summary small {
          color: #71849b;
          font-size: 12px;
        }
        .login-demo-toggle {
          border: 1px solid #c8d7ea;
          background: #ffffff;
          color: #173c6d;
          border-radius: 999px;
          padding: 8px 14px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }
        .login-demo-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 14px;
        }
        .login-demo-btn {
          min-height: 40px;
          border-radius: 14px;
          border: 1px solid #d6e2f0;
          background: #ffffff;
          color: #304860;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .login-demo-btn:hover {
          border-color: #8db0d8;
          background: #f3f8ff;
        }
        .login-demo-hint {
          margin-top: 12px;
          font-size: 11px;
          color: #73849a;
          text-align: center;
        }
        .login-footnote {
          margin-top: 16px;
          text-align: center;
          color: #c9d6e4;
          font-size: 12px;
          letter-spacing: 0.04em;
        }
        @media (max-width: 640px) {
          .login-card {
            padding: 20px 18px 18px;
          }
          .login-status-row,
          .login-demo-grid {
            grid-template-columns: 1fr;
          }
          .login-link-row,
          .login-demo-summary {
            flex-direction: column;
            align-items: stretch;
          }
          .login-demo-toggle {
            width: 100%;
          }
        }
      `}</style>

      <div className="login-card">
        <div className="login-brand">
          {logoUrl ? (
            <img src={logoUrl} alt={`${brandName} logo`} className="login-brand-logo" />
          ) : (
            <div className="login-brand-mark">{brandMark}</div>
          )}
          <h1>{brandName}</h1>
          <p>{subtitle}</p>
        </div>

        <div className="login-status-row">
          <div className="login-status-chip">
            <span>Session</span>
            <strong>Secure</strong>
          </div>
          <div className="login-status-chip">
            <span>Recovery</span>
            <strong>{effectiveOtpEnabled ? 'OTP Enabled' : 'Password Only'}</strong>
          </div>
          <div className="login-status-chip">
            <span>Audit</span>
            <strong>Always On</strong>
          </div>
        </div>

        {error && <div className="login-alert error">{error}</div>}
        {info && <div className="login-alert">{info}</div>}

        <div className="login-panel">
          <div className="login-panel-body">
            <div className="login-panel-title">
              {isOtpPage ? (otpRequested ? 'Verify Identity' : 'OTP Sign-In') : 'Primary Sign-In'}
            </div>
            {isOtpPage ? (
              <form onSubmit={handleVerifyOtp}>
                {!otpRequested ? (
                  <>
                    <div className="login-otp-subtitle">Enter your employee ID, login username, or registered email to continue</div>
                    <div className="form-group">
                      <label>Employee ID, Username, or Email<span className="required-marker" aria-hidden="true"> *</span></label>
                      <input
                        type="text"
                        placeholder="Enter your employee ID, username, or email"
                        value={identifier}
                        onChange={(event) => setIdentifier(event.target.value)}
                        onBlur={() => setIdentifier(trimEdgeWhitespace(identifier))}
                        onPaste={(event) => injectSanitizedPaste(event, trimEdgeWhitespace)}
                        autoComplete="username"
                        required
                      />
                    </div>
                    {!effectiveOtpEnabled ? (
                      <div className="login-alert">OTP sign-in is currently disabled for this bank. Continue with password sign-in or ask super admin to enable bank credential automation.</div>
                    ) : (
                      <button
                        type="button"
                        className="login-submit"
                        onClick={handleRequestOtp}
                        disabled={loading}
                      >
                        {loading ? 'Sending OTP...' : 'Send OTP'}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="login-otp-subtitle">
                      {deliveryTarget ? `Code sent to ${deliveryTarget}` : 'Code sent to your registered delivery channel'}
                    </div>
                    <div className="form-group">
                      <label>One-Time Passcode<span className="required-marker" aria-hidden="true"> *</span></label>
                      <div className="login-otp-boxes" onClick={() => document.getElementById('otp-code-input')?.focus()}>
                        {Array.from({ length: 6 }).map((_, index) => {
                          const digit = otpCode[index] || '';
                          return (
                            <div key={index} className={`login-otp-box ${digit ? '' : 'empty'}`}>
                              {digit || '-'}
                            </div>
                          );
                        })}
                      </div>
                      <input
                        id="otp-code-input"
                        className="login-otp-hidden-input"
                        type="text"
                        inputMode="numeric"
                        placeholder={deliveryTarget ? `Enter code sent to ${deliveryTarget}` : 'Enter OTP'}
                        value={otpCode}
                        onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        onPaste={(event) => injectSanitizedPaste(event, (value) => value.replace(/\D/g, '').slice(0, 6))}
                        autoComplete="one-time-code"
                        required
                      />
                    </div>
                    <div className="login-otp-inline-actions">
                      <div className="login-otp-validity">Valid for {formattedOtpCountdown}</div>
                      <div className="login-otp-resend-row">
                        {otpSecondsLeft > 0 ? (
                          <span className="login-otp-cooldown">Resend code in {otpSecondsLeft}s</span>
                        ) : (
                          <span className="login-otp-cooldown">
                            Didn&apos;t receive the code?{' '}
                            <button
                              type="button"
                              className="login-otp-resend-link"
                              onClick={handleRequestOtp}
                              disabled={loading}
                            >
                              Resend
                            </button>
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
                      <button type="submit" className="login-submit" disabled={loading}>
                        {loading ? 'Verifying...' : 'Verify & Continue'}
                      </button>
                    </div>
                  </>
                )}
              </form>
            ) : (
              <form onSubmit={handleLogin}>
              <div className="form-group">
                <label>Employee ID, Username, or Email<span className="required-marker" aria-hidden="true"> *</span></label>
                <input
                  type="text"
                  placeholder="Enter your employee ID, username, or email"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  onBlur={() => setIdentifier(trimEdgeWhitespace(identifier))}
                  onPaste={(event) => injectSanitizedPaste(event, trimEdgeWhitespace)}
                  autoComplete="username"
                  required
                />
              </div>

              <PasswordField
                id="login-password"
                label="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onBlur={() => setPassword((current) => trimPasswordEdges(current))}
                onPaste={(event) => injectSanitizedPaste(event, trimPasswordEdges)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />

              <div className="login-link-row">
                <Link className="login-link-btn" to="/forgot-password">
                  Forgot Password
                </Link>
                {effectiveOtpEnabled && (
                  <button type="button" className="login-link-btn" onClick={handleOpenOtpPage} disabled={loading}>
                    Use OTP Instead
                  </button>
                )}
              </div>

              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? 'Securing Session...' : 'Sign In'}
              </button>
              </form>
            )}
          </div>

          {showDemoFeatures && (
            <div className="login-panel-body">
              <div className="login-demo-summary">
                <div>
                  <strong>Demo Access Helpers</strong>
                  <small>Visible only outside production.</small>
                </div>
                <button
                  type="button"
                  className="login-demo-toggle"
                  onClick={() => setDemoPanelOpen((current) => !current)}
                >
                  {demoPanelOpen ? 'Hide Demo Accounts' : 'Show Demo Accounts'}
                </button>
              </div>

              {demoPanelOpen && (
                <>
                  <div className="login-demo-grid">
                    {demoUsers.map((item) => (
                      <button
                        key={item.email}
                        type="button"
                        className="login-demo-btn"
                        onClick={() => handleQuickLogin(item.email)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div className="login-demo-hint">All demo accounts use password: Password@123</div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="login-footnote">Role-based access enforced for bank document operations</div>
      </div>
    </div>
  );
};

export default Login;
