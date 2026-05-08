import {
  passwordMinLength,
  passwordRequireDigit,
  passwordRequireLowercase,
  passwordRequireSpecial,
  passwordRequireUppercase
} from '../config/env.js';

export const passwordPolicyMessage = `Password must be at least ${passwordMinLength} characters and include uppercase, lowercase, number, and special character.`;

export const validatePasswordStrength = (value) => {
  const password = String(value || '');
  if (password.length < passwordMinLength) return false;
  if (passwordRequireUppercase && !/[A-Z]/.test(password)) return false;
  if (passwordRequireLowercase && !/[a-z]/.test(password)) return false;
  if (passwordRequireDigit && !/\d/.test(password)) return false;
  if (passwordRequireSpecial && !/[^A-Za-z0-9]/.test(password)) return false;
  return true;
};

