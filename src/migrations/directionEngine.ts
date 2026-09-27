import { Database } from '../models';

export async function runDirectionEngineMigrations() {
  await Database.execute(`
    CREATE TABLE IF NOT EXISTS DirectionSessions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      answers TEXT NOT NULL,
      ideas TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES Users(id)
    )
  `);
}
