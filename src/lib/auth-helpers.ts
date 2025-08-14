/**
 * Didi Now Auth Helper Utilities
 */

/**
 * Format a 10-digit Indian phone number to include +91 prefix
 */
export function formatPhoneIN(phone: string): string {
  // Strip all non-digits
  const digits = phone.replace(/\D/g, '');
  
  // If it starts with 91, remove the prefix to get clean 10 digits
  const cleanDigits = digits.startsWith('91') ? digits.slice(2) : digits;
  
  return `+91${cleanDigits}`;
}

/**
 * Validate if a phone number is a valid 10-digit Indian mobile number
 */
export function isValidINPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 && /^[6-9]/.test(digits); // Indian mobile starts with 6-9
}

/**
 * Extract clean 10-digit number from formatted phone
 */
export function extractCleanPhone(formattedPhone: string): string {
  return formattedPhone.replace(/\D/g, '').slice(-10);
}

/**
 * Mask phone number for display (show last 3 digits)
 */
export function maskPhone(phone: string): string {
  const clean = extractCleanPhone(phone);
  if (clean.length !== 10) return phone;
  return `XXXXXX${clean.slice(-4)}`;
}

/**
 * Community options for the dropdown
 */
export const COMMUNITY_OPTIONS = [
  { value: 'prestige-high-fields', label: 'Prestige High Fields' },
  { value: 'vihanga', label: 'Vihanga' },
  { value: 'krish', label: 'Krish' },
  { value: 'other', label: 'Other' },
] as const;

export type CommunityValue = typeof COMMUNITY_OPTIONS[number]['value'];