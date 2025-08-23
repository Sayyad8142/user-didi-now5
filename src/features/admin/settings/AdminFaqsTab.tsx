import { useEffect, useMemo, useState } from "react";
import { adminListFaqs, adminCreateFaq, adminUpdateFaq, adminDeleteFaq, FaqRow } from "@/lib/data/faqs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Pencil, Plus } from "lucide-react";

export default function AdminFaqsTab() {
  const { toast } = useToast();
  const [rows, setRows] = useState<FaqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await adminListFaqs();
      setRows(data);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed to load FAQs", description: e.message });
    } finally { 
      setLoading(false); 
    }
  }

  useEffect(() => { 
    load(); 
  }, []);

  const filtered = useMemo(() => {
    const s = query.toLowerCase();
    return rows.filter(r => r.question.toLowerCase().includes(s) || r.answer.toLowerCase().includes(s));
  }, [rows, query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">FAQs</h3>
        <NewFaqButton onCreated={(r) => setRows(p => [...p, r])} />
      </div>
      <Input placeholder="Search FAQs…" value={query} onChange={(e) => setQuery(e.target.value)} />

      <div className="space-y-3">
        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {!loading && filtered.length === 0 ? <p className="text-sm text-muted-foreground">No FAQs yet.</p> : null}

        {filtered.map(r => (
          <div key={r.id} className="rounded-xl border p-3 bg-background">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">#{r.sort_order}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full border">
                    {r.is_active ? "Active" : "Hidden"}
                  </span>
                </div>
                <h4 className="font-medium mt-1">{r.question}</h4>
                <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{r.answer}</p>
              </div>
              <div className="shrink-0 flex gap-2">
                <EditFaqButton row={r} onUpdated={(nr) => setRows(p => p.map(x => x.id === nr.id ? nr : x))} />
                <Button variant="outline" size="icon"
                  onClick={async () => {
                    if (!confirm("Delete this FAQ?")) return;
                    try { 
                      await adminDeleteFaq(r.id); 
                      setRows(p => p.filter(x => x.id !== r.id)); 
                    }
                    catch (e: any) { 
                      toast({ variant: "destructive", title: "Delete failed", description: e.message }); 
                    }
                  }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewFaqButton({ onCreated }: { onCreated: (r: FaqRow) => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [active, setActive] = useState(true);
  const [order, setOrder] = useState(100);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const created = await adminCreateFaq({ question: q, answer: a, is_active: active, sort_order: order });
      onCreated(created);
      setOpen(false);
      setQ(""); 
      setA(""); 
      setOrder(100); 
      setActive(true);
      toast({ title: "FAQ added" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Save failed", description: e.message });
    } finally { 
      setSaving(false); 
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 mr-2" /> New FAQ</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add FAQ</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Question</Label>
            <Input value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div>
            <Label>Answer</Label>
            <Textarea value={a} onChange={e => setA(e.target.value)} className="min-h-[120px]" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Label>Active</Label>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
            <div className="flex items-center gap-2">
              <Label>Order</Label>
              <Input type="number" value={order} onChange={e => setOrder(parseInt(e.target.value || "0"))} className="w-24" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving || !q.trim() || !a.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditFaqButton({ row, onUpdated }: { row: FaqRow; onUpdated: (r: FaqRow) => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(row.question);
  const [a, setA] = useState(row.answer);
  const [active, setActive] = useState(row.is_active);
  const [order, setOrder] = useState(row.sort_order);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await adminUpdateFaq(row.id, { question: q, answer: a, is_active: active, sort_order: order });
      onUpdated(updated);
      setOpen(false);
      toast({ title: "FAQ updated" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Update failed", description: e.message });
    } finally { 
      setSaving(false); 
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <Pencil className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit FAQ</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Question</Label>
            <Input value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div>
            <Label>Answer</Label>
            <Textarea value={a} onChange={e => setA(e.target.value)} className="min-h-[120px]" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Label>Active</Label>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
            <div className="flex items-center gap-2">
              <Label>Order</Label>
              <Input type="number" value={order} onChange={e => setOrder(parseInt(e.target.value || "0"))} className="w-24" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving || !q.trim() || !a.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}