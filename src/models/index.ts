import { createClient } from '@libsql/client';
import { dbLogger } from '../utils/logger';

// Direct Turso client
export const db = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN
});

// Test connection first
export const testConnection = async () => {
  try {
    console.log('🔍 Testing Turso connection...');
    console.log('Database URL:', process.env.DATABASE_URL);
    console.log('Token length:', process.env.TURSO_AUTH_TOKEN?.length);
    
    const result = await db.execute('SELECT 1 as test');
    console.log('✅ Connection test successful:', result.rows);
    return true;
  } catch (error) {
    console.error('❌ Connection test failed:', error);
    return false;
  }
};

// Database operations
export class Database {
  static async execute(sql: string, params: any[] = []) {
    const start = Date.now();
    dbLogger.query(sql, params);
    
    try {
      const result = await db.execute({ sql, args: params });
      const duration = Date.now() - start;
      dbLogger.result(sql, result, duration);
      return result;
    } catch (error) {
      dbLogger.error(sql, error);
      console.error('Database error:', error);
      throw error;
    }
  }

  static async init() {
    // Test connection first
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Failed to connect to Turso database');
    }
    
    // Create tables
    await this.execute(`
      CREATE TABLE IF NOT EXISTS Users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.execute(`
      CREATE TABLE IF NOT EXISTS SocialAccounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        platform TEXT NOT NULL,
        platformUserId TEXT NOT NULL,
        platformUsername TEXT,
        accessToken TEXT NOT NULL,
        refreshToken TEXT,
        expiresAt DATETIME,
        isActive BOOLEAN DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES Users(id)
      )
    `);

    await this.execute(`
      CREATE TABLE IF NOT EXISTS Posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        content TEXT NOT NULL,
        mediaUrls TEXT,
        platforms TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        publishResults TEXT,
        scheduledAt DATETIME,
        campaignId INTEGER,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES Users(id)
      )
    `);

    await this.execute(`
      CREATE TABLE IF NOT EXISTS Campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        startDate DATETIME NOT NULL,
        endDate DATETIME NOT NULL,
        status TEXT DEFAULT 'active',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES Users(id)
      )
    `);

    await this.execute(`
      CREATE TABLE IF NOT EXISTS Analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        postId INTEGER NOT NULL,
        platform TEXT NOT NULL,
        views INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        shares INTEGER DEFAULT 0,
        comments INTEGER DEFAULT 0,
        engagementRate REAL DEFAULT 0,
        recordedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (postId) REFERENCES Posts(id)
      )
    `);

    console.log('✅ Database tables initialized');
    
    // Test R2 storage connection
    await this.testR2Connection();
  }

  static async testR2Connection() {
    try {
      console.log('🔄 Testing Cloudflare R2 connection...');
      
      const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      
      const s3Client = new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT!.replace('/marketingaddons', ''),
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!
        }
      });

      const listCommand = new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET_NAME!,
        MaxKeys: 1
      });
      
      await s3Client.send(listCommand);
      console.log('✅ R2 storage connection successful');
      console.log(`📁 Bucket: ${process.env.R2_BUCKET_NAME}`);
      
    } catch (error) {
      console.error('❌ R2 connection failed:', (error as Error).message);
      console.log('💡 Media uploads will not work until R2 is configured');
    }
  }
}