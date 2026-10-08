import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { getFirebaseIdToken, signOut as firebaseSignOut } from "@/lib/firebase";
import { LOVABLE_CLOUD_FUNCTIONS_URL, PRODUCTION_ANON_KEY, DIRECT_SUPABASE_URL } from "@/lib/constants";

export default function AccountSettings() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  async function downloadData() {
    setBusy(true); 
    setMsg("");
    try {
      const { data, error } = await supabase.rpc("export_my_data");
      if (error) throw error;
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; 
      a.download = "didi-now-my-data.json"; 
      a.click();
      URL.revokeObjectURL(url);
      
      setMsg("Data downloaded successfully!");
    } catch (e: any) {
      setMsg(e?.message || "Failed to export data");
    } finally {
      setBusy(false);
    }
  }

  async function callDelete(acknowledgeWallet: boolean): Promise<{ status: number; body: any }> {
    const token = await getFirebaseIdToken(true);
    if (!token) return { status: 401, body: { message: "Your session expired. Please sign in again." } };
    let last: any = null;
    for (const host of [LOVABLE_CLOUD_FUNCTIONS_URL, DIRECT_SUPABASE_URL]) {
      try {
        const res = await fetch(`${host}/functions/v1/delete-account`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: PRODUCTION_ANON_KEY,
            Authorization: `Bearer ${PRODUCTION_ANON_KEY}`,
            "x-firebase-token": token,
          },
          body: JSON.stringify({ acknowledge_wallet_forfeit: acknowledgeWallet }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.status === 404) { last = { status: 404, body }; continue; }
        return { status: res.status, body };
      } catch (e) {
        last = { status: 0, body: { message: "Network error. Please check your connection and try again." } };
      }
    }
    return last;
  }

  async function deleteAccount(acknowledgeWallet = false) {
    setBusy(true);
    setMsg("");
    try {
      const { status, body } = await callDelete(acknowledgeWallet);
      if (status === 409 && body?.error === "wallet_balance") {
        setWalletBalance(Number(body.balance_inr) || 0);
        setConfirmOpen(false);
        return;
      }
      if (status !== 200 || !body?.ok) {
        throw new Error(body?.message || "Failed to delete account. Please try again.");
      }
      setConfirmOpen(false);
      setWalletBalance(null);
      try {
        const { unregisterFcmToken } = await import("@/hooks/usePushNotifications");
        await unregisterFcmToken().catch(() => {});
      } catch {}
      try { const { clearDemoSession } = await import("@/lib/demo"); clearDemoSession(); } catch {}
      try { await firebaseSignOut(); } catch {}
      try { await supabase.auth.signOut(); } catch {}
      toast({ title: "Account deleted", description: "Your account has been deleted successfully." });
      setTimeout(() => { window.location.href = "/auth?deleted=1"; }, 800);
    } catch (e: any) {
      console.error("Account deletion error:", e);
      setConfirmOpen(false);
      setWalletBalance(null);
      setMsg(e?.message || "Failed to delete account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="pt-safe sticky top-0 z-50 bg-background">
        <div className="px-4 py-2 flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate(-1)}
            className="h-9 w-9 rounded-full border"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">Account Settings</h1>
        </div>
      </header>
      <div className="flex-1 p-4 space-y-6">

      {msg ? (
        <div className={`rounded-lg p-3 text-sm border ${
          msg.includes('successfully') 
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
            : 'bg-destructive/10 text-destructive border-destructive/20'
        }`}>
          {msg}
        </div>
      ) : null}

      <section className="rounded-2xl bg-card border shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Download className="h-5 w-5 text-primary" />
          <div className="font-semibold text-card-foreground">Download My Data</div>
        </div>
        <p className="text-sm text-muted-foreground">
          Download a copy of your profile and booking history in JSON format. This includes all your personal data we have on file.
        </p>
        <Button 
          onClick={downloadData} 
          disabled={busy} 
          className="w-full"
          variant="outline"
        >
          {busy ? "Preparing Download..." : "Download My Data"}
        </Button>
      </section>

      <section className="rounded-2xl bg-card border shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-destructive" />
          <div className="font-semibold text-destructive">Delete Account</div>
        </div>
        <p className="text-sm text-muted-foreground">
          Permanently delete your account and all associated data. This action cannot be undone and will remove:
        </p>
        <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
          <li>Your name, phone number and address</li>
          <li>Your login and notifications</li>
          <li>Any remaining wallet balance</li>
        </ul>
        <Button 
          variant="destructive" 
          onClick={() => setConfirmOpen(true)} 
          disabled={busy}
          className="w-full"
        >
          {busy ? "Deleting Account..." : "Delete My Account"}
        </Button>
      </section>

      <div className="text-xs text-muted-foreground text-center">
        Need help? Contact us at support@didinow.com
      </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !busy && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes your personal details and signs you out on all devices. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => { e.preventDefault(); deleteAccount(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Deleting..." : "Yes, delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={walletBalance !== null} onOpenChange={(o) => { if (!o && !busy) setWalletBalance(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You still have ₹{walletBalance} in your wallet</AlertDialogTitle>
            <AlertDialogDescription>
              If you delete your account now, this wallet balance will be lost. You can use it on a booking first, or continue to delete.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep my account</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => { e.preventDefault(); deleteAccount(true); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Deleting..." : "Delete anyway"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}