import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Star, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface FeedbackItem {
  id: string;
  category: string;
  rating: number;
  message: string;
  created_at: string;
  booking_id: string | null;
  profiles: {
    full_name: string;
    phone: string;
  } | null;
}

export default function AdminFeedback() {
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeedback();
  }, []);

  async function loadFeedback() {
    try {
      const { data, error } = await supabase
        .from("feedback")
        .select(`
          id,
          category,
          rating,
          message,
          created_at,
          booking_id,
          profiles!feedback_user_id_fkey(full_name, phone)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFeedback(data || []);
    } catch (error) {
      console.error("Error loading feedback:", error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteFeedback(id: string) {
    if (!confirm("Delete this feedback? This action cannot be undone.")) return;
    
    try {
      const { error } = await supabase
        .from("feedback")
        .delete()
        .eq("id", id);

      if (error) throw error;
      setFeedback(prev => prev.filter(item => item.id !== id));
    } catch (error) {
      console.error("Error deleting feedback:", error);
    }
  }

  const getCategoryColor = (category: string) => {
    const colors = {
      booking: "bg-blue-100 text-blue-700",
      payment: "bg-green-100 text-green-700",
      bug: "bg-red-100 text-red-700",
      suggestion: "bg-purple-100 text-purple-700",
      other: "bg-gray-100 text-gray-700"
    };
    return colors[category as keyof typeof colors] || colors.other;
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-background p-4 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <div className="text-sm text-muted-foreground">Loading feedback...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background p-4">
      <header className="mb-6 flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-full border"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <div className="text-2xl font-bold text-primary">User Feedback</div>
          <div className="text-xs text-muted-foreground">{feedback.length} feedback entries</div>
        </div>
      </header>

      {feedback.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-muted-foreground">No feedback received yet</div>
        </div>
      ) : (
        <div className="space-y-4">
          {feedback.map((item) => (
            <div key={item.id} className="rounded-2xl bg-card border shadow-sm p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${getCategoryColor(item.category)}`}>
                    {item.category}
                  </span>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-4 w-4 ${
                          i < item.rating
                            ? "text-yellow-500 fill-current"
                            : "text-gray-300"
                        }`}
                      />
                    ))}
                    <span className="text-sm text-muted-foreground ml-1">
                      {item.rating}/5
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteFeedback(item.id)}
                  className="text-destructive hover:text-destructive h-8 w-8 p-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="text-card-foreground mb-3 whitespace-pre-wrap">
                {item.message}
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <div>
                  <strong>From:</strong> {item.profiles?.full_name || "Unknown"} ({item.profiles?.phone || "No phone"})
                </div>
                <div>
                  <strong>Date:</strong> {new Date(item.created_at).toLocaleString()}
                </div>
                {item.booking_id && (
                  <div>
                    <strong>Booking ID:</strong> {item.booking_id}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}