import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function PrivacyPolicy() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPdfUrl = async () => {
      try {
        // First try to get URL from ops_settings
        const { data: settings } = await supabase
          .from('ops_settings')
          .select('value')
          .eq('key', 'privacy_policy_url')
          .maybeSingle();

        if (settings?.value) {
          setPdfUrl(settings.value);
          setLoading(false);
          return;
        }

        // Fallback to storage
        const { data, error } = await supabase.storage
          .from('legal-pdfs')
          .createSignedUrl('privacy.pdf', 3600); // 1 hour expiry

        if (error) {
          setError('Privacy Policy not available');
        } else {
          setPdfUrl(data.signedUrl);
        }
      } catch (err) {
        setError('Failed to load Privacy Policy');
      } finally {
        setLoading(false);
      }
    };

    fetchPdfUrl();
  }, []);

  const handleDownload = () => {
    if (pdfUrl) {
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = 'didi-now-privacy-policy.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* SEO Meta Tags - handled by index.html for now */}
      
      <header className="border-b bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 bg-primary/10 rounded-2xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Privacy Policy</h1>
              <p className="text-sm text-muted-foreground">Didi Now - Your privacy matters to us</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center min-h-96">
            <div className="text-center space-y-4">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
              <p className="text-muted-foreground">Loading Privacy Policy...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center min-h-96">
            <div className="text-center space-y-4">
              <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
              <h2 className="text-xl font-semibold">Privacy Policy Unavailable</h2>
              <p className="text-muted-foreground max-w-md">
                We're sorry, but the Privacy Policy document is currently unavailable. 
                Please try again later or contact support.
              </p>
            </div>
          </div>
        ) : pdfUrl ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">Privacy Policy Document</h2>
                <p className="text-sm text-muted-foreground">
                  Last updated: {new Date().toLocaleDateString()}
                </p>
              </div>
              <Button onClick={handleDownload} variant="outline" className="gap-2">
                <Download className="w-4 h-4" />
                Download PDF
              </Button>
            </div>

            <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
              <iframe
                src={`${pdfUrl}#toolbar=1&navpanes=0&scrollbar=1`}
                className="w-full h-[800px]"
                title="Privacy Policy"
              />
            </div>

            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Having trouble viewing the document?{' '}
                <Button 
                  variant="link" 
                  className="p-0 h-auto text-sm" 
                  onClick={handleDownload}
                >
                  Download the PDF directly
                </Button>
              </p>
            </div>
          </div>
        ) : null}
      </main>

      <footer className="border-t mt-16 py-8">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © 2024 Didi Now. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}