import { Link } from 'react-router-dom';
import { Compass, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/lib/permissions';

/** 404: unknown route — offers the pages the user can actually reach. */
export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <Compass className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold">পৃষ্ঠা পাওয়া যায়নি / Page not found</h1>
        <p className="text-sm text-muted-foreground">আপনি যে ঠিকানাটি খুঁজছেন সেটি এই অ্যাপে নেই বা সরিয়ে ফেলা হয়েছে।</p>
        <Button asChild>
          <Link to="/">ড্যাশবোর্ডে ফিরুন</Link>
        </Button>
      </div>
    </div>
  );
}

/** 403: signed in but the role lacks the permission for this page. */
export function ForbiddenPage() {
  const permissions = usePermissions();
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-700">
          <ShieldX className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold">অনুমতি নেই / Access denied</h1>
        <p className="text-sm text-muted-foreground">
          এই পৃষ্ঠাটি দেখার অনুমতি আপনার পদবিতে নেই। প্রয়োজন হলে শাখা ব্যবস্থাপক বা প্রশাসকের সাথে যোগাযোগ করুন।
        </p>
        {permissions.length === 0 && (
          <p className="text-xs text-muted-foreground">আপনার অ্যাকাউন্টে কোনো মডিউল অনুমতি নেই — প্রশাসকের সাথে যোগাযোগ করুন।</p>
        )}
        <Button asChild>
          <Link to="/">ড্যাশবোর্ডে ফিরুন</Link>
        </Button>
      </div>
    </div>
  );
}
