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

export const isPastToday = (hhmm: string, selectedDate: Date, minBuffer = 30): boolean => {
  const today = new Date();
  const selectedDateStart = new Date(selectedDate);
  selectedDateStart.setHours(0, 0, 0, 0);
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  
  // If selected date is not today, it's not past
  if (selectedDateStart.getTime() !== todayStart.getTime()) {
    return false;
  }
  
  const [hours, minutes] = hhmm.split(':').map(Number);
  const slotTime = new Date();
  slotTime.setHours(hours, minutes, 0, 0);
  
  const nowPlusBuffer = addMinutes(today, minBuffer);
  
  return isAfter(nowPlusBuffer, slotTime);
};

export const getDateChips = (): Array<{ date: Date; label: string; dayLabel: string; isToday: boolean }> => {
  const chips = [];
  const today = new Date();
  
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i);
    const label = i === 0 ? 'TODAY' : format(date, 'EEE').toUpperCase();
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

export const getExtraCharge = (timeSlot: string): number => {
  const [hours] = timeSlot.split(':').map(Number);
  // Extra ₹20 for slots after 4:00 PM (16:00)
  return hours >= 16 ? 20 : 0;
};

export const TIME_SEGMENTS = {
  Morning: { start: '06:00', end: '11:45' },
  Afternoon: { start: '12:00', end: '16:45' },
  Evening: { start: '17:00', end: '19:00' }
} as const;

export const TIME_SEGMENTS_COOK = {
  Morning: { start: '06:00', end: '11:45' },
  Afternoon: { start: '12:00', end: '16:45' },
  Evening: { start: '17:00', end: '21:00' }
} as const;

export type TimeSegment = keyof typeof TIME_SEGMENTS;