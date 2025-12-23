import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface Flat {
  id: string;
  flat_no: string;
}

interface FlatSearchInputProps {
  flats: Flat[];
  value: string;
  onSelect: (flatId: string, flatNo: string) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  placeholder?: string;
}

export function FlatSearchInput({
  flats,
  value,
  onSelect,
  disabled,
  loading,
  error,
  placeholder = "Enter your flat number"
}: FlatSearchInputProps) {
  const [searchTerm, setSearchTerm] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter flats based on search term
  const filteredFlats = flats.filter(flat =>
    flat.flat_no.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update search term when value prop changes
  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchTerm(newValue);
    setIsOpen(true);
    
    // Always clear selection when typing - user must select from dropdown
    // Only keep selection if the typed value exactly matches a flat
    const exactMatch = flats.find(f => f.flat_no.toLowerCase() === newValue.toLowerCase());
    if (exactMatch) {
      onSelect(exactMatch.id, exactMatch.flat_no);
    } else {
      onSelect('', '');
    }
  };

  const handleSelectFlat = (flat: Flat) => {
    setSearchTerm(flat.flat_no);
    onSelect(flat.id, flat.flat_no);
    setIsOpen(false);
  };

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label htmlFor="flat-search" className="text-sm font-medium">
        Flat No <span className="text-destructive">*</span>
      </Label>
      <div className="relative">
        <Input
          id="flat-search"
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={loading ? "Loading flats..." : placeholder}
          disabled={disabled || loading}
          className={cn(
            "rounded-xl shadow-input transition-smooth focus:ring-2 focus:ring-primary/20",
            error && "border-destructive"
          )}
        />
        
        {/* Dropdown list */}
        {isOpen && searchTerm && filteredFlats.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-xl shadow-lg overflow-hidden">
            <ScrollArea className="max-h-[200px]">
              <div className="p-1">
                {filteredFlats.map((flat) => (
                  <button
                    key={flat.id}
                    type="button"
                    onClick={() => handleSelectFlat(flat)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      "focus:bg-accent focus:text-accent-foreground focus:outline-none",
                      flat.flat_no === value && "bg-primary/10 text-primary font-medium"
                    )}
                  >
                    {flat.flat_no}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* No results message */}
        {isOpen && searchTerm && filteredFlats.length === 0 && flats.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-xl shadow-lg p-3">
            <p className="text-sm text-muted-foreground text-center">
              No flats found matching "{searchTerm}"
            </p>
          </div>
        )}
      </div>
      
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
