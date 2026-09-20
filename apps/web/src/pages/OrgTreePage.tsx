import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type { OrgTreeNode } from '@samity/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { applyDigitPreference } from '@/lib/digits';
import { useUiStore } from '@/stores/ui';

const KIND_BN: Record<OrgTreeNode['kind'], string> = {
  organization: 'সংস্থা',
  zone: 'জোন',
  area: 'এরিয়া',
  branch: 'শাখা',
  working_area: 'গ্রাম',
};

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-teal-50 text-teal-700',
  planned: 'bg-amber-50 text-amber-700',
  closed: 'bg-red-50 text-red-700',
};

function countsLine(node: OrgTreeNode, asciiDigits: boolean): string {
  const fmt = (n: number | string) => applyDigitPreference(String(n), asciiDigits);
  const parts = [`${fmt(node.counts.members)} সদস্য`, `${fmt(node.counts.centers)} কেন্দ্র`];
  if (Number(node.counts.outstandingLoans) > 0) parts.push(`৳${fmt(node.counts.outstandingLoans)} বকেয়া`);
  return parts.join(' · ');
}

function TreeNode({ node, depth }: { node: OrgTreeNode; depth: number }) {
  const asciiDigits = useUiStore((s) => s.asciiDigits);
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted',
          depth === 0 && 'font-bold',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button onClick={() => setOpen(!open)} className="p-0.5 hover:bg-muted-foreground/10 rounded" aria-label={open ? 'collapse' : 'expand'}>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-5" />
        )}

        <span className="text-xs text-muted-foreground w-14 shrink-0">{KIND_BN[node.kind]}</span>
        <span className="text-sm font-medium">{node.nameBn ?? node.name}</span>
        {node.code && <span className="text-xs text-muted-foreground">({node.code})</span>}
        {node.status && (
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', STATUS_BADGE[node.status])}>{node.status}</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{countsLine(node, asciiDigits)}</span>
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

/** Full hierarchy: Organization → Zone → Area → Branch → Village with counts. */
export function OrgTreePage() {
  const { t } = useTranslation();
  const tree = useQuery({
    queryKey: ['org-tree'],
    queryFn: () => api.get<{ tree: OrgTreeNode }>('/org/tree'),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{t('org.treeTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('org.treeSubtitle')}</p>
      </div>

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
          {tree.isError && <p className="text-sm text-red-600">{t('common.error')}</p>}
          {tree.data?.tree && <TreeNode node={tree.data.tree} depth={0} />}
        </CardContent>
      </Card>
    </div>
  );
}
