import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ExternalLink, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function PrivacyPolicyScreen() {
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
        // Fetch markdown content using RPC
        const { data: markdownData, error: markdownError } = await supabase
          .rpc('get_app_setting', { k: 'privacy_policy_markdown' });

        if (markdownError) {
          console.error('Error fetching privacy policy markdown:', markdownError);
        } else if (markdownData) {
          setContent(markdownData);
        }

        // Check for PDF URL using RPC
        const { data: pdfData, error: pdfError } = await supabase
          .rpc('get_app_setting', { k: 'privacy_pdf_url' });

        if (pdfError) {
          console.error('Error fetching PDF URL:', pdfError);
        } else if (pdfData) {
          setPdfUrl(pdfData);
        }

        // Get last updated date using RPC
        const { data: updatedData, error: updatedError } = await supabase
          .rpc('get_app_setting', { k: 'privacy_policy_updated_at' });

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
      } catch (error) {
        console.error('Error fetching privacy policy:', error);
        toast({
          title: "Error",
          description: "Failed to load privacy policy content",
          variant: "destructive"
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
        description: "Privacy policy link copied to clipboard"
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
    // Use marked to parse markdown and DOMPurify to sanitize HTML
    const { marked } = require('marked');
    const DOMPurify = require('dompurify');
    
    // Configure marked options
    marked.setOptions({
      breaks: true,
      gfm: true
    });
    
    // Parse markdown to HTML
    const rawHTML = marked.parse(markdown);
    
    // Sanitize HTML to prevent XSS attacks
    const cleanHTML = DOMPurify.sanitize(rawHTML, {
      ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'div'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class']
    });
    
    return cleanHTML;
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
            
            <div className="flex-1">
              <h1 className={`font-bold text-foreground transition-all duration-200 ${
                isScrolled ? 'text-lg' : 'text-2xl'
              }`}>
                Privacy Policy
              </h1>
              {!isScrolled && (
                <p className="text-sm text-muted-foreground">
                  How we protect your data
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
        {!content ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">Policy coming soon.</p>
            <p className="text-sm text-muted-foreground mt-2">
              We're working on updating our privacy policy. Please check back soon.
            </p>
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