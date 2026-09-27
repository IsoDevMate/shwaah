import { Value } from '@libsql/client';
import { Database, generateUUID } from './index';

export interface DirectionIdea {
  title: string;
  hook: string;
  platform: 'instagram' | 'tiktok' | 'linkedin' | 'youtube' | 'facebook';
  angle: string;
}

export interface DirectionSessionRecord {
  id: string;
  userId: string;
  answers: Record<string, string>;
  ideas: DirectionIdea[];
  createdAt: string;
}

function toRecord(row: Record<string, Value>): DirectionSessionRecord {
  return {
    id: String(row.id),
    userId: String(row.userId),
    answers: JSON.parse(String(row.answers)),
    ideas: JSON.parse(String(row.ideas)),
    createdAt: String(row.createdAt),
  };
}

export class DirectionSession {
  static async create(data: {
    userId: string;
    answers: Record<string, string>;
    ideas: DirectionIdea[];
  }) {
    const id = generateUUID();
    await Database.execute(
      'INSERT INTO DirectionSessions (id, userId, answers, ideas) VALUES (?, ?, ?, ?)',
      [id, data.userId, JSON.stringify(data.answers), JSON.stringify(data.ideas)]
    );
    return this.findByIdForUser(id, data.userId);
  }

  static async findByIdForUser(id: string, userId: string) {
    const result = await Database.execute(
      'SELECT * FROM DirectionSessions WHERE id = ? AND userId = ?',
      [id, userId]
    );
    return result.rows[0] ? toRecord(result.rows[0]) : null;
  }

  static async findByUser(userId: string, limit = 20) {
    const result = await Database.execute(
      'SELECT * FROM DirectionSessions WHERE userId = ? ORDER BY createdAt DESC LIMIT ?',
      [userId, limit]
    );
    return result.rows.map(toRecord);
  }
}
