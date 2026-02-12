export function isOpenNow(serviceType?: string): boolean {
  const now = new Date();
  const hours = now.getHours();
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