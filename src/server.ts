import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { Database } from './models';
import logger, { requestLogger } from './utils/logger';
import { ResponseUtil } from './utils/ResponseUtil';

// Import routes
import authRoutes from './routes/auth';
import socialRoutes from './routes/social';
import postsRoutes from './routes/posts';
import campaignsRoutes from './routes/campaigns';
import analyticsRoutes from './routes/analytics';

// Import scheduler
import './services/schedulerService';
import './services/logBackupService';

const app = express();
const PORT = process.env.PORT || 3000;

// Global BigInt serialization fix
(BigInt.prototype as any).toJSON = function() {
  return this.toString();
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use(requestLogger);

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  return ResponseUtil.success(res, 200, { 
    status: 'OK', 
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString() 
  }, 'Service is healthy');
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
async function startServer() {
  try {
    console.log('🔗 Connecting to Turso database...');
    await Database.init();
    console.log('✅ Database connection established successfully.');
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🏥 Health check: https://shwaah.onrender.com/api/health`);
      console.log(`🗄️  Database: Turso (libsql)`);
      console.log('\n🚀 Social Media Publisher API');
      console.log('\n📋 Available endpoints:');
      console.log('AUTH:');
      console.log('  POST /api/auth/register - Register new user');
      console.log('  POST /api/auth/login - Login user');
      console.log('\nSOCIAL:');
      console.log('  GET /api/social/accounts - Get connected accounts');
      console.log('  GET /api/social/connect/:platform - Get OAuth URL');
      console.log('\nPOSTS:');
      console.log('  POST /api/posts/create - Create/schedule post');
      console.log('  POST /api/posts/publish/:postId - Publish post');
      console.log('  GET /api/posts/scheduled - Get scheduled posts');
      console.log('  GET /api/posts/calendar - Get calendar view');
      console.log('\nCAMPAIGNS:');
      console.log('  POST /api/campaigns/create - Create campaign');
      console.log('  GET /api/campaigns/my-campaigns - Get campaigns');
      console.log('\nANALYTICS:');
      console.log('  GET /api/analytics/dashboard - User analytics');
      console.log('  GET /api/analytics/campaign/:id - Campaign analytics');
      console.log('\n⏰ Scheduler running for automated posting');
    });
  } catch (error) {
    logger.error('Server startup failed', { error: error.message, stack: error.stack });
    console.error('❌ Unable to start server:', error);
    process.exit(1);
  }
}

// Global error handler
app.use((error: any, req: any, res: any, next: any) => {
  logger.error('Unhandled Error', {
    method: req.method,
    url: req.url,
    error: error.message,
    stack: error.stack,
    body: req.body
  });

  return ResponseUtil.error(
    res, 
    error.statusCode || 500, 
    error.message || 'Internal server error',
    error,
    error.code
  );
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise) => {
  logger.error('Unhandled Promise Rejection', { reason: reason?.message || reason, stack: reason?.stack });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

startServer();
