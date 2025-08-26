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
      const { data, error } = await supabase.rpc('admin_get_legal_pdfs');
      
      if (error) throw error;

      setPrivacy({
        url: data?.[0]?.privacy_url || null,
        uploadedAt: null, // We'll get timestamps separately if needed
      });
      
      setTerms({
        url: data?.[0]?.terms_url || null,
        uploadedAt: null,
      });

      // Get timestamps separately
      const { data: settingsData } = await supabase
        .from('ops_settings')
        .select('key, value')
        .in('key', ['privacy_pdf_uploaded_at', 'terms_pdf_uploaded_at']);

      if (settingsData) {
        const settings = settingsData.reduce((acc, { key, value }) => ({ ...acc, [key]: value }), {} as Record<string, string>);
        
        setPrivacy(prev => ({
          ...prev,
          uploadedAt: settings['privacy_pdf_uploaded_at'] || null,
        }));
        
        setTerms(prev => ({
          ...prev,
          uploadedAt: settings['terms_pdf_uploaded_at'] || null,
        }));
      }
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

  const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = (reader.result as string) || '';
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const uploadWithRetry = async (kind: "privacy" | "terms", file: File) => {
    const doUpload = async () => {
      const timestamp = Date.now();
      const fileName = `${kind}.pdf`;
      
      // Use Edge Function directly (bypasses RLS issues)
      console.log('Using Edge Function for upload...');
      const base64 = await fileToBase64(file);
      
      const { data: fnData, error: fnError } = await supabase.functions.invoke('admin-upload-legal-pdf', {
        body: { 
          filename: fileName, 
          contentType: 'application/pdf', 
          base64, 
          kind 
        }
      });
      
      if (fnError) {
        console.error('Edge Function upload failed:', fnError);
        throw new Error(`Upload failed: ${fnError.message || 'Unknown error'}`);
      }
      
      if (!fnData?.url) {
        console.error('Edge Function response:', fnData);
        throw new Error('Edge Function did not return a valid URL');
      }
      
      const publicUrl = fnData.url;
      console.log('Edge Function upload successful:', publicUrl);
      
      const urlWithTimestamp = `${publicUrl}?t=${timestamp}`;

      // Save URL using RPC
      console.log('Saving URL via RPC:', urlWithTimestamp);
      const { error: rpcError } = await supabase.rpc('admin_set_legal_pdf', {
        kind,
        url: urlWithTimestamp
      });

      if (rpcError) {
        console.error('RPC error:', rpcError);
        throw new Error(`Failed to save URL: ${rpcError.message}`);
      }

      return { url: urlWithTimestamp, uploadedAt: new Date().toISOString() };
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
      console.error('PDF upload error:', error);
      
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
          description: error.message ?? 'Please try again.',
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