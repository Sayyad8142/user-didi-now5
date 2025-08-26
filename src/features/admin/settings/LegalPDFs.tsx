import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Download, Copy, Trash2, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface PdfState {
  url: string | null;
  uploadedAt: string | null;
}

export function LegalPDFs() {
  const [privacy, setPrivacy] = useState<PdfState>({ url: null, uploadedAt: null });
  const [terms, setTerms] = useState<PdfState>({ url: null, uploadedAt: null });
  const [uploading, setUploading] = useState<{ privacy: boolean; terms: boolean }>({
    privacy: false,
    terms: false,
  });
  const { toast } = useToast();

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('ops_settings')
        .select('key, value')
        .in('key', [
          'privacy_pdf_url', 
          'privacy_pdf_uploaded_at',
          'terms_pdf_url', 
          'terms_pdf_uploaded_at'
        ]);

      if (error) throw error;

      const settings = data?.reduce((acc, { key, value }) => ({ ...acc, [key]: value }), {} as Record<string, string>) || {};
      
      setPrivacy({
        url: settings['privacy_pdf_url'] || null,
        uploadedAt: settings['privacy_pdf_uploaded_at'] || null,
      });
      
      setTerms({
        url: settings['terms_pdf_url'] || null,
        uploadedAt: settings['terms_pdf_uploaded_at'] || null,
      });
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const validateFile = (file: File): boolean => {
    if (file.type !== 'application/pdf') {
      toast({
        title: "Invalid file type",
        description: "Please select a PDF file.",
        variant: "destructive",
      });
      return false;
    }

    if (file.size > 8 * 1024 * 1024) { // 8MB
      toast({
        title: "File too large",
        description: "Please select a PDF file smaller than 8MB.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const uploadPdf = async (kind: "privacy" | "terms", file: File | null) => {
    if (!file || !validateFile(file)) return;

    const path = kind === "privacy" ? "privacy.pdf" : "terms.pdf";
    
    setUploading(prev => ({ ...prev, [kind]: true }));

    try {
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('app-pdfs')
        .upload(path, file, {
          upsert: true,
          contentType: 'application/pdf',
          cacheControl: '3600',
        });

      if (uploadError) throw uploadError;

      // Get public URL with cache-busting
      const { data } = supabase.storage.from('app-pdfs').getPublicUrl(path);
      const uploadedAt = new Date().toISOString();
      const publicUrl = `${data.publicUrl}?v=${encodeURIComponent(uploadedAt)}`;

      // Save to ops_settings
      const { error: settingsError } = await supabase
        .from('ops_settings')
        .upsert([
          { key: `${kind}_pdf_url`, value: publicUrl },
          { key: `${kind}_pdf_uploaded_at`, value: uploadedAt },
        ]);

      if (settingsError) throw settingsError;

      // Update local state
      if (kind === "privacy") {
        setPrivacy({ url: publicUrl, uploadedAt });
      } else {
        setTerms({ url: publicUrl, uploadedAt });
      }

      toast({
        title: "Upload successful",
        description: `${kind === "privacy" ? "Privacy Policy" : "Terms of Service"} uploaded successfully.`,
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error?.message || "Failed to upload PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(prev => ({ ...prev, [kind]: false }));
    }
  };

  const removePdf = async (kind: "privacy" | "terms") => {
    const path = kind === "privacy" ? "privacy.pdf" : "terms.pdf";

    try {
      // Remove from storage
      const { error: storageError } = await supabase.storage
        .from('app-pdfs')
        .remove([path]);

      if (storageError) throw storageError;

      // Remove from ops_settings
      const { error: settingsError } = await supabase
        .from('ops_settings')
        .delete()
        .in('key', [`${kind}_pdf_url`, `${kind}_pdf_uploaded_at`]);

      if (settingsError) throw settingsError;

      // Update local state
      if (kind === "privacy") {
        setPrivacy({ url: null, uploadedAt: null });
      } else {
        setTerms({ url: null, uploadedAt: null });
      }

      toast({
        title: "PDF removed",
        description: `${kind === "privacy" ? "Privacy Policy" : "Terms of Service"} removed successfully.`,
      });
    } catch (error) {
      console.error('Remove error:', error);
      toast({
        title: "Remove failed",
        description: "Failed to remove PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied",
      description: "PDF link copied to clipboard.",
    });
  };

  const renderPdfCard = (
    title: string,
    filename: string,
    kind: "privacy" | "terms",
    state: PdfState,
    isUploading: boolean
  ) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title} ({filename})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            {state.url ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Uploaded</p>
                {state.uploadedAt && (
                  <p className="text-xs text-muted-foreground">
                    Updated: {formatDistanceToNow(new Date(state.uploadedAt), { addSuffix: true })}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not uploaded yet</p>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => uploadPdf(kind, e.target.files?.[0] || null)}
              className="hidden"
              id={`${kind}-upload`}
              disabled={isUploading}
            />
            <label htmlFor={`${kind}-upload`}>
              <Button variant="outline" size="sm" asChild disabled={isUploading}>
                <span className="cursor-pointer">
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {state.url ? "Replace" : "Upload"}
                </span>
              </Button>
            </label>
          </div>
        </div>

        {state.url && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open(state.url!, '_blank')}>
              <Download className="h-4 w-4" />
              Open
            </Button>
            <Button variant="outline" size="sm" onClick={() => copyLink(state.url!)}>
              <Copy className="h-4 w-4" />
              Copy link
            </Button>
            <Button variant="outline" size="sm" onClick={() => removePdf(kind)}>
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Legal PDFs</h2>
        <p className="text-muted-foreground">
          Upload Privacy Policy and Terms of Service PDFs for public access.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {renderPdfCard(
          "Privacy Policy",
          "privacy.pdf",
          "privacy",
          privacy,
          uploading.privacy
        )}

        {renderPdfCard(
          "Terms of Service",
          "terms.pdf",
          "terms",
          terms,
          uploading.terms
        )}
      </div>

      {(privacy.url || terms.url) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Public Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {privacy.url && (
              <div className="flex items-center justify-between p-2 bg-muted rounded">
                <span className="text-sm font-medium">Privacy Policy:</span>
                <Button variant="ghost" size="sm" onClick={() => copyLink(privacy.url!)}>
                  <Copy className="h-4 w-4" />
                  Copy link
                </Button>
              </div>
            )}
            {terms.url && (
              <div className="flex items-center justify-between p-2 bg-muted rounded">
                <span className="text-sm font-medium">Terms of Service:</span>
                <Button variant="ghost" size="sm" onClick={() => copyLink(terms.url!)}>
                  <Copy className="h-4 w-4" />
                  Copy link
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}