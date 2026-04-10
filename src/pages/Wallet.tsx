import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wallet as WalletIcon, ArrowDownCircle, ArrowUpCircle, RefreshCw, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWalletBalance, useWalletTransactions, useWalletRefresh, formatWalletReason } from '@/hooks/useWallet';
import { format } from 'date-fns';

function TransactionItem({ tx }: { tx: any }) {
  const isCredit = tx.type === 'credit';
  return (
    <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-gray-100">
      <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${
        isCredit ? 'bg-emerald-100' : 'bg-red-100'
      }`}>
        {isCredit
          ? <ArrowDownCircle className="w-5 h-5 text-emerald-600" />
          : <ArrowUpCircle className="w-5 h-5 text-red-600" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${isCredit ? 'text-emerald-700' : 'text-red-700'}`}>
          {isCredit ? '+' : '-'}₹{tx.amount_inr}
        </p>
        <p className="text-xs text-gray-700 font-medium mt-0.5">
          {formatWalletReason(tx.reason)}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {format(new Date(tx.created_at), 'dd MMM yyyy, hh:mm a')}
        </p>
      </div>
    </div>
  );
}

function TransactionSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-gray-100">
      <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-2.5 w-24" />
      </div>
    </div>
  );
}



export default function Wallet() {
  const navigate = useNavigate();
  const balanceQuery = useWalletBalance();
  const txQuery = useWalletTransactions();
  const { refreshWallet } = useWalletRefresh();
  

  const { data: wallet, isLoading: balanceLoading, isError: balanceError } = balanceQuery;
  const { data: transactions, isLoading: txLoading, isError: txError } = txQuery;

  const balance = wallet?.balance_inr ?? 0;

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="pt-safe bg-slate-50 sticky top-0 z-50">
        <div className="max-w-md mx-auto px-4 py-2 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-9 w-9 rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold text-primary flex-1">Didi Now Wallet</h1>
        </div>
      </header>

      <section className="flex-1 pb-24">
        <div className="max-w-md mx-auto px-4 py-4 space-y-5">
          {/* Balance card */}
          <div className="bg-gradient-to-br from-[#ff007a] to-[#e6006a] rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <WalletIcon className="w-5 h-5 text-white/80" />
                <p className="text-sm font-medium text-white/80">Available Balance</p>
              </div>

              {balanceLoading ? (
                <Skeleton className="h-10 w-32 bg-white/20 rounded-lg" />
              ) : balanceError ? (
                <div>
                  <p className="text-lg font-semibold text-white/70">Couldn't load balance</p>
                  <p className="text-xs text-white/50 mt-1">Check your connection and try again</p>
                </div>
              ) : (
                <p className="text-4xl font-bold tracking-tight">₹{balance}</p>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={refreshWallet}
                className="mt-3 h-8 px-3 text-xs text-white/80 hover:text-white hover:bg-white/10 rounded-full gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </Button>
            </div>
          </div>

          {/* Helper text */}
          <p className="text-xs text-gray-500 text-center px-4">
            Wallet refunds from cancelled bookings and no-worker cases will appear here.
          </p>

          {/* Transaction history */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
              Transaction History
            </h2>

            {txLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <TransactionSkeleton key={i} />
                ))}
              </div>
            ) : txError ? (
              <div className="text-center py-10 space-y-3">
                <p className="text-sm text-gray-500">Unable to load transactions</p>
                <p className="text-xs text-gray-400">Check your connection and try again</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshWallet}
                  className="rounded-full"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Retry
                </Button>
              </div>
            ) : !transactions || transactions.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <div className="h-16 w-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center">
                  <Receipt className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-500">No wallet transactions yet</p>
                <p className="text-xs text-gray-400">
                  Refunds from cancelled bookings will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => (
                  <TransactionItem key={tx.id} tx={tx} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
