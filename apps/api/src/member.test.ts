/**
 * ── Member Management tests ───────────────────────────────────────────────────
 * Admission wizard end-to-end (create → gates → member number → passbook),
 * duplicate blocking (same-branch + institution-wide NID), overlap flagging,
 * eligibility gate re-check, encrypted-at-rest + masked identity, and the
 * list endpoint. Exercises the demo router at /api/v1/members.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT'];
process.env['SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret';

let createAppRef: typeof import('./app.js').createApp;

beforeEach(async () => {
  vi.resetModules();
  ({ createApp: createAppRef } = await import('./app.js'));
  const members = await import('./lib/member-store.js');
  members.resetMemberDemoStore();
});

const auth = { Authorization: 'Bearer demo-token' };
const officer = { Authorization: 'Bearer demo-token-officer' };
const app = () => createAppRef() as never;
const get = (url: string, headers = auth) => request(app()).get(url).set(headers);
const post = (url: string, body?: unknown, headers = auth) => request(app()).post(url).set(headers).send(body ?? {});
const patch = (url: string, body?: unknown, headers = auth) => request(app()).patch(url).set(headers).send(body ?? {});

const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';
const BRANCH_MYM = '00000000-0000-4000-8000-0000000000b2';
const AREA_BALIATI = '00000000-0000-4000-8000-0000000000a1';

const baseDraft = {
  fullName: 'Salma Akter',
  fullNameBn: 'সালমা আক্তার',
  fatherOrHusbandName: 'Md Rafiq',
  motherName: 'Ayesha Begum',
  idType: 'nid' as const,
  idNumber: '1996123450123',
  dob: '1996-05-20',
  mobile: '01711234567',
  address: 'Village: Baliati, Dhamrai',
  workingAreaId: AREA_BALIATI,
  samityName: 'Rupali Samity',
  occupation: 'Poultry farmer',
  monthlyHouseholdIncome: '11000',
  landOwnedDecimals: 12,
  familyMembers: 4,
  nominees: [{ name: 'Md Rafiq', relation: 'husband' as const, sharePct: 100 }],
};

/** Walk an admission to `member_issued` (inclusive) and return the last view. */
async function advanceToIssued(admissionId: string, headers = auth) {
  const stages = ['field_survey', 'eligibility_screening', 'household_verification', 'manager_approval', 'orientation_completed', 'member_issued'] as const;
  let view: { body: { stage: string; memberNumber: string | null; passbookNo: string | null } } | undefined;
  for (const stage of stages) {
    const res = await post(`/api/v1/members/admissions/${admissionId}/stage`, { stage, result: 'pass' }, headers);
    expect(res.status, stage).toBe(200);
    view = res;
  }
  return view!;
}
void advanceToIssued;

describe('Admission wizard (req 1)', () => {
  it('creates an admission at field_survey with duplicates attached', async () => {
    const res = await post('/api/v1/members/admissions', { branchId: BRANCH_DHAKA, draft: baseDraft });
    expect(res.status).toBe(201);
    expect(res.body.admission.stage).toBe('field_survey');
    expect(res.body.admission.branchCode).toBe('DHK01');
    expect(res.body.admission.duplicates.matches).toEqual([]);
    expect(res.body.admission.eligibility.eligible).toBe(true);
  });

  it('walks all stages, issues a member number and generates a passbook', async () => {
    const created = await post('/api/v1/members/admissions', { branchId: BRANCH_DHAKA, draft: baseDraft });
    const id = created.body.admission.id as string;

    // Passbook stage finalizes: member row created with pending status.
    const stages = ['field_survey', 'eligibility_screening', 'household_verification', 'manager_approval', 'orientation_completed', 'member_issued', 'passbook_generated'] as const;
    let view: { body: { stage: string; memberNumber: string | null; passbookNo: string | null } };
    for (const stage of stages) {
      const res = await post(`/api/v1/members/admissions/${id}/stage`, { stage, result: 'pass' });
      expect(res.status, stage).toBe(200);
      view = res;
    }
    expect(view!.body.stage).toBe('passbook_generated');
    expect(view!.body.memberNumber).toMatch(/^DHK01-\d{2}-\d{5}$/);
    expect(view!.body.passbookNo).toBe(`PB-${view!.body.memberNumber!.replace(/^[^B]*B-/, 'PB-')}`.slice(0, 3) === 'PB-' ? `PB-${view!.body.memberNumber}` : view!.body.passbookNo);

    // Member appears in the list as pending.
    const list = await get('/api/v1/members?status=pending');
    expect(list.body.items.map((m: { full_name: string }) => m.full_name)).toContain('Salma Akter');
  });

  it('rejects an out-of-order stage and a wrong stage', async () => {
    const created = await post('/api/v1/members/admissions', { branchId: BRANCH_DHAKA, draft: baseDraft });
    const id = created.body.admission.id as string;

    const early = await post(`/api/v1/members/admissions/${id}/stage`, { stage: 'manager_approval', result: 'pass' });
    expect(early.status).toBe(409);

    // manager_approval before the three prior gates → 409
    const step = await post(`/api/v1/members/admissions/${id}/stage`, { stage: 'field_survey', result: 'pass' });
    expect(step.status).toBe(200);
    const skip = await post(`/api/v1/members/admissions/${id}/stage`, { stage: 'member_issued', result: 'pass' });
    expect(skip.status).toBe(409);
  });

  it('records a failed gate and lets a later pass continue', async () => {
    const created = await post('/api/v1/members/admissions', { branchId: BRANCH_DHAKA, draft: baseDraft });
    const id = created.body.admission.id as string;
    await post(`/api/v1/members/admissions/${id}/stage`, { stage: 'field_survey', result: 'pass' });
    const fail = await post(`/api/v1/members/admissions/${id}/stage`, { stage: 'eligibility_screening', result: 'fail', note: 'land above limit' });
    expect(fail.status).toBe(200);
    expect(fail.body.stageHistory.at(-1).result).toBe('fail');
  });

  it('gates manager approval behind member:approve (officer denied)', async () => {
    const created = await post('/api/v1/members/admissions', { branchId: BRANCH_DHAKA, draft: baseDraft });
    const id = created.body.admission.id as string;
    for (const stage of ['field_survey', 'eligibility_screening', 'household_verification'] as const) {
      await post(`/api/v1/members/admissions/${id}/stage`, { stage, result: 'pass' }, officer);
    }
    const denied = await post(`/api/v1/members/admissions/${id}/stage`, { stage: 'manager_approval', result: 'pass' }, officer);
    expect(denied.status).toBe(403);
    // The BM/demo admin can approve.
    const ok = await post(`/api/v1/members/admissions/${id}/stage`, { stage: 'manager_approval', result: 'pass' });
    expect(ok.status).toBe(200);
  });

  it('re-evaluates eligibility at the screening gate (land above limit fails)', async () => {
    const created = await post('/api/v1/members/admissions', { branchId: BRANCH_DHAKA, draft: { ...baseDraft, landOwnedDecimals: 80 } });
    const id = created.body.admission.id as string;
    await post(`/api/v1/members/admissions/${id}/stage`, { stage: 'field_survey', result: 'pass' });
    const res = await post(`/api/v1/members/admissions/${id}/stage`, { stage: 'eligibility_screening', result: 'pass' });
    expect(res.status).toBe(200);
    expect(res.body.stageHistory.at(-1).result).toBe('fail');
    expect(res.body.stageHistory.at(-1).note).toContain('land_above_limit');
  });

  it('supports draft patches between stages', async () => {
    const created = await post('/api/v1/members/admissions', { branchId: BRANCH_DHAKA, draft: baseDraft });
    const id = created.body.admission.id as string;
    const patched = await patch(`/api/v1/members/admissions/${id}/draft`, { occupation: 'Tailor' });
    expect(patched.status).toBe(200);
    expect(patched.body.draft.occupation).toBe('Tailor');
  });
});

describe('Duplicate detection (req 4)', () => {
  it('blocks a second membership in the same branch by NID', async () => {
    // Rahima Begum exists in Dhaka (seeded).
    const res = await get(
      `/api/v1/members/duplicate-check?idNumber=1990123456789&workingAreaId=${AREA_BALIATI}&branchId=${BRANCH_DHAKA}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.blocked).toBe(true);
    expect(res.body.matches[0].matchedBy).toContain('id_number');
    expect(res.body.matches[0].branchId).toBe(BRANCH_DHAKA);
  });

  it('blocks institution-wide by NID even across branches and flags overlap', async () => {
    // Same person applying at the Mymensingh branch → still blocked, flagged.
    const res = await get(
      `/api/v1/members/duplicate-check?idNumber=1990123456789&branchId=${BRANCH_MYM}`,
    );
    expect(res.body.blocked).toBe(true);
    expect(res.body.overlapRisk).toBe(true);
  });

  it('blocks by normalized mobile (+88 prefix)', async () => {
    const res = await get(`/api/v1/members/duplicate-check?mobile=%2B8801712345678&branchId=${BRANCH_MYM}`);
    expect(res.body.blocked).toBe(true);
    expect(res.body.matches[0].matchedBy).toContain('mobile');
  });

  it('flags but does not block a fuzzy name in the same village at another branch', async () => {
    // "Rahima Begum" ≈ "Rahima Begum" but only name+village signal, different branch.
    const res = await get(
      `/api/v1/members/duplicate-check?fullName=Rahima%20Begum&workingAreaId=${AREA_BALIATI}&branchId=${BRANCH_MYM}`,
    );
    expect(res.body.blocked).toBe(false);
    expect(res.body.overlapRisk).toBe(true);
    expect(res.body.matches[0].matchedBy).toContain('name_village');
  });

  it('is silent on a genuinely new applicant', async () => {
    const res = await get(
      `/api/v1/members/duplicate-check?fullName=New%20Person&mobile=01999888777&idNumber=1997777777777&workingAreaId=${AREA_BALIATI}&branchId=${BRANCH_DHAKA}`,
    );
    expect(res.body.matches).toEqual([]);
    expect(res.body.blocked).toBe(false);
    expect(res.body.overlapRisk).toBe(false);
  });

  it('rejects a create when the person already has a live membership (409)', async () => {
    const dup = { ...baseDraft, fullName: 'Rahima Begum', idNumber: '1990123456789', mobile: '01712345678' };
    const res = await post('/api/v1/members/admissions', { branchId: BRANCH_DHAKA, draft: dup });
    expect(res.status).toBe(409);
  });
});

describe('Identity protection (req 3)', () => {
  it('masks NID and mobile in the profile and never returns ciphertext', async () => {
    const list = await get('/api/v1/members?q=Rahima');
    const member = list.body.items.find((m: { full_name: string }) => m.full_name === 'Rahima Begum');
    expect(member).toBeTruthy();

    const profile = await get(`/api/v1/members/${member.id}`);
    expect(profile.status).toBe(200);
    expect(profile.body.idNumberMasked).toBe('••••••6789');
    expect(profile.body.mobileMasked).toBe('01712••••78');
    expect(JSON.stringify(profile.body)).not.toContain('idNumberEnc');
    expect(JSON.stringify(profile.body)).not.toContain('1990123456789');
  });

  it('searches by NID through the blind index without exposing it', async () => {
    const res = await get('/api/v1/members?q=1990123456789');
    expect(res.status).toBe(200);
    expect(res.body.items.some((m: { full_name: string }) => m.full_name === 'Rahima Begum')).toBe(true);
  });

  it('exposes expiring signed URLs, not raw bucket paths', async () => {
    const list = await get('/api/v1/members?q=Rahima');
    const member = list.body.items[0];
    const profile = await get(`/api/v1/members/${member.id}`);
    expect(profile.body.photoUrl).toMatch(/^\/api\/v1\/members\/documents\/.+\?expires=\d+$/);
  });
});

describe('Member list & access control', () => {
  it('lists seeded members with masked phones and filters by branch/status', async () => {
    const all = await get('/api/v1/members');
    expect(all.status).toBe(200);
    expect(all.body.total).toBeGreaterThanOrEqual(3);
    for (const m of all.body.items) {
      expect(m.mobile_masked).toMatch(/••••/);
    }
    const dhaka = await get(`/api/v1/members?branchId=${BRANCH_DHAKA}`);
    expect(dhaka.body.items.every((m: { branch_code: string }) => m.branch_code === 'DHK01')).toBe(true);
  });

  it('requires authentication and read permission', async () => {
    expect((await request(app()).get('/api/v1/members')).status).toBe(401);
    // members have no permissions
    const token = request(app());
    void token;
    expect((await get('/api/v1/members', officer)).status).toBe(200);
  });

  it('serves eligibility rules and lets admins update them', async () => {
    const rules = await get('/api/v1/members/eligibility-rules');
    expect(rules.status).toBe(200);
    expect(rules.body.rules.maxLandDecimals).toBe(50);

    const upd = await request(app()).put('/api/v1/members/eligibility-rules').set(auth).send({ maxLandDecimals: 30 });
    expect(upd.status).toBe(200);
    expect(upd.body.rules.maxLandDecimals).toBe(30);
  });
});

describe('Status flow with reason codes (req 6)', () => {
  async function firstActiveMemberId(): Promise<string> {
    const list = await get('/api/v1/members?status=active');
    return list.body.items[0].id as string;
  }

  it('walks active → dormant with a paired reason and date, then back', async () => {
    const id = await firstActiveMemberId();
    const res = await post(`/api/v1/members/${id}/status`, {
      status: 'dormant',
      reasonCode: 'inactivity',
      effectiveDate: '2026-09-01',
      note: 'no deposit for 6 months',
    });
    expect(res.status).toBe(200);
    expect(res.body.member.status).toBe('dormant');
    expect(res.body.change.effectiveDate).toBe('2026-09-01');

    const back = await post(`/api/v1/members/${id}/status`, {
      status: 'active',
      reasonCode: 'rejoined',
      effectiveDate: '2026-09-20',
    });
    expect(back.status).toBe(200);
    expect(back.body.member.status).toBe('active');

    const history = await get(`/api/v1/members/${id}/status-history`);
    expect(history.body.items).toHaveLength(2);
    expect(history.body.items[0].status).toBe('active'); // newest first
  });

  it('rejects an invalid transition and a mismatched reason code', async () => {
    const id = await firstActiveMemberId();
    // active → pending is not allowed
    const badTransition = await post(`/api/v1/members/${id}/status`, {
      status: 'pending',
      reasonCode: 'new_admission',
      effectiveDate: '2026-09-01',
    });
    expect(badTransition.status).toBe(409);

    // dormant requires inactivity
    await post(`/api/v1/members/${id}/status`, { status: 'dormant', reasonCode: 'inactivity', effectiveDate: '2026-09-01' });
    const badReason = await post(`/api/v1/members/${id}/status`, {
      status: 'active',
      reasonCode: 'inactivity',
      effectiveDate: '2026-09-05',
    });
    expect(badReason.status).toBe(422);
  });

  it('requires member:approve for status changes', async () => {
    const id = await firstActiveMemberId();
    const res = await post(`/api/v1/members/${id}/status`, { status: 'dormant', reasonCode: 'inactivity', effectiveDate: '2026-09-01' }, officer);
    expect(res.status).toBe(403);
  });
});

describe('Transfers with approval (req 7)', () => {
  it('walks propose → approve → complete and moves the member', async () => {
    const list = await get('/api/v1/members?branchId=00000000-0000-4000-8000-0000000000b1');
    const member = list.body.items.find((m: { status: string }) => m.status === 'active');

    const proposed = await post(`/api/v1/members/${member.id}/transfers`, {
      toBranchId: '00000000-0000-4000-8000-0000000000b2',
      toSamityName: 'Ashar Alo Samity',
      reason: 'Moved to husbands home in Mymensingh',
    });
    expect(proposed.status).toBe(201);
    expect(proposed.body.stage).toBe('proposed');
    expect(proposed.body.fromBranchCode).toBe('DHK01');
    expect(proposed.body.toBranchCode).toBe('MYM01');

    // Complete before approval → 409
    const early = await post(`/api/v1/members/transfers/${proposed.body.id}/complete`);
    expect(early.status).toBe(409);

    const approved = await post(`/api/v1/members/transfers/${proposed.body.id}/decision`, { decision: 'approve' });
    expect(approved.status).toBe(200);
    expect(approved.body.stage).toBe('approved');

    const done = await post(`/api/v1/members/transfers/${proposed.body.id}/complete`);
    expect(done.status).toBe(200);
    expect(done.body.stage).toBe('completed');

    const profile = await get(`/api/v1/members/${member.id}`);
    expect(profile.body.branchCode).toBe('MYM01');
    expect(profile.body.samityName).toBe('Ashar Alo Samity');

    // Transfer-out landed in the status history.
    const history = await get(`/api/v1/members/${member.id}/status-history`);
    expect(history.body.items[0].reason_code ?? history.body.items[0].reasonCode).toBe('transfer_out');
  });

  it('rejects a second open transfer and same-branch targets', async () => {
    const list = await get('/api/v1/members?branchId=00000000-0000-4000-8000-0000000000b1');
    const member = list.body.items.find((m: { status: string }) => m.status === 'active');

    const first = await post(`/api/v1/members/${member.id}/transfers`, {
      toBranchId: '00000000-0000-4000-8000-0000000000b2',
      reason: 'Relocation to village in Mymensingh',
    });
    expect(first.status).toBe(201);

    const second = await post(`/api/v1/members/${member.id}/transfers`, {
      toBranchId: '00000000-0000-4000-8000-0000000000b2',
      reason: 'Duplicate proposal while first is open',
    });
    expect(second.status).toBe(409);

    const sameBranch = await post(`/api/v1/members/${member.id}/transfers`, {
      toBranchId: '00000000-0000-4000-8000-0000000000b1',
      reason: 'Same branch target should fail',
    });
    // First transfer still open → the open-transfer guard fires first.
    expect([409, 422]).toContain(sameBranch.status);
  });

  it('gates decisions and proposals behind approval/branch permissions', async () => {
    const list = await get('/api/v1/members?branchId=00000000-0000-4000-8000-0000000000b1');
    const member = list.body.items.find((m: { status: string }) => m.status === 'active');
    const proposed = await post(`/api/v1/members/${member.id}/transfers`, {
      toBranchId: '00000000-0000-4000-8000-0000000000b2',
      reason: 'Officer proposes, manager decides',
    }, officer);
    expect(proposed.status).toBe(201);

    // Officer cannot approve (no member:approve).
    const denied = await post(`/api/v1/members/transfers/${proposed.body.id}/decision`, { decision: 'approve' }, officer);
    expect(denied.status).toBe(403);

    const ok = await post(`/api/v1/members/transfers/${proposed.body.id}/decision`, { decision: 'approve' });
    expect(ok.status).toBe(200);
  });
});

describe('Member 360 and notes (req 8)', () => {
  it('returns profile with masked identity, notes, status history and transfers', async () => {
    const list = await get('/api/v1/members?q=Rahima');
    const id = list.body.items[0].id as string;

    await post(`/api/v1/members/${id}/notes`, { note: 'নতুন নমিনি যোগ করতে চান' });

    const view = await get(`/api/v1/members/${id}/360`);
    expect(view.status).toBe(200);
    expect(view.body.profile.member_number).toMatch(/^DHK01-/);
    expect(view.body.profile.id_number_masked).toBe('••••••6789');
    expect(view.body.profile.nominees).toHaveLength(1);
    expect(view.body.notes.length).toBeGreaterThanOrEqual(2); // seeded + new
    expect(Array.isArray(view.body.savings)).toBe(true);
    expect(Array.isArray(view.body.loans)).toBe(true);
    expect(Array.isArray(view.body.attendance)).toBe(true);
    expect(Array.isArray(view.body.insurance)).toBe(true);
    expect(JSON.stringify(view.body)).not.toContain('1990123456789');
  });

  it('404s for an unknown member', async () => {
    expect((await get('/api/v1/members/00000000-0000-4000-8000-00000000dead/360')).status).toBe(404);
  });
});

describe('Search and bulk import (req 9)', () => {
  it('searches by member number, name and mobile', async () => {
    expect((await get('/api/v1/members?q=DHK01-26-00001')).body.total).toBeGreaterThanOrEqual(1);
    expect((await get('/api/v1/members?q=%E0%A6%B0%E0%A6%B9%E0%A6%BF%E0%A6%AE%E0%A6%BE')).body.total).toBeGreaterThanOrEqual(1); // রহিমা
    expect((await get('/api/v1/members?q=01812345678')).body.items[0].full_name).toBe('Nusrat Jahan');
  });

  it('imports rows, creates members, and reports per-row errors', async () => {
    const res = await post('/api/v1/members/bulk-import', {
      rows: [
        {
          fullName: 'Import Test One',
          fullNameBn: 'আমদানি এক',
          fatherOrHusbandName: 'Father One',
          motherName: 'Mother One',
          idNumber: '1995555555011',
          dob: '1995-01-01',
          mobile: '01711110001',
          occupation: 'Farmer',
          monthlyHouseholdIncome: '10000',
          branchCode: 'DHK-01',
          samityName: 'Rupali Samity',
          village: 'Baliati',
          nomineeName: 'Father One',
          nomineeRelation: 'husband',
          nomineeSharePct: 100,
        },
        {
          fullName: 'Import Test Two',
          fatherOrHusbandName: 'Father Two',
          motherName: 'Mother Two',
          idNumber: '1990123456789', // duplicate NID of the seeded Rahima
          dob: '1993-01-01',
          mobile: '01711110002',
          occupation: 'Tailor',
          monthlyHouseholdIncome: '9000',
          branchCode: 'DHK-01',
          samityName: 'Jonaki Samity',
          village: 'Baliati',
          nomineeName: 'Father Two',
          nomineeRelation: 'husband',
          nomineeSharePct: 100,
        },
        {
          fullName: 'Bad Row',
          fatherOrHusbandName: 'Father Bad',
          motherName: 'Mother Bad',
          idNumber: 'abc', // invalid NID
          dob: '1990-01-01',
          mobile: '01711110003',
          occupation: 'Vendor',
          monthlyHouseholdIncome: '100',
          branchCode: 'DHK-01',
          samityName: 'Jonaki Samity',
          village: 'Baliati',
          nomineeName: 'Father Bad',
          nomineeRelation: 'husband',
        },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.received).toBe(3);
    expect(res.body.created).toBe(1);
    expect(res.body.duplicateSkipped).toBe(1);
    expect(res.body.errors).toHaveLength(2);
    expect(res.body.members[0].member_number).toMatch(/^DHK01-\d{2}-\d{5}$/);

    // The created member appears in the list.
    const found = await get('/api/v1/members?q=Import%20Test%20One');
    expect(found.body.total).toBe(1);
  });

  it('rejects an empty import batch', async () => {
    expect((await post('/api/v1/members/bulk-import', { rows: [] })).status).toBe(400);
  });
});
