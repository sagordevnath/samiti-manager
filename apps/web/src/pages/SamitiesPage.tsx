import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Loader2, MapPin, Plus, Trash2 } from 'lucide-react';
import {
  SAMITY_STATUS,
  samityCreateSchema,
  type SamityCreateInput,
  type SamityUpdateInput,
} from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

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

type Branch = { id: string; name: string; name_bn: string | null; code: string };

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

  const samities = useQuery({
    queryKey: ['samities'],
    queryFn: () => api.get<{ items: SamityRow[] }>('/samities'),
  });

  const branches = useQuery({
    queryKey: ['org-branches'],
    queryFn: () => api.get<{ items: Branch[] }>('/org/branches'),
  });

  // Adding a new samity: pre-select the first branch so the dropdown shows the
  // real branch name from the database instead of an empty choice.
  useEffect(() => {
    const first = branches.data?.items?.[0];
    if (first && !editingId && !form.branchId) {
      setForm((prev) => ({ ...prev, branchId: first.id }));
    }
  }, [branches.data, editingId, form.branchId]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['samities'] });
  };

  const create = useMutation({
    mutationFn: (values: SamityCreateInput) => api.post('/samities', values),
    onSuccess: () => {
      setForm(emptyForm);
      setFormError('');
      invalidate();
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'ত্রুটি হয়েছে'),
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
    if (editingId) {
      const { branchId: _b, code: _c, ...rest } = form;
      void _b;
      void _c;
      update.mutate({ id: editingId, values: rest });
    } else {
      if (!form.branchId) {
        setFormError('শাখা নির্বাচন করুন / Select a branch');
        return;
      }
      create.mutate(form);
    }
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
                {branches.data?.items.map((b) => (
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
