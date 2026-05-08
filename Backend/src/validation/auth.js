import { z } from 'zod';
import { passwordMinLength } from '../config/env.js';
import { passwordPolicyMessage, validatePasswordStrength } from '../utils/passwordPolicy.js';

const strongPasswordSchema = z.string()
  .min(passwordMinLength, passwordPolicyMessage)
  .refine(validatePasswordStrength, passwordPolicyMessage);

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Username or email is required.'),
  password: z.string().min(1, 'Password is required.')
});

export const requestLoginOtpSchema = z.object({
  identifier: z.string().trim().min(1, 'Username or email is required.')
});

export const verifyLoginOtpSchema = z.object({
  identifier: z.string().trim().min(1, 'Username or email is required.'),
  code: z.string().trim().regex(/^\d{4,8}$/, 'A valid OTP is required.')
});

export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(1, 'Username or email is required.'),
  employee_id: z.string().trim().min(2, 'Employee ID is required.').max(64, 'Employee ID is too long.'),
  date_of_birth: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD.'),
  new_password: strongPasswordSchema,
  confirm_password: z.string().optional()
}).refine((payload) => {
  if (!payload.confirm_password) return true;
  return payload.new_password === payload.confirm_password;
}, {
  path: ['confirm_password'],
  message: 'Passwords do not match.'
});

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  email: z.string().trim().email('Valid email is required.'),
  username: z.string().trim().min(3).max(100).optional(),
  date_of_birth: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD.').optional(),
  password: strongPasswordSchema.optional()
});

export const changePasswordSchema = z.object({
  current_password: z.string().optional(),
  new_password: strongPasswordSchema,
  confirm_password: z.string().optional()
}).refine((payload) => {
  if (!payload.confirm_password) return true;
  return payload.new_password === payload.confirm_password;
}, {
  path: ['confirm_password'],
  message: 'Passwords do not match.'
});
