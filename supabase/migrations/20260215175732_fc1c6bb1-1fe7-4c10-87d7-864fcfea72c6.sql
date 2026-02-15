-- Clean up existing profiles where full_name is a phone number
UPDATE profiles
SET full_name = 'User ' || RIGHT(phone, 4)
WHERE full_name ~ '^\+?\d{7,15}$';
