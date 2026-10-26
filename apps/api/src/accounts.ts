import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req, Res, StreamableFile, UnauthorizedException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { store, type User } from './storage';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const scrypt = promisify(scryptCallback);
function encryptionKey() {
  if (process.env.DOCUMENT_KEY) {
    if (!/^[a-f0-9]{64}$/i.test(process.env.DOCUMENT_KEY)) throw new Error('Invalid document encryption key');
    return Buffer.from(process.env.DOCUMENT_KEY, 'hex');
  }
  const directory = resolve(process.env.DATA_DIRECTORY || '../../.data');
  mkdirSync(directory, { recursive: true });
  const keyPath = resolve(directory, 'document.key');
  if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 });
  return readFileSync(keyPath);
}
const key = encryptionKey();
if (key.length !== 32) throw new Error('Invalid document encryption key');
type Request = { headers: Record<string, string | undefined>; ip?: string };
type Response = { setHeader(name: string, value: string): void };
type Upload = { buffer: Buffer; originalname: string; mimetype: string; size: number };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
async function throttle(req: Request, email: string) {
  const now = Date.now();
  for (const id of [`ip:${req.headers['x-houseworthit-client'] || req.ip || 'local'}`, `email:${digest(email)}`]) {
    if (!await store.allowAttempt(id, now)) throw new BadRequestException('Too many attempts. Try again in 15 minutes.');
  }
}
function mutation(req: Request) {
  if (req.headers['x-houseworthit'] !== '1') throw new BadRequestException('Missing request protection header.');
}
function token(req: Request) { return req.headers.cookie?.split(';').map(p => p.trim()).find(p => p.startsWith('hwi_session='))?.slice(12) || ''; }
async function current(req: Request): Promise<User> {
  const user = await store.userBySession(digest(token(req)), Date.now());
  if (!user) throw new UnauthorizedException('Please sign in to continue.');
  return user;
}
function cookie(res: Response, value: string, maxAge = 28800) { res.setHeader('Set-Cookie', `hwi_session=${value}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`); }
async function session(user: User, res: Response) {
  const value = randomBytes(32).toString('hex');
  await store.createSession(digest(value), user.id, Date.now() + 28800000);
  cookie(res, value);
  return publicUser(user);
}
function publicUser(user: User) { return { id: user.id, email: user.email, name: user.name, profile: JSON.parse(user.profile) }; }
const categories = ['Income', 'Savings', 'Employment', 'Other'];
@Controller('v1')
export class AccountsController {
  @Post('auth/register')
  async register(@Body() body: Record<string, unknown>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    mutation(req);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    await throttle(req, email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100 || typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) throw new BadRequestException('Use a valid email, a name, and a password of 12–128 characters.');
    if (body.consent !== true) throw new BadRequestException('Please acknowledge how your information is stored.');
    const salt = randomBytes(16).toString('hex');
    const hash = (await scrypt(body.password, salt, 64) as Buffer).toString('hex');
    const id = randomBytes(16).toString('hex');
    const user: User = { id, email, name: body.name.trim(), salt, hash, profile: '{}' };
    try { await store.createUser(user); }
    catch { throw new BadRequestException('Unable to create this account. Try signing in or use another email.'); }
    return session(user, res);
  }
  @Post('auth/login') @HttpCode(200)
  async login(@Body() body: Record<string, unknown>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    mutation(req);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    await throttle(req, email);
    if (typeof body?.password !== 'string' || body.password.length > 128) throw new UnauthorizedException('Email or password is incorrect.');
    const user = await store.userByEmail(email);
    const hash = await scrypt(body.password, user?.salt || 'houseworthit-dummy-salt', 64) as Buffer;
    if (!user || !timingSafeEqual(hash, Buffer.from(user.hash, 'hex'))) throw new UnauthorizedException('Email or password is incorrect.');
    return session(user, res);
  }
  @Post('auth/logout') @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) { mutation(req); await store.deleteSession(digest(token(req))); cookie(res, '', 0); return { ok: true }; }
  @Get('profile') async profile(@Req() req: Request) { return publicUser(await current(req)); }
  @Put('profile') async save(@Body() body: Record<string, unknown>, @Req() req: Request) {
    mutation(req); const user = await current(req); const profile: Record<string, string | number> = {};
    for (const field of ['annualIncome', 'monthlyDebts', 'savings', 'targetPrice']) {
      const value = body?.[field];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000000) throw new BadRequestException(`Invalid ${field}.`);
      profile[field] = value;
    }
    const choices: Record<string, string[]> = { employment: ['Employed', 'Self-employed', 'Retired', 'Other'], creditRange: ['Not sure', 'Below 620', '620–679', '680–739', '740+'], timeline: ['Exploring', '0–3 months', '3–6 months', '6–12 months', '12+ months'] };
    for (const field of Object.keys(choices)) {
      if (typeof body[field] !== 'string' || !choices[field].includes(body[field] as string)) throw new BadRequestException(`Invalid ${field}.`);
      profile[field] = body[field] as string;
    }
    if (typeof body.zip !== 'string' || (body.zip !== '' && !/^\d{5}$/.test(body.zip))) throw new BadRequestException('Use a five-digit ZIP code.');
    profile.zip = body.zip;
    await store.updateProfile(user.id, JSON.stringify(profile));
    return publicUser({ ...user, profile: JSON.stringify(profile) });
  }
  @Get('documents') async documents(@Req() req: Request) { return store.documents((await current(req)).id); }
  @Post('documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1, parts: 2 } }))
  async upload(@UploadedFile() file: Upload | undefined, @Body('category') category: string, @Req() req: Request) {
    mutation(req); const user = await current(req);
    if (!file?.size || !categories.includes(category)) throw new BadRequestException('Choose a document and category.');
    if ((await store.documents(user.id)).length >= 20) throw new BadRequestException('Document limit reached. Remove a file before uploading another.');
    const b = file.buffer;
    const mime = b.subarray(0, 5).toString() === '%PDF-' ? 'application/pdf' : b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : b[0] === 255 && b[1] === 216 && b[2] === 255 ? 'image/jpeg' : '';
    const extension = mime === 'application/pdf' ? /\.pdf$/i : mime === 'image/png' ? /\.png$/i : /\.jpe?g$/i;
    if (!mime || mime !== file.mimetype || !extension.test(file.originalname)) throw new BadRequestException('Upload a PDF, JPEG, or PNG matching its file extension.');
    const id = randomBytes(16).toString('hex');
    const nonce = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(`${user.id}:${id}`));
    const content = Buffer.concat([cipher.update(b), cipher.final()]);
    const name = file.originalname.replace(/[^a-zA-Z0-9._ ()-]/g, '_').slice(0, 160);
    await store.putDocument({ id, user_id: user.id, name, category, mime, size: file.size, created: new Date().toISOString(), nonce, tag: cipher.getAuthTag(), content });
    return { id, name, category, size: file.size };
  }
  @Get('documents/:id') async download(@Param('id') id: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await current(req);
    const doc = await store.document(user.id, id);
    if (!doc) throw new BadRequestException('Document not found.');
    const decipher = createDecipheriv('aes-256-gcm', key, doc.nonce); decipher.setAAD(Buffer.from(`${user.id}:${id}`)); decipher.setAuthTag(doc.tag);
    res.setHeader('Content-Disposition', `attachment; filename="${doc.name}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(Buffer.concat([decipher.update(doc.content), decipher.final()]), { type: doc.mime });
  }
  @Delete('documents/:id') async remove(@Param('id') id: string, @Req() req: Request) { mutation(req); await store.removeDocument((await current(req)).id, id); return { ok: true }; }
  @Delete('profile') async erase(@Req() req: Request, @Res({ passthrough: true }) res: Response) { mutation(req); await store.deleteUser(await current(req)); cookie(res, '', 0); return { ok: true }; }
}
