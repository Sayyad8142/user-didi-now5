-- Create a safe, read-only function to fetch public settings
CREATE OR REPLACE FUNCTION public.get_app_setting(k text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value
  FROM public.ops_settings
  WHERE key = k
    AND key IN (
      'privacy_policy_markdown',
      'privacy_pdf_url',
      'privacy_policy_updated_at'
    )
$$;

-- Grant execute permissions to all users
GRANT EXECUTE ON FUNCTION public.get_app_setting(text) TO anon, authenticated;

-- Seed the privacy policy markdown with the updated content
INSERT INTO public.ops_settings(key, value) VALUES
('privacy_policy_markdown', 
'# Privacy Policy
**Effective:** 19 Aug 2025

This Privacy Policy governs the use of the Didi Now mobile app and web platform operated by **Didi Now Private Limited**.

## 1. Information We Collect
- Personal details: name, address, phone, email, UPI ID.
- Residential details: flat size, family size, etc.
- Usage data: logins, bookings, app interactions.
- Device & access info: IP, browser/OS.
- Location data (if you grant permission).

## 2. How We Use Your Information
Provide and improve services; match with service experts; process payments; send notifications; support; legal compliance; analytics.

## 3. Sharing of Information
We do **not** sell or rent data. We may share with: service experts, service providers (hosting, payments), legal authorities when required, or others with your consent.

## 4. Cookies & Tracking
We may use cookies or similar tech for experience and analytics. You can control cookies in your browser.

## 5. Data Retention
We retain data while your account is active or as needed. Request deletion at **team@didisnow.com**.

## 6. Data Security
We use reasonable safeguards, but no internet transmission is 100% secure.

## 7. Your Rights
Access/correct data, withdraw consent, request deletion via **team@didisnow.com**.

## 8. Third-Party Links
External sites are outside our control and policies.

## 9. Children''s Privacy
Not directed to children under 18.

## 10. Changes
We may update this Policy; continued use means acceptance.

## 11. Grievance Officer
**Grievance Officer**  
Didi Now Private Limited, Prestige High Fields, Hyderabad – 500032  
Email: **team@didisnow.com** · Phone: **+91 8008180018**

## 12. Contact
Email: **team@didisnow.com** · Phone: **+91 8008180018**
')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Update the timestamp
INSERT INTO public.ops_settings(key, value)
VALUES ('privacy_policy_updated_at', now()::text)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;