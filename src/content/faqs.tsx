import React from "react";

export type FaqItem = { id: string; q: string; a: React.ReactNode };

export const FAQS: FaqItem[] = [
  { id: "what", q: "What is Didi Now?", a: "Didi Now is an on-demand home service platform where you can book trusted professionals for services like maid and bathroom cleaning at your convenience." },
  { id: "city", q: "Which city is Didi Now available in?", a: "Currently, Didi Now is available only in Hyderabad." },
  { id: "book", q: "How do I book a service?", a: "Open the app, choose a service, select Instant or Scheduled booking, enter your address, and confirm your booking." },
  { id: "instant-vs-schedule", q: "What is the difference between Instant and Scheduled booking?", a: "Instant booking is for immediate service when a worker is available. Scheduled booking lets you choose your preferred date and time slot." },
  { id: "services", q: "Which services are available on Didi Now?", a: "Currently, Didi Now offers Maid services and Bathroom Cleaning services." },
  { id: "assign", q: "How are workers assigned?", a: "Available nearby workers are notified, and the most suitable worker is assigned based on availability and service area." },
  { id: "pay", q: "How do I pay?", a: "You can pay through the available payment options shown in the app during booking or after service, depending on the booking flow." },
  { id: "cancel", q: "Can I cancel or reschedule a booking?", a: "Yes, you can cancel or reschedule based on the booking status and app rules. Applicable charges may apply in some cases." },
  { id: "unhappy", q: "What if I am not satisfied with the service?", a: "You can contact support and share your issue. The team will review it and help resolve it as quickly as possible." },
  { id: "support", q: "How can I contact support?", a: <>You can reach Didi Now support at <a href="tel:+918008180018" className="underline">+91 8008180018</a> or <a href="mailto:team@didisnow.com" className="underline">team@didisnow.com</a>.</> },
];
