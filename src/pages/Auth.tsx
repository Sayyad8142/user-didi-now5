import { AuthCard } from '@/components/auth/AuthCard';
import authHero from '@/assets/auth-hero.png';

export default function Auth() {
  return (
    <div className="min-h-screen gradient-bg flex flex-col items-center justify-center p-4">
      <img 
        src={authHero} 
        alt="Instant maid service" 
        className="w-full max-w-xs mb-4 rounded-lg"
      />
      <AuthCard />
    </div>
  );
}