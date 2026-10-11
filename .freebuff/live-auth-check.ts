/**
 * Scratch live check (never committed): does createApp()'s real auth middleware
 * accept a genuine ES256 access token from the project? Reads the token from
 * .freebuff/live-token.txt, prints status + response body only.
 */
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../apps/api/src/app.js';

const token = fs.readFileSync(new URL('./live-token.txt', import.meta.url), 'utf8').trim();

const app = createApp();
const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
console.log('GET /api/v1/auth/me ->', res.status);
console.log(JSON.stringify(res.body).slice(0, 400));
process.exit(res.status === 200 ? 0 : 1);
