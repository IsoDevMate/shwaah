import { Value } from '@libsql/client';
import { Database, generateUUID } from './index';

export interface AuditDimension {
  grade: 'Low' | 'Fair' | 'Good' | 'Great';
  why: string;
  painPoint: string;
}

export interface PresenceAuditReport {
  overallGrade: 'Low' | 'Fair' | 'Good' | 'Great';
  summary: string;
  hook: AuditDimension;
  relatability: AuditDimension;
  retention: AuditDimension;
}

export interface PresenceAuditRecord {
  id: string;
  userId: string;
  socialAccountId: string;
  platformMediaId: string;
  mediaType: string;
  mediaUrl: string;
  thumbnailUrl: string | null;
  permalink: string | null;
  caption: string;
  report: PresenceAuditReport;
  fix: string | null;
  createdAt: string;
}

function toRecord(row: Record<string, Value>): PresenceAuditRecord {
  return {
    id: String(row.id),
    userId: String(row.userId),
    socialAccountId: String(row.socialAccountId),
    platformMediaId: String(row.platformMediaId),
    mediaType: String(row.mediaType),
    mediaUrl: String(row.mediaUrl),
    thumbnailUrl: row.thumbnailUrl ? String(row.thumbnailUrl) : null,
    permalink: row.permalink ? String(row.permalink) : null,
    caption: String(row.caption || ''),
    report: JSON.parse(String(row.report)),
    fix: row.fix ? String(row.fix) : null,
    createdAt: String(row.createdAt),
  };
}

export class PresenceAudit {
  static async create(data: Omit<PresenceAuditRecord, 'id' | 'fix' | 'createdAt'>) {
    const id = generateUUID();
    await Database.execute(
      `INSERT INTO PresenceAudits (
        id, userId, socialAccountId, platformMediaId, mediaType, mediaUrl,
        thumbnailUrl, permalink, caption, overallGrade, report
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.userId,
        data.socialAccountId,
        data.platformMediaId,
        data.mediaType,
        data.mediaUrl,
        data.thumbnailUrl,
        data.permalink,
        data.caption,
        data.report.overallGrade,
        JSON.stringify(data.report),
      ]
    );
    return this.findByIdForUser(id, data.userId);
  }

  static async findByIdForUser(id: string, userId: string) {
    const result = await Database.execute(
      'SELECT * FROM PresenceAudits WHERE id = ? AND userId = ?',
      [id, userId]
    );
    return result.rows[0] ? toRecord(result.rows[0]) : null;
  }

  static async findByUser(userId: string, limit = 30) {
    const result = await Database.execute(
      'SELECT * FROM PresenceAudits WHERE userId = ? ORDER BY createdAt DESC LIMIT ?',
      [userId, limit]
    );
    return result.rows.map(toRecord);
  }

  static async saveFix(id: string, userId: string, fix: string) {
    await Database.execute(
      `UPDATE PresenceAudits
       SET fix = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ? AND userId = ?`,
      [fix, id, userId]
    );
    return this.findByIdForUser(id, userId);
  }
}
