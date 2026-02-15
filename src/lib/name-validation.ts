/**
 * Shared name validation utilities.
 * Prevents phone numbers from being saved as user names.
 */

const PHONE_REGEX = /^\+?\d{7,15}$/;

/** Returns an error string if the name is invalid, or null if valid. */
export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Name is required";
  if (trimmed.length < 2) return "Name must be at least 2 characters";
  if (PHONE_REGEX.test(trimmed)) return "Please enter your real name, not a phone number";
  return null;
}

/** Returns true if name looks like a phone number */
export function isPhoneNumberName(name: string): boolean {
  return PHONE_REGEX.test(name.trim());
}
