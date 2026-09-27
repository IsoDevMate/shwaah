import { Value } from '@libsql/client';
import { Database, generateUUID } from './index';

export interface VoiceNoteRecord {
  id: string;
  userId: string;
  title: string | null;
  audioUrl: string;
  mimeType: string;
  durationMs: number | null;
  fileSize: number | null;
  source: 'record' | 'upload';
  createdAt: string;
}

function toRecord(row: Record<string, Value>): VoiceNoteRecord {
  return {
    id: String(row.id),
    userId: String(row.userId),
    title: row.title ? String(row.title) : null,
    audioUrl: String(row.audioUrl),
    mimeType: String(row.mimeType),
    durationMs: row.durationMs == null ? null : Number(row.durationMs),
    fileSize: row.fileSize == null ? null : Number(row.fileSize),
    source: String(row.source) === 'record' ? 'record' : 'upload',
    createdAt: String(row.createdAt),
  };
}

export class VoiceNote {
  static async create(data: {
    userId: string;
    title?: string | null;
    audioUrl: string;
    mimeType: string;
    durationMs?: number | null;
    fileSize?: number | null;
    source: 'record' | 'upload';
  }) {
    const id = generateUUID();
    await Database.execute(
      `INSERT INTO VoiceNotes (
        id, userId, title, audioUrl, mimeType, durationMs, fileSize, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.userId,
        data.title ?? null,
        data.audioUrl,
        data.mimeType,
        data.durationMs ?? null,
        data.fileSize ?? null,
        data.source,
      ]
    );
    return this.findByIdForUser(id, data.userId);
  }

  static async findByIdForUser(id: string, userId: string) {
    const result = await Database.execute(
      'SELECT * FROM VoiceNotes WHERE id = ? AND userId = ?',
      [id, userId]
    );
    return result.rows[0] ? toRecord(result.rows[0]) : null;
  }

  static async findByUser(userId: string, limit = 100) {
    const result = await Database.execute(
      'SELECT * FROM VoiceNotes WHERE userId = ? ORDER BY createdAt DESC LIMIT ?',
      [userId, limit]
    );
    return result.rows.map(toRecord);
  }

  static async deleteForUser(id: string, userId: string) {
    const note = await this.findByIdForUser(id, userId);
    if (!note) return null;
    await Database.execute('DELETE FROM VoiceNotes WHERE id = ? AND userId = ?', [id, userId]);
    return note;
  }
}
