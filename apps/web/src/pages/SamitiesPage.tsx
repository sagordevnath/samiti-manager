import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { CalendarClock, Loader2, MapPin, Plus, Trash2, Users } from 'lucide-react';
import {
  GROUP_STATUS,
  MEETING_STATUS,
  SAMITY_STATUS,
  groupCreateSchema,
  meetingCreateSchema,
  samityCreateSchema,
  type SamityCreateInput,
  type SamityUpdateInput,
} from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

type SamityRow = {
  id: string;
  code: string;
  name: string;
  village: string;
  meeting_day: string;
  meeting_time: string;
  meeting_place: string;
  status: string;
  branch_id: string;
  field_officer_id: string | null;
  branches: { code: string; name: string; name_bn: string | null } | null;
};

type Branch = { id: string; name: string; name_bn: string | null; code: string; status?: string };

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const DAY_LABELS: Record<string, string> = {
  sunday: 'রবিবার',
  monday: 'সোমবার',
  tuesday: 'মঙ্গলবার',
  wednesday: 'বুধবার',
  thursday: 'বৃহস্পতিবার',
  friday: 'শুক্রবার',
  saturday: 'শনিবার',
};

const STATUS_LABELS: Record<string, string> = {
  forming: 'গঠনচলছে',
  active: 'সক্রিয়',
  paused: 'স্থগিত',
  closed: 'বন্ধ',
  merged: 'একীভূত',
  split: 'বিভক্ত',
};

const emptyForm: SamityCreateInput = {
  branchId: '',
  code: '',
  name: '',
  village: '',
  meetingDay: 'friday',
  meetingTime: '17:30',
  meetingPlace: '',
  fieldOfficerId: '',
  status: 'forming',
};

/** Samity management: full CRUD from the client against the live database. */
export function SamitiesPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<SamityCreateInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<SamityRow | null>(null);
  const sessionBranchId = useAuthStore((s) => s.user?.branchId ?? null);

  const samities = useQuery({
    queryKey: ['samities'],
    queryFn: () => api.get<{ items: SamityRow[] }>('/samities'),
  });

  const branches = useQuery({
    queryKey: ['org-branches'],
    queryFn: () => api.get<{ items: Branch[] }>('/org/branches'),
  });

  // Branches that can host a NEW samity. A closed/merged branch must never be
  // offered as the destination, and editing keeps the samity's own branch
  // visible even if it has since been closed.
  const allBranches = branches.data?.items ?? [];
  const selectableBranches = allBranches.filter(
    (b) => (b.status ?? 'active') !== 'closed' && (b.status ?? 'active') !== 'merged',
  );
  // While editing, keep the samity's current branch in the list even if that
  // branch has since been closed, so the select never renders blank.
  const branchOptions =
    form.branchId && !selectableBranches.some((b) => b.id === form.branchId)
      ? [...selectableBranches, ...allBranches.filter((b) => b.id === form.branchId)]
      : selectableBranches;

  // Default the branch to the signed-in user's own branch (correct for branch
  // staff) rather than the first row of the list — otherwise a samity could be
  // silently filed under an unrelated branch just because it sorted first.
  useEffect(() => {
    if (editingId || form.branchId) return;
    const own = sessionBranchId;
    const first = own ? selectableBranches.find((b) => b.id === own) : undefined;
    if (first) setForm((prev) => ({ ...prev, branchId: first.id }));
  }, [branches.data, editingId, form.branchId, sessionBranchId]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['samities'] });
  };

  const create = useMutation({
    mutationFn: (values: SamityCreateInput) => api.post('/samities', values),
    onSuccess: (_res, values) => {
      setForm(emptyForm);
      setFormError('');
      setNotice(`নতুন সমিতি সংরক্ষিত ও তালিকায় যোগ হয়েছে: ${values.name} (${values.code})`);
      invalidate();
    },
    onError: (err) => {
      setNotice('');
      setFormError(err instanceof Error ? err.message : 'ত্রুটি হয়েছে');
    },
  });

  const update = useMutation({
    mutationFn: ({ id, values }: { id: string; values: SamityUpdateInput }) => api.patch(`/samities/${id}`, values),
    onSuccess: () => {
      setEditingId(null);
      setForm(emptyForm);
      setFormError('');
      invalidate();
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'ত্রুটি হয়েছে'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/samities/${id}`),
    onSuccess: invalidate,
    onError: (err) => setFormError(err instanceof Error ? err.message : 'ত্রুটি হয়েছে'),
  });

  const startEdit = (s: SamityRow) => {
    setEditingId(s.id);
    setFormError('');
    setForm({
      branchId: s.branch_id,
      code: s.code,
      name: s.name,
      village: s.village,
      meetingDay: (DAYS as readonly string[]).includes(s.meeting_day)
        ? (s.meeting_day as SamityCreateInput['meetingDay'])
        : 'friday',
      meetingTime: s.meeting_time.slice(0, 5),
      meetingPlace: s.meeting_place,
      fieldOfficerId: s.field_officer_id ?? '',
      status: (SAMITY_STATUS as readonly string[]).includes(s.status)
        ? (s.status as SamityCreateInput['status'])
        : 'forming',
    });
  };

  const submit = () => {
    setFormError('');
    setNotice('');
    // A blank field officer must be omitted entirely — '' is not a valid uuid,
    // and the API/schema treat the officer as optional at creation time.
    const values: SamityCreateInput = {
      ...form,
      fieldOfficerId: form.fieldOfficerId?.trim() ? form.fieldOfficerId : undefined,
    };
    if (editingId) {
      const { branchId: _b, code: _c, ...rest } = values;
      void _b;
      void _c;
      update.mutate({ id: editingId, values: rest });
      return;
    }
    if (!values.branchId) {
      setFormError('শাখা নির্বাচন করুন / Select a branch');
      return;
    }
    // Validate client-side first so a missing village/venue reads as a field
    // error instead of an opaque 422 from the API.
    const parsed = samityCreateSchema.safeParse(values);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'ইনপুট সঠিক নয়');
      return;
    }
    create.mutate(parsed.data);
  };

  const items = samities.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-teal-700">Samities</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MapPin className="h-6 w-6 text-teal-700" /> সমিতি ব্যবস্থাপনা
        </h1>
      </div>

      {notice && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">সমিতি তালিকা ({items.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {samities.isLoading ? (
            <p className="text-sm text-muted-foreground">লোড হচ্ছে…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">কোনো সমিতি পাওয়া যায়নি।</p>
          ) : (
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3">কোড</th>
                  <th className="py-2 pr-3">নাম</th>
                  <th className="py-2 pr-3">শাখা</th>
                  <th className="py-2 pr-3">গ্রাম</th>
                  <th className="py-2 pr-3">সভা</th>
                  <th className="py-2 pr-3">স্ট্যাটাস</th>
                  <th className="py-2 pr-3 text-right">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{s.code}</td>
                    <td className="py-2 pr-3 font-medium">{s.name}</td>
                    <td className="py-2 pr-3 text-xs">
                      {s.branches ? (
                        <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-teal-700">
                          {s.branches.name_bn ?? s.branches.name} ({s.branches.code})
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 pr-3">{s.village}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {DAY_LABELS[s.meeting_day] ?? s.meeting_day} · {s.meeting_time.slice(0, 5)} · {s.meeting_place}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {STATUS_LABELS[s.status] ?? s.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant={selected?.id === s.id ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSelected(selected?.id === s.id ? null : s)}
                        >
                          <Users className="h-3.5 w-3.5" /> দল ও সভা
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => startEdit(s)}>
                          সম্পাদনা
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (window.confirm(`"${s.name}" মুছে ফেলবেন? / Delete this samity?`)) remove.mutate(s.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {selected && <SamityChildren samity={selected} onClose={() => setSelected(null)} />}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{editingId ? 'সমিতি সম্পাদনা' : 'নতুন সমিতি'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="branchId">শাখা</Label>
              <select
                id="branchId"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={form.branchId}
                disabled={editingId !== null}
                onChange={(e) => setForm({ ...form, branchId: e.target.value })}
              >
                <option value="">— নির্বাচন —</option>
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name_bn ?? b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code">কোড</Label>
              <Input id="code" value={form.code} disabled={editingId !== null} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">নাম</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="village">গ্রাম</Label>
              <Input id="village" value={form.village} onChange={(e) => setForm({ ...form, village: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meetingDay">সভার দিন</Label>
              <select
                id="meetingDay"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={form.meetingDay}
                onChange={(e) => setForm({ ...form, meetingDay: e.target.value as SamityCreateInput['meetingDay'] })}
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {DAY_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meetingTime">সভার সময়</Label>
              <Input id="meetingTime" type="time" value={form.meetingTime} onChange={(e) => setForm({ ...form, meetingTime: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meetingPlace">সভার স্থান</Label>
              <Input id="meetingPlace" value={form.meetingPlace} onChange={(e) => setForm({ ...form, meetingPlace: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">স্ট্যাটাস</Label>
              <select
                id="status"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as SamityCreateInput['status'] })}
              >
                {SAMITY_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s] ?? s}
                  </option>
                ))}
              </select>
            </div>
            {formError && <p className="text-xs text-red-600 sm:col-span-2">{formError}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {(create.isPending || update.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId ? 'সংরক্ষণ' : 'যোগ করুন'}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm);
                    setFormError('');
                  }}
                >
                  বাতিল
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

type GroupRow = { id: string; name: string; member_count: number; status: string };
type MeetingRow = { id: string; meeting_date: string; start_time: string; end_time: string; status: string };
type SamityMemberRow = { id: string; full_name: string; member_code: string; samity_id: string | null };

const GROUP_STATUS_LABELS: Record<string, string> = {
  forming: 'গঠনচলছে',
  active: 'সক্রিয়',
  paused: 'স্থগিত',
  closed: 'বন্ধ',
};

const MEETING_STATUS_LABELS: Record<string, string> = {
  scheduled: 'নির্ধারিত',
  in_progress: 'চলমান',
  closed: 'সম্পন্ন',
  cancelled: 'বাতিল',
  rescheduled: 'পুনঃনির্ধারিত',
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'সংযোগ ব্যর্থ / Request failed');

/**
 * A samity's child entities — the 5–10 member groups and the weekly meeting
 * schedule. Both are exposed by the API (GET/POST /samities/:id/groups and
 * /meetings) and were previously unreachable from the UI, so a center could be
 * created but never actually opened for business.
 */
function SamityChildren({ samity, onClose }: { samity: SamityRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [name, setName] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [gStatus, setGStatus] = useState<string>('forming');
  const [date, setDate] = useState(todayIso());
  const [start, setStart] = useState('17:30');
  const [end, setEnd] = useState('18:30');
  const [mStatus, setMStatus] = useState<string>('scheduled');

  const groups = useQuery({
    queryKey: ['samity-groups', samity.id],
    queryFn: () => api.get<{ items: GroupRow[] }>(`/samities/${samity.id}/groups`),
  });
  const meetings = useQuery({
    queryKey: ['samity-meetings', samity.id],
    queryFn: () => api.get<{ items: MeetingRow[] }>(`/samities/${samity.id}/meetings`),
  });
  // Members are fetched by branch (the list endpoint has no samity filter) and
  // narrowed to this samity client-side; a center is far smaller than a branch.
  const members = useQuery({
    queryKey: ['samity-members', samity.branch_id],
    queryFn: () => api.get<{ items: SamityMemberRow[] }>(`/members?branchId=${samity.branch_id}&pageSize=100`),
  });
  const samityMembers = (members.data?.items ?? []).filter((m) => m.samity_id === samity.id);

  const createGroup = useMutation({
    mutationFn: (values: { samityId: string; name: string; memberIds: string[]; status: string }) =>
      api.post(`/samities/${samity.id}/groups`, values),
    onSuccess: () => {
      setError('');
      setOk(`দল তৈরি হয়েছে: ${name}`);
      setName('');
      setMemberIds([]);
      void qc.invalidateQueries({ queryKey: ['samity-groups', samity.id] });
    },
    onError: (e) => setError(errText(e)),
  });

  const createMeeting = useMutation({
    mutationFn: (values: { samityId: string; meetingDate: string; startTime: string; endTime: string; status: string }) =>
      api.post(`/samities/${samity.id}/meetings`, values),
    onSuccess: () => {
      setError('');
      setOk(`সভা নির্ধারিত হয়েছে: ${date}`);
      void qc.invalidateQueries({ queryKey: ['samity-meetings', samity.id] });
    },
    onError: (e) => setError(errText(e)),
  });

  const submitGroup = () => {
    setError('');
    setOk('');
    const parsed = groupCreateSchema.safeParse({ samityId: samity.id, name, memberIds, status: gStatus });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'ইনপুট সঠিক নয়');
      return;
    }
    createGroup.mutate(parsed.data);
  };

  const submitMeeting = () => {
    setError('');
    setOk('');
    const parsed = meetingCreateSchema.safeParse({
      samityId: samity.id,
      meetingDate: date,
      startTime: start,
      endTime: end,
      status: mStatus,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'ইনপুট সঠিক নয়');
      return;
    }
    createMeeting.mutate(parsed.data);
  };

  const toggleMember = (id: string) => {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 10 ? prev : [...prev, id]));
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">দল ও সভা — {samity.name} ({samity.code})</CardTitle>
            <CardDescription>প্রতি ৫–১০ জনে একটি দল; সাপ্তাহিক সভা নির্ধারণ করুন।</CardDescription>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            বন্ধ করুন
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? (
          <div className="rounded-[var(--radius)] border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>
        ) : null}
        {ok ? (
          <div className="rounded-[var(--radius)] border border-teal-600/30 bg-teal-600/10 px-3 py-2 text-xs text-teal-800 dark:text-teal-200">{ok}</div>
        ) : null}

        {/* ── Groups ── */}
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-teal-700" /> দল ({groups.data?.items.length ?? 0})
          </h3>
          {groups.isLoading ? (
            <p className="text-xs text-muted-foreground">লোড হচ্ছে…</p>
          ) : (groups.data?.items.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground">এই সমিতিতে কোনো দল নেই।</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {groups.data?.items.map((g) => (
                <li key={g.id} className="flex items-center justify-between rounded-md border px-3 py-1.5">
                  <span className="font-medium">{g.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {g.member_count} সদস্য · {GROUP_STATUS_LABELS[g.status] ?? g.status}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-2 border-t pt-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="g-name">দলের নাম</Label>
              <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-status">স্ট্যাটাস</Label>
              <select
                id="g-status"
                className="h-11 w-full rounded-[var(--radius)] border border-input bg-background/60 px-3 text-sm"
                value={gStatus}
                onChange={(e) => setGStatus(e.target.value)}
              >
                {GROUP_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {GROUP_STATUS_LABELS[s] ?? s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button size="sm" disabled={createGroup.isPending} onClick={submitGroup}>
                {createGroup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} দল যোগ করুন
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>সদস্য ({memberIds.length}/10 নির্বাচিত)</Label>
            {members.isLoading ? (
              <p className="text-xs text-muted-foreground">সদস্য লোড হচ্ছে…</p>
            ) : samityMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground">এই সমিতিতে এখনো সদস্য যুক্ত হয়নি।</p>
            ) : (
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-[var(--radius)] border p-2">
                {samityMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMember(m.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      memberIds.includes(m.id) ? 'border-teal-600 bg-teal-600 text-white' : 'hover:bg-muted'
                    }`}
                  >
                    {m.full_name} ({m.member_code})
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Meetings ── */}
        <div className="space-y-3 border-t pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="h-4 w-4 text-teal-700" /> সভা ({meetings.data?.items.length ?? 0})
          </h3>
          {meetings.isLoading ? (
            <p className="text-xs text-muted-foreground">লোড হচ্ছে…</p>
          ) : (meetings.data?.items.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground">কোনো সভা নির্ধারিত নেই।</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {meetings.data?.items.map((m) => (
                <li key={m.id} className="flex items-center justify-between rounded-md border px-3 py-1.5">
                  <span className="font-medium">{m.meeting_date}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.start_time.slice(0, 5)}–{m.end_time.slice(0, 5)} · {MEETING_STATUS_LABELS[m.status] ?? m.status}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-2 border-t pt-3 sm:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="m-date">তারিখ</Label>
              <Input id="m-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-start">শুরু</Label>
              <Input id="m-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-end">শেষ</Label>
              <Input id="m-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-status">স্ট্যাটাস</Label>
              <select
                id="m-status"
                className="h-11 w-full rounded-[var(--radius)] border border-input bg-background/60 px-3 text-sm"
                value={mStatus}
                onChange={(e) => setMStatus(e.target.value)}
              >
                {MEETING_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {MEETING_STATUS_LABELS[s] ?? s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button size="sm" variant="outline" disabled={createMeeting.isPending} onClick={submitMeeting}>
                {createMeeting.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} সভা নির্ধারণ
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
