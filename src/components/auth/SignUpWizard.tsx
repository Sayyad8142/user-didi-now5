import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PhoneInputIN } from './PhoneInputIN';
import { CleaningLoader } from '@/components/ui/cleaning-loader';
import { ArrowLeft, Building2, Check, ChevronRight, Home, MapPin, Search, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { validateName } from '@/lib/name-validation';
import { isValidINPhone } from '@/lib/auth-helpers';
import { useCommunities } from '@/hooks/useCommunities';
import { useBuildings } from '@/hooks/useBuildings';
import { useFlats } from '@/hooks/useFlats';

export interface SignUpData {
  fullName: string;
  phone: string;
  communityId: string;
  communityValue: string;
  buildingId: string;
  flatId: string;
  flatNo: string;
}

interface Props {
  data: SignUpData;
  setData: React.Dispatch<React.SetStateAction<SignUpData>>;
  loading: boolean;
  onSubmit: () => void;
}

type Step = 1 | 2 | 3 | 4;

export function SignUpWizard({ data, setData, loading, onSubmit }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { communities, loading: communitiesLoading } = useCommunities();
  const selectedCommunity = communities.find(c => c.id === data.communityId);
  const isPHF = selectedCommunity?.flat_format === 'phf_code';

  const { buildings, loading: buildingsLoading } = useBuildings(data.communityId || null);
  const { flats, loading: flatsLoading } = useFlats(
    data.buildingId || null,
    data.communityId || null,
    isPHF
  );

  // Skip tower step entirely for PHF format
  const totalSteps = isPHF ? 3 : 4;
  const displayStep = isPHF && step >= 3 ? step - 1 : step;

  // ----- Bottom sheets -----
  const [communitySheet, setCommunitySheet] = useState(false);
  const [buildingSheet, setBuildingSheet] = useState(false);
  const [communityQuery, setCommunityQuery] = useState('');
  const [buildingQuery, setBuildingQuery] = useState('');
  const [flatQuery, setFlatQuery] = useState(data.flatNo || '');

  const filteredCommunities = useMemo(
    () => communities.filter(c => c.name.toLowerCase().includes(communityQuery.toLowerCase())),
    [communities, communityQuery]
  );
  const filteredBuildings = useMemo(
    () => buildings.filter(b => b.name.toLowerCase().includes(buildingQuery.toLowerCase())),
    [buildings, buildingQuery]
  );
  const filteredFlats = useMemo(
    () =>
      flatQuery
        ? flats.filter(f => f.flat_no.toLowerCase().includes(flatQuery.toLowerCase())).slice(0, 50)
        : flats.slice(0, 12),
    [flats, flatQuery]
  );

  // ----- Validation per step -----
  const validateStep = (s: Step): boolean => {
    const e: Record<string, string> = {};
    if (s === 1) {
      const nameErr = validateName(data.fullName);
      if (nameErr) e.fullName = nameErr;
      if (!data.phone) e.phone = 'Mobile number is required';
      else if (!isValidINPhone(data.phone)) e.phone = 'Please enter a valid 10-digit mobile number';
    }
    if (s === 2) {
      if (!data.communityId) e.communityId = 'Please select your community';
    }
    if (s === 3 && !isPHF) {
      if (!data.buildingId) e.buildingId = 'Please select your building';
    }
    if (s === 4 || (s === 3 && isPHF)) {
      if (!data.flatId) e.flatId = 'Please select a valid flat from the list';
      else if (!flats.some(f => f.id === data.flatId))
        e.flatId = 'Please select a valid flat from the list';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    if (step === 2 && isPHF) {
      // Skip tower step
      setStep(4);
      return;
    }
    if (step >= totalSteps + (isPHF ? 1 : 0) - 1 && step !== 4) {
      setStep((step + 1) as Step);
    } else if (step < 4) {
      setStep((step + 1) as Step);
    }
  };

  const goBack = () => {
    if (step === 4 && isPHF) {
      setStep(2);
      return;
    }
    if (step > 1) setStep((step - 1) as Step);
  };

  const isFinalStep = step === 4 || (step === 3 && isPHF);

  const handleAction = () => {
    if (!validateStep(step)) return;
    if (isFinalStep) {
      onSubmit();
    } else {
      goNext();
    }
  };

  const stepTitle =
    step === 1 ? "Let's get started"
    : step === 2 ? 'Choose your community'
    : step === 3 && !isPHF ? 'Select your tower'
    : 'Pick your flat';

  const stepSubtitle =
    step === 1 ? 'Tell us a bit about you'
    : step === 2 ? 'We serve gated communities only'
    : step === 3 && !isPHF ? 'Which building do you live in?'
    : 'Type or pick from the list';

  return (
    <div className="space-y-6">
      {/* Progress + Back */}
      <div className="flex items-center gap-3">
        {step > 1 ? (
          <button
            onClick={goBack}
            className="h-9 w-9 rounded-full bg-pink-50 text-pink-600 flex items-center justify-center active:scale-95 transition"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <div className="h-9 w-9" />
        )}
        <div className="flex-1">
          <div className="flex gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-all duration-300',
                  i < displayStep ? 'bg-gradient-to-r from-pink-500 to-rose-500' : 'bg-pink-100'
                )}
              />
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5 font-medium">
            Step {displayStep} of {totalSteps}
          </p>
        </div>
      </div>

      {/* Step header */}
      <div>
        <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">{stepTitle}</h2>
        <p className="text-sm text-muted-foreground mt-1">{stepSubtitle}</p>
      </div>

      {/* Step content */}
      <div className="space-y-4 min-h-[180px]">
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-sm font-semibold text-gray-700">
                Full Name
              </Label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-pink-400" />
                <Input
                  id="fullName"
                  autoFocus
                  placeholder="Enter your full name"
                  value={data.fullName}
                  onChange={e => setData(p => ({ ...p, fullName: e.target.value }))}
                  disabled={loading}
                  className="h-12 pl-10 rounded-2xl border-gray-200 bg-white shadow-sm focus-visible:ring-2 focus-visible:ring-pink-200 focus-visible:border-pink-400"
                />
              </div>
              {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
            </div>

            <PhoneInputIN
              value={data.phone}
              onChange={v => setData(p => ({ ...p, phone: v }))}
              error={errors.phone}
              disabled={loading}
              required
            />
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-2 duration-300">
            <SelectorRow
              icon={<MapPin className="h-5 w-5 text-pink-500" />}
              label="Community"
              value={selectedCommunity?.name}
              placeholder={communitiesLoading ? 'Loading…' : 'Search your community'}
              onClick={() => setCommunitySheet(true)}
              disabled={loading || communitiesLoading}
            />
            {errors.communityId && <p className="text-xs text-destructive mt-2">{errors.communityId}</p>}
          </div>
        )}

        {step === 3 && !isPHF && (
          <div className="animate-in fade-in slide-in-from-right-2 duration-300 space-y-3">
            {buildingsLoading ? (
              <div className="text-sm text-muted-foreground text-center py-8">Loading towers…</div>
            ) : buildings.length <= 20 ? (
              <div className="grid grid-cols-2 gap-3">
                {buildings.map(b => {
                  const selected = data.buildingId === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() =>
                        setData(p => ({ ...p, buildingId: b.id, flatId: '', flatNo: '' }))
                      }
                      className={cn(
                        'relative p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98]',
                        selected
                          ? 'border-pink-500 bg-pink-50 shadow-md shadow-pink-500/10'
                          : 'border-gray-200 bg-white hover:border-pink-200'
                      )}
                    >
                      <Building2 className={cn('h-5 w-5 mb-2', selected ? 'text-pink-500' : 'text-gray-400')} />
                      <p className={cn('text-sm font-semibold', selected ? 'text-pink-700' : 'text-gray-800')}>
                        {b.name}
                      </p>
                      {selected && (
                        <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-pink-500 flex items-center justify-center">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <SelectorRow
                icon={<Building2 className="h-5 w-5 text-pink-500" />}
                label="Tower / Building"
                value={buildings.find(b => b.id === data.buildingId)?.name}
                placeholder="Search your tower"
                onClick={() => setBuildingSheet(true)}
                disabled={loading}
              />
            )}
            {errors.buildingId && <p className="text-xs text-destructive">{errors.buildingId}</p>}
          </div>
        )}

        {(step === 4 || (step === 3 && isPHF)) && (
          <div className="animate-in fade-in slide-in-from-right-2 duration-300 space-y-3">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Flat Number</Label>
              <div className="relative">
                <Home className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-pink-400" />
                <Input
                  autoFocus
                  inputMode="text"
                  placeholder={flatsLoading ? 'Loading flats…' : 'Type your flat number'}
                  value={flatQuery}
                  onChange={e => {
                    const v = e.target.value;
                    setFlatQuery(v);
                    const exact = flats.find(f => f.flat_no.toLowerCase() === v.toLowerCase());
                    if (exact) setData(p => ({ ...p, flatId: exact.id, flatNo: exact.flat_no }));
                    else setData(p => ({ ...p, flatId: '', flatNo: '' }));
                  }}
                  disabled={loading || flatsLoading}
                  className="h-12 pl-10 rounded-2xl border-gray-200 bg-white shadow-sm focus-visible:ring-2 focus-visible:ring-pink-200 focus-visible:border-pink-400"
                />
              </div>
            </div>

            {/* Suggestions */}
            {!flatsLoading && flats.length > 0 && (
              <div className="rounded-2xl border border-gray-100 bg-white p-2 max-h-[220px] overflow-y-auto">
                {filteredFlats.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No flats matching "{flatQuery}"
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {filteredFlats.map(f => {
                      const selected = data.flatId === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setData(p => ({ ...p, flatId: f.id, flatNo: f.flat_no }));
                            setFlatQuery(f.flat_no);
                          }}
                          className={cn(
                            'h-10 rounded-xl text-sm font-semibold transition-all active:scale-95',
                            selected
                              ? 'bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-md'
                              : 'bg-pink-50 text-pink-700 hover:bg-pink-100'
                          )}
                        >
                          {f.flat_no}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {errors.flatId && <p className="text-xs text-destructive">{errors.flatId}</p>}
          </div>
        )}
      </div>

      {/* Primary CTA */}
      <Button
        onClick={handleAction}
        disabled={loading}
        className="w-full h-14 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 text-white font-semibold text-base shadow-xl shadow-pink-500/30 transition-all duration-300 hover:shadow-2xl hover:shadow-pink-500/40 active:scale-[0.98] disabled:opacity-50"
      >
        {loading && <CleaningLoader size="sm" className="mr-2" />}
        {isFinalStep ? 'Send OTP' : 'Continue'}
      </Button>

      {/* Community sheet */}
      <Sheet open={communitySheet} onOpenChange={setCommunitySheet}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl p-0 max-h-[85vh] flex flex-col border-0"
        >
          <SheetHeader className="p-5 pb-3 text-left">
            <SheetTitle className="text-xl font-bold">Select Community</SheetTitle>
          </SheetHeader>
          <div className="px-5 pb-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                autoFocus
                value={communityQuery}
                onChange={e => setCommunityQuery(e.target.value)}
                placeholder="Search your community"
                className="h-12 pl-10 rounded-2xl bg-gray-50 border-gray-100"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-6">
            {filteredCommunities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No communities found</p>
            ) : (
              filteredCommunities.map(c => {
                const selected = c.id === data.communityId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setData(p => ({
                        ...p,
                        communityId: c.id,
                        communityValue: c.value || '',
                        buildingId: '',
                        flatId: '',
                        flatNo: ''
                      }));
                      setCommunitySheet(false);
                      setCommunityQuery('');
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-colors',
                      selected ? 'bg-pink-50' : 'hover:bg-gray-50'
                    )}
                  >
                    <div
                      className={cn(
                        'h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
                        selected ? 'bg-pink-500 text-white' : 'bg-pink-100 text-pink-500'
                      )}
                    >
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-semibold truncate', selected ? 'text-pink-700' : 'text-gray-900')}>
                        {c.name}
                      </p>
                    </div>
                    {selected && <Check className="h-5 w-5 text-pink-500 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Building sheet (only used when >20 buildings) */}
      <Sheet open={buildingSheet} onOpenChange={setBuildingSheet}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl p-0 max-h-[85vh] flex flex-col border-0"
        >
          <SheetHeader className="p-5 pb-3 text-left">
            <SheetTitle className="text-xl font-bold">Select Tower</SheetTitle>
          </SheetHeader>
          <div className="px-5 pb-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                autoFocus
                value={buildingQuery}
                onChange={e => setBuildingQuery(e.target.value)}
                placeholder="Search your tower"
                className="h-12 pl-10 rounded-2xl bg-gray-50 border-gray-100"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-6">
            {filteredBuildings.map(b => {
              const selected = b.id === data.buildingId;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setData(p => ({ ...p, buildingId: b.id, flatId: '', flatNo: '' }));
                    setBuildingSheet(false);
                    setBuildingQuery('');
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-colors',
                    selected ? 'bg-pink-50' : 'hover:bg-gray-50'
                  )}
                >
                  <div
                    className={cn(
                      'h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
                      selected ? 'bg-pink-500 text-white' : 'bg-pink-100 text-pink-500'
                    )}
                  >
                    <Building2 className="h-5 w-5" />
                  </div>
                  <p className={cn('text-sm font-semibold flex-1', selected ? 'text-pink-700' : 'text-gray-900')}>
                    {b.name}
                  </p>
                  {selected && <Check className="h-5 w-5 text-pink-500" />}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SelectorRow({
  icon,
  label,
  value,
  placeholder,
  onClick,
  disabled
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  placeholder: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all active:scale-[0.99]',
        value
          ? 'border-pink-300 bg-pink-50/50'
          : 'border-gray-200 bg-white hover:border-pink-200',
        disabled && 'opacity-60'
      )}
    >
      <div className="h-10 w-10 rounded-xl bg-pink-100 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[11px] font-semibold text-pink-600 uppercase tracking-wide">{label}</p>
        <p
          className={cn(
            'text-sm font-semibold truncate mt-0.5',
            value ? 'text-gray-900' : 'text-gray-400'
          )}
        >
          {value || placeholder}
        </p>
      </div>
      <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />
    </button>
  );
}
