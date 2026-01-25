import { createClient } from '@libsql/client';

// Alternative direct Turso client if needed
export const tursoClient = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN
});

// Test connection
export const testTursoConnection = async () => {
  try {
    const result = await tursoClient.execute('SELECT 1 as test');
    console.log('✅ Turso connection successful:', result.rows);
    return true;
  } catch (error) {
    console.error('❌ Turso connection failed:', error);
    return false;
  }
};
