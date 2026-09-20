/**
 * ── Geo CSV importer ─────────────────────────────────────────────────────────
 * Parses the Bangladesh administrative hierarchy CSV
 * (division,district,upazila,union,village + *_bn columns) and upserts
 * working_areas rows. Village identity = (org, division, district, upazila,
 * union, village) — same as the DB unique index, so imports are idempotent.
 */
import type { GeoCsvRow } from '@samity/shared';

/** Minimal RFC-4180-ish CSV line splitter handling quoted fields. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** A store-agnostic upsert function injected by the caller (DB or demo store). */
export type WorkingAreaUpsert = (row: {
  division: string;
  district: string;
  upazila: string;
  union: string | null;
  village: string;
  divisionBn: string | null;
  districtBn: string | null;
  upazilaBn: string | null;
  unionBn: string | null;
  villageBn: string | null;
}) => 'upserted' | 'skipped';

export interface GeoImportSummary {
  rows: number;
  workingAreasUpserted: number;
  skipped: number;
}

/**
 * Import geo rows. Rows missing both village and union still upsert the
 * upazila-level survey placeholder (village defaults to the union name when
 * only union-level data exists — matches how field offices log coverage).
 */
export function importGeoRows(rows: GeoCsvRow[], upsert: WorkingAreaUpsert): GeoImportSummary {
  let upserted = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.division || !row.district || !row.upazila) {
      skipped++;
      continue;
    }
    const village = row.village || row.union || '';
    if (!village) {
      // Upazila-only row: nothing mappable to a village entity.
      skipped++;
      continue;
    }
    const result = upsert({
      division: row.division,
      district: row.district,
      upazila: row.upazila,
      union: row.union || null,
      village,
      divisionBn: row.divisionBn || null,
      districtBn: row.districtBn || null,
      upazilaBn: row.upazilaBn || null,
      unionBn: row.unionBn || null,
      villageBn: row.villageBn || null,
    });
    if (result === 'upserted') upserted++;
    else skipped++;
  }

  return { rows: rows.length, workingAreasUpserted: upserted, skipped };
}
