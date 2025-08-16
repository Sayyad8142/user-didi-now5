import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const LS_KEY = "admin_sound_enabled";
const SOUND_SRC = "/ding.mp3"; // optional file in /public

export function useNewBookingAlert() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    const raw = localStorage.getItem(LS_KEY);
    return raw === "1";
  });

  // Audio plumbing
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const lastPlayRef = useRef<number>(0);

  useEffect(() => {
    // prepare HTMLAudioElement (if file exists)
    audioRef.current = new Audio(SOUND_SRC);
    audioRef.current.preload = "auto";
  }, []);

  // Web Audio fallback (works after a user gesture)
  function beepFallback() {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = ctxRef.current!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 1046; // C6
    g.gain.value = 0.06;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.22);
  }

  async function play() {
    const now = Date.now();
    if (now - lastPlayRef.current < 600) return; // throttle
    lastPlayRef.current = now;

    try {
      // try HTMLAudio first
      const a = audioRef.current;
      if (a) {
        a.currentTime = 0;
        await a.play();
        return;
      }
    } catch (_) { /* fallthrough */ }

    try {
      // fallback: Web Audio beep
      if (ctxRef.current && ctxRef.current.state === "suspended") {
        await ctxRef.current.resume();
      }
      beepFallback();
    } catch (_) {}
  }

  function stopSound() {
    try {
      // Stop HTMLAudio if playing
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      // Note: Web Audio oscillators stop automatically after their duration
    } catch (_) { /* ignore */ }
  }

  // Subscribe to INSERT on bookings
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel("bookings-sound")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bookings" }, (payload) => {
        // Only alert for "pending" new bookings (typical at creation)
        if (payload.new?.status === "pending") {
          // If tab is hidden, we still play — browsers may mute; toggle handles permission
          play();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [enabled]);

  // toggle also unlocks audio on first enable (counts as user gesture)
  async function toggle() {
    const val = !enabled;
    setEnabled(val);
    localStorage.setItem(LS_KEY, val ? "1" : "0");
    if (val) {
      try {
        // prime audio so future plays are allowed
        if (audioRef.current) {
          audioRef.current.muted = true;
          await audioRef.current.play();
          audioRef.current.pause();
          audioRef.current.muted = false;
        } else {
          // init web-audio context
          if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          await ctxRef.current.resume();
          beepFallback();
        }
      } catch { /* ignore */ }
    }
  }

  return { enabled, toggle, stopSound };
}