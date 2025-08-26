import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Download, Copy, Trash2, Loader2, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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

  useEffect(() => {
    // Check session validity on mount
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSessionValid(false);
        return;
      }
      setSessionValid(true);
      loadSettings();
    };
    checkSession();
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

    setUploading(prev => ({ ...prev, [kind]: true }));

    try {
      const bucket = 'app-pdfs';
      const path = kind === 'privacy' ? 'privacy.pdf' : 'terms.pdf';

      const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
        upsert: true,
        contentType: 'application/pdf',
        cacheControl: '3600',
      });

      if (upErr) {
        // Special handling for RLS/session problems
        if (/row-level security|42501/i.test(upErr.message)) {
          toast({ 
            variant: 'destructive', 
            title: 'Session expired', 
            description: 'Please login again to upload legal PDFs.' 
          });
          navigate('/admin/login');
          return;
        }
        throw upErr;
      }

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
      const uploadedAt = new Date().toISOString();
      const publicUrl = `${urlData.publicUrl}?v=${encodeURIComponent(uploadedAt)}`;

      await supabase.from('ops_settings').upsert([
        { key: `${kind}_pdf_url`, value: publicUrl },
        { key: `${kind}_pdf_uploaded_at`, value: uploadedAt },
      ]);

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

  if (!sessionValid) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Legal PDFs</h2>
          <p className="text-muted-foreground">
            Upload Privacy Policy and Terms of Service PDFs for public access.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-muted-foreground mb-4">Session expired, please sign in again</p>
              <Button onClick={() => navigate('/admin/login')}>
                Sign In
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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