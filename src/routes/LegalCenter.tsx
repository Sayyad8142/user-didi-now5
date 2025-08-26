import { useMemo, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const PP = `
# Privacy Policy
**Effective:** 19 Aug 2025

Didi Now ("we", "our", "us") provides household service bookings (maids, cooks, bathroom cleaning).

## Data we collect
- **Account info:** name, phone number
- **Address:** community name, flat number
- **Bookings:** service type, date/time, price, status
- **App data:** device info & diagnostics (only to run the app)
- **Workers:** the assigned worker for your booking will see your name, community, and flat number to fulfill the service.

## How we use data
- To create and manage bookings
- To notify admins for assignment and status updates
- To provide customer support and safety
- To improve reliability and prevent abuse

## Sharing
- We do **not** sell your data.
- We share your booking **only** with the assigned worker and internal staff to complete the service.

## Retention & deletion
- We keep your data while your account is active.
- You may request deletion at any time from **Profile → Delete Account** (coming soon) or by email.

## Security
- Data is encrypted in transit. Database access is restricted with row-level security.
- No third-party ad tracking SDKs.

## Children
- This app is intended for adults. Do not use if you are under the age of majority.

## Changes
- We may update this policy. We'll post the new date at the top.

## Contact
- Email: support@didinow.com
- Phone: 8008180018
`;

const TOS = `
# Terms of Service
**Effective:** 19 Aug 2025

Welcome to Didi Now. By using the app, you agree to these terms.

## Service
We connect you with household service providers (maids, cooks, bathroom cleaners). We aim for ~10 minute response for instant bookings.

## Bookings & Pricing
Prices are shown in the app and may vary by flat size, selected tasks, community, or time. Scheduled bookings occur at your chosen date/time.

## Payments
Payments to workers may be completed via UPI (PhonePe/GPay/Paytm). These are **real-world services**, not digital in-app content. Didi Now does not process or store your UPI credentials.

## Cancellations
Please cancel promptly if you no longer need the service. Late cancellations may still incur a charge based on work already started.

## Conduct
Treat workers with respect. We may suspend accounts that abuse the service or staff.

## Liability
To the maximum extent permitted by law, Didi Now is not liable for indirect or incidental damages. Our total liability is limited to the amounts you paid for the affected booking.

## Disputes
Governing law: India. You agree to resolve disputes in the courts within our principal place of business.

## Changes
We may update these terms. Continued use means you accept the updated terms.

## Contact
- Email: support@didinow.com
- Phone: 8008180018
`;

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function LegalCenter() {
  const q = useQuery();
  const nav = useNavigate();
  const tab = (q.get("tab") || "privacy") as "privacy" | "terms";
  const [pdfUrl, setPdfUrl] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Get the PDF URL from the admin_get_legal_pdfs function
        const { data, error } = await supabase.rpc('admin_get_legal_pdfs');
        
        if (!cancelled && !error && data?.[0]) {
          const url = tab === "privacy" ? data[0].privacy_url : data[0].terms_url;
          setPdfUrl(url || "");
        } else {
          setPdfUrl("");
        }
      } catch (err) {
        console.error('Error loading PDF URL:', err);
        if (!cancelled) setPdfUrl("");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tab]);

  return (
    <div className="min-h-dvh bg-rose-50/40 p-4">
      <header className="mb-4 flex items-center gap-2">
        <button onClick={() => nav(-1)} className="h-9 w-9 rounded-full border grid place-items-center">←</button>
        <div>
          <div className="text-2xl font-bold text-[#ff007a]">Legal</div>
          <div className="text-xs text-gray-500">Policies & Terms</div>
        </div>
      </header>

      <nav className="mb-3 flex gap-2">
        <button
          className={cn(
            "px-3 py-2 rounded-xl text-sm border",
            tab === "privacy" ? "bg-[#ff007a] text-white border-[#ff007a]" : "bg-white border-gray-200"
          )}
          onClick={() => nav(`/legal?tab=privacy`, { replace: true })}
        >
          Privacy Policy
        </button>
        <button
          className={cn(
            "px-3 py-2 rounded-xl text-sm border",
            tab === "terms" ? "bg-[#ff007a] text-white border-[#ff007a]" : "bg-white border-gray-200"
          )}
          onClick={() => nav(`/legal?tab=terms`, { replace: true })}
        >
          Terms of Service
        </button>
      </nav>

      {pdfUrl ? (
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <iframe
            title={tab === "privacy" ? "Privacy Policy" : "Terms of Service"}
            src={pdfUrl}
            className="w-full"
            style={{ height: "80vh", border: "0" }}
          />
        </div>
      ) : (
        <article className="bg-white rounded-2xl shadow p-4 prose prose-sm max-w-none">
          <pre className="whitespace-pre-wrap leading-relaxed text-gray-800">
{tab === "privacy" ? PP : TOS}
          </pre>
        </article>
      )}
    </div>
  );
}