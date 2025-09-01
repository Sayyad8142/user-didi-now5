const KEY = 'guestSession';

export type GuestSession = {
  isGuest: true;
  createdAt: string;
  user: { id: 'guest'; displayName: 'Guest' };
};

export const setGuest = (): GuestSession => {
  const payload: GuestSession = {
    isGuest: true,
    createdAt: new Date().toISOString(),
    user: { id: 'guest', displayName: 'Guest' },
  };
  localStorage.setItem(KEY, JSON.stringify(payload));
  return payload;
};

export const getGuest = (): GuestSession | null => {
  try { 
    return JSON.parse(localStorage.getItem(KEY) ?? 'null'); 
  } catch { 
    return null; 
  }
};

export const isGuest = () => getGuest()?.isGuest === true;
export const clearGuest = () => localStorage.removeItem(KEY);