import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const STAGES = [
  { key: 'field_survey', title: 'Field survey', titleBn: 'মাঠ জরিপ', short: 'Survey' },
  { key: 'eligibility_screening', title: 'Eligibility screening', titleBn: 'যোগ্যতা যাচাই', short: 'Eligibility' },
  { key: 'household_verification', title: 'Household verification', titleBn: 'পরিবার যাচাই', short: 'Verification' },
  { key: 'manager_approval', title: 'Branch Manager approval', titleBn: 'শাখা ব্যবস্থাপক অনুমোদন', short: 'Approval' },
  { key: 'orientation_completed', title: 'Orientation / training completed', titleBn: 'ওরিয়েন্টেশন/প্রশিক্ষণ সম্পন্ন', short: 'Training' },
  { key: 'member_issued', title: 'Member number issued', titleBn: 'সদস্য নম্বর দেওয়া হয়েছে', short: 'Member no.' },
  { key: 'passbook_generated', title: 'Passbook generated', titleBn: 'পাসবুক প্রস্তুত', short: 'Passbook' },
] as const;

type StageKey = (typeof STAGES)[number]['key'];

const initialForm = {
  fullName: '',
  fullNameBn: '',
  fatherOrHusbandName: '',
  motherName: '',
  idNumber: '',
  dob: '',
  mobile: '',
  occupation: '',
  monthlyHouseholdIncome: '',
  landOwnedDecimals: '',
  familyMembers: '',
  address: '',
  photoPath: '',
  signaturePath: '',
  nomineeName: '',
  nomineeRelation: 'husband',
  nomineeSharePct: '100',
};

function stepIsComplete(stepIndex: number, form: typeof initialForm) {
  switch (stepIndex) {
    case 0:
      return !!(form.fullName && form.fullNameBn && form.fatherOrHusbandName && form.motherName && form.dob && form.mobile);
    case 1:
      return !!(form.idNumber && form.occupation && form.monthlyHouseholdIncome && form.landOwnedDecimals && form.familyMembers);
    case 2:
      return !!(form.address && form.photoPath && form.signaturePath);
    case 3:
      return true;
    case 4:
      return true;
    case 5:
      return true;
    case 6:
      return true;
    default:
      return false;
  }
}

export function MemberAdmissionPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [submitted, setSubmitted] = useState(false);

  const progress = useMemo(() => ((currentStep + 1) / STAGES.length) * 100, [currentStep]);

  const updateField = (field: keyof typeof initialForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const currentStage = STAGES[currentStep]!;
  const canContinue = stepIsComplete(currentStep, form);

  const handleNext = () => {
    if (currentStep < STAGES.length - 1) {
      setCurrentStep((prev) => prev + 1);
      return;
    }
    setSubmitted(true);
  };

  const handlePrevious = () => {
    if (currentStep > 0) setCurrentStep((prev) => prev - 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-teal-700">Member admission</p>
          <h1 className="text-2xl font-bold">সদস্য ভর্তি</h1>
        </div>
        <div className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
          Step {currentStep + 1} of {STAGES.length}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">{currentStage.title}</CardTitle>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 md:grid-cols-7">
            {STAGES.map((stage, index) => {
              const active = currentStep === index;
              const complete = index < currentStep || submitted;
              return (
                <div
                  key={stage.key}
                  className={[
                    'rounded-md border p-2 text-center text-xs transition-all',
                    active ? 'border-teal-500 bg-teal-50 text-teal-700' : complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-muted bg-card text-muted-foreground',
                  ].join(' ')}
                >
                  <div className="mb-1 flex justify-center">
                    {complete ? <CheckCircle2 className="h-4 w-4" /> : <UserRoundCheck className="h-4 w-4" />}
                  </div>
                  <div className="font-medium">{stage.short}</div>
                </div>
              );
            })}
          </div>

          {!submitted ? (
            <form className="space-y-6" onSubmit={(event) => event.preventDefault()}>
              {currentStep === 0 && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Name (English) / নাম (ইংরেজি)</Label>
                    <Input id="fullName" value={form.fullName} onChange={(e) => updateField('fullName', e.target.value)} placeholder="Rahima Begum" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fullNameBn">Name (Bangla) / নাম (বাংলা)</Label>
                    <Input id="fullNameBn" value={form.fullNameBn} onChange={(e) => updateField('fullNameBn', e.target.value)} placeholder="রহিমা বেগম" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fatherOrHusbandName">Father / husband name / পিতার/স্বামীর নাম</Label>
                    <Input id="fatherOrHusbandName" value={form.fatherOrHusbandName} onChange={(e) => updateField('fatherOrHusbandName', e.target.value)} placeholder="Abdul Karim" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="motherName">Mother name / মাতার নাম</Label>
                    <Input id="motherName" value={form.motherName} onChange={(e) => updateField('motherName', e.target.value)} placeholder="Jahanara Begum" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dob">Date of birth / জন্ম তারিখ</Label>
                    <Input id="dob" type="date" value={form.dob} onChange={(e) => updateField('dob', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mobile">Mobile / মোবাইল</Label>
                    <Input id="mobile" value={form.mobile} onChange={(e) => updateField('mobile', e.target.value)} placeholder="01712345678" />
                  </div>
                </div>
              )}

              {currentStep === 1 && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="idNumber">NID or birth registration / এনআইডি বা জন্ম নিবন্ধন</Label>
                    <Input id="idNumber" value={form.idNumber} onChange={(e) => updateField('idNumber', e.target.value)} placeholder="1990123456789" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="occupation">Occupation / পেশা</Label>
                    <Input id="occupation" value={form.occupation} onChange={(e) => updateField('occupation', e.target.value)} placeholder="Poultry farmer" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="monthlyHouseholdIncome">Household income (BDT) / পরিবারের মাসিক আয় (টাকা)</Label>
                    <Input id="monthlyHouseholdIncome" value={form.monthlyHouseholdIncome} onChange={(e) => updateField('monthlyHouseholdIncome', e.target.value)} placeholder="12000" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="landOwnedDecimals">Land owned (decimal) / জমির পরিমাণ (ডেসিমাল)</Label>
                    <Input id="landOwnedDecimals" value={form.landOwnedDecimals} onChange={(e) => updateField('landOwnedDecimals', e.target.value)} placeholder="15" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="familyMembers">Family members / পরিবারের সদস্য সংখ্যা</Label>
                    <Input id="familyMembers" value={form.familyMembers} onChange={(e) => updateField('familyMembers', e.target.value)} placeholder="5" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="nomineeName">Nominee / নমিনি</Label>
                    <Input id="nomineeName" value={form.nomineeName} onChange={(e) => updateField('nomineeName', e.target.value)} placeholder="Abdul Karim" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nomineeRelation">Relation / সম্পর্ক</Label>
                    <select
                      id="nomineeRelation"
                      className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
                      value={form.nomineeRelation}
                      onChange={(e) => updateField('nomineeRelation', e.target.value)}
                    >
                      <option value="husband">Husband / স্বামী</option>
                      <option value="father">Father / বাবা</option>
                      <option value="mother">Mother / মা</option>
                      <option value="son">Son / ছেলে</option>
                      <option value="daughter">Daughter / মেয়ে</option>
                      <option value="brother">Brother / ভাই</option>
                      <option value="sister">Sister / বোন</option>
                      <option value="other">Other / অন্যান্য</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nomineeSharePct">Share percentage / অংশের হার</Label>
                    <Input id="nomineeSharePct" value={form.nomineeSharePct} onChange={(e) => updateField('nomineeSharePct', e.target.value)} placeholder="100" />
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="address">Address / ঠিকানা</Label>
                    <Input id="address" value={form.address} onChange={(e) => updateField('address', e.target.value)} placeholder="Village: Baliati, Dhamrai, Dhaka" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="photoPath">Photo / ছবি</Label>
                    <Input id="photoPath" value={form.photoPath} onChange={(e) => updateField('photoPath', e.target.value)} placeholder="uploads/member/photo-001.jpg" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signaturePath">Signature / thumbprint / স্বাক্ষর / থাম্বপ্রিন্ট</Label>
                    <Input id="signaturePath" value={form.signaturePath} onChange={(e) => updateField('signaturePath', e.target.value)} placeholder="uploads/member/signature-001.png" />
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-4 rounded-lg border bg-muted/40 p-4">
                  <div className="flex items-center gap-2 text-lg font-semibold text-teal-700">
                    <ShieldCheck className="h-5 w-5" /> Branch Manager approval checklist
                  </div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Eligibility criteria reviewed and mark as eligible.</li>
                    <li>• Household verification confirms the applicant is a resident of the service area.</li>
                    <li>• Nominee information and share allocation are checked for clarity.</li>
                  </ul>
                </div>
              )}

              {currentStep === 5 && (
                <div className="space-y-4 rounded-lg border border-teal-200 bg-teal-50 p-4">
                  <p className="text-sm font-medium text-teal-800">Member ID assignment</p>
                  <div className="flex gap-3">
                    <Input value={form.fullName ? `${form.fullName.slice(0, 3).toUpperCase()}-2026-001` : 'SM-2026-001'} readOnly />
                  </div>
                </div>
              )}

              {currentStep === 6 && (
                <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-medium text-emerald-800">Passbook generated and ready for handover</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-md bg-white p-3 shadow-sm">
                      <p className="text-xs uppercase text-muted-foreground">Member number</p>
                      <p className="mt-1 text-lg font-bold text-emerald-700">{form.fullName ? `${form.fullName.slice(0, 3).toUpperCase()}-2026-001` : 'SM-2026-001'}</p>
                    </div>
                    <div className="rounded-md bg-white p-3 shadow-sm">
                      <p className="text-xs uppercase text-muted-foreground">Passbook no.</p>
                      <p className="mt-1 text-lg font-bold text-emerald-700">PB-2026-001</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between gap-3 border-t pt-4">
                <Button type="button" variant="outline" onClick={handlePrevious} disabled={currentStep === 0}>
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                <Button type="button" onClick={handleNext} disabled={currentStep < STAGES.length - 1 && !canContinue}>
                  {currentStep === STAGES.length - 1 ? 'Finish' : 'Next'}
                  {currentStep < STAGES.length - 1 && <ChevronRight className="h-4 w-4" />}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold text-emerald-800">Member onboarding completed</h2>
              <p className="text-sm text-emerald-700">
                The applicant has moved through the full admission workflow and the passbook is ready for issue.
              </p>
              <Button type="button" onClick={() => setSubmitted(false)} variant="outline">
                Review again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
