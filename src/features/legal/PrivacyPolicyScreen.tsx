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
        // Fetch markdown content
        const { data: markdownData } = await supabase
          .from('ops_settings')
          .select('value')
          .eq('key', 'privacy_policy_markdown')
          .maybeSingle();

        if (markdownData?.value) {
          setContent(markdownData.value);
        }

        // Check for PDF URL
        const { data: pdfData } = await supabase
          .from('ops_settings')
          .select('value')
          .eq('key', 'privacy_pdf_url')
          .maybeSingle();

        if (pdfData?.value) {
          setPdfUrl(pdfData.value);
        }

        // Get last updated date
        const { data: updatedData } = await supabase
          .from('ops_settings')
          .select('value')
          .in('key', ['privacy_policy_updated_at', 'privacy_pdf_uploaded_at']);

        if (updatedData && updatedData.length > 0) {
          const dates = updatedData
            .map(item => new Date(item.value))
            .filter(date => !isNaN(date.getTime()))
            .sort((a, b) => b.getTime() - a.getTime());
          
          if (dates.length > 0) {
            setLastUpdated(dates[0].toLocaleDateString('en-IN', {
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
      const publicUrl = 'https://didisnow.com/legal/privacy';
      const fallbackUrl = `${window.location.origin}/legal/privacy`;
      
      // Try public URL first, fallback to in-app URL
      await navigator.clipboard.writeText(publicUrl);
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
        html += `<p class="font-semibold text-foreground mb-2">${line.substring(2, line.length - 2)}</p>`;
      } else if (line === '') {
        html += '<br>';
      } else if (line.includes('team@didisnow.com')) {
        html += `<p class="text-muted-foreground mb-3">${line.replace(/team@didisnow\.com/g, '<a href="mailto:team@didisnow.com" class="text-primary underline">team@didisnow.com</a>')}</p>`;
      } else if (line.includes('https://')) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const formattedLine = line.replace(urlRegex, '<a href="$1" class="text-primary underline" target="_blank" rel="noopener noreferrer">$1</a>');
        html += `<p class="text-muted-foreground mb-3">${formattedLine}</p>`;
      } else if (line.length > 0) {
        html += `<p class="text-muted-foreground mb-3">${line}</p>`;
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
        <article className="prose prose-slate max-w-none">
          <div 
            dangerouslySetInnerHTML={{ 
              __html: renderMarkdown(content) 
            }} 
            className="space-y-4"
          />
        </article>

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