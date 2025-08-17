import React, { useRef, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface OtpBoxesProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}

export function OtpBoxes({
  length = 6,
  value,
  onChange,
  disabled = false,
  error,
}: OtpBoxesProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  // Initialize refs array
  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, length);
  }, [length]);

  // Auto-focus first empty input
  useEffect(() => {
    const firstEmptyIndex = value.length;
    if (firstEmptyIndex < length && inputRefs.current[firstEmptyIndex]) {
      inputRefs.current[firstEmptyIndex]?.focus();
      setFocusedIndex(firstEmptyIndex);
    }
  }, [value, length]);

  // SMS auto-detection setup
  useEffect(() => {
    // WebOTP API for SMS auto-detection (experimental)
    if (typeof window !== 'undefined' && 'OTPCredential' in window) {
      const ac = new AbortController();
      
      try {
        // @ts-ignore - WebOTP API is experimental
        (navigator.credentials as any).get({
          otp: { transport: ['sms'] },
          signal: ac.signal
        }).then((otp: any) => {
          if (otp?.code) {
            const code = otp.code.replace(/\D/g, '').slice(0, length);
            onChange(code);
          }
        }).catch((err: any) => {
          // Silently handle errors - user can still enter manually
          console.log('Auto OTP detection not available:', err);
        });
      } catch (err) {
        // WebOTP not supported
        console.log('WebOTP API not supported');
      }

      return () => ac.abort();
    }
  }, [length, onChange]);

  const handleChange = (index: number, inputValue: string) => {
    // Only allow digits
    const digit = inputValue.replace(/\D/g, '').slice(-1);
    
    const newValue = value.split('');
    newValue[index] = digit;
    
    // Fill in any gaps with empty strings
    while (newValue.length < length) {
      newValue.push('');
    }
    
    const updatedValue = newValue.join('').slice(0, length);
    onChange(updatedValue);

    // Auto-advance to next input
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
      setFocusedIndex(index + 1);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      if (!value[index] && index > 0) {
        // If current input is empty, go to previous input
        inputRefs.current[index - 1]?.focus();
        setFocusedIndex(index - 1);
      } else {
        // Clear current input
        const newValue = value.split('');
        newValue[index] = '';
        onChange(newValue.join(''));
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
      setFocusedIndex(index - 1);
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
      setFocusedIndex(index + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange(pastedData);
  };

  const handleFocus = (index: number) => {
    setFocusedIndex(index);
  };

  return (
    <div className="space-y-4">
      {/* Hidden input for SMS auto-fill */}
      <input
        ref={hiddenInputRef}
        type="text"
        autoComplete="one-time-code"
        inputMode="numeric"
        style={{ 
          position: 'absolute', 
          left: '-9999px', 
          opacity: 0,
          pointerEvents: 'none' 
        }}
        onChange={(e) => {
          const code = e.target.value.replace(/\D/g, '').slice(0, length);
          if (code.length <= length) {
            onChange(code);
          }
        }}
      />
      
      <div className="flex gap-3 justify-center">
        {Array.from({ length }, (_, index) => (
          <div
            key={index}
            className={cn(
              "relative w-14 h-14 rounded-2xl border-2 transition-all duration-300",
              "bg-background shadow-sm",
              focusedIndex === index && "border-primary ring-4 ring-primary/20 shadow-md",
              error && "border-destructive ring-4 ring-destructive/20",
              value[index] && "border-primary bg-primary/5",
              !value[index] && !error && "border-border hover:border-muted-foreground"
            )}
          >
            <Input
              ref={(el) => (inputRefs.current[index] = el)}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              autoComplete={index === 0 ? "one-time-code" : "off"}
              value={value[index] || ''}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              onFocus={() => handleFocus(index)}
              disabled={disabled}
              className={cn(
                "w-full h-full text-center text-xl font-bold bg-transparent border-0",
                "focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
                "placeholder:text-muted-foreground/30",
                disabled && "cursor-not-allowed opacity-50"
              )}
              placeholder="•"
            />
          </div>
        ))}
      </div>
      
      {error && (
        <div className="text-center">
          <p className="text-sm text-destructive animate-in slide-in-from-top-1 duration-200 flex items-center justify-center gap-1">
            <span className="w-1 h-1 bg-destructive rounded-full"></span>
            {error}
          </p>
        </div>
      )}
      
      <div className="text-center">
        <p className="text-xs text-muted-foreground">
          OTP will auto-fill when received via SMS
        </p>
      </div>
    </div>
  );
}