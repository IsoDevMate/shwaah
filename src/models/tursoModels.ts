import { Database } from '../models';

export class User {
  static async create(data: { email: string; password: string; name: string }) {
    const result = await Database.execute(
      'INSERT INTO Users (email, password, name) VALUES (?, ?, ?)',
      [data.email, data.password, data.name]
    );
    return { id: result.lastInsertRowid, ...data };
  }

  static async findByEmail(email: string) {
    const result = await Database.execute('SELECT * FROM Users WHERE email = ?', [email]);
    return result.rows[0] || null;
  }

  static async findById(id: number) {
    const result = await Database.execute('SELECT * FROM Users WHERE id = ?', [id]);
    return result.rows[0] || null;
  }
}

export class SocialAccount {
  static async create(data: any) {
    const result = await Database.execute(
      'INSERT INTO SocialAccounts (userId, platform, platformUserId, platformUsername, accessToken, refreshToken, expiresAt, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [data.userId, data.platform, data.platformUserId, data.platformUsername, data.accessToken, data.refreshToken, data.expiresAt, data.isActive]
    );
    return { id: result.lastInsertRowid, ...data };
  }

  static async findByUserAndPlatforms(userId: number, platforms: string[]) {
    const placeholders = platforms.map(() => '?').join(',');
    const result = await Database.execute(
      `SELECT * FROM SocialAccounts WHERE userId = ? AND platform IN (${placeholders}) AND isActive = 1`,
      [userId, ...platforms]
    );
    return result.rows;
  }

  static async findByUser(userId: number) {
    const result = await Database.execute(
      'SELECT * FROM SocialAccounts WHERE userId = ? AND isActive = 1',
      [userId]
    );
    return result.rows;
  }

  static async findById(id: number) {
    const result = await Database.execute('SELECT * FROM SocialAccounts WHERE id = ?', [id]);
    return result.rows[0] || null;
  }

  static async update(id: number, data: any) {
    await Database.execute(
      'UPDATE SocialAccounts SET accessToken = ?, expiresAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [data.accessToken, data.expiresAt, id]
    );
    return await this.findById(id);
  }

  static async updateByUserAndPlatform(userId: number, platform: string, data: any) {
    await Database.execute(
      'UPDATE SocialAccounts SET isActive = ?, updatedAt = CURRENT_TIMESTAMP WHERE userId = ? AND platform = ?',
      [data.isActive, userId, platform]
    );
  }

  static async upsert(data: any) {
    const existing = await Database.execute(
      'SELECT id FROM SocialAccounts WHERE userId = ? AND platform = ?',
      [data.userId, data.platform]
    );
    
    if (existing.rows.length > 0) {
      await Database.execute(
        'UPDATE SocialAccounts SET platformUserId = ?, platformUsername = ?, accessToken = ?, refreshToken = ?, expiresAt = ?, isActive = ?, updatedAt = CURRENT_TIMESTAMP WHERE userId = ? AND platform = ?',
        [data.platformUserId, data.platformUsername, data.accessToken, data.refreshToken, data.expiresAt, data.isActive, data.userId, data.platform]
      );
      return { id: existing.rows[0].id, ...data };
    } else {
      return await this.create(data);
    }
  }
}

export class Post {
  static async create(data: any) {
    const result = await Database.execute(
      'INSERT INTO Posts (userId, content, mediaUrls, platforms, status, scheduledAt, campaignId) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.userId, data.content, JSON.stringify(data.mediaUrls), JSON.stringify(data.platforms), data.status, data.scheduledAt, data.campaignId]
    );
    return { id: result.lastInsertRowid, ...data };
  }

  static async findById(id: number) {
    const result = await Database.execute('SELECT * FROM Posts WHERE id = ?', [id]);
    const post = result.rows[0];
    if (post) {
      post.mediaUrls = JSON.parse(post.mediaUrls || '[]');
      post.platforms = JSON.parse(post.platforms);
      post.publishResults = post.publishResults ? JSON.parse(post.publishResults) : null;
    }
    return post || null;
  }

  static async findByUser(userId: number) {
    const result = await Database.execute(
      'SELECT * FROM Posts WHERE userId = ? ORDER BY createdAt DESC',
      [userId]
    );
    return result.rows.map(post => ({
      ...post,
      mediaUrls: JSON.parse(post.mediaUrls || '[]'),
      platforms: JSON.parse(post.platforms),
      publishResults: post.publishResults ? JSON.parse(post.publishResults) : null
    }));
  }

  static async findScheduled() {
    const result = await Database.execute(
      'SELECT * FROM Posts WHERE status = "scheduled" AND scheduledAt <= datetime("now")'
    );
    return result.rows.map(post => ({
      ...post,
      mediaUrls: JSON.parse(post.mediaUrls || '[]'),
      platforms: JSON.parse(post.platforms)
    }));
  }

  static async findScheduledByUser(userId: number) {
    const result = await Database.execute(
      'SELECT * FROM Posts WHERE userId = ? AND status = "scheduled" AND scheduledAt >= datetime("now") ORDER BY scheduledAt ASC',
      [userId]
    );
    return result.rows.map(post => ({
      ...post,
      mediaUrls: JSON.parse(post.mediaUrls || '[]'),
      platforms: JSON.parse(post.platforms)
    }));
  }

  static async findByDateRange(userId: number, startDate: string, endDate: string) {
    const result = await Database.execute(
      'SELECT * FROM Posts WHERE userId = ? AND scheduledAt BETWEEN ? AND ? ORDER BY scheduledAt ASC',
      [userId, startDate, endDate]
    );
    return result.rows.map(post => ({
      ...post,
      mediaUrls: JSON.parse(post.mediaUrls || '[]'),
      platforms: JSON.parse(post.platforms)
    }));
  }

  static async update(id: number, data: any) {
    await Database.execute(
      'UPDATE Posts SET status = ?, publishResults = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [data.status, JSON.stringify(data.publishResults), id]
    );
  }

  static async delete(id: number, userId: number) {
    const result = await Database.execute(
      'DELETE FROM Posts WHERE id = ? AND userId = ?',
      [id, userId]
    );
    return result.changes > 0;
  }
}

export class Campaign {
  static async create(data: any) {
    const result = await Database.execute(
      'INSERT INTO Campaigns (userId, name, description, startDate, endDate, status) VALUES (?, ?, ?, ?, ?, ?)',
      [data.userId, data.name, data.description, data.startDate, data.endDate, data.status]
    );
    return { id: result.lastInsertRowid, ...data };
  }

  static async findByUser(userId: number) {
    const result = await Database.execute(
      'SELECT * FROM Campaigns WHERE userId = ? ORDER BY createdAt DESC',
      [userId]
    );
    return result.rows;
  }

  static async findById(id: number) {
    const result = await Database.execute('SELECT * FROM Campaigns WHERE id = ?', [id]);
    return result.rows[0] || null;
  }

  static async update(id: number, data: any) {
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

  static async delete(id: number, userId: number) {
    const result = await Database.execute(
      'DELETE FROM Campaigns WHERE id = ? AND userId = ?',
      [id, userId]
    );
    return result.changes > 0;
  }
}

export class Analytics {
  static async create(data: any) {
    const result = await Database.execute(
      'INSERT INTO Analytics (postId, platform, views, likes, shares, comments, engagementRate) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.postId, data.platform, data.views, data.likes, data.shares, data.comments, data.engagementRate]
    );
    return { id: result.lastInsertRowid, ...data };
  }

  static async findByPost(postId: number) {
    const result = await Database.execute(
      'SELECT * FROM Analytics WHERE postId = ? ORDER BY recordedAt DESC',
      [postId]
    );
    return result.rows;
  }

  static async findByCampaign(campaignId: number) {
    const result = await Database.execute(
      `SELECT a.* FROM Analytics a 
       JOIN Posts p ON a.postId = p.id 
       WHERE p.campaignId = ? 
       ORDER BY a.recordedAt DESC`,
      [campaignId]
    );
    return result.rows;
  }

  static async findByUserAndDateRange(userId: number, daysAgo: number) {
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

  static async update(id: number, data: any) {
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
