import { Database } from '../models';

export async function runVoiceNotesMigrations() {
  await Database.execute(`
    CREATE TABLE IF NOT EXISTS VoiceNotes (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      title TEXT,
      audioUrl TEXT NOT NULL,
      mimeType TEXT NOT NULL,
      durationMs INTEGER,
      fileSize INTEGER,
      source TEXT NOT NULL DEFAULT 'upload',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES Users(id)
    )
  `);

  await Database.execute(
    'CREATE INDEX IF NOT EXISTS idx_voice_notes_user_created ON VoiceNotes(userId, createdAt DESC)'
  );
}
