import React from "react";
import {
  Sparkles,
  CalendarCheck,
  CreditCard,
  ShieldCheck,
  XCircle,
  Star,
  Users,
  ListChecks,
  LifeBuoy,
} from "lucide-react";

export type FaqItem = { id: string; q: string; a: React.ReactNode };

export type FaqCategory = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: FaqItem[];
};

export const SUPPORT_PHONE = "+918008180018";
export const SUPPORT_PHONE_DISPLAY = "+91 80081 80018";
export const SUPPORT_EMAIL = "team@didisnow.com";

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "general",
    label: "General",
    icon: Sparkles,
    items: [
      {
        id: "g-what",
        q: "What is Didi Now?",
        a: "Didi Now is an instant home services platform that helps you book trusted nearby workers from gated communities for household tasks like dishwashing, sweeping, mopping, bathroom cleaning, kitchen cleaning, dusting, and general home help.",
      },
      {
        id: "g-city",
        q: "Which city is Didi Now available in?",
        a: "Currently Didi Now operates in Hyderabad. We're expanding soon — stay tuned!",
      },
      {
        id: "g-fast",
        q: "How fast can I get a worker?",
        a: "Instant bookings are usually assigned within minutes, depending on worker availability and demand in your community.",
      },
      {
        id: "g-schedule",
        q: "Can I schedule bookings?",
        a: "Yes. You can book instantly or schedule a booking for a later date and time slot that works for you.",
      },
    ],
  },
  {
    id: "booking",
    label: "Booking",
    icon: CalendarCheck,
    items: [
      {
        id: "b-how",
        q: "How do I book a service?",
        a: "Select a service → choose Instant or Scheduled → confirm your booking. A nearby worker is then assigned to you automatically.",
      },
      {
        id: "b-combine",
        q: "Can I combine multiple tasks?",
        a: "Yes. You can combine tasks like utensils, sweeping, mopping, bathroom cleaning, and more in a single booking.",
      },
      {
        id: "b-reject",
        q: "What happens if a worker rejects the booking?",
        a: "The system automatically tries to assign another nearby worker — you don't need to do anything.",
      },
      {
        id: "b-none",
        q: "What if no worker is available?",
        a: "If no worker can be assigned, the booking may auto-cancel and any eligible refund or wallet credit is processed automatically.",
      },
    ],
  },
  {
    id: "payments",
    label: "Payments",
    icon: CreditCard,
    items: [
      {
        id: "p-methods",
        q: "Which payment methods are supported?",
        a: "UPI, debit/credit cards, popular wallets, net banking, and Pay After Service (when eligible).",
      },
      {
        id: "p-pas",
        q: "What is Pay After Service?",
        a: "Eligible users may pay after the work is completed instead of paying upfront. Availability depends on your account and booking type.",
      },
      {
        id: "p-secure",
        q: "Is online payment secure?",
        a: "Yes. All payments are processed securely using trusted payment gateways. We never store your card details.",
      },
    ],
  },
  {
    id: "safety",
    label: "OTP & Safety",
    icon: ShieldCheck,
    items: [
      {
        id: "s-why",
        q: "Why is OTP required?",
        a: "OTP ensures secure booking completion and protects both users and workers from fraud or accidental closures.",
      },
      {
        id: "s-when",
        q: "When should I share the OTP?",
        a: "Only after the work is fully completed to your satisfaction. Never share it before the job is done.",
      },
      {
        id: "s-verified",
        q: "Are workers verified?",
        a: "Workers go through mobile verification, identity verification, and continuous rating monitoring.",
      },
    ],
  },
  {
    id: "cancel",
    label: "Cancellation & Refunds",
    icon: XCircle,
    items: [
      {
        id: "c-cancel",
        q: "Can I cancel a booking?",
        a: "Yes, you can cancel a booking. However, repeated or late cancellations may attract cancellation charges.",
      },
      {
        id: "c-refund",
        q: "Will I receive a refund?",
        a: "Eligible refunds are processed automatically. Wallet refunds are usually instant; bank refunds may take a few business days.",
      },
    ],
  },
  {
    id: "ratings",
    label: "Ratings & Reviews",
    icon: Star,
    items: [
      {
        id: "r-why",
        q: "Why should I give ratings?",
        a: "Ratings help us improve service quality and reward workers who consistently do great work.",
      },
      {
        id: "r-report",
        q: "Can I report bad behavior?",
        a: "Yes. You can report misconduct or any safety concern through the in-app support — we take every report seriously.",
      },
    ],
  },
  {
    id: "workers",
    label: "Worker Questions",
    icon: Users,
    items: [
      {
        id: "w-receive",
        q: "How do workers receive bookings?",
        a: "Bookings are dispatched based on worker availability, ratings, and proximity to your community.",
      },
      {
        id: "w-paid",
        q: "How do workers get paid?",
        a: "Worker payouts are processed digitally after the job is confirmed complete via OTP.",
      },
    ],
  },
  {
    id: "scope",
    label: "Service Scope",
    icon: ListChecks,
    items: [
      {
        id: "sc-included",
        q: "What is included in regular cleaning?",
        a: "Sweeping, mopping, utensils cleaning, and basic dusting — depending on the service you select.",
      },
      {
        id: "sc-excluded",
        q: "What is NOT included?",
        a: "Heavy lifting, dangerous tasks, exterior or high-rise cleaning, childcare, and medical care are not included unless explicitly mentioned in the service.",
      },
    ],
  },
  {
    id: "support",
    label: "Support",
    icon: LifeBuoy,
    items: [
      {
        id: "sup-contact",
        q: "How can I contact support?",
        a: (
          <>
            You can reach Didi Now support at{" "}
            <a href={`tel:${SUPPORT_PHONE}`} className="underline text-primary">
              {SUPPORT_PHONE_DISPLAY}
            </a>{" "}
            or{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline text-primary">
              {SUPPORT_EMAIL}
            </a>
            .
          </>
        ),
      },
    ],
  },
];

// Flat list (backward compatibility for FaqSection / existing imports)
export const FAQS: FaqItem[] = FAQ_CATEGORIES.flatMap((c) => c.items);
