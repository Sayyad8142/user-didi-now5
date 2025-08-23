import { useMemo, useState } from "react";
import { FAQS } from "@/content/faqs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function FaqSection() {
  const [openAll, setOpenAll] = useState(false);
  const top = FAQS.slice(0, 6);

  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">FAQs</h2>
        <Sheet open={openAll} onOpenChange={setOpenAll}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">See all FAQs</Button>
          </SheetTrigger>
          <FaqSheet />
        </Sheet>
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

function FaqSheet() {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return FAQS.filter(item => item.q.toLowerCase().includes(s) || String(item.a).toLowerCase().includes(s));
  }, [q]);

  return (
    <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
      <SheetHeader>
        <SheetTitle>Frequently Asked Questions</SheetTitle>
      </SheetHeader>
      <div className="mt-3 space-y-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search FAQs…" />
        <Accordion type="single" collapsible className="w-full">
          {filtered.map((f) => (
            <AccordionItem key={f.id} value={f.id} className="border-b">
              <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </SheetContent>
  );
}