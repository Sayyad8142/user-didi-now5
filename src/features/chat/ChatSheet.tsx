import { useEffect, useRef, useState } from 'react';
import { fetchMessages, sendMessage, subscribeMessages } from './api';
import type { BookingMessage } from '@/lib/types';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Phone, User, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
export default function ChatSheet({
  open,
  onOpenChange,
  booking,
  mode
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  booking: any;
  mode: 'user' | 'admin';
}) {
  const [messages, setMessages] = useState<BookingMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    let cleanup: (() => void) | undefined;
    fetchMessages(booking.id).then(setMessages).catch(console.error);
    cleanup = subscribeMessages(booking.id, m => setMessages(prev => [...prev, m]));
    return () => {
      if (cleanup) cleanup();
    };
  }, [open, booking.id]);
  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: 'smooth'
    });
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
        senderName: meIsAdmin ? 'Admin' : booking.cust_name ?? null
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }
  return <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col bg-background">
        {/* Header */}
        <SheetHeader className="p-4 border-b bg-gradient-to-r from-primary to-primary/80 text-white">
          <SheetTitle className="text-white text-left flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold">Chat with Support</div>
              <div className="text-xs text-white/80 font-normal">
                {booking.service_type} • {booking.community} • {booking.flat_no}
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-4">
          {messages.length === 0 ? <div className="text-center py-8 space-y-2">
              <div className="w-16 h-16 rounded-full bg-muted mx-auto flex items-center justify-center">
                <User className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="text-sm text-muted-foreground">
                Start a conversation about your booking
              </div>
              <div className="text-xs text-muted-foreground">
                Our support team will help you
              </div>
            </div> : <div className="space-y-4">
              {messages.map(m => {
            const mine = meIsAdmin && m.sender_role === 'admin' || !meIsAdmin && m.sender_role === 'user';
            const time = new Date(m.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            });
            return <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[80%] rounded-2xl px-4 py-2 space-y-1", mine ? "bg-gradient-to-r from-primary to-primary/80 text-white" : "bg-muted text-foreground")}>
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {m.body}
                      </div>
                      <div className={cn("text-[10px] flex items-center gap-1", mine ? "text-white/70" : "text-muted-foreground")}>
                        <Clock className="w-3 h-3" />
                        {time}
                      </div>
                    </div>
                  </div>;
          })}
            </div>}
          <div ref={endRef} />
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t bg-background">
          <div className="flex gap-2">
            <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Type your message..." className="min-h-[44px] max-h-32 resize-none" onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }} disabled={loading} />
            <Button onClick={onSend} disabled={!text.trim() || loading} className="h-[44px] w-[44px] p-0 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70">
              <Send className="w-4 h-4" />
            </Button>
          </div>
          
          {/* Quick actions */}
          <div className="flex gap-2 mt-2">
            
          </div>
        </div>
      </SheetContent>
    </Sheet>;
}