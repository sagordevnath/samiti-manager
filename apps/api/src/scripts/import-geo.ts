/**
 * Import the Bangladesh geo hierarchy CSV into working_areas.
 * Usage: npm run db:import-geo -w @samity/api -- path/to/geo.csv
 * CSV header: division,district,upazila,union,village,division_bn,district_bn,upazila_bn,union_bn,village_bn
 * Demo mode (no Supabase configured) imports into the in-memory store —
 * useful for a quick smoke check of the parser.
 */
import { readFile } from 'node:fs/promises';
import { geoCsvRowSchema, type GeoCsvRow } from '@samity/shared';
import { isDemoMode } from '../lib/demo.js';
import { orgDemoStore } from '../lib/org-store.js';
import { importGeoRows } from '../lib/geo-csv.js';
import { parseCsvLine } from '../lib/geo-csv.js';
import { supabaseAdmin } from '../lib/supabase.js';


async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npm run db:import-geo -w @samity/api -- <geo.csv>');
    process.exit(1);
  }

  const text = await readFile(file, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    console.error('❌ CSV needs a header and at least one data row');
    process.exit(1);
  }

  const alias: Record<string, string> = {
    division_bn: 'divisionBn',
    district_bn: 'districtBn',
    upazila_bn: 'upazilaBn',
    union_bn: 'unionBn',
    village_bn: 'villageBn',
  };
  const header = parseCsvLine(lines[0]!).map((c) => alias[c.toLowerCase().replace(/\s+/g, '_')] ?? c.toLowerCase());

  const rows: GeoCsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const rec: Record<string, string> = {};
    header.forEach((h, i) => (rec[h] = cells[i] ?? ''));
    rows.push(geoCsvRowSchema.parse(rec));
  }

  if (isDemoMode()) {
    const store = orgDemoStore();
    const summary = importGeoRows(rows, (r) => {
      const dup = store.workingAreas.find(
        (v) =>
          v.division.toLowerCase() === r.division.toLowerCase() &&
          v.district.toLowerCase() === r.district.toLowerCase() &&
          v.upazila.toLowerCase() === r.upazila.toLowerCase() &&
          (v.union ?? '').toLowerCase() === (r.union ?? '').toLowerCase() &&
          v.village.toLowerCase() === r.village.toLowerCase(),
      );
      if (dup) return 'skipped';
      store.workingAreas.push({
        id: crypto.randomUUID(),
        org_id: store.orgId,
        division: r.division,
        district: r.district,
        upazila: r.upazila,
        union: r.union,
        village: r.village,
        division_bn: r.divisionBn,
        district_bn: r.districtBn,
        upazila_bn: r.upazilaBn,
        union_bn: r.unionBn,
        village_bn: r.villageBn,
        population: null,
        households: null,
        market_days: null,
        competitor_mfis: 0,
        potential_score: 3,
        gps_lat: null,
        gps_lng: null,
        branch_id: null,
        surveyed_at: null,
      });
      return 'upserted';
    });
    console.log(`✅ (demo store) ${summary.workingAreasUpserted} upserted, ${summary.skipped} skipped of ${summary.rows} rows`);
    return;
  }

  let upserted = 0;
  let skipped = 0;
  for (const r of rows) {
    const village = r.village || r.union;
    if (!village) {
      skipped++;
      continue;
    }
    const { error } = await supabaseAdmin.from('working_areas').upsert(
      {
        org_id: (await supabaseAdmin.from('organizations').select('id').limit(1).single()).data?.id ?? crypto.randomUUID(),
        division: r.division,
        district: r.district,
        upazila: r.upazila,
        union: r.union || null,
        village,
        division_bn: r.divisionBn || null,
        district_bn: r.districtBn || null,
        upazila_bn: r.upazilaBn || null,
        union_bn: r.unionBn || null,
        village_bn: r.villageBn || null,
      },
      { onConflict: 'org_id, division, district, upazila, union, village' },
    );
    if (error) skipped++;
    else upserted++;
  }
  console.log(`✅ ${upserted} upserted, ${skipped} skipped of ${rows.length} rows`);
}

main().catch((err) => {
  console.error('❌ geo import failed:', err);
  process.exit(1);
});
