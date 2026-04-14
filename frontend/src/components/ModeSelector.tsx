import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Info } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type DetectionMode = 'normal' | 'thermal' | 'night';

interface ModeSelectorProps {
    value: DetectionMode;
    onChange: (value: DetectionMode) => void;
    className?: string;
    showHint?: boolean;
}

export function ModeSelector({ value, onChange, className, showHint = true }: ModeSelectorProps) {
    const getHint = () => {
        switch (value) {
            case 'thermal':
                return "Use for thermal camera or infrared images — enhances heat signatures";
            case 'night':
                return "Enhances low-light and night camera trap images — boosts contrast and brightness";
            default:
                return "Standard detection — use for daytime clear images";
        }
    };

    return (
        <div className={cn("space-y-3", className)}>
            <label className="text-sm font-medium flex items-center justify-between">
                Image Mode
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p className="max-w-xs">Select "Thermal" or "Night Vision" for low-light or IR footage to improve detection accuracy via preprocessing.</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </label>
            <Tabs defaultValue="normal" value={value} onValueChange={(v) => onChange(v as DetectionMode)}>
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="normal">🌤️ Normal</TabsTrigger>
                    <TabsTrigger value="thermal">🌡️ Thermal / IR</TabsTrigger>
                    <TabsTrigger value="night">🌙 Night Vision</TabsTrigger>
                </TabsList>
            </Tabs>

            {showHint && (
                <div className="flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2 text-[11px] leading-relaxed text-primary font-medium border border-primary/10 shadow-sm animate-in fade-in slide-in-from-top-1">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{getHint()}</span>
                </div>
            )}
        </div>
    );
}
