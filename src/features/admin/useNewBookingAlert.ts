import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const LS_KEY = "admin_sound_enabled";
const SOUND_SRC = "/ding.mp3"; // optional file in /public

// Shared singletons so all components control the same audio instance
let sharedAudio: HTMLAudioElement | null = null;
let sharedCtx: AudioContext | null = null;
let sharedLastPlay = 0;

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
    // Prepare a single shared HTMLAudioElement
    if (!sharedAudio) {
      sharedAudio = new Audio(SOUND_SRC);
      sharedAudio.preload = "auto";
      // Debug logging
      sharedAudio.addEventListener('canplaythrough', () => {
        console.log('Admin alert sound loaded successfully');
      }, { once: true } as any);
      sharedAudio.addEventListener('error', (e) => {
        console.error('Failed to load admin alert sound:', e);
      });
    }
    audioRef.current = sharedAudio;
    ctxRef.current = sharedCtx;
  }, []);

  // Web Audio fallback (works after a user gesture)
  function beepFallback() {
    if (!sharedCtx) sharedCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    ctxRef.current = sharedCtx;
    const ctx = sharedCtx!;
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
    if (now - sharedLastPlay < 600) return; // throttle
    sharedLastPlay = now;

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
      if (sharedCtx && sharedCtx.state === "suspended") {
        await sharedCtx.resume();
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
        // Play sound for any new booking INSERT
        console.log("New booking INSERT received for sound alert:", payload.new?.id, payload.new?.status);
        play();
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