import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MapContainer, Marker, Popup, TileLayer, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { BranchMapPoint, VillageMapPoint } from '@samity/shared';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { applyDigitPreference } from '@/lib/digits';
import { useUiStore } from '@/stores/ui';

/** OSM tile URL (free). */
const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Teal pin for branches (avoids default marker asset bundling issues). */
const branchIcon = L.divIcon({
  className: '',
  html: `<div style="background:#0f766e;color:#fff;border-radius:9999px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">শ</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const SCORE_COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#16a34a'];

/** Map of branches (pins) + working-area villages (color = potential score). */
export function BranchMapPage() {
  const { t } = useTranslation();
  const asciiDigits = useUiStore((s) => s.asciiDigits);

  const points = useQuery({
    queryKey: ['org-map-points'],
    queryFn: () => api.get<{ branches: BranchMapPoint[]; villages: VillageMapPoint[] }>('/org/map-points'),
  });

  const branches = points.data?.branches ?? [];
  const villages = points.data?.villages ?? [];

  const center: [number, number] = branches.length > 0 ? [branches[0]!.lat, branches[0]!.lng] : [23.8, 90.35];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{t('org.mapTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('org.mapSubtitle')}</p>
      </div>

      {points.isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {points.isError && <p className="text-sm text-red-600">{t('common.error')}</p>}

      {points.data && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <MapContainer center={center} zoom={9} className="h-[70vh] w-full">
              <TileLayer url={OSM_TILES} attribution={OSM_ATTR} />

              {branches.map((b) => (
                <Marker key={b.id} position={[b.lat, b.lng]} icon={branchIcon}>
                  <Popup>
                    <strong>{b.name}</strong> ({b.code})
                    <br />
                    {t('org.status')}: {b.status}
                  </Popup>
                </Marker>
              ))}

              {villages.map((v) => (
                <CircleMarker
                  key={v.id}
                  center={[v.lat, v.lng]}
                  radius={5 + v.potentialScore}
                  pathOptions={{
                    color: SCORE_COLORS[v.potentialScore - 1] ?? '#94a3b8',
                    fillColor: SCORE_COLORS[v.potentialScore - 1] ?? '#94a3b8',
                    fillOpacity: 0.65,
                    weight: 1,
                  }}
                >
                  <Popup>
                    {useUiStore.getState().asciiDigits ? v.name : v.name}
                    <br />
                    {t('org.potential')}: {v.potentialScore}/5
                    <br />
                    {v.branchId ? t('org.assigned') : t('org.unassigned')}
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-teal-700" /> {t('org.branch')}
        </span>
        {SCORE_COLORS.map((c, i) => (
          <span key={c} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: c }} />
            {t('org.potential')} {i + 1}/5
          </span>
        ))}
        <span className="ml-auto">{applyDigitPreference(`${branches.length} ${t('org.branch')} · ${villages.length} ${t('org.village')}`, asciiDigits)}</span>
      </div>
    </div>
  );
}
