import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, MapPin, Smartphone, Users } from 'lucide-react';

interface MeetingSummary {
  id: string;
  name: string;
  date: string;
  time: string;
  place: string;
  present: number;
  total: number;
}

export function SamityMobilePage() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [meetings, setMeetings] = useState<MeetingSummary[]>([
    { id: 'm1', name: 'Rupali Samity', date: '2026-09-20', time: '17:30', place: 'School premise', present: 18, total: 22 },
    { id: 'm2', name: 'Shongshod Samity', date: '2026-09-24', time: '17:00', place: 'Community center', present: 12, total: 18 },
  ]);
  const [draftNote, setDraftNote] = useState('');

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const cached = localStorage.getItem('samity-mobile-draft');
    if (cached) setDraftNote(cached);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('samity-mobile-draft', draftNote);
  }, [draftNote]);

  const nextMeeting = useMemo(() => meetings[0] ?? null, [meetings]);

  return (
    <div className="mx-auto max-w-md space-y-4 pb-8">
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Field officer</p>
            <h1 className="text-xl font-semibold">Meeting board</h1>
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs ${offline ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
            <Smartphone className="h-3.5 w-3.5" />
            {offline ? 'Offline mode' : 'Online sync'}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-gradient-to-br from-teal-50 to-white p-4 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Next meeting</p>
        <h2 className="mt-2 text-lg font-semibold">{nextMeeting?.name}</h2>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /> {nextMeeting?.date} · {nextMeeting?.time}</div>
          <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {nextMeeting?.place}</div>
          <div className="flex items-center gap-2"><Users className="h-4 w-4" /> {nextMeeting?.present}/{nextMeeting?.total} present</div>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium">Attendance</h3>
          <button className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-medium text-white">Check in</button>
        </div>
        <div className="space-y-2">
          {meetings.map((meeting) => (
            <div key={meeting.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{meeting.name}</p>
                  <p className="text-xs text-muted-foreground">{meeting.date}</p>
                </div>
                <button className="rounded-full border px-2 py-1 text-xs">Toggle</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="font-medium">Meeting notes</h3>
        <textarea
          value={draftNote}
          onChange={(event) => setDraftNote(event.target.value)}
          className="mt-3 min-h-24 w-full rounded-md border p-2 text-sm"
          placeholder="Savings collection, late members, decisions..."
        />
      </div>
    </div>
  );
}
