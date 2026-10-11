/**
 * ── Users & access ───────────────────────────────────────────────────────────
 * The directory of everyone who can sign in: their role (which decides the
 * sidebar and every API gate) and their branch posting. Access is disabled
 * rather than deleted, so an officer's history stays in the audit trail.
 *
 * Roles are the single source of truth from @samity/shared, so the role
 * reference card here always matches what Security & Audit enforces.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Loader2, ShieldCheck, Trash2, UserPlus, UserX, Users } from 'lucide-react';
import {
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  ROLES,
  USER_STATUS_LABELS,
  userCreateSchema,
  type Role,
  type UserCreateInput,
  type UserListResponse,
  type UserStatus,
} from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api } from '@/lib/api';
import { useCan } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth';

type Branch = { id: string; code: string; name: string; name_bn: string | null; status?: string };

const emptyForm: UserCreateInput = {
  email: '',
  fullName: '',
  phone: '',
  role: 'account_officer',
  branchId: null,
  locale: 'bn',
  password: '',
};

const errText = (e: unknown): string => (e instanceof ApiError ? e.message : 'সংযোগ ব্যর্থ / Request failed');

export function UsersPage() {
  const qc = useQueryClient();
  const canManage = useCan()('user:manage');
  const selfId = useAuthStore((s) => s.user?.id ?? null);
  const [form, setForm] = useState<UserCreateInput>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ fullName: string; phone: string; role: Role; branchId: string | null }>({
    fullName: '',
    phone: '',
    role: 'account_officer',
    branchId: null,
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  /** Row awaiting a destructive "purge this login" confirmation. */
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);

  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<UserListResponse>('/users'),
  });
  const branches = useQuery({
    queryKey: ['org-branches'],
    queryFn: () => api.get<{ items: Branch[] }>('/org/branches'),
  });

  const branchOptions = branches.data?.items ?? [];
  const branchLabel = (id: string) => {
    const b = branchOptions.find((x) => x.id === id);
    return b ? `${b.code} · ${b.name_bn ?? b.name}` : id;
  };

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['users'] });

  const create = useMutation({
    mutationFn: (values: UserCreateInput) => api.post('/users', values),
    onSuccess: (_res, values) => {
      setForm(emptyForm);
      setShowForm(false);
      setError('');
      setNotice(`অ্যাকাউন্ট তৈরি হয়েছে: ${values.email} — প্রাথমিক পাসওয়ার্ড ব্যবহারকারীকে জানান।`);
      invalidate();
    },
    onError: (e) => setError(errText(e)),
  });

  const update = useMutation({
    mutationFn: (input: { id: string; body: Record<string, unknown> }) => api.patch(`/users/${input.id}`, input.body),
    onSuccess: () => {
      setEditingId(null);
      setError('');
      setNotice('পরিবর্তন সংরক্ষিত হয়েছে।');
      invalidate();
    },
    onError: (e) => setError(errText(e)),
  });

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: UserStatus }) => api.post(`/users/${input.id}/status`, { status: input.status }),
    onSuccess: (_res, input) => {
      setError('');
      setNotice(input.status === 'disabled' ? 'প্রবেশ বন্ধ করা হয়েছে।' : 'প্রবেশ পুনরায় চালু করা হয়েছে।');
      invalidate();
    },
    onError: (e) => setError(errText(e)),
  });

  const purge = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      setConfirmPurgeId(null);
      setEditingId(null);
      setError('');
      setNotice('অ্যাকাউন্ট স্থায়ীভাবে মুছে ফেলা হয়েছে।');
      invalidate();
    },
    onError: (e) => {
      setConfirmPurgeId(null);
      setError(errText(e));
    },
  });

  const items = users.data?.items ?? [];
  const active = items.filter((u) => u.status === 'active').length;

  const submit = () => {
    const parsed = userCreateSchema.safeParse(form);
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join(' · '),
      );
      return;
    }
    create.mutate(parsed.data as UserCreateInput);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">ব্যবহারকারী ও প্রবেশাধিকার</h1>
          <p className="text-sm text-muted-foreground">
            যারা সাইন-ইন করতে পারেন — তাঁদের ভূমিকা (মেনু ও অনুমতি নির্ধারণ করে) এবং শাখা পোস্টিং।
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? 'outline' : 'default'} size="sm">
            <UserPlus className="h-4 w-4" /> নতুন ব্যবহারকারী
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-[var(--radius)] border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-[var(--radius)] border border-teal-600/30 bg-teal-600/10 px-4 py-3 text-sm text-teal-800 dark:text-teal-200">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Users, label: 'মোট অ্যাকাউন্ট', value: String(items.length) },
          { icon: ShieldCheck, label: 'সক্রিয়', value: String(active) },
          { icon: UserX, label: 'প্রবেশ বন্ধ', value: String(items.length - active) },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 pt-5">
              <s.icon className="h-5 w-5 text-teal-700" />
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-lg font-bold tabular-nums">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showForm && canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>নতুন ব্যবহারকারী</CardTitle>
            <CardDescription>
              সাইন-ইন তৈরি হয় Supabase Auth-এ, ভূমিকা ও শাখা থাকে অ্যাপের অনুমতি রেকর্ডে। প্রাথমিক পাসওয়ার্ড ব্যবহারকারীকে জানিয়ে
              প্রথম সাইন-ইনের পর বদলাতে বলুন।
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="u-email">ইমেইল</Label>
              <Input
                id="u-email"
                type="email"
                placeholder="officer@example.org"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-name">পূর্ণ নাম</Label>
              <Input id="u-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-phone">মোবাইল</Label>
              <Input
                id="u-phone"
                placeholder="01XXXXXXXXX"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-pass">প্রাথমিক পাসওয়ার্ড</Label>
              <Input
                id="u-pass"
                type="text"
                placeholder="কমপক্ষে ৮ অক্ষর"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-role">ভূমিকা</Label>
              <select
                id="u-role"
                className="h-11 w-full rounded-[var(--radius)] border border-input bg-background/60 px-3 text-sm"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r].bn} ({ROLE_LABELS[r].en})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-branch">শাখা</Label>
              <select
                id="u-branch"
                className="h-11 w-full rounded-[var(--radius)] border border-input bg-background/60 px-3 text-sm"
                value={form.branchId ?? ''}
                onChange={(e) => setForm({ ...form, branchId: e.target.value || null })}
              >
                <option value="">— সংস্থা পর্যায় (শাখা নেই) —</option>
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} · {b.name_bn ?? b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <Button onClick={submit} disabled={create.isPending}>
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} সংরক্ষণ
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                বাতিল
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>ডিরেক্টরি</CardTitle>
          <CardDescription>{items.length} জন ব্যবহারকারী</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {users.isPending ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : users.isError ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              ব্যবহারকারীর তালিকা লোড করা যায়নি। প্রবেশাধিকার প্রয়োজন (user:manage)।
            </p>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">কোনো ব্যবহারকারী নেই।</p>
          ) : (
            items.map((u) => (
              <div key={u.id} className="rounded-[var(--radius)] border px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <span className="truncate">{u.fullName}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                        {ROLE_LABELS[u.role]?.bn ?? u.role}
                      </span>
                      {u.status === 'disabled' ? (
                        <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
                          {USER_STATUS_LABELS.disabled.bn}
                        </span>
                      ) : null}
                      {u.id === selfId ? (
                        <span className="rounded-full bg-teal-600/15 px-2 py-0.5 text-[11px] font-medium text-teal-800 dark:text-teal-200">
                          আপনি
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.branchId ? branchLabel(u.branchId) : 'সংস্থা পর্যায়'} · {u.phone || 'মোবাইল নেই'}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(editingId === u.id ? null : u.id);
                          setDraft({ fullName: u.fullName, phone: u.phone, role: u.role, branchId: u.branchId });
                          setError('');
                        }}
                      >
                        সম্পাদনা
                      </Button>
                      <Button
                        size="sm"
                        variant={u.status === 'active' ? 'destructive' : 'outline'}
                        disabled={u.isSelf || setStatus.isPending}
                        onClick={() => setStatus.mutate({ id: u.id, status: u.status === 'active' ? 'disabled' : 'active' })}
                      >
                        {u.status === 'active' ? 'প্রবেশ বন্ধ' : 'পুনরায় চালু'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        title="ভুল ইমেইলে তৈরি অ্যাকাউন্ট মুছে ফেলুন"
                        disabled={u.isSelf || purge.isPending}
                        onClick={() => setConfirmPurgeId(confirmPurgeId === u.id ? null : u.id)}
                      >
                        <Trash2 className="h-4 w-4" /> মুছুন
                      </Button>
                    </div>
                  ) : null}
                </div>

                {confirmPurgeId === u.id ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-destructive/40 bg-destructive/10 px-3 py-2">
                    <p className="text-xs text-destructive">
                      <strong className="font-semibold">{u.fullName}</strong> স্থায়ীভাবে মুছে ফেলবেন? লেনদেন আছে এমন
                      অ্যাকাউন্ট মুছে ফেলা যায় না — সেক্ষেত্রে প্রবেশ বন্ধই যথাযথ।
                    </p>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={purge.isPending}
                      onClick={() => purge.mutate(u.id)}
                    >
                      {purge.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} হ্যাঁ,
                      মুছুন
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmPurgeId(null)}>
                      বাতিল
                    </Button>
                  </div>
                ) : null}

                {editingId === u.id && canManage ? (
                  <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label>পূর্ণ নাম</Label>
                      <Input value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>মোবাইল</Label>
                      <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>ভূমিকা</Label>
                      <select
                        className="h-11 w-full rounded-[var(--radius)] border border-input bg-background/60 px-3 text-sm"
                        value={draft.role}
                        onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r].bn}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>শাখা</Label>
                      <select
                        className="h-11 w-full rounded-[var(--radius)] border border-input bg-background/60 px-3 text-sm"
                        value={draft.branchId ?? ''}
                        onChange={(e) => setDraft({ ...draft, branchId: e.target.value || null })}
                      >
                        <option value="">— সংস্থা পর্যায় —</option>
                        {branchOptions.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.code} · {b.name_bn ?? b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-4 flex gap-2">
                      <Button
                        size="sm"
                        disabled={update.isPending}
                        onClick={() =>
                          update.mutate({
                            id: u.id,
                            body: { fullName: draft.fullName, phone: draft.phone, role: draft.role, branchId: draft.branchId },
                          })
                        }
                      >
                        {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} সংরক্ষণ
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        বাতিল
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-teal-700" /> ভূমিকা ও অনুমতি
          </CardTitle>
          <CardDescription>
            প্রতিটি ভূমিকা কী করতে পারে — এই অনুমতিগুলোই সাইডবার ও প্রতিটি API রুট নিয়ন্ত্রণ করে। বিস্তারিত{' '}
            <Link to="/security" className="font-medium text-teal-700 underline">
              নিরাপত্তা ও অডিট
            </Link>{' '}
            পাতায়।
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r} className="rounded-[var(--radius)] border px-3 py-2">
              <p className="text-sm font-semibold">
                {ROLE_LABELS[r].bn} <span className="text-xs font-normal text-muted-foreground">({ROLE_LABELS[r].en})</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {ROLE_PERMISSIONS[r].length > 0
                  ? ROLE_PERMISSIONS[r].join(' · ')
                  : 'শুধু নিজের হিসাব দেখতে পারেন / Read-only self service'}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
