import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkerAvatarProps {
  photoUrl?: string | null;
  name?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: { avatar: 'w-8 h-8', icon: 'w-4 h-4', text: 'text-xs' },
  md: { avatar: 'w-10 h-10', icon: 'w-5 h-5', text: 'text-sm' },
  lg: { avatar: 'w-12 h-12', icon: 'w-5 h-5', text: 'text-lg' },
};

export function WorkerAvatar({ photoUrl, name, size = 'sm', className }: WorkerAvatarProps) {
  const s = sizeMap[size];
  const initial = (name || 'W').charAt(0).toUpperCase();

  return (
    <Avatar className={cn(s.avatar, 'shrink-0 border border-primary/10', className)}>
      {photoUrl ? (
        <AvatarImage src={photoUrl} alt={name || 'Worker'} />
      ) : null}
      <AvatarFallback className={cn('bg-primary/10 text-primary font-bold', s.text)}>
        {name ? initial : <User className={s.icon} />}
      </AvatarFallback>
    </Avatar>
  );
}
