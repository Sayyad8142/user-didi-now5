import React from "react";

export type FaqItem = { id: string; q: string; a: React.ReactNode };

export const FAQS: FaqItem[] = [
  { id: "what", q: "What is Didi Now?", a: <>A quick home-services app for <b>maid, cook, and bathroom cleaning</b>. Instant help in ~10 mins or schedule for later.</> },
  { id: "signup", q: "How do I sign up?", a: <>Enter your <b>mobile number</b>, verify the <b>OTP</b>, and complete your <b>profile</b> (Community & Flat No.).</> },
  { id: "otp", q: "I didn't receive the OTP. What can I do?", a: <>Check network/SMS block → wait 30–60s → tap <b>Resend OTP</b>. If still stuck, call support: <a href="tel:8008180018" className="underline">8008180018</a>.</> },
  { id: "why-address", q: "Why do you ask for Community & Flat No.?", a: <>So the worker can reach the correct address quickly. Update anytime in <b>Profile</b>.</> },

  { id: "book", q: "How do I book a service?", a: <>Home → choose a service → select options → <b>Book Now</b> (instant) or <b>Schedule</b> (pick date & time).</> },
  { id: "instant-vs-schedule", q: "Instant vs Schedule?", a: <><b>Instant:</b> assign ASAP (~10 mins). <b>Schedule:</b> pick a future date/time; you'll get a reminder.</> },
  { id: "maid-tasks", q: "Maid service: what tasks are included?", a: <>Choose <b>Floor Cleaning (Jhaadu & Pocha)</b> and/or <b>Dish Washing</b>. Select one or both.</> },
  { id: "maid-pricing", q: "How is maid pricing calculated?", a: <>By <b>flat size</b> + <b>selected tasks</b>. Example: 2BHK ₹100 per task, 3BHK ₹120 per task, etc. Total = sum of chosen tasks.</> },

  { id: "cook-details", q: "Cook service: what details needed?", a: <>Select <b>family count</b> and <b>food preference</b> (Veg/Non-Veg).</> },
  { id: "cook-pricing", q: "How is cook pricing calculated?", a: <>Base (e.g., ₹200) + <b>₹50 for Non-Veg</b> + <b>₹20 per extra person</b>. Total shown before booking.</> },

  { id: "bath-book", q: "How do I book bathroom cleaning?", a: <>Choose the <b>number of bathrooms</b>. Price updates automatically.</> },

  { id: "pay", q: "How do I pay?", a: <>Tap <b>Pay Now</b> after assignment → choose your UPI app (PhonePe/GPay/Paytm). The worker's UPI ID is pre-filled.</> },
  { id: "receipt", q: "Do I get a receipt?", a: <>UPI shows the payment receipt. Booking details appear in <b>Bookings → History</b>.</> },

  { id: "who", q: "How do I know who's coming?", a: <>After assignment, you'll see the <b>worker's name, rating</b>, and a call option if enabled.</> },
  { id: "arrival", q: "When will the worker arrive?", a: <>Instant aims for <b>~10 minutes</b>. Scheduled aims for your chosen time (you'll get a reminder).</> },
  { id: "support", q: "I need to contact support.", a: <>Tap <b>Call Support</b> on the booking card or call <a href="tel:8008180018" className="underline">8008180018</a>.</> },

  { id: "reschedule", q: "Can I reschedule or cancel?", a: <>Yes—open the booking and use <b>Reschedule</b> or <b>Cancel</b> (please cancel early).</> },
  { id: "rate", q: "How do ratings work?", a: <>After service, rate the worker from the booking card. It helps improve matching.</> },
  { id: "unhappy", q: "I'm unhappy with the service.", a: <>Rate the booking and call <a href="tel:8008180018" className="underline">8008180018</a>. We'll help.</> },

  { id: "privacy", q: "How is my data used?", a: <>We store basic contact & address to deliver services. Encrypted, protected with <b>row-level security</b>. We don't sell data.</> },
  { id: "update-profile", q: "Can I update my profile/community?", a: <>Yes—go to <b>Profile</b> to edit name, phone, community, and flat number.</> },
  { id: "data-rights", q: "Can I download or delete my data?", a: <>Yes—<b>Profile → Data & Privacy</b> (export or delete), or email <a href="mailto:support@didisnow.com" className="underline">support@didisnow.com</a>.</> },

  { id: "stuck", q: "App looks stuck or doesn't update.", a: <>Pull-to-refresh on <b>Bookings</b> or reopen the app; check internet connection.</> },
  { id: "upi-fail", q: "UPI didn't open / payment failed.", a: <>Try another UPI app and stable internet. If it still fails, call <a href="tel:8008180018" className="underline">8008180018</a>.</> },

  { id: "hours", q: "What are service hours?", a: <>Daily: <b>6:00 AM – 7:00 PM</b>. Target arrival for instant: <b>~10 minutes</b>.</> },
];