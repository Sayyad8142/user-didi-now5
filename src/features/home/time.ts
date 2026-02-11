export function isOpenNow(serviceType?: string): boolean {
  const now = new Date();
  const hours = now.getHours();
  const endHour = serviceType === 'cook' ? 21 : 19; // Cook: 9 PM, Others: 7 PM
  return hours >= 6 && hours < endHour;
}

export function getOpenStatusText(serviceType?: string): string {
  if (isOpenNow(serviceType)) {
    return "Open now";
  }
  
  const now = new Date();
  const hours = now.getHours();
  
  if (hours < 6) {
    return "Opens 6:00 AM";
  } else {
    return "Opens 6:00 AM tomorrow";
  }
}

export function getServiceHoursText(serviceType?: string): string {
  return serviceType === 'cook' ? '6AM - 9PM Daily' : '6AM - 7PM Daily';
}

export function firstName(fullName?: string): string {
  if (!fullName) return "";
  return fullName.split(" ")[0];
}