import { AuthCard } from '@/components/auth/AuthCard';
import authHero from '@/assets/auth-hero.png';

export default function Auth() {
  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center p-4 overflow-hidden">
      {/* Background image */}
      <div 
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `url(${authHero})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      {/* Overlay for better readability */}
      <div className="absolute inset-0 z-0 bg-background/70 backdrop-blur-sm" />
      
      {/* Auth card on top */}
      <div className="relative z-10">
        <AuthCard />
      </div>
    </div>
  );
}