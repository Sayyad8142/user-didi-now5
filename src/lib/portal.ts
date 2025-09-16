// Persist which portal the user is in: 'admin' | 'user'
const KEY = 'didi.active_portal';

export type Portal = 'admin' | 'user';

export const PortalStore = {
  get(): Portal | null {
    try { 
      return (localStorage.getItem(KEY) as Portal) || null; 
    } catch { 
      return null; 
    }
  },
  set(p: Portal) {
    try { 
      localStorage.setItem(KEY, p); 
    } catch {}
  },
  clear() {
    try { 
      localStorage.removeItem(KEY); 
    } catch {}
  }
};