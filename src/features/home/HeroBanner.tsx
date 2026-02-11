import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import femaleMaidImage from '@/assets/female-maid.webp';

export function HeroBanner() {
  const navigate = useNavigate();

  return (
    <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-pink-50 via-white to-pink-100/60 border border-primary/10 shadow-card">
      <div className="flex items-center p-5 gap-4">
        {/* Left content */}
        <div className="flex-1 space-y-3 min-w-0">
          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-bold">
            <Zap className="w-3 h-3" />
            Instant Service
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-foreground leading-snug">
              Your maid on leave?
            </h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Relax. We'll send one in 10 minutes.
            </p>
          </div>
          <button
            onClick={() => navigate('/book/maid')}
            className="w-full mt-1 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-bold shadow-button hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
          >
            Book Maid Now
          </button>
        </div>

        {/* Right image */}
        <div className="flex-shrink-0 w-28 h-28 rounded-2xl overflow-hidden shadow-lg">
          <img
            src={femaleMaidImage}
            alt="Professional maid"
            className="w-full h-full object-cover"
            loading="eager"
          />
        </div>
      </div>
    </div>
  );
}
