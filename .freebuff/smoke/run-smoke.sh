#!/usr/bin/env bash
# Programs reqs 5-9 live smoke test (UTF-8 payloads via vite proxy).
set -e
B="http://127.0.0.1:5174/api/v1/programs"
T="Authorization: Bearer demo-token"
CT="Content-Type: application/json"
S=".freebuff/smoke"

echo "== 1) seed project =="
curl -s -X POST "$B/projects" -H "$T" -H "$CT" --data-binary @"$S/project.json" -o "$S/_p.json" -w "projects:%{http_code}\n"
ID=$(node -e "console.log(require('./$S/_p.json').id)")
echo "project $ID"
sed "s/__ID__/$ID/g" "$S/expense.json" > "$S/_e.json"

echo "== 2) activate + expense 90% of tube-well line =="
curl -s -X POST "$B/projects/$ID/decision" -H "$T" -H "$CT" -d '{"action":"activate"}' -o /dev/null -w "activate:%{http_code}\n"
curl -s -X POST "$B/expenses" -H "$T" -H "$CT" --data-binary @"$S/_e.json" -o /dev/null -w "expense:%{http_code}\n"

echo "== 3) budget status (expect tube-well 90% warning) =="
curl -s "$B/projects/$ID/budget-status" -H "$T" -o "$S/_bs.json" -w "budget-status:%{http_code}\n"
node -e "
const d=require('./$S/_bs.json');
for (const l of d.monitor.lines) console.log('  line='+l.lineItem.slice(0,14)+' spent='+l.spent+' pct='+l.utilizationPct+' alert='+l.alert);
console.log('  burn: '+d.burn.burnPct+'% vs elapsed '+d.burn.expectedPct+'% -> '+d.burn.status);
"

echo "== 4) alerts + donor rollup =="
curl -s "$B/budget/alerts" -H "$T" -o "$S/_al.json" -w "alerts:%{http_code}\n"
node -e "const d=require('./$S/_al.json');console.log('  alert rows:',d.items.map(a=>[a.lineItem.slice(0,10),a.utilizationPct,a.alert]))"
curl -s "$B/budget/donor-utilization" -H "$T" -o "$S/_du.json" -w "donor-util:%{http_code}\n"
node -e "const d=require('./$S/_du.json');console.log('  donors:',d.items.map(x=>[x.donor,x.utilizationPct]))"

echo "== 5) field visit =="
sed "s/__ID__/$ID/g" "$S/visit.json" > "$S/_v.json"
curl -s -X POST "$B/visits" -H "$T" -H "$CT" --data-binary @"$S/_v.json" -o "$S/_vr.json" -w "visit:%{http_code}\n"

echo "== 6) donor report (Q2) + word export =="
curl -s -X POST "$B/donor-reports" -H "$T" -H "$CT" -d "{\"projectId\":\"$ID\",\"periodStart\":\"2026-04-01\",\"periodEnd\":\"2026-06-30\"}" -o "$S/_r.json" -w "report:%{http_code}\n"
RID=$(node -e "console.log(require('./$S/_r.json').id)")
curl -s "$B/donor-reports/$RID/export" -H "$T" -o "$S/_x.html" -w "export:%{http_code}\n"
node -e "
const h=require('fs').readFileSync('$S/_x.html','utf8');
console.log('  has title:', h.includes('দাতা প্রতিবেদন / Donor Report'));
console.log('  has case data:', h.includes('CASE-') || h.includes('গোপনীয়'));
"

echo "== 7) sensitive case: admin sees, officer masked, log kept =="
curl -s -X POST "$B/cases" -H "$T" -H "$CT" --data-binary @"$S/case.json" -o "$S/_c.json" -w "case:%{http_code}\n"
CID=$(node -e "console.log(require('./$S/_c.json').id)")
curl -s "$B/cases/$CID" -H "Authorization: Bearer demo-token-officer" -o "$S/_cm.json" -w "officer-view:%{http_code}\n"
node -e "
const d=require('./$S/_cm.json');
console.log('  officer restrictedUnlocked:', d.restrictedUnlocked);
console.log('  name masked:', d.case.beneficiaryName === null);
console.log('  details masked:', d.case.restrictedDetails === null);
"
curl -s "$B/cases/$CID/access-log" -H "Authorization: Bearer demo-token-officer" -o /dev/null -w "officer-log(expect 403):%{http_code}\n"
curl -s "$B/cases/$CID/access-log" -H "$T" -o "$S/_lg.json" -w "admin-log:%{http_code}\n"
node -e "const d=require('./$S/_lg.json');console.log('  log actions:',d.items.map(x=>x.action))"

echo "== 8) funding + schedule =="
curl -s -X POST "$B/funding" -H "$T" -H "$CT" --data-binary @"$S/funding.json" -o "$S/_f.json" -w "funding:%{http_code}\n"
node -e "
const d=require('./$S/_f.json');
console.log('  code:', d.code, 'installments:', d.schedule.length);
console.log('  first interest:', d.schedule[0].interest, '> last:', d.schedule[d.schedule.length-1].interest, '->', Number(d.schedule[0].interest) > Number(d.schedule[d.schedule.length-1].interest));
console.log('  final balance:', d.schedule[d.schedule.length-1].balance, 'total payable:', d.summary.totalPayable);
"
