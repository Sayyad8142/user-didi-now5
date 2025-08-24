import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Phone, MessageCircle, Mail, HeadphonesIcon } from "lucide-react";
import FeedbackForm from "./components/FeedbackForm";
import { openExternalUrl } from "@/lib/nativeOpen";
import GeneralChatSheet from "@/components/chat/GeneralChatSheet";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

const SUPPORT_PHONE = "+918008180018";
const SUPPORT_WHATSAPP = "+918008180018";
const SUPPORT_EMAIL = "team@didisnow.com";

export default function SupportScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [chatOpen, setChatOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const searchParams = new URLSearchParams(location.search);
  const bookingId = searchParams.get("booking") || "";

  // Fetch user profile for chat
  useEffect(() => {
    if (user) {
      supabase
        .from('profiles')
        .select('full_name, phone, community, flat_no')
        .eq('id', user.id)
        .single()
        .then(({ data }) => setUserProfile(data));
    }
  }, [user]);

  const telHref = `tel:${SUPPORT_PHONE}`;
  const waHref = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
    `Hello Didi Now, I need help${bookingId ? " | Booking: " + bookingId : ""}`
  )}`;
  const mailHref = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Didi Now Support")}&body=${encodeURIComponent(
    `Hi Team,\n\nPlease assist me.${bookingId ? "\nBooking: " + bookingId : ""}\n\nThanks`
  )}`;

  return (
    <div className="min-h-dvh bg-background p-4 space-y-6">
      <header className="mb-4 flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-full border"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <div className="text-2xl font-bold text-primary">Help & Support</div>
          <div className="text-xs text-muted-foreground">We're here to help you</div>
        </div>
      </header>

      {bookingId && (
        <div className="rounded-lg bg-muted p-3 text-sm">
          <div className="flex items-center gap-2">
            <HeadphonesIcon className="h-4 w-4 text-primary" />
            <span className="font-medium">Support for booking: {bookingId}</span>
          </div>
        </div>
      )}

      {/* Contact Methods */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Contact Support</h2>
        
        <button 
          onClick={() => openExternalUrl(telHref)}
          className="flex items-center gap-4 p-4 rounded-2xl bg-card border shadow-sm hover:shadow-md transition-shadow w-full text-left"
        >
          <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <Phone className="h-6 w-6 text-green-600" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-card-foreground">Call Support</div>
            <div className="text-sm text-muted-foreground">{SUPPORT_PHONE}</div>
            <div className="text-xs text-muted-foreground">Available 24/7 • ~10 mins response</div>
          </div>
        </button>
        
        <button 
          onClick={() => setChatOpen(true)}
          className="flex items-center gap-4 p-4 rounded-2xl bg-card border shadow-sm hover:shadow-md transition-shadow w-full text-left"
        >
          <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
            <MessageCircle className="h-6 w-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-card-foreground">Live Chat</div>
            <div className="text-sm text-muted-foreground">Chat with our support team</div>
            <div className="text-xs text-muted-foreground">Real-time • Fast response • WhatsApp-like</div>
          </div>
        </button>
        
        <a 
          href={waHref} 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-4 p-4 rounded-2xl bg-card border shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <MessageCircle className="h-6 w-6 text-green-600" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-card-foreground">WhatsApp</div>
            <div className="text-sm text-muted-foreground">External WhatsApp chat</div>
            <div className="text-xs text-muted-foreground">Share images/videos • Voice messages</div>
          </div>
        </a>
        
        <a 
          href={mailHref}
          className="flex items-center gap-4 p-4 rounded-2xl bg-card border shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
            <Mail className="h-6 w-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-card-foreground">Email Support</div>
            <div className="text-sm text-muted-foreground">{SUPPORT_EMAIL}</div>
            <div className="text-xs text-muted-foreground">Detailed issues • File attachments</div>
          </div>
        </a>
      </div>

      {/* Feedback Form */}
      <div className="rounded-2xl bg-card border shadow-sm p-4">
        <h3 className="text-lg font-semibold text-card-foreground mb-4">Send Feedback</h3>
        <FeedbackForm bookingId={bookingId} />
      </div>

      {/* Help Tip */}
      <div className="text-xs text-muted-foreground bg-muted rounded-lg p-3">
        <div className="font-medium mb-1">💡 Quick Tip</div>
        You can access support directly from any booking by tapping "Need Help?" on the booking card.
      </div>

      {/* Chat Sheet */}
      <GeneralChatSheet
        open={chatOpen}
        onOpenChange={setChatOpen}
        userProfile={userProfile}
      />
    </div>
  );
}