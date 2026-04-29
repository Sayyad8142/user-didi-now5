import React from 'react';
import { Star, GraduationCap, ShieldCheck, BadgeCheck } from 'lucide-react';

/**
 * Premium "Trusted Didi Now Partners" section.
 * UI-only — purely presentational.
 */
export function TrustedPartnersSection() {
  return (
    <section
      aria-labelledby="trusted-partners-heading"
      className="relative py-6 px-2 animate-fade-in"
    >
      {/* Soft pink gradient backdrop */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/10 bg-gradient-to-b from-pink-50 via-white to-pink-50/60 px-5 py-8 shadow-sm">
        {/* Decorative blurred glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
        />

        {/* Premium seal */}
        <div className="relative mx-auto flex flex-col items-center">
          <div className="relative">
            {/* Outer gold ring */}
            <div
              className="relative flex h-28 w-28 items-center justify-center rounded-full shadow-[0_10px_30px_-8px_rgba(255,0,122,0.45)]"
              style={{
                background:
                  'conic-gradient(from 180deg at 50% 50%, #f5c66b 0deg, #fff3c4 90deg, #ff007a 180deg, #ffb3d1 270deg, #f5c66b 360deg)',
              }}
            >
              {/* Inner seal */}
              <div
                className="relative flex h-[5.5rem] w-[5.5rem] flex-col items-center justify-center rounded-full text-center shadow-inner"
                style={{
                  background:
                    'radial-gradient(circle at 30% 25%, #ffffff 0%, #fff0f6 55%, #ffd6e7 100%)',
                }}
              >
                <BadgeCheck
                  className="h-7 w-7 text-primary drop-shadow-sm"
                  strokeWidth={2.4}
                />
                <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  Verified by
                </span>
                <span className="text-[11px] font-extrabold leading-tight text-foreground">
                  Didi Now
                </span>
              </div>

              {/* Subtle shine sweep */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
              >
                <span className="absolute -inset-y-2 -left-1/2 w-1/2 rotate-12 bg-gradient-to-r from-transparent via-white/60 to-transparent opacity-70 animate-[shine_3.5s_ease-in-out_infinite]" />
              </span>
            </div>
          </div>

          {/* Heading */}
          <h2
            id="trusted-partners-heading"
            className="mt-5 text-center text-lg font-bold text-foreground sm:text-xl"
          >
            Trusted Partners for Quality Service
          </h2>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            Every partner is verified and rated by real users
          </p>
        </div>

        {/* 3 Trust points */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <TrustPoint
            icon={<Star className="h-5 w-5" fill="currentColor" strokeWidth={1.5} />}
            label="Top Rated Workers"
          />
          <TrustPoint
            icon={<GraduationCap className="h-5 w-5" strokeWidth={2} />}
            label="Experienced & Skilled"
          />
          <TrustPoint
            icon={<ShieldCheck className="h-5 w-5" strokeWidth={2} />}
            label="Background Verified"
          />
        </div>
      </div>

      {/* Local keyframes for shine */}
      <style>{`
        @keyframes shine {
          0% { transform: translateX(-120%) rotate(12deg); }
          60% { transform: translateX(320%) rotate(12deg); }
          100% { transform: translateX(320%) rotate(12deg); }
        }
      `}</style>
    </section>
  );
}

function TrustPoint({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-100 to-pink-50 text-primary shadow-sm ring-1 ring-primary/10">
        {icon}
      </div>
      <span className="mt-2 text-[11px] font-semibold leading-tight text-foreground">
        {label}
      </span>
    </div>
  );
}

export default TrustedPartnersSection;
