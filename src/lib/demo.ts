// Demo user utilities for development and testing

export const DEMO_PHONE = '+919876543210';
export const DEMO_OTP = '123456';

export interface DemoSession {
  user: {
    id: string;
    phone: string;
    email?: string;
  };
  profile: {
    id: string;
    full_name: string;
    phone: string;
    community: string;
    flat_no: string;
    is_admin: boolean;
  };
}

export const DEMO_SESSION: DemoSession = {
  user: {
    id: 'demo-user-id-123',
    phone: DEMO_PHONE,
  },
  profile: {
    id: 'demo-user-id-123',
    full_name: 'Demo User',
    phone: DEMO_PHONE,
    community: 'Demo Community',
    flat_no: 'D-101',
    is_admin: false,
  },
};

export function isDemoCredentials(phone: string, otp: string): boolean {
  const normalizedPhone = phone === '919876543210' ? '+919876543210' : phone;
  return normalizedPhone === DEMO_PHONE && otp.trim() === DEMO_OTP;
}

export function setDemoSession(): void {
  localStorage.setItem('demo-session', JSON.stringify(DEMO_SESSION));
  localStorage.setItem('demo-mode', 'true');
  // Notify app that demo mode changed so AuthProvider can update immediately
  window.dispatchEvent(new CustomEvent('demo-mode-changed', { detail: { enabled: true } }));
}

export function getDemoSession(): DemoSession | null {
  // Check guest session first
  const guestMode = localStorage.getItem('guest-mode');
  if (guestMode === 'true') {
    const guestData = localStorage.getItem('guest-session');
    if (guestData) {
      try {
        return JSON.parse(guestData);
      } catch {
        // Continue to demo session check
      }
    }
  }
  
  // Check demo session
  const demoMode = localStorage.getItem('demo-mode');
  if (demoMode !== 'true') return null;
  
  const sessionData = localStorage.getItem('demo-session');
  if (!sessionData) return null;
  
  try {
    return JSON.parse(sessionData);
  } catch {
    return null;
  }
}

export function clearDemoSession(): void {
  const hadDemoMode = localStorage.getItem('demo-mode') === 'true';
  const hadGuestMode = localStorage.getItem('guest-mode') === 'true';

  localStorage.removeItem('demo-session');
  localStorage.removeItem('demo-mode');
  localStorage.removeItem('guest-session');
  localStorage.removeItem('guest-mode');

  // Notify ONLY when we actually transitioned from enabled -> disabled.
  // This avoids noisy/infinite event loops when this function is called repeatedly.
  if (hadDemoMode || hadGuestMode) {
    window.dispatchEvent(new CustomEvent('demo-mode-changed', { detail: { enabled: false } }));
  }
}

export function isDemoMode(): boolean {
  return localStorage.getItem('demo-mode') === 'true' || localStorage.getItem('guest-mode') === 'true';
}

// Guest session functionality
const GUEST_SESSION: DemoSession = {
  user: {
    id: 'guest-user-id',
    phone: '',
    email: 'guest@example.com',
  },
  profile: {
    id: 'guest-user-id',
    full_name: 'Guest User',
    phone: '',
    community: 'Guest Community',
    flat_no: 'Guest',
    is_admin: false,
  },
};

export function setGuestSession(): void {
  localStorage.setItem('guest-session', JSON.stringify(GUEST_SESSION));
  localStorage.setItem('guest-mode', 'true');
  // Notify app that guest mode was enabled
  window.dispatchEvent(new CustomEvent('demo-mode-changed', { detail: { enabled: true, isGuest: true } }));
}

export function getGuestSession(): DemoSession | null {
  const guestData = localStorage.getItem('guest-session');
  if (!guestData) return null;
  
  try {
    return JSON.parse(guestData);
  } catch {
    return null;
  }
}

export function isGuestMode(): boolean {
  return localStorage.getItem('guest-mode') === 'true';
}