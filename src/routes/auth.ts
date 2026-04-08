import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/tursoModels';
import { asyncHandler, sendSuccess, sendError } from '../utils/routeHelpers';
import { registerSchema, loginSchema } from '../schemas/auth';
import { UserCreditsModel, AffiliateModel } from '../v2/schemas';
import { Database, generateUUID } from '../models';
import { sendOTPEmail, sendPasswordResetEmail } from '../v2/services/emailService';

const router = express.Router();

// Send OTP
router.post('/send-otp', asyncHandler('Auth', 'SendOTP')(async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendError(req, res, new Error('Valid email required'), 'Validation failed', 400, 'VALIDATION_ERROR');
  }

  const existing = await User.findByEmail(email);
  if (existing) {
    return sendError(req, res, new Error('Email already registered'), 'Registration failed', 400, 'USER_EXISTS');
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Invalidate any previous OTPs for this email
  await Database.execute('DELETE FROM EmailOTP WHERE email = ?', [email]);
  await Database.execute(
    'INSERT INTO EmailOTP (id, email, otp, expiresAt) VALUES (?, ?, ?, ?)',
    [generateUUID(), email, otp, expiresAt]
  );

  await sendOTPEmail(email, otp);
  return sendSuccess(req, res, {}, 'OTP sent to your email');
}));

// Verify OTP
router.post('/verify-otp', asyncHandler('Auth', 'VerifyOTP')(async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return sendError(req, res, new Error('Email and OTP required'), 'Validation failed', 400, 'VALIDATION_ERROR');
  }

  const result = await Database.execute(
    'SELECT * FROM EmailOTP WHERE email = ? AND otp = ? AND verified = 0 AND expiresAt > CURRENT_TIMESTAMP',
    [email, otp]
  );

  if (!result.rows[0]) {
    return sendError(req, res, new Error('Invalid or expired OTP'), 'Verification failed', 400, 'INVALID_OTP');
  }

  await Database.execute('UPDATE EmailOTP SET verified = 1 WHERE email = ?', [email]);
  return sendSuccess(req, res, { verified: true }, 'Email verified');
}));

// Register
router.post('/register', asyncHandler('Auth', 'Register')(async (req, res) => {
  const validation = registerSchema.safeParse(req.body);
  if (!validation.success) {
    const errorMessage = validation.error.issues[0]?.message || 'Validation failed';
    return sendError(req, res, new Error(errorMessage), 'Validation failed', 400, 'VALIDATION_ERROR');
  }
  
  const { email, password, name } = validation.data;
  const { ref } = req.body; // referral code from ?ref= param
  
  const existingUser = await User.findByEmail(email);
  if (existingUser) {
    return sendError(req, res, new Error('User already exists'), 'Registration failed', 400, 'USER_EXISTS');
  }

  // Check OTP was verified
  const otpRecord = await Database.execute(
    'SELECT * FROM EmailOTP WHERE email = ? AND verified = 1',
    [email]
  );
  if (!otpRecord.rows[0]) {
    return sendError(req, res, new Error('Email not verified. Please verify your email first.'), 'Registration failed', 403, 'EMAIL_NOT_VERIFIED');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  
  const user = await User.create({ email, password: hashedPassword, name });

  // Init free plan credits
  await UserCreditsModel.initForUser(user.id, 'free');

  // Record referral if ref code provided
  if (ref) {
    const affiliate = await AffiliateModel.findByCode(ref);
    if (affiliate) {
      await AffiliateModel.recordReferral(String(affiliate.id), user.id, ref);
      // 4% bonus credits to affiliate for signup (before any payment)
      const affiliateCredits = await UserCreditsModel.findByUser(String(affiliate.userId));
      if (affiliateCredits) {
        const bonus = Math.max(1, Math.floor(Number(affiliateCredits.creditsRemaining) * 0.04));
        await UserCreditsModel.add(String(affiliate.userId), bonus, `Referral signup bonus from ${email}`);
        await AffiliateModel.addEarnings(String(affiliate.id), bonus);
      }
    }
  }
  
  // Cleanup OTP
  await Database.execute('DELETE FROM EmailOTP WHERE email = ?', [email]);

  return sendSuccess(req, res, {
    user: { id: user.id, email: user.email, name: user.name }
  }, 'User registered successfully', 201);
}));

// Login
router.post('/login', asyncHandler('Auth', 'Login')(async (req, res) => {
  const validation = loginSchema.safeParse(req.body);
  if (!validation.success) {
    const errorMessage = validation.error.issues[0]?.message || 'Validation failed';
    return sendError(req, res, new Error(errorMessage), 'Validation failed', 400, 'VALIDATION_ERROR');
  }
  
  const { email, password } = validation.data;
  
  const user = await User.findByEmail(email);
  if (!user) {
    return sendError(req, res, new Error('Invalid credentials'), 'Login failed', 401, 'INVALID_CREDENTIALS');
  }
  
  const isValidPassword = await bcrypt.compare(password, String(user.password));
  if (!isValidPassword) {
    return sendError(req, res, new Error('Invalid credentials'), 'Login failed', 401, 'INVALID_CREDENTIALS');
  }
  
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });
  
  return sendSuccess(req, res, {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name
    }
  }, 'Login successful');
}));

// Forgot password
router.post('/forgot-password', asyncHandler('Auth', 'ForgotPassword')(async (req, res) => {
  const { email } = req.body;
  if (!email) return sendError(req, res, new Error('Email required'), 'Validation failed', 400, 'VALIDATION_ERROR');

  const user = await User.findByEmail(email);
  // Always respond success to avoid email enumeration
  if (!user) return sendSuccess(req, res, {}, 'If that email exists, a reset link has been sent');

  const token = generateUUID() + generateUUID(); // 72-char random token
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await Database.execute('DELETE FROM PasswordResetTokens WHERE userId = ?', [user.id]);
  await Database.execute(
    'INSERT INTO PasswordResetTokens (id, userId, token, expiresAt) VALUES (?, ?, ?, ?)',
    [generateUUID(), user.id, token, expiresAt]
  );

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  await sendPasswordResetEmail(email, resetUrl);

  return sendSuccess(req, res, {}, 'If that email exists, a reset link has been sent');
}));

// Reset password
router.post('/reset-password', asyncHandler('Auth', 'ResetPassword')(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return sendError(req, res, new Error('Token and password required'), 'Validation failed', 400, 'VALIDATION_ERROR');
  if (password.length < 8) return sendError(req, res, new Error('Password must be at least 8 characters'), 'Validation failed', 400, 'VALIDATION_ERROR');

  const result = await Database.execute(
    'SELECT * FROM PasswordResetTokens WHERE token = ? AND used = 0 AND expiresAt > CURRENT_TIMESTAMP',
    [token]
  );
  if (!result.rows[0]) return sendError(req, res, new Error('Invalid or expired reset link'), 'Reset failed', 400, 'INVALID_TOKEN');

  const { userId } = result.rows[0] as any;
  const hashedPassword = await bcrypt.hash(password, 10);

  await Database.execute('UPDATE Users SET password = ? WHERE id = ?', [hashedPassword, userId]);
  await Database.execute('UPDATE PasswordResetTokens SET used = 1 WHERE token = ?', [token]);

  return sendSuccess(req, res, {}, 'Password reset successfully');
}));

export default router;
