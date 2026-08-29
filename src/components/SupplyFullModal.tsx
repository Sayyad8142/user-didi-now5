import React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";

interface SupplyFullModalProps {
  open: boolean;
  onClose: () => void;
  onSchedule: () => void;
  title?: string;
  message?: string;
}

export function SupplyFullModal({
  open,
  onClose,
  onSchedule,
  title = "Workers Are Busy",
  message = "Workers are busy in other bookings. Please try after some time.",
}: SupplyFullModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xs rounded-3xl p-6 text-center shadow-xl border-0 gap-0">
        {/* Icon */}
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
          <Users className="w-8 h-8 text-primary" />
        </div>

        {/* Title */}
        <h2 className="text-lg font-bold text-foreground mb-2">{title}</h2>

        {/* Message */}
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{message}</p>

        {/* Buttons */}
        <div className="space-y-2">
          <Button onClick={onClose} className="w-full h-11 rounded-2xl font-bold">
            OK
          </Button>
          <Button
            variant="outline"
            onClick={onSchedule}
            className="w-full h-11 rounded-2xl font-semibold border-primary/20 text-primary hover:bg-primary/5"
          >
            Schedule Instead
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
