import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/tursoModels';
import { asyncHandler, sendSuccess, sendError } from '../utils/routeHelpers';

const router = express.Router();

// Register
router.post('/register', asyncHandler('Auth', 'Register')(async (req, res) => {
  const { email, password, name } = req.body;
  
  const existingUser = await User.findByEmail(email);
  if (existingUser) {
    return sendError(req, res, new Error('User already exists'), 'Registration failed', 400, 'USER_EXISTS');
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const user = await User.create({
    email,
    password: hashedPassword,
    name
  });
  
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });
  
  return sendSuccess(req, res, {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name
    }
  }, 'User registered successfully', 201);
}));

// Login
router.post('/login', asyncHandler('Auth', 'Login')(async (req, res) => {
  const { email, password } = req.body;
  
  const user = await User.findByEmail(email);
  if (!user) {
    return sendError(req, res, new Error('Invalid credentials'), 'Login failed', 401, 'INVALID_CREDENTIALS');
  }
  
  const isValidPassword = await bcrypt.compare(password, user.password as string);
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

export default router;
