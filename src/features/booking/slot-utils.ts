import { format, addMinutes, parse, isAfter, addDays } from 'date-fns';

export const makeSlots = (startHHMM: string, endHHMM: string, stepMin = 15): string[] => {
  const slots: string[] = [];
  const [startHour, startMin] = startHHMM.split(':').map(Number);
  const [endHour, endMin] = endHHMM.split(':').map(Number);
  
  const startTime = new Date();
  startTime.setHours(startHour, startMin, 0, 0);
  
  const endTime = new Date();
  endTime.setHours(endHour, endMin, 0, 0);
  
  let currentTime = startTime;
  
  while (currentTime <= endTime) {
    const timeStr = format(currentTime, 'HH:mm');
    slots.push(timeStr);
    currentTime = addMinutes(currentTime, stepMin);
  }
  
  return slots;
};

export const toDisplay12h = (hhmm: string): string => {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return format(date, 'h:mm a');
};

/** Current wall-clock time in Asia/Kolkata, regardless of device timezone. */
export const getISTNow = (): { y: number; m: number; d: number; minutes: number } => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  const hour = get('hour') % 24;
  return { y: get('year'), m: get('month'), d: get('day'), minutes: hour * 60 + get('minute') };
};

/**
 * Is the slot in the past (or inside the lead-time buffer) for the selected date?
 * Always evaluated against Asia/Kolkata so a device with a wrong/foreign timezone
 * can neither hide valid slots nor enable expired ones.
 */
export const isPastToday = (hhmm: string, selectedDate: Date, minBuffer = 30): boolean => {
  const ist = getISTNow();

  // Compare calendar dates using the selected date's own local Y/M/D (chips are built locally).
  const selY = selectedDate.getFullYear();
  const selM = selectedDate.getMonth() + 1;
  const selD = selectedDate.getDate();

  const selKey = selY * 10000 + selM * 100 + selD;
  const istKey = ist.y * 10000 + ist.m * 100 + ist.d;

  if (selKey > istKey) return false;   // future date → nothing is past
  if (selKey < istKey) return true;    // past date → everything is past

  const [hours, minutes] = hhmm.split(':').map(Number);
  const slotMinutes = hours * 60 + minutes;

  return slotMinutes < ist.minutes + minBuffer;
};


export const getDateChips = (): Array<{ date: Date; label: string; dayLabel: string; isToday: boolean }> => {
  const chips = [];
  const today = new Date();
  
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i);
    const label = i === 0 ? 'TODAY' : i === 1 ? 'TOMORROW' : format(date, 'EEE').toUpperCase();
    const dayLabel = format(date, 'd');
    chips.push({
      date,
      label,
      dayLabel,
      isToday: i === 0
    });
  }
  
  return chips;
};

// Legacy constants kept for backward compat but no longer used
export const AFTER_4PM_SURCHARGE = 0;
export const OFF_PEAK_DISCOUNT = 0;

/** @deprecated Use useSlotSurge hook instead */
export const getExtraCharge = (_timeSlot: string): number => 0;

/** @deprecated No longer used — surge is dynamic from DB */
export const isAfter4pmSlot = (_timeSlot: string): boolean => false;

/** Off-peak discount: currently disabled */
export const isOffPeakSlot = (_timeSlot: string): boolean => false;

export const getOffPeakDiscount = (_timeSlot: string): number => 0;

export const TIME_SEGMENTS = {
  Morning: { start: '07:00', end: '11:45' },
  Afternoon: { start: '12:00', end: '16:45' },
  Evening: { start: '17:00', end: '18:30' }
} as const;

export const TIME_SEGMENTS_COOK = {
  Morning: { start: '07:00', end: '11:45' },
  Afternoon: { start: '12:00', end: '16:45' },
  Evening: { start: '17:00', end: '21:00' }
} as const;

export type TimeSegment = keyof typeof TIME_SEGMENTS;