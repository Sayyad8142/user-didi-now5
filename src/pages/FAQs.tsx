import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FAQ_CATEGORIES,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
  SUPPORT_PHONE_DISPLAY,
  type FaqItem,
} from "@/content/faqs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Search,
  Phone,
  Mail,
  Copy,
  MessageCircle,
  X,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type CategoryId = (typeof FAQ_CATEGORIES)[number]["id"];

export default function FAQsPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCat, setActiveCat] = useState<CategoryId>(FAQ_CATEGORIES[0].id);

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  const searchResults = useMemo(() => {
    if (!isSearching) return [] as Array<FaqItem & { categoryLabel: string }>;
    const out: Array<FaqItem & { categoryLabel: string }> = [];
    for (const cat of FAQ_CATEGORIES) {
      for (const item of cat.items) {
        const hay = `${item.q} ${typeof item.a === "string" ? item.a : ""}`.toLowerCase();
        if (hay.includes(trimmedQuery)) {
          out.push({ ...item, categoryLabel: cat.label });
        }
      }
    }
    return out;
  }, [trimmedQuery, isSearching]);

  const activeCategory = FAQ_CATEGORIES.find((c) => c.id === activeCat)!;

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      toast({ title: "Email copied", description: SUPPORT_EMAIL });
    } catch {
      toast({ title: "Could not copy", description: SUPPORT_EMAIL });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50/40 via-background to-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="rounded-full"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight truncate">
              Help Center
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              Answers, safety & support
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search help articles..."
              className="pl-10 pr-10 h-11 rounded-2xl bg-white/90 border-border/80"
            />
            {isSearching && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Category chips (hidden during search) */}
        {!isSearching && (
          <div className="px-4 pb-3 -mx-1 overflow-x-auto scrollbar-none">
            <div className="flex gap-2 px-1 min-w-max">
              {FAQ_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const active = cat.id === activeCat;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCat(cat.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 h-9 rounded-full border text-sm whitespace-nowrap transition-all",
                      active
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-white/80 text-foreground border-border hover:bg-white"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* Body */}
      <div className="px-4 pt-4">
        {isSearching ? (
          searchResults.length === 0 ? (
            <EmptyState onClear={() => setSearchQuery("")} />
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3">
                {searchResults.length} result
                {searchResults.length !== 1 ? "s" : ""} for "{searchQuery}"
              </p>
              <FaqList
                items={searchResults.map((r) => ({
                  ...r,
                  q: r.q,
                  a: (
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-primary/80 mb-1 font-medium">
                        {r.categoryLabel}
                      </div>
                      {r.a}
                    </div>
                  ),
                }))}
              />
            </>
          )
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <activeCategory.icon className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">
                {activeCategory.label}
              </h2>
              <span className="text-xs text-muted-foreground">
                · {activeCategory.items.length} article
                {activeCategory.items.length !== 1 ? "s" : ""}
              </span>
            </div>
            <FaqList items={activeCategory.items} />
          </>
        )}

        {/* Support card */}
        <div className="mt-8 rounded-2xl bg-gradient-to-br from-primary/10 to-pink-100/40 border border-primary/20 p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <MessageCircle className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground">
                Still need help?
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Our team is here for you, every day.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <a
              href={`tel:${SUPPORT_PHONE}`}
              className="flex flex-col items-center justify-center gap-1 h-16 rounded-xl bg-white border border-border hover:bg-pink-50 transition"
            >
              <Phone className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium">Call us</span>
            </a>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="flex flex-col items-center justify-center gap-1 h-16 rounded-xl bg-white border border-border hover:bg-pink-50 transition"
            >
              <Mail className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium">Email</span>
            </a>
          </div>

          <div className="mt-3 space-y-2">
            <button
              onClick={copyEmail}
              className="w-full flex items-center justify-between gap-2 px-3 h-10 rounded-xl bg-white border border-border text-xs"
            >
              <span className="flex items-center gap-2 text-muted-foreground truncate">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{SUPPORT_EMAIL}</span>
              </span>
              <span className="flex items-center gap-1 text-primary font-medium shrink-0">
                <Copy className="h-3.5 w-3.5" /> Copy
              </span>
            </button>
            <div className="w-full flex items-center justify-between gap-2 px-3 h-10 rounded-xl bg-white border border-border text-xs">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />
                {SUPPORT_PHONE_DISPLAY}
              </span>
              <span className="text-muted-foreground">7 AM – 7 PM</span>
            </div>
          </div>

          <Button
            onClick={() => navigate("/support")}
            className="w-full mt-3 rounded-xl"
          >
            Open Live Support
          </Button>
        </div>
      </div>
    </div>
  );
}

function FaqList({ items }: { items: FaqItem[] }) {
  if (items.length === 0) return null;
  return (
    <Accordion type="single" collapsible className="w-full space-y-2">
      {items.map((faq) => (
        <AccordionItem
          key={faq.id}
          value={faq.id}
          className="bg-white/90 rounded-2xl border border-border/70 px-4 shadow-sm"
        >
          <AccordionTrigger className="text-left py-4 hover:no-underline">
            <span className="font-medium text-sm text-foreground pr-3">
              {faq.q}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-4 text-sm text-muted-foreground leading-relaxed">
            {faq.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="text-center py-12 px-6 bg-white/80 rounded-2xl border border-border/70">
      <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
        <Search className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="font-medium text-foreground">No matches found</h3>
      <p className="text-xs text-muted-foreground mt-1 mb-4">
        Try a different keyword or browse by category.
      </p>
      <Button variant="outline" onClick={onClear} className="rounded-full">
        Clear search
      </Button>
    </div>
  );
}
