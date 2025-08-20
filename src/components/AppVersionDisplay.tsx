import { useWebVersionQuery } from '@/hooks/useWebVersionQuery';
import { cn } from '@/lib/utils';

interface AppVersionDisplayProps {
  className?: string;
}

export function AppVersionDisplay({ className }: AppVersionDisplayProps) {
  const { data: version, isLoading } = useWebVersionQuery();

  if (isLoading) return null;

  return (
    <div className={cn(
      "text-xs text-muted-foreground text-center py-2",
      "hidden sm:block", // Hide on very small screens
      className
    )}>
      App version: {version}
    </div>
  );
}