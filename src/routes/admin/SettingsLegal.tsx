import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const DEFAULT_PP = `# Privacy Policy
Effective: 19 Aug 2025

We collect your name, phone, community and flat number, and booking details to provide household services. We do not sell data. Workers receive only the details needed to complete the service. You can request deletion in-app or by email (support@didinow.com). Data is encrypted in transit and protected by row-level security.`;

const DEFAULT_TOS = `# Terms of Service
Effective: 19 Aug 2025

Didi Now connects you with household service providers. Prices vary by selections. Payments may be done via UPI in external apps. Please cancel promptly if not needed. Treat workers with respect. Liability is limited to amounts paid for the affected booking.`;

function mdToHtml(md: string) {
  // Minimal markdown → HTML (headers + paragraphs)
  const esc = (s:string)=>s.replace(/[&<>"]/g,(c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c] as string));
  return (
    '<!doctype html><meta charset="utf-8" />' +
    '<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto;max-width:720px;margin:24px auto;padding:0 16px;line-height:1.6}h1{font-size:1.6rem}h2{font-size:1.2rem;margin-top:1rem}pre{white-space:pre-wrap}</style>' +
    esc(md)
      .replace(/^# (.*)$/gm, '<h1>$1</h1>')
      .replace(/^## (.*)$/gm, '<h2>$1</h2>')
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/^/, '<p>')
      .concat('</p>')
  );
}

export default function SettingsLegal() {
  const [privacy, setPrivacy] = useState(DEFAULT_PP);
  const [terms, setTerms] = useState(DEFAULT_TOS);
  const [privacyUrl, setPrivacyUrl] = useState<string>("");
  const [termsUrl, setTermsUrl] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      // load latest URLs if saved
      const { data: ops } = await supabase.from("ops_settings").select("key,value").in("key", ["privacy_url","terms_url"]);
      ops?.forEach((r:any)=> {
        if (r.key === "privacy_url") setPrivacyUrl(r.value);
        if (r.key === "terms_url") setTermsUrl(r.value);
      });

      // try to fetch existing files to seed editors (optional)
      try {
        if (privacyUrl) {
          const res = await fetch(privacyUrl); if (res.ok) setPrivacy(await res.text());
        }
        if (termsUrl) {
          const res2 = await fetch(termsUrl); if (res2.ok) setTerms(await res2.text());
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function publish(kind: "privacy" | "terms") {
    setSaving(true);
    try {
      const html = mdToHtml(kind === "privacy" ? privacy : terms);
      const file = new File([html], `${kind}.html`, { type: "text/html" });
      const path = `${kind}.html`;

      // Upload (upsert) to 'legal' bucket
      const { error: upErr } = await supabase.storage.from("legal").upload(path, file, { upsert: true, contentType: "text/html" });
      if (upErr && upErr.message && !upErr.message.includes("The resource already exists")) throw upErr;

      // Get public URL
      const { data: pub } = supabase.storage.from("legal").getPublicUrl(path);
      const url = pub?.publicUrl || "";

      // Save to ops_settings
      if (url) {
        await supabase.from("ops_settings").upsert({ key: `${kind}_url`, value: url });
        if (kind === "privacy") setPrivacyUrl(url); else setTermsUrl(url);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-background border shadow-sm p-4">
        <div className="mb-2 text-lg font-semibold">Privacy Policy</div>
        <Textarea value={privacy} onChange={(e)=>setPrivacy(e.target.value)} rows={12} />
        <div className="mt-2 flex items-center gap-2">
          <Button onClick={()=>publish("privacy")} disabled={saving} className="bg-primary text-primary-foreground">
            {saving ? "Publishing…" : "Publish to public URL"}
          </Button>
          <Input readOnly value={privacyUrl || ""} placeholder="Published URL will appear here" className="flex-1" />
        </div>
      </section>

      <section className="rounded-2xl bg-background border shadow-sm p-4">
        <div className="mb-2 text-lg font-semibold">Terms of Service</div>
        <Textarea value={terms} onChange={(e)=>setTerms(e.target.value)} rows={12} />
        <div className="mt-2 flex items-center gap-2">
          <Button onClick={()=>publish("terms")} disabled={saving} className="bg-primary text-primary-foreground">
            {saving ? "Publishing…" : "Publish to public URL"}
          </Button>
          <Input readOnly value={termsUrl || ""} placeholder="Published URL will appear here" className="flex-1" />
        </div>
      </section>

      <p className="text-xs text-muted-foreground">Copy these URLs into App Store Connect and Google Play Console. You can update content anytime and click Publish again.</p>
    </div>
  );
}