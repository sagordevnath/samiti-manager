import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import type { MemberListRow } from '@samity/shared';

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

export function MembersPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['members', q, status],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (status) params.set('status', status);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return api.get<{ items: MemberListRow[]; total: number }>(`/members${suffix}`);
    },
  });

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
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3">সদস্য নম্বর</th>
                  <th className="py-2 pr-3">নাম</th>
                  <th className="py-2 pr-3">মোবাইল</th>
                  <th className="py-2 pr-3">শাখা</th>
                  <th className="py-2 pr-3">সমিতি</th>
                  <th className="py-2 pr-3">স্ট্যাটাস</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr
                    key={m.id}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                    onClick={() => (window.location.href = `/members/${m.id}`)}
                  >
                    <td className="py-2 pr-3 font-mono text-xs">{m.member_number}</td>
                    <td className="py-2 pr-3">
                      <div className="font-medium">{m.full_name_bn || m.full_name}</div>
                      <div className="text-xs text-muted-foreground">{m.full_name}</div>
                    </td>
                    <td className="py-2 pr-3">{m.mobile_masked}</td>
                    <td className="py-2 pr-3">{m.branch_code}</td>
                    <td className="py-2 pr-3">{m.samity_name ?? '—'}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[m.status] ?? 'bg-slate-100 text-slate-700'}`}>
                        {STATUS_LABELS[m.status] ?? m.status}
                      </span>
                    </td>
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
