import { useEffect, useRef, useState } from 'react';
import { fetchMessages, sendMessage, subscribeMessages } from './api';
import type { BookingMessage } from '@/lib/types';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function ChatSheet({
  open, onOpenChange, booking, mode
}: { 
  open: boolean; 
  onOpenChange: (v: boolean) => void; 
  booking: any; 
  mode: 'user' | 'admin' 
}) {
  const [messages, setMessages] = useState<BookingMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    
    let cleanup: (() => void) | undefined;
    
    fetchMessages(booking.id).then(setMessages).catch(console.error);
    cleanup = subscribeMessages(booking.id, (m) => setMessages(prev => [...prev, m]));
    
    return () => {
      if (cleanup) cleanup();
    };
  }, [open, booking.id]);

  useEffect(() => { 
    endRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [messages]);

  const meIsAdmin = mode === 'admin';

  async function onSend() {
    if (!text.trim() || loading) return;
    const body = text.trim();
    setText('');
    setLoading(true);
    try {
      await sendMessage(booking.id, body, {
        senderRole: meIsAdmin ? 'admin' : 'user',
        senderName: meIsAdmin ? 'Admin' : booking.cust_name ?? null,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle>Chat with Support</SheetTitle>
          <div className="text-xs text-muted-foreground">
            Booking: {booking.service_type} • {booking.community} • {booking.flat_no}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">
              No messages yet. Start the conversation!
            </div>
          )}
          {messages.map(m => {
            const mine = (meIsAdmin && m.sender_role === 'admin') || (!meIsAdmin && m.sender_role === 'user');
            return (
              <div key={m.id} className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                mine 
                  ? "ml-auto bg-gradient-to-r from-[#ff007a] to-[#e6006a] text-white" 
                  : "mr-auto bg-muted text-foreground"
              )}>
                <div className="whitespace-pre-wrap">{m.body}</div>
                <div className={cn("text-[10px] mt-1", 
                  mine ? "text-white/70" : "text-muted-foreground"
                )}>
                  {new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        <div className="p-3 border-t flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            disabled={loading}
          />
          <Button 
            onClick={onSend} 
            disabled={!text.trim() || loading}
            className="bg-gradient-to-r from-[#ff007a] to-[#e6006a] hover:from-[#e6006a] hover:to-[#cc005f] text-white"
          >
            Send
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}