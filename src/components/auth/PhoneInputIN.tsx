import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface PhoneInputINProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}

export function PhoneInputIN({
  value,
  onChange,
  placeholder = "Enter mobile number",
  error,
  disabled = false,
  required = false,
}: PhoneInputINProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value.replace(/\D/g, ''); // Only digits
    if (inputValue.length <= 10) {
      onChange(inputValue);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="phone" className="text-sm font-medium text-foreground">
        Mobile Number {required && <span className="text-destructive">*</span>}
      </Label>
      <div className="relative">
        <div className="flex rounded-xl border border-border bg-input shadow-input transition-smooth focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary">
          {/* +91 Prefix Chip */}
          <div className="flex items-center px-3 py-2 bg-muted/50 rounded-l-xl border-r border-border">
            <span className="text-sm font-medium text-muted-foreground">+91</span>
          </div>
          
          {/* Phone Number Input */}
          <Input
            id="phone"
            type="tel"
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={10}
            className={cn(
              "border-0 rounded-l-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent",
              "text-base font-medium placeholder:text-muted-foreground/60"
            )}
          />
        </div>
        
        {error && (
          <p className="text-sm text-destructive mt-1 animate-in slide-in-from-top-1 duration-200">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}