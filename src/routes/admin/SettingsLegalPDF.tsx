import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Obj = { name: string; updated_at?: string };

async function getObjectMeta(name: string): Promise<Obj | null> {
  const { data, error } = await supabase.storage.from("legal-pdfs").list("", { search: name });
  if (error) return null;
  const found = (data || []).find(o => o.name === name);
  return found ? { name: found.name, updated_at: (found as any).updated_at } : null;
}

export default function SettingsLegalPDF() {
  const navigate = useNavigate();
  const [privacyMeta, setPrivacyMeta] = useState<Obj | null>(null);
  const [termsMeta, setTermsMeta] = useState<Obj | null>(null);
  const [uploading, setUploading] = useState<"privacy" | "terms" | null>(null);
  const [message, setMessage] = useState<string>("");

  async function refresh() {
    const [p, t] = await Promise.all([getObjectMeta("privacy.pdf"), getObjectMeta("terms.pdf")]);
    setPrivacyMeta(p); 
    setTermsMeta(t);
  }
  
  useEffect(() => { 
    refresh(); 
  }, []);

  async function upload(kind: "privacy" | "terms", file: File | null) {
    if (!file) return;
    if (file.type !== "application/pdf") { 
      setMessage("Please upload a PDF file."); 
      return; 
    }
    if (file.size > 8 * 1024 * 1024) { 
      setMessage("Max size 8 MB."); 
      return; 
    }
    setMessage(""); 
    setUploading(kind);
    try {
      const path = `${kind}.pdf`;
      const { error } = await supabase.storage.from("legal-pdfs")
        .upload(path, file, { upsert: true, contentType: "application/pdf" });
      if (error) throw error;
      await refresh();
      setMessage(`${kind === "privacy" ? "Privacy Policy" : "Terms"} uploaded successfully.`);
    } catch (e: any) {
      setMessage(e?.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function remove(kind: "privacy" | "terms") {
    if (!confirm(`Remove ${kind}.pdf?`)) return;
    await supabase.storage.from("legal-pdfs").remove([`${kind}.pdf`]);
    await refresh();
  }

  return (
    <div className="min-h-dvh bg-background p-4 space-y-6">
      <header className="mb-4 flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-full border"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <div className="text-2xl font-bold text-primary">Legal PDFs</div>
          <div className="text-xs text-muted-foreground">Upload Privacy Policy and Terms of Service as PDFs</div>
        </div>
      </header>

      {message ? (
        <div className="rounded-lg bg-emerald-50 text-emerald-700 p-3 text-sm border border-emerald-200">
          {message}
        </div>
      ) : null}

      <section className="rounded-2xl bg-card border shadow-sm p-4 space-y-3">
        <div className="font-semibold text-card-foreground">Privacy Policy (privacy.pdf)</div>
        <div className="text-xs text-muted-foreground">Allowed: PDF • Max 8 MB</div>
        <div className="flex items-center gap-2">
          <Input 
            type="file" 
            accept="application/pdf" 
            onChange={e => upload("privacy", e.target.files?.[0] || null)} 
            disabled={!!uploading}
            className="flex-1"
          />
          <Button 
            onClick={() => remove("privacy")} 
            variant="outline" 
            disabled={!privacyMeta || !!uploading}
          >
            Remove
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {privacyMeta ? `Uploaded • ${privacyMeta.updated_at || ""}` : "Not uploaded yet"}
        </div>
      </section>

      <section className="rounded-2xl bg-card border shadow-sm p-4 space-y-3">
        <div className="font-semibold text-card-foreground">Terms of Service (terms.pdf)</div>
        <div className="text-xs text-muted-foreground">Allowed: PDF • Max 8 MB</div>
        <div className="flex items-center gap-2">
          <Input 
            type="file" 
            accept="application/pdf" 
            onChange={e => upload("terms", e.target.files?.[0] || null)} 
            disabled={!!uploading}
            className="flex-1"
          />
          <Button 
            onClick={() => remove("terms")} 
            variant="outline" 
            disabled={!termsMeta || !!uploading}
          >
            Remove
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {termsMeta ? `Uploaded • ${termsMeta.updated_at || ""}` : "Not uploaded yet"}
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Users will view these PDFs inside the app (short-lived signed links). Only admins can upload/replace/delete.
      </p>
    </div>
  );
}