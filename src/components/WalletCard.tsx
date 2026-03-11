import { Wallet } from 'lucide-react';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { Skeleton } from '@/components/ui/skeleton';

export function WalletCard() {
  const { balance, isLoading } = useWalletBalance();

  return (
    <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl p-5 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
            <Wallet className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-white/80 text-xs font-medium uppercase tracking-wide">Wallet Balance</p>
            {isLoading ? (
              <Skeleton className="h-7 w-20 bg-white/20 rounded" />
            ) : (
              <p className="text-2xl font-bold text-white">₹{balance}</p>
            )}
          </div>
        </div>
      </div>
      {balance > 0 && (
        <p className="text-white/70 text-[11px] mt-3">
          Wallet balance will be auto-applied on your next booking
        </p>
      )}
    </div>
  );
}
