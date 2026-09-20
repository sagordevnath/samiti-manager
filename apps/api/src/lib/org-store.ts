/**
 * ── Org-structure demo store ─────────────────────────────────────────────────
 * The org module is preview-first: when Supabase env values are still the
 * validated placeholders, routes serve this in-memory dataset instead of
 * failing. Shapes mirror the DB rows in supabase/database.types.ts.
 * NOT for production — replace by configuring real SUPABASE_* values.
 */
import type { BranchStatus, OpeningStage } from '@samity/shared';

export interface ZoneRow {
  id: string;
  org_id: string;
  code: string;
  name: string;
  name_bn: string | null;
}

export interface AreaRow extends ZoneRow {
  zone_id: string;
}

export interface BranchProfileRow {
  id: string;
  org_id: string;
  area_id: string;
  name: string;
  name_bn: string | null;
  code: string;
  district: string | null;
  status: BranchStatus;
  opening_date: string | null;
  address: string | null;
  gps_lat: string | null;
  gps_lng: string | null;
  manager_user_id: string | null;
}

export interface WorkingAreaRow {
  id: string;
  org_id: string;
  division: string;
  district: string;
  upazila: string;
  union: string | null;
  village: string;
  division_bn: string | null;
  district_bn: string | null;
  upazila_bn: string | null;
  union_bn: string | null;
  village_bn: string | null;
  population: number | null;
  households: number | null;
  market_days: string | null;
  competitor_mfis: number;
  potential_score: number;
  gps_lat: string | null;
  gps_lng: string | null;
  branch_id: string | null;
  surveyed_at: string | null;
}

export interface BranchOpeningRow {
  id: string;
  org_id: string;
  branch_id: string;
  stage: OpeningStage;
  proposal_note: string;
  proposed_at: string;
  director_note: string | null;
  checklist: { item: string; done: boolean; note?: string }[];
  activated_at: string | null;
  rejected_note: string | null;
}

export interface StaffAssignmentRow {
  id: string;
  org_id: string;
  user_id: string;
  branch_id: string;
  role_at_branch: string;
  effective_from: string;
  effective_to: string | null;
  note: string | null;
}

export interface OrgDemoData {
  orgId: string;
  zones: ZoneRow[];
  areas: AreaRow[];
  branches: BranchProfileRow[];
  workingAreas: WorkingAreaRow[];
  openings: BranchOpeningRow[];
  assignments: StaffAssignmentRow[];
  /** per-branch demo aggregates for the tree view */
  branchStats: Record<string, { members: number; centers: number; outstandingLoans: string }>;
}

/** Dhaka-region bounding box for believable demo coordinates. */
const dhaka = (lat: number, lng: number) => ({ gps_lat: String(lat), gps_lng: String(lng) });

function build(): OrgDemoData {
  const orgId = '00000000-0000-4000-8000-0000000000aa';
  const zoneDhaka = '00000000-0000-4000-8000-0000000000b1';
  const zoneMymensingh = '00000000-0000-4000-8000-0000000000b2';
  const areaDhakaCentral = '00000000-0000-4000-8000-0000000000c1';
  const areaDhakaNorth = '00000000-0000-4000-8000-0000000000c2';
  const areaMymensingh = '00000000-0000-4000-8000-0000000000c3';

  const zones: ZoneRow[] = [
    { id: zoneDhaka, org_id: orgId, code: 'Z-DHK', name: 'Dhaka Zone', name_bn: 'ঢাকা অঞ্চল' },
    { id: zoneMymensingh, org_id: orgId, code: 'Z-MYM', name: 'Mymensingh Zone', name_bn: 'ময়মনসিংহ অঞ্চল' },
  ];

  const areas: AreaRow[] = [
    { id: areaDhakaCentral, org_id: orgId, zone_id: zoneDhaka, code: 'A-DKC', name: 'Dhaka Central Area', name_bn: 'ঢাকা কেন্দ্রীয় এলাকা' },
    { id: areaDhakaNorth, org_id: orgId, zone_id: zoneDhaka, code: 'A-DKN', name: 'Dhaka North Area', name_bn: 'ঢাকা উত্তর এলাকা' },
    { id: areaMymensingh, org_id: orgId, zone_id: zoneMymensingh, code: 'A-MYM', name: 'Mymensingh Sadar Area', name_bn: 'ময়মনসিংহ সদর এলাকা' },
  ];

  const branches: BranchProfileRow[] = [
    {
      id: '00000000-0000-4000-8000-0000000000d1',
      org_id: orgId,
      area_id: areaDhakaCentral,
      name: 'Dhanmondi Branch',
      name_bn: 'ধানমন্ডি শাখা',
      code: 'DHK-01',
      district: 'Dhaka',
      status: 'active',
      opening_date: '2019-03-01',
      address: 'House 12, Road 5, Dhanmondi, Dhaka',
      ...dhaka(23.7461, 90.3742),
      manager_user_id: null,
    },
    {
      id: '00000000-0000-4000-8000-0000000000d2',
      org_id: orgId,
      area_id: areaDhakaNorth,
      name: 'Uttara Branch',
      name_bn: 'উত্তরা শাখা',
      code: 'DHK-02',
      district: 'Dhaka',
      status: 'active',
      opening_date: '2021-07-15',
      address: 'Sector 7, Uttara, Dhaka',
      ...dhaka(23.8685, 90.4009),
      manager_user_id: null,
    },
    {
      id: '00000000-0000-4000-8000-0000000000d3',
      org_id: orgId,
      area_id: areaMymensingh,
      name: 'Mymensingh Sadar Branch',
      name_bn: 'ময়মনসিংহ সদর শাখা',
      code: 'MYM-01',
      district: 'Mymensingh',
      status: 'planned',
      opening_date: null,
      address: 'Chorpara, Mymensingh',
      ...dhaka(24.7471, 90.4203),
      manager_user_id: null,
    },
  ];

  // ~18 villages per active branch; 4 unassigned; a planned branch with none.
  const villageSeed: Array<[number | null, string, string, string, string, string, number, number, number, number, string, string]> = [
    // [branchIdx|null, village, villageBn, upazila, upazilaBn, union, pop, hh, competitors, score, lat, lng]
    [0, 'Baliati', 'বালিয়াটি', 'Dhamrai', 'ধামরাই', 'Baliati', 3200, 740, 2, 5, '23.9012', '90.2011'],
    [0, 'Panjol', 'পাঁচল', 'Dhamrai', 'ধামরাই', 'Panjol', 2100, 480, 1, 4, '23.9123', '90.2214'],
    [0, 'Chandra', 'চন্দ্রা', 'Dhamrai', 'ধামরাই', 'Chandra', 5400, 1210, 3, 4, '23.8879', '90.2318'],
    [0, 'Gohail', 'গোহাইল', 'Dhamrai', 'ধামরাই', 'Gohail', 1800, 402, 0, 3, '23.9330', '90.2431'],
    [0, 'Kaliakair North', 'কালিয়াকৈর উত্তর', 'Kaliakair', 'কালিয়াকৈর', 'Batan', 2900, 655, 1, 4, '24.0321', '90.2210'],
    [0, 'Mouchak', 'মৌচাক', 'Kaliakair', 'কালিয়াকৈর', 'Mouchak', 3700, 830, 2, 5, '24.0612', '90.2419'],
    [0, 'Koraitola', 'কড়ইতোলা', 'Kaliakair', 'কালিয়াকৈর', 'Atia', 1500, 321, 0, 2, '24.0755', '90.2630'],
    [0, 'Daulatpur', 'দৌলতপুর', 'Dhamrai', 'ধামরাই', 'Daulatpur', 2600, 577, 1, 4, '23.8590', '90.2110'],
    [0, 'Bishnandi', 'বিষ্ণন্দি', 'Dhamrai', 'ধামরাই', 'Bishnandi', 1900, 410, 0, 3, '23.8721', '90.1905'],
    [0, 'Jagannathpur', 'জগন্নাথপুর', 'Savar', 'সাভার', 'Banktown', 4100, 902, 2, 4, '23.8301', '90.2405'],
    [0, 'Genda', 'গেন্ডা', 'Savar', 'সাভার', 'Genda', 2300, 512, 1, 3, '23.8410', '90.2701'],
    [0, 'Nayahat', 'নয়াহাট', 'Savar', 'সাভার', 'Nayahat', 3100, 690, 2, 4, '23.8201', '90.2602'],
    [0, 'Tejgaon Periphery', 'তেজগাঁও পরিধি', 'Savar', 'সাভার', 'Amlabo', 5200, 1180, 4, 3, '23.7999', '90.3120'],
    [0, 'Gabtoli West', 'গাবতলী পশ্চিম', 'Savar', 'সাভার', 'Gabtoli', 4600, 1021, 3, 4, '23.7885', '90.3110'],
    [0, 'Berulia', 'বেরুলিয়া', 'Dhamrai', 'ধামরাই', 'Berulia', 1700, 366, 0, 3, '23.9150', '90.1902'],
    [0, 'Bunagachi', 'বুনগাচি', 'Dhamrai', 'ধামরাই', 'Bunagachi', 2800, 610, 1, 4, '23.9210', '90.2505'],
    [0, 'Ruhitpur', 'রুহিতপুর', 'Dhamrai', 'ধামরাই', 'Ruhitpur', 2400, 528, 1, 3, '23.8915', '90.1810'],
    [0, 'Atpara', 'অপরা', 'Dhamrai', 'ধামরাই', 'Atpara', 2100, 466, 0, 3, '23.9020', '90.1708'],
    [1, 'Dakshinkhan', 'দক্ষিণখান', 'Uttara', 'উত্তরা', 'Dakshinkhan', 6100, 1345, 3, 5, '23.8530', '90.4105'],
    [1, 'Uttarkhan', 'উত্তরখান', 'Uttara', 'উত্তরা', 'Uttarkhan', 5800, 1290, 2, 5, '23.8677', '90.4021'],
    [1, 'Begunbari', 'বেগুনবাড়ি', 'Uttara', 'উত্তরা', 'Begunbari', 3900, 860, 2, 4, '23.8790', '90.4210'],
    [1, 'Ibrahimpur', 'ইব্রাহিমপুর', 'Uttara', 'উত্তরা', 'Ibrahimpur', 4400, 977, 2, 4, '23.8711', '90.4315'],
    [1, 'Abdullahpur', 'আব্দুল্লাহপুর', 'Uttara', 'উত্তরা', 'Abdullahpur', 5000, 1112, 3, 4, '23.8890', '90.4410'],
    [1, 'Jahangirnagar', 'জাহাঙ্গীরনগর', 'Ashulia', 'আশুলিয়া', 'Jahangirnagar', 3400, 751, 1, 4, '23.9010', '90.4210'],
    [1, 'Boro Bigha', 'বড় বিঘা', 'Ashulia', 'আশুলিয়া', 'Boro Bigha', 2900, 640, 1, 3, '23.9120', '90.4312'],
    [1, 'Sharuzzamanpur', 'শরুজ্জামানপুর', 'Ashulia', 'আশুলিয়া', 'Sharuzzamanpur', 2600, 571, 0, 3, '23.9230', '90.4420'],
    [1, 'Shahjadpur', 'শাহজাদপুর', 'Uttara', 'উত্তরা', 'Shahjadpur', 3800, 842, 2, 4, '23.8440', '90.4401'],
    [1, 'Kamarpara', 'কামারপাড়া', 'Uttara', 'উত্তরা', 'Kamarpara', 4500, 998, 2, 5, '23.8555', '90.4250'],
    [1, 'Rajabari', 'রাজাবাড়ী', 'Uttara', 'উত্তরা', 'Rajabari', 3200, 706, 1, 3, '23.8610', '90.4150'],
    [1, 'Para Bigha', 'পাড়া বিঘা', 'Ashulia', 'আশুলিয়া', 'Para Bigha', 2300, 505, 0, 3, '23.9080', '90.4501'],
    [null, 'Char Kanchanpur', 'চর কাঞ্চনপুর', 'Dhamrai', 'ধামরাই', 'Kanchanpur', 1500, 330, 0, 2, '23.9450', '90.1605'],
    [null, 'Sonatoni', 'সোনাতনী', 'Kaliakair', 'কালিয়াকৈর', 'Sonatoni', 1900, 415, 0, 2, '24.0510', '90.2005'],
    [null, 'Baroid', 'বাড়ইদ', 'Dhamrai', 'ধামরাই', 'Baroid', 1700, 375, 1, 2, '23.9350', '90.2150'],
    [null, 'Shafipur Old', 'শাফিপুর পুরাতন', 'Kaliakair', 'কালিয়াকৈর', 'Shafipur', 2800, 610, 2, 3, '24.0101', '90.2550'],
  ];

  const workingAreas: WorkingAreaRow[] = villageSeed.map(([branchIdx, village, villageBn, upazila, upazilaBn, unionName, pop, hh, competitors, score, lat, lng], i) => ({
    id: `00000000-0000-4000-8000-0000000001${String(i + 10).padStart(2, '0')}`,
    org_id: orgId,
    division: 'Dhaka',
    district: 'Dhaka',
    upazila,
    union: unionName,
    village,
    division_bn: 'ঢাকা',
    district_bn: 'ঢাকা',
    upazila_bn: upazilaBn,
    union_bn: null,
    village_bn: villageBn,
    population: pop,
    households: hh,
    market_days: score >= 4 ? 'sat, wed' : 'sun',
    competitor_mfis: competitors,
    potential_score: score,
    gps_lat: lat,
    gps_lng: lng,
    branch_id: branchIdx == null ? null : branches[branchIdx]!.id,
    surveyed_at: '2026-08-15T04:00:00.000Z',
  }));

  const openings: BranchOpeningRow[] = [
    {
      id: '00000000-0000-4000-8000-0000000000e1',
      org_id: orgId,
      branch_id: branches[2]!.id,
      stage: 'proposed',
      proposal_note:
        '১৮টি গ্রাম নিয়ে গঠিত এলাকা; প্রাথমিক জরিপে সম্ভাব্য ১,২০০ সদস্য। দুটি প্রতিযোগী এনজিও সক্রিয় কিন্তু কভারেজ দুর্বল।',
      proposed_at: '2026-09-01T06:00:00.000Z',
      director_note: null,
      checklist: [
        { item: 'office_rent', done: false },
        { item: 'staff_recruited', done: false },
        { item: 'cash_limit_set', done: false },
      ],
      activated_at: null,
      rejected_note: null,
    },
  ];

  const assignments: StaffAssignmentRow[] = [
    {
      id: '00000000-0000-4000-8000-0000000000f1',
      org_id: orgId,
      user_id: '00000000-0000-4000-8000-000000000004',
      branch_id: branches[0]!.id,
      role_at_branch: 'branch_manager',
      effective_from: '2023-01-10',
      effective_to: '2025-06-30',
      note: 'Initial posting',
    },
    {
      id: '00000000-0000-4000-8000-0000000000f2',
      org_id: orgId,
      user_id: '00000000-0000-4000-8000-000000000005',
      branch_id: branches[0]!.id,
      role_at_branch: 'branch_manager',
      effective_from: '2025-07-01',
      effective_to: null,
      note: 'Transfer-in from Uttara',
    },
    {
      id: '00000000-0000-4000-8000-0000000000f3',
      org_id: orgId,
      user_id: '00000000-0000-4000-8000-000000000004',
      branch_id: branches[1]!.id,
      role_at_branch: 'branch_manager',
      effective_from: '2025-07-01',
      effective_to: null,
      note: 'Transfer-out from Dhanmondi',
    },
  ];

  const branchStats: OrgDemoData['branchStats'] = {
    [branches[0]!.id]: { members: 412, centers: 18, outstandingLoans: '1250000.00' },
    [branches[1]!.id]: { members: 356, centers: 15, outstandingLoans: '987500.00' },
    [branches[2]!.id]: { members: 0, centers: 0, outstandingLoans: '0.00' },
  };

  return { orgId, zones, areas, branches, workingAreas, openings, assignments, branchStats };
}

let store: OrgDemoData | null = null;

/** Singleton demo dataset (fresh per process). */
export function orgDemoStore(): OrgDemoData {
  store ??= build();
  return store;
}
