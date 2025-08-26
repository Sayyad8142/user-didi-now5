import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Download, Copy, Trash2, Loader2, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ensureAdminSession } from "@/lib/auth/ensureAdminSession";

interface PdfState {
  url: string | null;
  uploadedAt: string | null;
}

export function LegalPDFs() {
  const navigate = useNavigate();
  const [privacy, setPrivacy] = useState<PdfState>({ url: null, uploadedAt: null });
  const [terms, setTerms] = useState<PdfState>({ url: null, uploadedAt: null });
  const [uploading, setUploading] = useState<{ privacy: boolean; terms: boolean }>({
    privacy: false,
    terms: false,
  });
  const [sessionValid, setSessionValid] = useState(true);
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

  // Clear any previous session error state when component mounts
  useEffect(() => {
    setSessionValid(true);
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

  const uploadWithRetry = async (kind: "privacy" | "terms", file: File) => {
    const doUpload = async () => {
      const timestamp = Date.now();
      const fileName = `${kind}.pdf`;
      
      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('app-pdfs')
        .upload(fileName, file, {
          upsert: true,
          contentType: 'application/pdf',
          cacheControl: '3600'
        });

      if (uploadError) throw uploadError;

      // Get public URL with cache busting
      const { data: { publicUrl } } = supabase.storage
        .from('app-pdfs')
        .getPublicUrl(fileName);
      
      const urlWithTimestamp = `${publicUrl}?t=${timestamp}`;

      // Save settings to database
      const uploadedAt = new Date().toISOString();
      
      const { error: settingsError } = await supabase
        .from('ops_settings')
        .upsert([
          { key: `${kind}_pdf_url`, value: urlWithTimestamp },
          { key: `${kind}_pdf_uploaded_at`, value: uploadedAt }
        ]);

      if (settingsError) throw settingsError;

      return { url: urlWithTimestamp, uploadedAt };
    };

    // Ensure session and try once
    await ensureAdminSession();
    try {
      return await doUpload();
    } catch (e: any) {
      // Retry once on auth/permission errors
      const msg = String(e?.message || e);
      if (e?.code === "401" || /JWT|auth|permission|401/i.test(msg)) {
        await ensureAdminSession();
        return await doUpload();
      }
      throw e;
    }
  };

  const uploadPdf = async (kind: "privacy" | "terms", file: File | null) => {
    if (!file || !validateFile(file)) return;

    setUploading(prev => ({ ...prev, [kind]: true }));

    try {
      const result = await uploadWithRetry(kind, file);

      // Update local state
      if (kind === 'privacy') {
        setPrivacy(result);
      } else {
        setTerms(result);
      }

      toast({
        title: "Upload successful",
        description: `${kind === 'privacy' ? 'Privacy Policy' : 'Terms of Service'} uploaded successfully!`,
      });

    } catch (error: any) {
      console.error('Upload error:', error);
      
      if (error.code === "AUTH_EXPIRED") {
        toast({
          variant: "destructive",
          title: "Session expired",
          description: "Please try the upload again.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Upload failed",
          description: error.message,
        });
      }
    } finally {
      setUploading(prev => ({ ...prev, [kind]: false }));
    }
  };

  const removeWithRetry = async (kind: "privacy" | "terms") => {
    const doRemove = async () => {
      const fileName = `${kind}.pdf`;
      
      // Remove from storage
      const { error: deleteError } = await supabase.storage
        .from('app-pdfs')
        .remove([fileName]);

      if (deleteError) throw deleteError;

      // Remove from settings
      const { error: settingsError } = await supabase
        .from('ops_settings')
        .delete()
        .in('key', [`${kind}_pdf_url`, `${kind}_pdf_uploaded_at`]);

      if (settingsError) throw settingsError;
    };

    // Ensure session and try once
    await ensureAdminSession();
    try {
      await doRemove();
    } catch (e: any) {
      // Retry once on auth/permission errors
      const msg = String(e?.message || e);
      if (e?.code === "401" || /JWT|auth|permission|401/i.test(msg)) {
        await ensureAdminSession();
        await doRemove();
      } else {
        throw e;
      }
    }
  };

  const removePdf = async (kind: "privacy" | "terms") => {
    try {
      await removeWithRetry(kind);

      // Update local state
      if (kind === 'privacy') {
        setPrivacy({ url: null, uploadedAt: null });
      } else {
        setTerms({ url: null, uploadedAt: null });
      }

      toast({
        title: "Removal successful",
        description: `${kind === 'privacy' ? 'Privacy Policy' : 'Terms of Service'} removed successfully!`,
      });

    } catch (error: any) {
      console.error('Remove error:', error);
      
      if (error.code === "AUTH_EXPIRED") {
        toast({
          variant: "destructive",
          title: "Session expired",
          description: "Please try the removal again.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Removal failed",
          description: error.message,
        });
      }
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
          <CardContent className="space-y-4">
            {privacy.url && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Privacy Policy URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={privacy.url}
                    readOnly
                    className="flex-1 px-3 py-2 border border-input bg-background text-sm rounded-md"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyLink(privacy.url!)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(privacy.url!, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
            {terms.url && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Terms of Service URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={terms.url}
                    readOnly
                    className="flex-1 px-3 py-2 border border-input bg-background text-sm rounded-md"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyLink(terms.url!)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(terms.url!, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}