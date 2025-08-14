export function isOpenNow(): boolean {
  const now = new Date();
  const hours = now.getHours();
  return hours >= 6 && hours < 19; // 6 AM to 7 PM
}

export function getOpenStatusText(): string {
  if (isOpenNow()) {
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

export function firstName(fullName?: string): string {
  if (!fullName) return "";
  return fullName.split(" ")[0];
}