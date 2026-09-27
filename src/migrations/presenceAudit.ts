import { Database } from '../models';

export async function runPresenceAuditMigrations() {
  await Database.execute(`
    CREATE TABLE IF NOT EXISTS PresenceAudits (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      socialAccountId TEXT NOT NULL,
      platformMediaId TEXT NOT NULL,
      mediaType TEXT NOT NULL,
      mediaUrl TEXT NOT NULL,
      thumbnailUrl TEXT,
      permalink TEXT,
      caption TEXT,
      overallGrade TEXT NOT NULL,
      report TEXT NOT NULL,
      fix TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES Users(id),
      FOREIGN KEY (socialAccountId) REFERENCES SocialAccounts(id)
    )
  `);

  await Database.execute(
    'CREATE INDEX IF NOT EXISTS idx_presence_audits_user_created ON PresenceAudits(userId, createdAt DESC)'
  );
}
