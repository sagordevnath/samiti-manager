process.env.NODE_ENV = 'test';
process.env.PORT = '4010';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
process.env.SUPABASE_ANON_KEY = 'y';
const { createApp } = await import('./dist/app.js');
const app = createApp();
const { resetMisOpsStore } = await import('./dist/lib/mis-ops-store.js');
resetMisOpsStore();
const res = await fetch('http://n').catch(() => null);
// use supertest
const request = (await import('supertest')).default;
const r = await request(app).get('/api/v1/mis-ops/export/standard/samity_list/csv').set('Authorization', 'Bearer demo-token');
console.log('STATUS', r.status);
console.log('HEADERS', JSON.stringify(r.headers));
console.log('BODY_START', String(r.text || '').slice(0, 120));
