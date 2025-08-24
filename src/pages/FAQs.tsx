import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getPublicFaqs } from "@/lib/data/faqs";
import { FAQS as FALLBACK } from "@/content/faqs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Search } from "lucide-react";

type FaqUI = { id: string; q: string; a: React.ReactNode };

export default function FAQsPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [items, setItems] = useState<FaqUI[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const rows = await getPublicFaqs();
        if (rows.length) {
          setItems(rows.map(r => ({ id: r.id, q: r.question, a: r.answer })));
        } else {
          setItems(FALLBACK.map(x => ({ id: x.id, q: x.q, a: x.a })));
        }
      } catch (error) {
        console.error('Failed to load FAQs:', error);
        setItems(FALLBACK.map(x => ({ id: x.id, q: x.q, a: x.a })));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    if (!searchQuery.trim()) return items;
    
    const query = searchQuery.toLowerCase();
    return items.filter(item => 
      item.q.toLowerCase().includes(query) || 
      String(item.a).toLowerCase().includes(query)
    );
  }, [items, searchQuery]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-4 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Frequently Asked Questions</h1>
            <p className="text-sm text-muted-foreground">
              Find answers to common questions
            </p>
          </div>
        </div>
      </header>

      {/* Search */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search FAQs..."
            className="pl-10 rounded-xl"
          />
        </div>
      </div>

      {/* FAQs Content */}
      <div className="px-4">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-muted-foreground mb-2">
              {searchQuery ? "No FAQs found matching your search" : "No FAQs available"}
            </div>
            {searchQuery && (
              <Button
                variant="outline"
                onClick={() => setSearchQuery("")}
                className="rounded-full"
              >
                Clear search
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Results count */}
            <div className="text-sm text-muted-foreground mb-4">
              {searchQuery && (
                <span>
                  {filteredItems.length} result{filteredItems.length !== 1 ? 's' : ''} found
                </span>
              )}
            </div>

            {/* FAQ Accordion */}
            <Accordion type="single" collapsible className="w-full space-y-2">
              {filteredItems.map((faq, index) => (
                <AccordionItem 
                  key={faq.id} 
                  value={faq.id} 
                  className="bg-card rounded-xl border border-border px-4"
                >
                  <AccordionTrigger className="text-left py-4 hover:no-underline">
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-medium">
                        {index + 1}
                      </span>
                      <span className="font-medium">{faq.q}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 pl-9 text-muted-foreground leading-relaxed">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </>
        )}
      </div>

      {/* Help section */}
      <div className="p-4 mt-8">
        <div className="bg-card rounded-xl p-4 border border-border">
          <h3 className="font-medium mb-2">Still have questions?</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Can't find what you're looking for? Get in touch with our support team.
          </p>
          <Button
            onClick={() => navigate('/support')}
            className="w-full rounded-full"
          >
            Contact Support
          </Button>
        </div>
      </div>
    </div>
  );
}