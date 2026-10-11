import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Plus } from 'lucide-react';
import {
  areaCreateSchema,
  zoneCreateSchema,
  type AreaCreateInput,
  type OrgTreeNode,
  type OrgTreeNodeKind,
  type ZoneCreateInput,
} from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api } from '@/lib/api';
import { useCan } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { applyDigitPreference } from '@/lib/digits';
import { useUiStore } from '@/stores/ui';

const KIND_BN: Record<OrgTreeNodeKind, string> = {
  organization: 'প্রধান কার্যালয়',
  zone: 'জোন',
  area: 'এরিয়া অফিস',
  branch: 'শাখা',
  samity: 'সমিতি / কেন্দ্র',
  group: 'দল',
  working_area: 'গ্রাম',
};

/** Where each level is managed — makes every tree row a jump link. */
const KIND_ROUTE: Record<OrgTreeNodeKind, string | null> = {
  organization: '/organization',
  zone: '/organization',
  area: '/organization',
  branch: '/branches',
  samity: '/samities',
  group: '/samities',
  working_area: '/working-areas',
};

/** The NGO-MFI operating hierarchy this tree mirrors (BRAC/Grameen style). */
const HIERARCHY: { kind: OrgTreeNodeKind; en: string; note: string }[] = [
  { kind: 'organization', en: 'Head Office / MFI', note: 'নীতি, তহবিল ও নিয়ন্ত্রক রিপোর্ট' },
  { kind: 'zone', en: 'Zone / Region', note: 'জোন ম্যানেজার দ্বারা তত্ত্বাবধান' },
  { kind: 'area', en: 'Area Office', note: 'এরিয়া ম্যানেজার — শাখা অনুমোদন' },
  { kind: 'branch', en: 'Branch', note: 'শাখা ব্যবস্থাপক — সঞ্চয়, ঋণ, নগদ' },
  { kind: 'samity', en: 'Samity / Center (VO)', note: 'সাপ্তাহিক সভা ও আদায়ের কেন্দ্র' },
  { kind: 'group', en: 'Group (5–10 members)', note: 'জামিন ও সমষ্টিগত দায়' },
];

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-teal-50 text-teal-700',
  planned: 'bg-amber-50 text-amber-700',
  closed: 'bg-red-50 text-red-700',
  forming: 'bg-violet-50 text-violet-700',
  paused: 'bg-amber-50 text-amber-700',
};

/** Counts wording follows the level: centers under a branch, groups under a samity. */
function countsLine(node: OrgTreeNode, asciiDigits: boolean): string {
  const fmt = (n: number | string) => applyDigitPreference(String(n), asciiDigits);
  const parts: string[] = [];
  if (node.counts.members > 0) parts.push(`${fmt(node.counts.members)} সদস্য`);
  if (node.counts.centers > 0) parts.push(`${fmt(node.counts.centers)} সমিতি`);
  if ((node.counts.groups ?? 0) > 0) parts.push(`${fmt(node.counts.groups ?? 0)} দল`);
  if (Number(node.counts.outstandingLoans) > 0) parts.push(`৳${fmt(node.counts.outstandingLoans)} বকেয়া`);
  return parts.join(' · ');
}

function TreeNode({ node, depth }: { node: OrgTreeNode; depth: number }) {
  const asciiDigits = useUiStore((s) => s.asciiDigits);
  const [open, setOpen] = useState(depth < 3);
  const hasChildren = node.children.length > 0;
  const route = KIND_ROUTE[node.kind];
  const label = node.nameBn ?? node.name;

  return (
    <div>
      <div
        className={cn('group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted', depth === 0 && 'font-bold')}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setOpen(!open)}
            className="rounded p-0.5 hover:bg-muted-foreground/10"
            aria-label={open ? 'collapse' : 'expand'}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-5" />
        )}

        <span className="w-24 shrink-0 text-xs text-muted-foreground">{KIND_BN[node.kind]}</span>
        {route ? (
          <Link to={route} className="truncate text-sm font-medium hover:text-primary hover:underline">
            {label}
          </Link>
        ) : (
          <span className="truncate text-sm font-medium">{label}</span>
        )}
        {route && <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />}
        {node.code && <span className="shrink-0 text-xs text-muted-foreground">({node.code})</span>}
        {node.status && (
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', STATUS_BADGE[node.status])}>{node.status}</span>
        )}
        <span className="ml-auto whitespace-nowrap pl-2 text-xs text-muted-foreground">{countsLine(node, asciiDigits)}</span>
      </div>

      {open && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

interface ZoneRow {
  id: string;
  code: string;
  name: string;
  name_bn: string | null;
}

/**
 * Two-step setup: the hierarchy cannot be built top-down without zones and
 * areas, and the API has always exposed them — this is where they become
 * reachable, so a new organization can actually be commissioned from the UI.
 */
function StructureSetup({ zones }: { zones: ZoneRow[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [zone, setZone] = useState<ZoneCreateInput>({ name: '', nameBn: '', code: '' });
  const [area, setArea] = useState<AreaCreateInput>({ name: '', nameBn: '', code: '', zoneId: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['org-tree'] });
    void qc.invalidateQueries({ queryKey: ['org-zones'] });
    void qc.invalidateQueries({ queryKey: ['org-areas'] });
  };
  const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'সংযোগ ব্যর্থ / Request failed');

  const createZone = useMutation({
    mutationFn: (values: ZoneCreateInput) => api.post('/org/zones', values),
    onSuccess: (_r, values) => {
      setZone({ name: '', nameBn: '', code: '' });
      setError('');
      setNotice(`জোন তৈরি হয়েছে: ${values.nameBn} (${values.code})`);
      invalidate();
    },
    onError: (e) => setError(errText(e)),
  });

  const createArea = useMutation({
    mutationFn: (values: AreaCreateInput) => api.post('/org/areas', values),
    onSuccess: (_r, values) => {
      setArea({ name: '', nameBn: '', code: '', zoneId: '' });
      setError('');
      setNotice(`এরিয়া অফিস তৈরি হয়েছে: ${values.nameBn} (${values.code})`);
      invalidate();
    },
    onError: (e) => setError(errText(e)),
  });

  const submit = (kind: 'zone' | 'area') => {
    const parsed = kind === 'zone' ? zoneCreateSchema.safeParse(zone) : areaCreateSchema.safeParse(area);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '));
      return;
    }
    if (kind === 'zone') createZone.mutate(parsed.data as ZoneCreateInput);
    else createArea.mutate(parsed.data as AreaCreateInput);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">কাঠামো তৈরি করুন / Set up the hierarchy</CardTitle>
        <CardDescription>
          জোন → এরিয়া → শাখা (শাখা পাতা থেকে) → সমিতি। উপরের ধাপ ছাড়া নিচের ধাপ তৈরি করা যায় না।
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-[var(--radius)] border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-[var(--radius)] border border-teal-600/30 bg-teal-600/10 px-3 py-2 text-xs text-teal-800 dark:text-teal-200">
            {notice}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="z-namebn">জোনের নাম (বাংলা)</Label>
            <Input id="z-namebn" value={zone.nameBn} onChange={(e) => setZone({ ...zone, nameBn: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="z-name">{t('org.nameEn')}</Label>
            <Input id="z-name" value={zone.name} onChange={(e) => setZone({ ...zone, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="z-code">জোন কোড</Label>
            <Input
              id="z-code"
              placeholder="Z-DHK"
              value={zone.code}
              onChange={(e) => setZone({ ...zone, code: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="flex items-end">
            <Button size="sm" disabled={createZone.isPending} onClick={() => submit('zone')}>
              {createZone.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} জোন যোগ করুন
            </Button>
          </div>
        </div>

        <div className="grid gap-3 border-t pt-3 sm:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="a-namebn">এরিয়ার নাম (বাংলা)</Label>
            <Input id="a-namebn" value={area.nameBn} onChange={(e) => setArea({ ...area, nameBn: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-name">{t('org.nameEn')}</Label>
            <Input id="a-name" value={area.name} onChange={(e) => setArea({ ...area, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-code">এরিয়া কোড</Label>
            <Input
              id="a-code"
              placeholder="A-DHK1"
              value={area.code}
              onChange={(e) => setArea({ ...area, code: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-zone">জোন</Label>
            <select
              id="a-zone"
              className="h-11 w-full rounded-[var(--radius)] border border-input bg-background/60 px-3 text-sm"
              value={area.zoneId}
              onChange={(e) => setArea({ ...area, zoneId: e.target.value })}
            >
              <option value="">— জোন বাছুন —</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.code} · {z.name_bn ?? z.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button size="sm" variant="outline" disabled={createArea.isPending} onClick={() => submit('area')}>
              {createArea.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} এরিয়া যোগ করুন
            </Button>
          </div>
        </div>

        {zones.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            প্রথমে একটি জোন তৈরি করুন — এরিয়া ও শাখা তার অধীনে যোগ হবে।
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Full NGO-MFI hierarchy with counts:
 * Organization → Zone → Area → Branch → Samity/Center → Group,
 * with each branch's working areas (villages) as geographic leaves.
 */
export function OrgTreePage() {
  const { t } = useTranslation();
  const canManageOrg = useCan()('org:manage');
  const tree = useQuery({
    queryKey: ['org-tree'],
    queryFn: () => api.get<{ tree: OrgTreeNode }>('/org/tree'),
  });
  const zones = useQuery({
    queryKey: ['org-zones'],
    queryFn: () => api.get<{ items: ZoneRow[] }>('/org/zones'),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{t('org.treeTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('org.treeSubtitle')}</p>
      </div>

      {canManageOrg ? <StructureSetup zones={zones.data?.items ?? []} /> : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('org.hierarchy')}</CardTitle>
        </CardHeader>
        <CardContent>
          {tree.isLoading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}
            </p>
          )}
          {tree.isError && <p className="text-sm text-red-600">{(tree.error as Error).message}</p>}
          {tree.data?.tree && <TreeNode node={tree.data.tree} depth={0} />}
        </CardContent>
      </Card>

      {/* Operating hierarchy legend — the NGO-MFI reporting ladder in one glance. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">এনজিও-এমএফআই পরিচালন কাঠামো / Operating hierarchy</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2">
            {HIERARCHY.map((level, index) => (
              <li key={level.kind} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {KIND_BN[level.kind]} <span className="text-xs text-muted-foreground">· {level.en}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{level.note}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
