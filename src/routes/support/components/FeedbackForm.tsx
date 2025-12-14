import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { auth as firebaseAuth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";

interface FeedbackFormProps {
  bookingId?: string;
}

export default function FeedbackForm({ bookingId = "" }: FeedbackFormProps) {
  const [category, setCategory] = useState("booking");
  const [rating, setRating] = useState(5);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  
  const categories = [
    { value: "booking", label: "Booking" },
    { value: "payment", label: "Payment" },
    { value: "bug", label: "Bug" },
    { value: "suggestion", label: "Suggestion" },
    { value: "other", label: "Other" }
  ];

  async function submit() {
    if (!message.trim()) return;
    setBusy(true);
    setSubmitted(false);
    
    try {
      const user = firebaseAuth.currentUser;
      const user_id = user?.uid;
      
      if (!user_id) {
        throw new Error("User not authenticated");
      }
      
      const { error } = await supabase.from("feedback").insert({
        user_id,
        booking_id: bookingId || null,
        category,
        rating,
        message: message.trim()
      });
      
      if (error) throw error;
      
      setSubmitted(true);
      setMessage("");
      setRating(5);
      setCategory("booking");
    } catch (error) {
      console.error("Error submitting feedback:", error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Category Selection */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Category
        </label>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={`px-3 py-2 rounded-full text-sm border whitespace-nowrap transition-colors ${
                category === cat.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-muted"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Rating */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Rating
        </label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((num) => (
            <button
              key={num}
              onClick={() => setRating(num)}
              className={`p-1 rounded transition-colors ${
                rating >= num ? "text-yellow-500" : "text-muted-foreground hover:text-yellow-400"
              }`}
            >
              <Star className="h-6 w-6 fill-current" />
            </button>
          ))}
          <span className="ml-2 text-sm text-muted-foreground">
            {rating}/5
          </span>
        </div>
      </div>

      {/* Message */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Message
        </label>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe your issue, suggestion, or feedback..."
          className="min-h-[100px] resize-none"
          maxLength={1000}
        />
        <div className="text-xs text-muted-foreground mt-1">
          {message.length}/1000 characters
        </div>
      </div>

      {/* Submit Button */}
      <Button 
        disabled={busy || !message.trim()} 
        onClick={submit} 
        className="w-full"
      >
        {busy ? "Sending..." : "Submit Feedback"}
      </Button>

      {/* Success Message */}
      {submitted && (
        <div className="rounded-lg bg-emerald-50 text-emerald-700 p-3 text-sm border border-emerald-200">
          Thank you! We have received your feedback and will review it shortly.
        </div>
      )}
    </div>
  );
}