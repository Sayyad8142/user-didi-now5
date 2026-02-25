import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface PriceNoteProps {
  className?: string;
}

export function PriceNote({ className }: PriceNoteProps) {
  const [note, setNote] = useState('Note: this price is not fixed; it may go up or down based on the exact work.');

  useEffect(() => {
    const fetchNote = async () => {
      try {
        const { data } = await supabase.rpc('get_app_setting', { k: 'pricing_note' });
        if (data) {
          setNote(data);
        }
      } catch (error) {
        console.error('Failed to fetch pricing note:', error);
        // Keep default fallback text
      }
    };

    fetchNote();
  }, []);

  return (
    <div className={cn("mt-2 flex items-start gap-2 text-xs text-muted-foreground italic", className)}>
      <Info size={16} className="mt-0.5 flex-shrink-0" />
      
    </div>);

}