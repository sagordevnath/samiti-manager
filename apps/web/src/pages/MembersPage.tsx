import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pencil, Users } from 'lucide-react';
import { memberUpdateSchema } from '@samity/shared';
import type { MemberListRow } from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useCan } from '@/lib/permissions';

const STATUS_LABELS: Record<string, string> = {
  pending: 'অপেক্ষমাণ',
  active: 'সক্রিয়',
  dormant: 'নিষ্ক্রিয়',
  dropout: 'ছাড়পত্র',
  transferred: 'স্থানান্তরিত',
  deceased: 'মৃত',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  active: 'bg-emerald-100 text-emerald-800',
  dormant: 'bg-slate-100 text-slate-700',
  dropout: 'bg-rose-100 text-rose-800',
  transferred: 'bg-sky-100 text-sky-800',
  deceased: 'bg-slate-200 text-slate-800',
};

/**
 * Live rows (GET /members in live mode) carry member_code + FK embeds
 * samities(name) / branches(code); demo-mode rows carry the masked display
 * fields. Handle both shapes.
 */
type Row = MemberListRow &
  Partial<{
    phone: string | null;
    national_id: string | null;
    samity_id: string | null;
    member_code: string | null;
    samity_name: string | null;
    branch_code: string | null;
    samities: { name: string } | null;
    branches: { code: string } | null;
  }>;

export function MembersPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const canWrite = useCan()('member:write');
  const qc = useQueryClient();

  const [editing, setEditing] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState({ fullName: '', phone: '', nationalId: '', samityId: '' });
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['members', q, status],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (status) params.set('status', status);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return api.get<{ items: Row[]; total: number }>(`/members${suffix}`);
    },
  });

  const samities = useQuery({
    queryKey: ['samities'],
    queryFn: () => api.get<{ items: Array<{ id: string; name: string }> }>('/samities'),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['members'] });

  const update = useMutation({
    mutationFn: ({ id, values }: { id: string; values: unknown }) => api.patch(`/members/${id}`, values),
    onSuccess: () => {
      setEditing(null);
      setFormError('');
      invalidate();
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'ত্রুটি হয়েছে'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/members/${id}`),
    onSuccess: invalidate,
    onError: (err) => setFormError(err instanceof Error ? err.message : 'ত্রুটি হয়েছে'),
  });

  const startEdit = (m: Row) => {
    setEditing(m);
    setFormError('');
    setEditForm({
      fullName: m.full_name ?? '',
      phone: m.phone ?? (m.mobile_masked ?? '').replace(/[•*xX-]/g, ''),
      nationalId: m.national_id ?? '',
      samityId: m.samity_id ?? '',
    });
  };

  const submitEdit = () => {
    if (!editing) return;
    setFormError('');
    const candidate = {
      fullName: editForm.fullName.trim(),
      phone: editForm.phone.trim(),
      ...(editForm.nationalId.trim() ? { nationalId: editForm.nationalId.trim() } : {}),
      ...(editForm.samityId ? { samityId: editForm.samityId } : {}),
    };
    const parsed = memberUpdateSchema.safeParse(
      editForm.samityId ? candidate : { ...candidate, samityId: undefined },
    );
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'ইনপুট সঠিক নয়');
      return;
    }
    update.mutate({ id: editing.id, values: parsed.data });
  };

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-teal-700">Members</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Users className="h-6 w-6 text-teal-700" /> সদস্য তালিকা
          </h1>
        </div>
        <div className="flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="নাম / সদস্য নম্বর / মোবাইল / এনআইডি"
            className="w-64"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="">সব স্ট্যাটাস</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {canWrite && editing && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">সদস্য সম্পাদনা — {editing.full_name}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                submitEdit();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="fullName">নাম</Label>
                <Input id="fullName" value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">মোবাইল</Label>
                <Input id="phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nationalId">এনআইডি</Label>
                <Input id="nationalId" value={editForm.nationalId} onChange={(e) => setEditForm({ ...editForm, nationalId: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="samityId">সমিতি</Label>
                <select
                  id="samityId"
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={editForm.samityId}
                  onChange={(e) => setEditForm({ ...editForm, samityId: e.target.value })}
                >
                  <option value="">— নির্বাচন —</option>
                  {samities.data?.items.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              {formError && <p className="text-xs text-red-600 sm:col-span-2">{formError}</p>}
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={update.isPending}>
                  সংরক্ষণ
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  বাতিল
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {formError && !editing && <p className="text-sm text-red-600">{formError}</p>}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            মোট সদস্য {data ? data.total : '…'} জন
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">লোড হচ্ছে…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">কোনো সদস্য পাওয়া যায়নি।</p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3">সদস্য নম্বর</th>
                  <th className="py-2 pr-3">নাম</th>
                  <th className="py-2 pr-3">মোবাইল</th>
                  <th className="py-2 pr-3">শাখা</th>
                  <th className="py-2 pr-3">সমিতি</th>
                  <th className="py-2 pr-3">স্ট্যাটাস</th>
                  {canWrite && <th className="py-2 pr-3 text-right">অ্যাকশন</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td
                      className="cursor-pointer py-2 pr-3 font-mono text-xs"
                      onClick={() => (window.location.href = `/members/${m.id}`)}
                    >
                      {m.member_code ?? m.member_number}
                    </td>
                    <td
                      className="cursor-pointer py-2 pr-3"
                      onClick={() => (window.location.href = `/members/${m.id}`)}
                    >
                      <div className="font-medium">{m.full_name_bn || m.full_name}</div>
                      <div className="text-xs text-muted-foreground">{m.full_name}</div>
                    </td>
                    <td className="py-2 pr-3">{m.mobile_masked ?? m.phone ?? '—'}</td>
                    <td className="py-2 pr-3">{m.branches?.code ?? m.branch_code ?? '—'}</td>
                    <td className="py-2 pr-3">{m.samities?.name ?? m.samity_name ?? '—'}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[m.status] ?? 'bg-slate-100 text-slate-700'}`}>
                        {STATUS_LABELS[m.status] ?? m.status}
                      </span>
                    </td>
                    {canWrite && (
                      <td className="py-2 pr-3">
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="outline" size="sm" onClick={() => startEdit(m)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={remove.isPending}
                            onClick={() => {
                              if (window.confirm(`${m.full_name} মুছে ফেলবেন? / Delete this member?`)) remove.mutate(m.id);
                            }}
                          >
                            🗑
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
