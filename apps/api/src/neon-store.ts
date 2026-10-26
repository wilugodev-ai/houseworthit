import { Pool } from 'pg';
import { Storage } from '@google-cloud/storage';
import { createHash } from 'node:crypto';
import type { AccountStore, DocumentInfo, StoredDocument, User } from './storage';

export class NeonStore implements AccountStore {
  readonly kind = 'neon';
  private pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 15000, idleTimeoutMillis: 10000, statement_timeout: 15000 });
  private bucket = new Storage().bucket(process.env.DOCUMENT_BUCKET!);
  private object(userId: string, id: string) { return this.bucket.file(`${userId}/${id}`); }

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, profile TEXT NOT NULL DEFAULT '{}');
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires BIGINT NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
      CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, category TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created TEXT NOT NULL, nonce BYTEA NOT NULL, tag BYTEA NOT NULL);
      CREATE INDEX IF NOT EXISTS documents_user_id ON documents(user_id);
      CREATE TABLE IF NOT EXISTS auth_attempts (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires BIGINT NOT NULL);
    `);
  }

  async createUser(user: User) { await this.pool.query('INSERT INTO users VALUES ($1,$2,$3,$4,$5,$6)', [user.id, user.email, user.name, user.salt, user.hash, user.profile]); }
  async userByEmail(email: string) { return (await this.pool.query<User>('SELECT * FROM users WHERE email=$1', [email])).rows[0]; }
  async userBySession(token: string, now: number) {
    return (await this.pool.query<User>('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=$1 AND s.expires>$2', [token, now])).rows[0];
  }
  async createSession(token: string, userId: string, expires: number) {
    await this.pool.query('DELETE FROM sessions WHERE expires<$1', [Date.now()]);
    await this.pool.query('INSERT INTO sessions VALUES ($1,$2,$3)', [token, userId, expires]);
  }
  async deleteSession(token: string) { await this.pool.query('DELETE FROM sessions WHERE token=$1', [token]); }
  async updateProfile(userId: string, profile: string) { await this.pool.query('UPDATE users SET profile=$1 WHERE id=$2', [profile, userId]); }
  async documents(userId: string) {
    return (await this.pool.query<DocumentInfo>('SELECT id,name,category,mime,size,created FROM documents WHERE user_id=$1 ORDER BY created DESC', [userId])).rows;
  }
  async putDocument(doc: StoredDocument) {
    const object = this.object(doc.user_id, doc.id);
    await object.save(doc.content, { resumable: false, contentType: 'application/octet-stream', validation: 'crc32c', metadata: { cacheControl: 'no-store' } });
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [doc.user_id]);
      if (!user.rowCount) throw new Error('Account unavailable');
      const count = await client.query<{ n: string }>('SELECT COUNT(*) AS n FROM documents WHERE user_id=$1', [doc.user_id]);
      if (Number(count.rows[0].n) >= 20) throw new Error('Document limit reached. Remove a file before uploading another.');
      await client.query('INSERT INTO documents VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [doc.id, doc.user_id, doc.name, doc.category, doc.mime, doc.size, doc.created, doc.nonce, doc.tag]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      await object.delete({ ignoreNotFound: true });
      throw error;
    } finally { client.release(); }
  }
  async document(userId: string, id: string) {
    const doc = (await this.pool.query<Omit<StoredDocument, 'content'>>('SELECT * FROM documents WHERE id=$1 AND user_id=$2', [id, userId])).rows[0];
    if (!doc) return undefined;
    const [content] = await this.object(userId, id).download({ validation: 'crc32c' });
    return { ...doc, content };
  }
  async removeDocument(userId: string, id: string) {
    const doc = await this.pool.query('SELECT id FROM documents WHERE id=$1 AND user_id=$2', [id, userId]);
    if (!doc.rowCount) return;
    await this.object(userId, id).delete({ ignoreNotFound: true });
    await this.pool.query('DELETE FROM documents WHERE id=$1 AND user_id=$2', [id, userId]);
  }
  async deleteUser(user: User) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
      // Remove all objects in this owner's prefix, including any abandoned
      // upload whose metadata transaction failed before the process stopped.
      const [files] = await this.bucket.getFiles({ prefix: `${user.id}/` });
      for (const file of files) await file.delete({ ignoreNotFound: true });
      await client.query('DELETE FROM users WHERE id=$1', [user.id]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async allowAttempt(key: string, now: number) {
    const id = createHash('sha256').update(key).digest('hex');
    await this.pool.query('DELETE FROM auth_attempts WHERE expires<$1', [now]);
    const result = await this.pool.query<{ count: number }>(`INSERT INTO auth_attempts VALUES ($1,1,$2)
      ON CONFLICT (id) DO UPDATE SET count=auth_attempts.count+1 RETURNING count`, [id, now + 900000]);
    return result.rows[0].count <= 30;
  }
}
