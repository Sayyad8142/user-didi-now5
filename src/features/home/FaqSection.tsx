import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getPublicFaqs } from "@/lib/data/faqs";
import { FAQS as FALLBACK } from "@/content/faqs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

type FaqUI = { id: string; q: string; a: React.ReactNode };

export default function FaqSection() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FaqUI[] | null>(null);

  useEffect(() => {
    (async () => {
      const rows = await getPublicFaqs();
      if (rows.length) {
        setItems(rows.map(r => ({ id: r.id, q: r.question, a: r.answer })));
      } else {
        setItems(FALLBACK.map(x => ({ id: x.id, q: x.q, a: x.a })));
      }
    })();
  }, []);

  if (!items) return null;

  const top = items.slice(0, 6);

  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">FAQs</h2>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => navigate('/faqs')}
        >
          See all FAQs
        </Button>
      </div>

      <Accordion type="single" collapsible className="w-full rounded-xl bg-white/70 p-2">
        {top.map((f) => (
          <AccordionItem key={f.id} value={f.id} className="border-none">
            <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
