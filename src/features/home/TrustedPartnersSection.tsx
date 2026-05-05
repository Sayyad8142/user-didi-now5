import React from 'react';
import { Star, Award, ShieldCheck } from 'lucide-react';

/**
 * Premium "Experts Vetted for Quality" section.
 * Golden wax-seal aesthetic on soft cream backdrop.
 * UI-only — purely presentational.
 */
export function TrustedPartnersSection() {
  return (
    <section
      aria-labelledby="trusted-partners-heading"
      className="relative px-2 pt-8 pb-6 animate-fade-in"
    >
      <div
        className="relative overflow-hidden rounded-3xl px-5 py-10"
        style={{
          background:
            'linear-gradient(180deg, #fbf6ec 0%, #f7efde 55%, #f3e8cf 100%)',
        }}
      >
        {/* Golden Wax Seal */}
        <div className="relative mx-auto flex flex-col items-center">
          <WaxSeal />

          {/* Heading */}
          <h2
            id="trusted-partners-heading"
            className="mt-7 text-center text-[22px] font-extrabold tracking-tight text-[#1a1a1a]"
          >
            Experts Vetted for Quality
          </h2>
          <p className="mt-1.5 text-center text-xs text-[#6b6357]">
            Every partner is verified and rated by real users
          </p>
        </div>

        {/* 3 Golden trust points */}
        <div className="mt-8 grid grid-cols-3 gap-3">
          <TrustPoint
            icon={<Star className="h-6 w-6" fill="#fff8e1" strokeWidth={1.8} />}
            label={['Top Rated', 'Experts']}
          />
          <TrustPoint
            icon={<Award className="h-6 w-6" strokeWidth={2} />}
            label={['Professionally', 'Trained']}
          />
          <TrustPoint
            icon={<ShieldCheck className="h-6 w-6" strokeWidth={2} />}
            label={['Background', 'Verified']}
          />
        </div>
      </div>
    </section>
  );
}

/* ------------ Wax Seal ------------ */
function WaxSeal() {
  // 12-petal scalloped wax-seal silhouette
  const petals = 12;
  const points: string[] = [];
  for (let i = 0; i < petals * 2; i++) {
    const angle = (Math.PI * 2 * i) / (petals * 2) - Math.PI / 2;
    const r = i % 2 === 0 ? 50 : 44; // outer / inner radius
    const x = 50 + r * Math.cos(angle);
    const y = 50 + r * Math.sin(angle);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  const polygon = points.join(' ');

  return (
    <div className="relative h-32 w-32">
      {/* Soft cast shadow */}
      <div
        aria-hidden
        className="absolute left-1/2 top-[78%] h-4 w-24 -translate-x-1/2 rounded-full bg-black/20 blur-md"
      />

      <svg
        viewBox="0 0 100 100"
        className="relative h-full w-full drop-shadow-[0_6px_10px_rgba(120,80,0,0.35)]"
      >
        <defs>
          <radialGradient id="goldFill" cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#fff3b0" />
            <stop offset="35%" stopColor="#f4c95d" />
            <stop offset="70%" stopColor="#c98a1f" />
            <stop offset="100%" stopColor="#7a4f0c" />
          </radialGradient>
          <radialGradient id="innerGold" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#e0a93a" />
            <stop offset="60%" stopColor="#b07b14" />
            <stop offset="100%" stopColor="#8a5a08" />
          </radialGradient>
          <radialGradient id="highlight" cx="35%" cy="25%" r="35%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer scalloped seal */}
        <polygon points={polygon} fill="url(#goldFill)" />

        {/* Inner recessed disc */}
        <circle cx="50" cy="50" r="33" fill="url(#innerGold)" />

        {/* Engraved inner ring */}
        <circle
          cx="50"
          cy="50"
          r="29"
          fill="none"
          stroke="#5e3d05"
          strokeOpacity="0.45"
          strokeWidth="0.6"
        />
        <circle
          cx="50"
          cy="50"
          r="29"
          fill="none"
          stroke="#fff2c2"
          strokeOpacity="0.35"
          strokeWidth="0.4"
          transform="translate(0,0.6)"
        />

        {/* Embossed brand text */}
        <text
          x="50"
          y="54"
          textAnchor="middle"
          fontSize="9"
          fontWeight="700"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontStyle="italic"
          fill="#5e3d05"
          fillOpacity="0.55"
        >
          Didi Now
        </text>
        <text
          x="50"
          y="53.4"
          textAnchor="middle"
          fontSize="9"
          fontWeight="700"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontStyle="italic"
          fill="#fff2c2"
          fillOpacity="0.35"
        >
          Didi Now
        </text>

        {/* Glossy highlight */}
        <ellipse cx="38" cy="32" rx="22" ry="14" fill="url(#highlight)" />
      </svg>
    </div>
  );
}

/* ------------ Trust Point ------------ */
function TrustPoint({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: [string, string];
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-xl text-[#7a4f0c] shadow-[0_4px_10px_-4px_rgba(122,79,12,0.45)]"
        style={{
          background:
            'linear-gradient(180deg, #f7d979 0%, #e0a93a 55%, #b07b14 100%)',
          color: '#5e3d05',
        }}
      >
        <span className="drop-shadow-[0_1px_0_rgba(255,243,176,0.6)]">
          {icon}
        </span>
      </div>
      <span className="mt-2 text-[12px] font-semibold leading-tight text-[#1a1a1a]">
        {label[0]}
        <br />
        {label[1]}
      </span>
    </div>
  );
}

export default TrustedPartnersSection;
