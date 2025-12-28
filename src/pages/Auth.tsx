import { AuthCard } from '@/components/auth/AuthCard';

export default function Auth() {
  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center p-4 overflow-hidden bg-gradient-to-br from-pink-50 via-white to-rose-50">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Large gradient orb top-right */}
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-gradient-to-br from-pink-200/40 to-rose-300/30 rounded-full blur-3xl" />
        {/* Medium gradient orb bottom-left */}
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-gradient-to-tr from-pink-300/30 to-fuchsia-200/20 rounded-full blur-3xl" />
        {/* Small accent orb */}
        <div className="absolute top-1/3 left-10 w-32 h-32 bg-gradient-to-br from-rose-200/50 to-pink-100/30 rounded-full blur-2xl" />
        {/* Floating shapes */}
        <div className="absolute top-20 right-20 w-4 h-4 bg-pink-300/60 rounded-full animate-pulse" />
        <div className="absolute bottom-32 right-32 w-3 h-3 bg-rose-400/50 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-40 left-1/4 w-2 h-2 bg-fuchsia-300/70 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }} />
      </div>
      
      {/* Auth card */}
      <div className="relative z-10 w-full max-w-sm">
        <AuthCard />
      </div>
    </div>
  );
}