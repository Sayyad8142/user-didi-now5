import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ExternalLink, Copy, Check, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function TermsScreen() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 120);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        // Check for PDF URL using RPC (future-proofed for when admin uploads)
        const { data: pdfData, error: pdfError } = await supabase
          .rpc('get_app_setting', { k: 'terms_pdf_url' });

        if (pdfError) {
          console.error('Error fetching PDF URL:', pdfError);
        } else if (pdfData) {
          setPdfUrl(pdfData);
        }

        // Get last updated date using RPC (if available)
        const { data: updatedData, error: updatedError } = await supabase
          .rpc('get_app_setting', { k: 'terms_policy_updated_at' });

        if (updatedError) {
          console.error('Error fetching updated date:', updatedError);
        } else if (updatedData) {
          const date = new Date(updatedData);
          if (!isNaN(date.getTime())) {
            setLastUpdated(date.toLocaleDateString('en-IN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            }));
          }
        }

        // Set fallback content if no PDF
        if (!pdfData) {
          setContent(fallbackTermsContent);
        }
      } catch (error) {
        console.error('Error fetching terms of service:', error);
        // Set fallback content on error
        setContent(fallbackTermsContent);
        toast({
          title: "Notice",
          description: "Showing cached terms content",
          variant: "default"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [toast]);

  const handleCopyLink = async () => {
    try {
      const currentUrl = window.location.href;
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      
      toast({
        title: "Link copied",
        description: "Terms of Service link copied to clipboard"
      });
    } catch (error) {
      console.error('Failed to copy:', error);
      toast({
        title: "Error",
        description: "Failed to copy link",
        variant: "destructive"
      });
    }
  };

  const renderMarkdown = (markdown: string) => {
    // Simple markdown to HTML conversion for headings and basic formatting
    const lines = markdown.split('\n');
    let html = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('# ')) {
        html += `<h1 class="text-3xl font-bold text-foreground mb-6">${line.substring(2)}</h1>`;
      } else if (line.startsWith('## ')) {
        html += `<h2 class="text-xl font-semibold text-foreground mt-8 mb-4">${line.substring(3)}</h2>`;
      } else if (line.startsWith('- ')) {
        html += `<li class="ml-4">${line.substring(2)}</li>`;
      } else if (line.startsWith('**') && line.endsWith('**')) {
        html += `<p class="font-semibold text-foreground mb-3">${line.substring(2, line.length - 2)}</p>`;
      } else if (line === '') {
        html += '<div class="mb-3"></div>';
      } else if (line.includes('team@didisnow.com')) {
        html += `<p class="text-muted-foreground mb-3">${line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/team@didisnow\.com/g, '<a href="mailto:team@didisnow.com" class="text-primary underline font-medium">team@didisnow.com</a>')}</p>`;
      } else if (line.includes('https://')) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const formattedLine = line.replace(urlRegex, '<a href="$1" class="text-primary underline" target="_blank" rel="noopener noreferrer">$1</a>');
        html += `<p class="text-muted-foreground mb-3">${formattedLine}</p>`;
      } else if (line.length > 0) {
        html += `<p class="text-muted-foreground mb-3">${line.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-medium">$1</strong>')}</p>`;
      }
    }
    
    return html;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Header */}
      <header className={`sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-all duration-200 ${
        isScrolled ? 'shadow-sm' : ''
      }`}>
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            
            <div className="h-8 w-px bg-border" />
            <div className="h-12 w-12 bg-primary/10 rounded-2xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            
            <div className="flex-1">
              <h1 className={`font-bold text-foreground transition-all duration-200 ${
                isScrolled ? 'text-lg' : 'text-2xl'
              }`}>
                Terms of Service
              </h1>
              {!isScrolled && (
                <p className="text-sm text-muted-foreground">
                  Terms and conditions of use
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyLink}
                className="flex items-center gap-2"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copied ? 'Copied' : 'Share'}
              </Button>
              
              {pdfUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(pdfUrl, '_blank')}
                  className="flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open PDF
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {pdfUrl ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">Terms of Service Document</h2>
                <p className="text-sm text-muted-foreground">
                  {lastUpdated ? `Last updated: ${lastUpdated}` : `Last updated: ${new Date().toLocaleDateString()}`}
                </p>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
              <iframe
                src={`${pdfUrl}#toolbar=1&navpanes=0&scrollbar=1`}
                className="w-full h-[80vh]"
                title="Terms of Service"
              />
            </div>

            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Having trouble viewing the document?{' '}
                <Button 
                  variant="link" 
                  className="p-0 h-auto text-sm" 
                  onClick={() => window.open(pdfUrl, '_blank')}
                >
                  Open the PDF directly
                </Button>
              </p>
            </div>
          </div>
        ) : (
          <article className="prose prose-slate max-w-none">
            <div 
              dangerouslySetInnerHTML={{ 
                __html: renderMarkdown(content) 
              }} 
              className="space-y-4"
            />
          </article>
        )}

        {/* Last Updated */}
        {lastUpdated && (
          <div className="mt-12 pt-8 border-t">
            <p className="text-sm text-muted-foreground text-center">
              Last updated: {lastUpdated}
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-16 py-8">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © 2025 Didi Now. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

const fallbackTermsContent = `# Didi Now – Terms of Use
**Version** 1.0  
**Last Updated:** 19 Aug 2025

These Terms of Use ("Terms") govern your access and use of Didi Now via our website and mobile apps. By using the Platform, you agree to these Terms. If you do not agree, please do not use the Platform.

## 1. Definitions
- **Platform:** The Didi Now website and mobile apps.  
- **Services:** Instant booking of domestic helpers ("Experts").  
- **Users:** Customers using the Platform to book Experts.  
- **Experts:** Independent service providers offering house-help services via the Platform.

## 2. Services
The Platform helps Users discover and book Experts for:
- Maid Services (cleaning, dusting, utensils, etc.)  
- Cook Services (meal preparation, kitchen help, etc.)  
Didi Now only facilitates the connection between Users and Experts. Experts are **not** employees or representatives of Didi Now; we are not responsible for the performance, quality, or completion of any service by an Expert.

## 3. Eligibility
You must be 18+, legally capable of entering into a contract, and booking within Hyderabad, India.

## 4. Account Registration
Register with accurate information and keep your credentials secure. You are responsible for activity under your account.

## 5. Bookings
- **Order:** Book based on available slots; Didi Now assigns an Expert on a best-effort basis.  
- **Confirmation:** A booking is confirmed when an Expert accepts; you will be notified.  
- **Cancellations:** Free before confirmation; post-confirmation may incur a fee.  
- **Substitution:** If an Expert cancels, we may assign a substitute.  
- **Extension:** You can extend duration during booking or in-app if available.  
- **No Direct Engagement:** Do not bypass the Platform to re-engage Experts directly.

## 6. Payments
- Payments are prepaid via the Platform and may include Expert Fee, Technology Fee, convenience/surge fees, and applicable GST.  
- Charges are final and non-refundable unless required by law or our refund policy.  
- Didi Now's maximum liability is limited to **₹10,000** per confirmed booking.

## 7. User Conduct
Treat Experts respectfully and provide a safe, clean working environment. Abusive or unlawful conduct may lead to suspension.

## 8. Expert Conduct
Experts are expected to be punctual, professional, and respectful; misconduct can lead to delisting.

## 9. Limitation of Liability
Didi Now is not liable for acts/omissions of Experts and does not guarantee availability, punctuality, or outcomes. Liability shall not exceed **₹10,000** per booking.

## 10. Intellectual Property
All rights to the Platform, content, branding, and technology belong to Didi Now or its licensors.

## 11. Privacy
Your personal information is handled per our Privacy Policy. You consent to SMS/email/app communications related to bookings.

## 12. Termination
Either party may terminate use at any time. You remain liable for outstanding payments.

## 13. Grievance Redressal
**Email:** team@didisnow.com  
**Address:** Didi Now Private Limited, Prestige High Fields, Hyderabad – 500032, India  
**Phone:** +91 8008180018 (Mon–Sun, 10:00 a.m.–6:00 p.m.)

## 14. Governing Law & Jurisdiction
Indian law governs; exclusive jurisdiction lies with courts in Hyderabad, Telangana.

## 15. Miscellaneous
We may update these Terms at any time; continued use implies acceptance. Didi Now is not liable for delays due to force-majeure events. GST invoices are issued where applicable.`;