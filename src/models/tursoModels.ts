import { Database, generateUUID } from '../models';
import { AuthUser, PostDB } from '../types';
import { Value } from '@libsql/client';

// Helper to convert a database Row to an AuthUser
function rowToAuthUser(row: Record<string, Value>): AuthUser {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    password: String(row.password),
  };
}

export class User {
  static async create(data: { email: string; password: string; name: string }) {
    const id = generateUUID();
    await Database.execute(
      'INSERT INTO Users (id, email, password, name) VALUES (?, ?, ?, ?)',
      [String(id), String(data.email), String(data.password), String(data.name)]
    );
    return { id, ...data };
  }

  static async findByEmail(email: string): Promise<AuthUser | null> {
    const result = await Database.execute('SELECT * FROM Users WHERE email = ?', [String(email)]);
    return result.rows[0] ? rowToAuthUser(result.rows[0]) : null;
  }

  static async findById(id: string): Promise<AuthUser | null> {
    const result = await Database.execute('SELECT * FROM Users WHERE id = ?', [id]);
    return result.rows[0] ? rowToAuthUser(result.rows[0]) : null;
  }
}

export class SocialAccount {
  static async create(data: any) {
    const id = generateUUID();
    await Database.execute(
      'INSERT INTO SocialAccounts (id, userId, platform, platformUserId, platformUsername, accessToken, refreshToken, expiresAt, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, data.userId, data.platform, data.platformUserId, data.platformUsername, data.accessToken, data.refreshToken, data.expiresAt, data.isActive]
    );
    return { id, ...data };
  }

  static async findByUserAndPlatforms(userId: string, platforms: string[]) {
    const placeholders = platforms.map(() => '?').join(',');
    const result = await Database.execute(
      `SELECT * FROM SocialAccounts WHERE userId = ? AND platform IN (${placeholders}) AND isActive = 1`,
      [userId, ...platforms]
    );
    return result.rows;
  }

  static async findByUser(userId: string) {
    const result = await Database.execute(
      'SELECT * FROM SocialAccounts WHERE userId = ? AND isActive = 1',
      [userId]
    );
    return result.rows;
  }

  static async findById(id: string) {
    const result = await Database.execute('SELECT * FROM SocialAccounts WHERE id = ?', [id]);
    return result.rows[0] || null;
  }

  static async update(id: string, data: any) {
    await Database.execute(
      'UPDATE SocialAccounts SET accessToken = ?, expiresAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [data.accessToken, data.expiresAt, id]
    );
    return await this.findById(id);
  }

  static async updateByUserAndPlatform(userId: string, platform: string, data: any) {
    await Database.execute(
      'UPDATE SocialAccounts SET isActive = ?, updatedAt = CURRENT_TIMESTAMP WHERE userId = ? AND platform = ?',
      [data.isActive, userId, platform]
    );
  }

  static async upsert(data: any) {
    const existing = await Database.execute(
      'SELECT id FROM SocialAccounts WHERE userId = ? AND platform = ? AND platformUserId = ?',
      [data.userId, data.platform, data.platformUserId]
    );
    
    if (existing.rows.length > 0) {
      await Database.execute(
        'UPDATE SocialAccounts SET platformUsername = ?, accessToken = ?, refreshToken = ?, expiresAt = ?, isActive = ?, updatedAt = CURRENT_TIMESTAMP WHERE userId = ? AND platform = ? AND platformUserId = ?',
        [data.platformUsername, data.accessToken, data.refreshToken, data.expiresAt, data.isActive, data.userId, data.platform, data.platformUserId]
      );
      return { id: String(existing.rows[0].id), ...data };
    } else {
      return await this.create(data);
    }
  }
}

// Helper to convert a database Row to a PostDB
function rowToPostDB(row: Record<string, Value>): PostDB {
  const mediaUrls = JSON.parse(String(row.mediaUrls || '[]'));
  const platforms = JSON.parse(String(row.platforms));
  const publishResults = row.publishResults ? JSON.parse(String(row.publishResults)) : null;
  const platformContent = row.platformContent ? JSON.parse(String(row.platformContent)) : null;

  return {
    id: String(row.id),
    userId: String(row.userId),
    content: String(row.content),
    mediaUrls: mediaUrls,
    platforms: platforms,
    platformContent: platformContent,
    status: String(row.status),
    publishResults: publishResults,
    scheduledAt: row.scheduledAt ? String(row.scheduledAt) : undefined,
    campaignId: row.campaignId ? String(row.campaignId) : undefined,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

export class Post {
  static async create(data: any): Promise<PostDB> {
    const id = generateUUID();
    await Database.execute(
      'INSERT INTO Posts (id, userId, content, mediaUrls, platforms, platformContent, status, scheduledAt, campaignId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, data.userId, data.content, JSON.stringify(data.mediaUrls), JSON.stringify(data.platforms), data.platformContent ? JSON.stringify(data.platformContent) : null, data.status, data.scheduledAt, data.campaignId]
    );
    return { 
      id, 
      userId: data.userId,
      content: data.content,
      mediaUrls: data.mediaUrls,
      platforms: data.platforms,
      platformContent: data.platformContent ?? null,
      status: data.status,
      publishResults: null,
      scheduledAt: data.scheduledAt,
      campaignId: data.campaignId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  static async findById(id: string): Promise<PostDB | null> {
    const result = await Database.execute('SELECT * FROM Posts WHERE id = ?', [id]);
    return result.rows[0] ? rowToPostDB(result.rows[0]) : null;
  }

  static async findByUser(userId: string): Promise<PostDB[]> {
    const result = await Database.execute(
      'SELECT * FROM Posts WHERE userId = ? ORDER BY createdAt DESC',
      [userId]
    );
    return result.rows.map(rowToPostDB);
  }

  static async findScheduled(lookaheadMinutes = 0): Promise<PostDB[]> {
    const result = await Database.execute(
      `SELECT * FROM Posts WHERE status = "scheduled" AND scheduledAt IS NOT NULL AND replace(replace(scheduledAt, 'T', ' '), 'Z', '') <= strftime('%Y-%m-%d %H:%M:%S', 'now', '+${lookaheadMinutes} minutes') ORDER BY scheduledAt ASC`
    );
    return result.rows.map(rowToPostDB);
  }

  static async findScheduledByUser(userId: string): Promise<PostDB[]> {
    const result = await Database.execute(
      'SELECT * FROM Posts WHERE userId = ? AND status = "scheduled" ORDER BY scheduledAt ASC',
      [userId]
    );
    return result.rows.map(rowToPostDB);
  }

  static async findByDateRange(userId: string, startDate: string, endDate: string): Promise<PostDB[]> {
    const result = await Database.execute(
      'SELECT * FROM Posts WHERE userId = ? AND scheduledAt BETWEEN ? AND ? ORDER BY scheduledAt ASC',
      [userId, startDate, endDate]
    );
    return result.rows.map(rowToPostDB);
  }

  static async update(id: string, data: any) {
    await Database.execute(
      'UPDATE Posts SET status = ?, publishResults = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [data.status, JSON.stringify(data.publishResults), id]
    );
  }

  static async delete(id: string, userId: string) {
    const result = await Database.execute(
      'DELETE FROM Posts WHERE id = ? AND userId = ?',
      [id, userId]
    );
    return result.rowsAffected > 0;
  }
}

export class Campaign {
  static async create(data: any) {
    const id = generateUUID();
    await Database.execute(
      'INSERT INTO Campaigns (id, userId, name, description, startDate, endDate, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, data.userId, data.name, data.description, data.startDate, data.endDate, data.status]
    );
    return { id, ...data };
  }

  static async findByUser(userId: string) {
    const result = await Database.execute(
      'SELECT * FROM Campaigns WHERE userId = ? ORDER BY createdAt DESC',
      [userId]
    );
    return result.rows;
  }

  static async findById(id: string) {
    const result = await Database.execute('SELECT * FROM Campaigns WHERE id = ?', [id]);
    return result.rows[0] || null;
  }

  static async update(id: string, data: any) {
    const updates = [];
    const values = [];
    
    if (data.name) { updates.push('name = ?'); values.push(data.name); }
    if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description); }
    if (data.startDate) { updates.push('startDate = ?'); values.push(data.startDate); }
    if (data.endDate) { updates.push('endDate = ?'); values.push(data.endDate); }
    if (data.status) { updates.push('status = ?'); values.push(data.status); }
    
    updates.push('updatedAt = CURRENT_TIMESTAMP');
    values.push(id);
    
    await Database.execute(
      `UPDATE Campaigns SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return await this.findById(id);
  }

  static async delete(id: string, userId: string) {
    const result = await Database.execute(
      'DELETE FROM Campaigns WHERE id = ? AND userId = ?',
      [id, userId]
    );
    return result.rowsAffected > 0;
  }
}

export class Analytics {
  static async create(data: any) {
    const id = generateUUID();
    await Database.execute(
      'INSERT INTO Analytics (id, postId, platform, views, likes, shares, comments, engagementRate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, data.postId, data.platform, data.views, data.likes, data.shares, data.comments, data.engagementRate]
    );
    return { id, ...data };
  }

  static async findByPost(postId: string) {
    const result = await Database.execute(
      'SELECT * FROM Analytics WHERE postId = ? ORDER BY recordedAt DESC',
      [postId]
    );
    return result.rows;
  }

  static async findByCampaign(campaignId: string) {
    const result = await Database.execute(
      `SELECT a.* FROM Analytics a 
       JOIN Posts p ON a.postId = p.id 
       WHERE p.campaignId = ? 
       ORDER BY a.recordedAt DESC`,
      [campaignId]
    );
    return result.rows;
  }

  static async findByUserAndDateRange(userId: string, daysAgo: number) {
    const result = await Database.execute(
      `SELECT a.* FROM Analytics a 
       JOIN Posts p ON a.postId = p.id 
       WHERE p.userId = ? AND a.recordedAt >= datetime('now', '-${daysAgo} days')
       ORDER BY a.recordedAt DESC`,
      [userId]
    );
    return result.rows;
  }

  static async findRecent(days: number = 7) {
    const result = await Database.execute(
      `SELECT a.*, p.userId FROM Analytics a 
       JOIN Posts p ON a.postId = p.id 
       WHERE a.recordedAt >= datetime('now', '-${days} days')
       ORDER BY a.recordedAt DESC`
    );
    return result.rows;
  }

  static async update(id: string, data: any) {
    await Database.execute(
      'UPDATE Analytics SET views = ?, likes = ?, shares = ?, comments = ?, engagementRate = ? WHERE id = ?',
      [data.views, data.likes, data.shares, data.comments, data.engagementRate, id]
    );
  }

  static async count() {
    const result = await Database.execute('SELECT COUNT(*) as count FROM Analytics');
    return result.rows[0].count;
  }
}

export class Notification {
  static async create(data: { userId: string; type: string; title: string; message: string; postId?: string }) {
    const id = generateUUID();
    await Database.execute(
      'INSERT INTO Notifications (id, userId, type, title, message, postId) VALUES (?, ?, ?, ?, ?, ?)',
      [id, data.userId, data.type, data.title, data.message, data.postId ?? null]
    );
    return { id, ...data, read: 0 };
  }

  static async findByUser(userId: string, limit = 30) {
    const result = await Database.execute(
      'SELECT * FROM Notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT ?',
      [userId, limit]
    );
    return result.rows;
  }

  static async markRead(id: string, userId: string) {
    await Database.execute(
      'UPDATE Notifications SET read = 1 WHERE id = ? AND userId = ?',
      [id, userId]
    );
  }

  static async markAllRead(userId: string) {
    await Database.execute(
      'UPDATE Notifications SET read = 1 WHERE userId = ?',
      [userId]
    );
  }

  static async unreadCount(userId: string) {
    const result = await Database.execute(
      'SELECT COUNT(*) as count FROM Notifications WHERE userId = ? AND read = 0',
      [userId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}
