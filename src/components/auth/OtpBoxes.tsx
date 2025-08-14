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
      <div className="flex gap-3 justify-center">
        {Array.from({ length }, (_, index) => (
          <Input
            key={index}
            ref={(el) => (inputRefs.current[index] = el)}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={value[index] || ''}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            onFocus={() => handleFocus(index)}
            disabled={disabled}
            className={cn(
              "w-12 h-12 text-center text-lg font-bold rounded-xl",
              "border-2 transition-all duration-200",
              "focus:ring-2 focus:ring-primary/30 focus:border-primary",
              focusedIndex === index && "border-primary ring-2 ring-primary/20",
              error && "border-destructive",
              value[index] && "bg-primary/5 border-primary/50"
            )}
          />
        ))}
      </div>
      
      {error && (
        <p className="text-sm text-destructive text-center animate-in slide-in-from-top-1 duration-200">
          {error}
        </p>
      )}
    </div>
  );
}