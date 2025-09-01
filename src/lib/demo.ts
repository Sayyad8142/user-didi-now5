const KEY = 'demoSession';

export type DemoSession = {
  isDemo: true;
  createdAt: string;
  user: { id: 'demo'; displayName: 'Demo User' };
};

export const setDemo = (): DemoSession => {
  const payload: DemoSession = {
    isDemo: true,
    createdAt: new Date().toISOString(),
    user: { id: 'demo', displayName: 'Demo User' },
  };
  localStorage.setItem(KEY, JSON.stringify(payload));
  return payload;
};

export const getDemo = (): DemoSession | null => {
  try { 
    return JSON.parse(localStorage.getItem(KEY) ?? 'null'); 
  } catch { 
    return null; 
  }
};

export const isDemo = () => getDemo()?.isDemo === true;
export const clearDemo = () => localStorage.removeItem(KEY);

// phone utils
export const normPhone = (raw: string) =>
  raw.replace(/[^\d]/g, ''); // keep digits only

export const isDemoPhone = (raw: string) => {
  const p = normPhone(raw);
  // accept 9876543210 or +91 9876543210 etc.
  return p.endsWith('9876543210');
};

export const DEMO_OTP = '123456';