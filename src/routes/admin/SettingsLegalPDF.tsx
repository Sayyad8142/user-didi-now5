import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Copy, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

type PdfState = {
  url?: string;
  uploadedAt?: string;
}

export default function SettingsLegalPDF() {
  const navigate = useNavigate();
  const [privacy, setPrivacy] = useState<PdfState>({});
  const [terms, setTerms] = useState<PdfState>({});
  const [uploading, setUploading] = useState<"privacy" | "terms" | null>(null);

  async function loadSettings() {
    try {
      const { data } = await supabase
        .from('ops_settings')
        .select('key, value')
        .in('key', ['privacy_pdf_url', 'privacy_pdf_uploaded_at', 'terms_pdf_url', 'terms_pdf_uploaded_at']);
      
      if (data) {
        const privacyUrl = data.find(row => row.key === 'privacy_pdf_url')?.value;
        const privacyUploadedAt = data.find(row => row.key === 'privacy_pdf_uploaded_at')?.value;
        const termsUrl = data.find(row => row.key === 'terms_pdf_url')?.value;
        const termsUploadedAt = data.find(row => row.key === 'terms_pdf_uploaded_at')?.value;
        
        setPrivacy({ url: privacyUrl, uploadedAt: privacyUploadedAt });
        setTerms({ url: termsUrl, uploadedAt: termsUploadedAt });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }
  
  useEffect(() => { 
    loadSettings(); 
  }, []);

  async function uploadPdf(kind: "privacy" | "terms", file: File | null) {
    if (!file) return;
    
    if (file.type !== "application/pdf") { 
      toast.error("Please select a PDF file"); 
      return; 
    }
    if (file.size > 8 * 1024 * 1024) { 
      toast.error("File too large (max 8 MB)"); 
      return; 
    }
    
    setUploading(kind);
    try {
      const key = kind === 'privacy' ? 'privacy.pdf' : 'terms.pdf';
      
      // Upload to new app-pdfs bucket
      const { error: upErr } = await supabase
        .storage.from('app-pdfs')
        .upload(key, file, { contentType: 'application/pdf', upsert: true });
      
      if (upErr) { 
        toast.error(`Upload failed: ${upErr.message}`); 
        return; 
      }

      // Get public URL
      const { data: { publicUrl } } = supabase
        .storage.from('app-pdfs')
        .getPublicUrl(key);

      // Persist in ops_settings
      await supabase.from('ops_settings').upsert([
        { key: `${kind}_pdf_url`, value: publicUrl },
        { key: `${kind}_pdf_uploaded_at`, value: new Date().toISOString() },
      ]);

      toast.success(`${kind === 'privacy' ? 'Privacy Policy' : 'Terms'} uploaded`);
      
      // Update local state
      if (kind === 'privacy') {
        setPrivacy({ url: publicUrl, uploadedAt: new Date().toISOString() });
      } else {
        setTerms({ url: publicUrl, uploadedAt: new Date().toISOString() });
      }
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function removePdf(kind: "privacy" | "terms") {
    if (!confirm(`Remove ${kind === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}?`)) return;
    
    try {
      const key = kind === 'privacy' ? 'privacy.pdf' : 'terms.pdf';
      
      // Remove from storage
      await supabase.storage.from('app-pdfs').remove([key]);
      
      // Remove from ops_settings
      await supabase.from('ops_settings').delete().in('key', [
        `${kind}_pdf_url`, `${kind}_pdf_uploaded_at`
      ]);
      
      toast.success('Removed');
      
      // Clear local state
      if (kind === 'privacy') {
        setPrivacy({});
      } else {
        setTerms({});
      }
    } catch (error) {
      console.error('Remove failed:', error);
      toast.error('Failed to remove');
    }
  }

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
  };

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

      <section className="rounded-2xl bg-card border shadow-sm p-4 space-y-3">
        <div className="font-semibold text-card-foreground">Privacy Policy (privacy.pdf)</div>
        <div className="text-xs text-muted-foreground">Allowed: PDF • Max 8 MB</div>
        <div className="flex items-center gap-2">
          <Input 
            type="file" 
            accept="application/pdf" 
            onChange={e => uploadPdf("privacy", e.target.files?.[0] || null)} 
            disabled={!!uploading}
            className="flex-1"
          />
          {privacy.url && (
            <>
              <Button 
                onClick={() => window.open(privacy.url, '_blank')} 
                variant="outline" 
                size="sm"
                disabled={!!uploading}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button 
                onClick={() => copyLink(privacy.url!)} 
                variant="outline" 
                size="sm"
                disabled={!!uploading}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button 
            onClick={() => removePdf("privacy")} 
            variant="outline" 
            disabled={!privacy.url || !!uploading}
          >
            Remove
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {privacy.url ? `Uploaded • ${privacy.uploadedAt ? new Date(privacy.uploadedAt).toLocaleDateString() : ""}` : "Not uploaded yet"}
        </div>
      </section>

      <section className="rounded-2xl bg-card border shadow-sm p-4 space-y-3">
        <div className="font-semibold text-card-foreground">Terms of Service (terms.pdf)</div>
        <div className="text-xs text-muted-foreground">Allowed: PDF • Max 8 MB</div>
        <div className="flex items-center gap-2">
          <Input 
            type="file" 
            accept="application/pdf" 
            onChange={e => uploadPdf("terms", e.target.files?.[0] || null)} 
            disabled={!!uploading}
            className="flex-1"
          />
          {terms.url && (
            <>
              <Button 
                onClick={() => window.open(terms.url, '_blank')} 
                variant="outline" 
                size="sm"
                disabled={!!uploading}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button 
                onClick={() => copyLink(terms.url!)} 
                variant="outline" 
                size="sm"
                disabled={!!uploading}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button 
            onClick={() => removePdf("terms")} 
            variant="outline" 
            disabled={!terms.url || !!uploading}
          >
            Remove
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {terms.url ? `Uploaded • ${terms.uploadedAt ? new Date(terms.uploadedAt).toLocaleDateString() : ""}` : "Not uploaded yet"}
        </div>
      </section>

      {/* Public Links Section */}
      {(privacy.url || terms.url) && (
        <section className="rounded-2xl bg-card border shadow-sm p-4 space-y-3">
          <div className="font-semibold text-card-foreground">Public PDF Links</div>
          <div className="text-xs text-muted-foreground">Direct links to uploaded PDFs</div>
          
          <div className="space-y-3">
            {privacy.url && (
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-sm font-medium text-foreground mb-1">Privacy Policy:</div>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-muted-foreground break-all flex-1">
                    {privacy.url}
                  </code>
                  <Button 
                    onClick={() => copyLink(privacy.url!)} 
                    variant="ghost" 
                    size="sm"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            
            {terms.url && (
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-sm font-medium text-foreground mb-1">Terms of Service:</div>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-muted-foreground break-all flex-1">
                    {terms.url}
                  </code>
                  <Button 
                    onClick={() => copyLink(terms.url!)} 
                    variant="ghost" 
                    size="sm"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="pb-24 text-xs text-muted-foreground">
        PDFs are uploaded to public storage and immediately accessible. Upload replaces existing files.
      </div>
    </div>
  );
}