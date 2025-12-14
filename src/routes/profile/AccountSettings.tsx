import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { auth as firebaseAuth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Trash2 } from "lucide-react";

export default function AccountSettings() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

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

  async function deleteAccount() {
    if (!confirm("This will permanently delete your bookings and profile. This cannot be undone. Continue?")) {
      return;
    }
    
    setBusy(true); 
    setMsg("");
    try {
      // 1) purge database rows first
      const { error: deleteError } = await supabase.rpc("delete_my_data");
      if (deleteError) throw deleteError;

      // 2) delete auth user via Edge Function
      const user = firebaseAuth.currentUser;
      const token = user ? await user.getIdToken() : null;
      
      if (token) {
        const res = await supabase.functions.invoke('delete-auth-user', {
          headers: { Authorization: `Bearer ${token}` },
          body: {}
        });
        
        if (res.error) {
          console.error('Auth deletion error:', res.error);
          throw new Error("Failed to delete authentication record");
        }
      }

      // 3) sign out and redirect
      const { PortalStore } = await import('@/lib/portal');
      await signOut(firebaseAuth);
      PortalStore.clear();
      navigate("/auth?deleted=1");
    } catch (e: any) {
      console.error('Account deletion error:', e);
      setMsg(e?.message || "Failed to delete account");
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
          <li>Your profile information</li>
          <li>All booking history</li>
          <li>Your login credentials</li>
        </ul>
        <Button 
          variant="destructive" 
          onClick={deleteAccount} 
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
    </div>
  );
}