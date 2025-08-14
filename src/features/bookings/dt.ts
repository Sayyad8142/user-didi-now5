import { format } from 'date-fns';

export const formatDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'dd MMM');
};

export const formatTime = (time: string): string => {
  const [hours, minutes] = time.split(':');
  const hour24 = parseInt(hours);
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  return `${hour12}:${minutes} ${period}`;
};

export const formatDateTime = (date: string, time?: string): string => {
  if (time) {
    return `${formatDate(date)} at ${formatTime(time)}`;
  }
  return formatDate(date);
};