import { useEffect, useState } from 'react';

export function useKeyboardPadding() {
  const [kb, setKb] = useState(0);

  useEffect(() => {
    let remove1: any, remove2: any;

    // Prefer Capacitor Keyboard if present
    const anyWin = window as any;
    if (anyWin.Capacitor?.Plugins?.Keyboard || anyWin.Keyboard) {
      const Keyboard = anyWin.Keyboard || anyWin.Capacitor.Plugins.Keyboard;
      Keyboard?.setResizeMode?.({ mode: 'native' }).catch?.(() => {});
      const a = Keyboard?.addListener?.('keyboardWillShow', (e: any) => setKb(e.keyboardHeight || 0));
      const b = Keyboard?.addListener?.('keyboardWillHide', () => setKb(0));
      remove1 = a?.remove; remove2 = b?.remove;
      return () => { remove1?.(); remove2?.(); };
    }

    // Fallback: visualViewport
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const bottom = Math.max(0, (window.innerHeight - (vv.height + vv.offsetTop)));
      setKb(bottom);
    };
    vv.addEventListener('resize', onResize);
    onResize();
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  return kb;
}