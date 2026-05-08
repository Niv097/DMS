import React, { useEffect, useMemo, useState } from 'react';

const getPasswordStrength = (value) => {
  const password = value || '';
  let score = 0;

  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (!password) {
    return { level: 'empty', label: 'Enter a password to see guidance.', value: 0 };
  }
  if (score <= 1) {
    return { level: 'low', label: 'Weak: use at least 8 characters with mixed types.', value: 1 };
  }
  if (score <= 2) {
    return { level: 'medium', label: 'Fair: add numbers or symbols for stronger protection.', value: 2 };
  }
  if (score === 3) {
    return { level: 'good', label: 'Good: this is suitable for most business access.', value: 3 };
  }
  return { level: 'strong', label: 'Strong: balanced for secure banking access.', value: 4 };
};

const PasswordField = ({
  id,
  label,
  value,
  onChange,
  onBlur,
  onPaste,
  placeholder,
  required = false,
  autoComplete,
  showStrength = false,
  helpText,
  onCapsLockChange
}) => {
  const [visible, setVisible] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const strength = useMemo(() => getPasswordStrength(value), [value]);

  useEffect(() => {
    if (typeof onCapsLockChange === 'function') {
      onCapsLockChange(capsLockOn);
    }
  }, [capsLockOn, onCapsLockChange]);

  const handleKeyState = (event) => {
    const nextState = Boolean(event.getModifierState && event.getModifierState('CapsLock'));
    setCapsLockOn(nextState);
  };

  return (
    <div className="form-group">
      <label htmlFor={id}>
        {label}
        {required && <span className="required-marker" aria-hidden="true"> *</span>}
      </label>
      <div className={`password-field ${capsLockOn ? 'caps-lock' : ''}`}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          onKeyUp={handleKeyState}
          onKeyDown={handleKeyState}
          onFocus={handleKeyState}
          onBlur={(event) => {
            setCapsLockOn(false);
            if (typeof onBlur === 'function') onBlur(event);
          }}
          onPaste={onPaste}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {capsLockOn && (
        <div className="password-field-meta warning">
          Caps Lock is on. Check before continuing.
        </div>
      )}
      {helpText && (
        <div className="password-field-meta">
          {helpText}
        </div>
      )}
      {showStrength && (
        <div className="password-strength-block">
          <div className="password-strength-bar" aria-hidden="true">
            <span className={`strength-segment ${strength.value >= 1 ? `filled ${strength.level}` : ''}`} />
            <span className={`strength-segment ${strength.value >= 2 ? `filled ${strength.level}` : ''}`} />
            <span className={`strength-segment ${strength.value >= 3 ? `filled ${strength.level}` : ''}`} />
            <span className={`strength-segment ${strength.value >= 4 ? `filled ${strength.level}` : ''}`} />
          </div>
          <div className={`password-field-meta strength ${strength.level}`}>
            {strength.label}
          </div>
        </div>
      )}
    </div>
  );
};

export default PasswordField;
