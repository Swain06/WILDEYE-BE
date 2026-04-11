import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface ResultsCardProps {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

export function ResultsCard({
  title,
  icon: Icon,
  children,
  className,
  variant = 'default',
}: ResultsCardProps) {
  const variantStyles = {
    default: 'border-border',
    success: 'border-success/50 bg-success/5',
    warning: 'border-warning/50 bg-warning/5',
    danger: 'border-destructive/50 bg-destructive/5',
  };

  return (
    <Card className={cn('animate-fade-in', variantStyles[variant], className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          {Icon && <Icon className="h-5 w-5 text-primary" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
