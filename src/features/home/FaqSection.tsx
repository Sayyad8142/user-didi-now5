import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FAQ_CATEGORIES } from "@/content/faqs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const PREVIEW_FAQ_IDS = ["g-what", "g-fast", "g-schedule", "s-when"];

export default function FaqSection() {
  const navigate = useNavigate();

  const previewItems = useMemo(() => {
    const out: Array<{ id: string; q: string; a: React.ReactNode }> = [];
    for (const cat of FAQ_CATEGORIES) {
      for (const item of cat.items) {
        if (PREVIEW_FAQ_IDS.includes(item.id)) {
          out.push({ id: item.id, q: item.q, a: item.a });
        }
      }
    }
    // Preserve the requested order
    return PREVIEW_FAQ_IDS.map((id) => out.find((x) => x.id === id)!).filter(Boolean);
  }, []);

  return (
    <section className="mt-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">FAQs</h2>
          <p className="text-xs text-muted-foreground">Quick answers to common questions</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/faqs")}
          className="text-primary font-medium rounded-full hover:bg-primary/5 -mr-2"
        >
          See all
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </div>

      <Accordion type="single" collapsible className="w-full space-y-2">
        {previewItems.map((faq) => (
          <AccordionItem
            key={faq.id}
            value={faq.id}
            className="bg-white/90 rounded-2xl border border-border/70 px-4 shadow-sm"
          >
            <AccordionTrigger className="text-left py-3.5 hover:no-underline">
              <span className="font-medium text-sm text-foreground pr-3 leading-snug">
                {faq.q}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-4 text-sm text-muted-foreground leading-relaxed">
              {faq.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
