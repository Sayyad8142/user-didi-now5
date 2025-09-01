const KEY = 'guestSession';

export type GuestSession = { isGuest: true; createdAt: string };

export const setGuest = () =>
  localStorage.setItem(
    KEY,
    JSON.stringify({ isGuest: true, createdAt: new Date().toISOString() } satisfies GuestSession)
  );

export const clearGuest = () => localStorage.removeItem(KEY);

export const isGuest = (): boolean => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null')?.isGuest === true;
  } catch {
    return false;
  }
};
