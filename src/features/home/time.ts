export function getISTDate(): Date {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + istOffset);
}

export function isOpenNow(serviceType?: string): boolean {
  const istNow = getISTDate();
  const hours = istNow.getHours();
  // 7 AM to 7 PM IST
  return hours >= 7 && hours < 19;
}

export function getOpenStatusText(serviceType?: string): string {
  if (isOpenNow(serviceType)) {
    return "Open now";
  }
  
  const now = new Date();
  const hours = now.getHours();
  
  if (hours < 7) {
    return "Opens 7:00 AM";
  } else {
    return "Opens 7:00 AM tomorrow";
  }
}

export function getServiceHoursText(serviceType?: string): string {
  return '7AM - 7PM Daily';
}

export function firstName(fullName?: string): string {
  if (!fullName) return "";
  return fullName.split(" ")[0];
}