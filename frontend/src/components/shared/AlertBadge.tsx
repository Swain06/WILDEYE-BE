import { cn } from '@/lib/utils';

interface AlertBadgeProps {
  status: 'Low' | 'Medium' | 'High' | 'Critical' | 'Pending' | 'Reviewed' | 'Confirmed' | 'False Positive';
  className?: string;
}

export function AlertBadge({ status, className }: AlertBadgeProps) {
  const styles = {
    Low: 'bg-success/20 text-success border-success/30',
    Medium: 'bg-warning/20 text-warning border-warning/30',
    High: 'bg-accent/20 text-accent border-accent/30',
    Critical: 'bg-destructive/20 text-destructive border-destructive/30',
    Pending: 'bg-warning/20 text-warning border-warning/30',
    Reviewed: 'bg-primary/20 text-primary border-primary/30',
    Confirmed: 'bg-destructive/20 text-destructive border-destructive/30',
    'False Positive': 'bg-muted text-muted-foreground border-border',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        styles[status],
        className
      )}
    >
      {status}
    </span>
  );
}
