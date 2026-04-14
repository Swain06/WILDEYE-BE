import { useState } from 'react';
import { Upload, Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileUpload } from '@/components/shared/FileUpload';
import { CameraCapture } from '@/components/CameraCapture';
import { cn } from '@/lib/utils';

interface ImageInputToggleProps {
    onFileSelected: (file: File, previewUrl: string) => void;
    label?: string; // default: "Image Source"
    accept?: string; // default: "image/*"
    className?: string;
}

export function ImageInputToggle({
    onFileSelected,
    label = "Image Source",
    accept = "image/*",
    className
}: ImageInputToggleProps) {
    const [mode, setMode] = useState<"upload" | "camera">("upload");
    const [showCamera, setShowCamera] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);

    const handleFileSelect = (file: File) => {
        const url = URL.createObjectURL(file);
        setPreview(url);
        setFileName(file.name);
        onFileSelected(file, url);
    };

    const handleCameraCapture = (file: File, url: string) => {
        setPreview(url);
        setFileName(file.name);
        setShowCamera(false);
        onFileSelected(file, url);
    };

    const clearSelection = () => {
        setPreview(null);
        setFileName(null);
    };

    return (
        <div className={cn("space-y-4", className)}>
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{label}</label>
                {!preview && (
                    <Tabs value={mode} onValueChange={(v) => setMode(v as "upload" | "camera")} className="w-auto">
                        <TabsList className="grid w-fitt grid-cols-2 h-9">
                            <TabsTrigger value="upload" className="px-3 text-xs gap-1.5">
                                <Upload className="h-3.5 w-3.5" />
                                Upload
                            </TabsTrigger>
                            <TabsTrigger value="camera" className="px-3 text-xs gap-1.5">
                                <Camera className="h-3.5 w-3.5" />
                                Camera
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                )}
            </div>

            {preview ? (
                <div className="flex items-center gap-4 p-3 rounded-xl border bg-card shadow-sm animate-in fade-in zoom-in duration-200">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted">
                        <img
                            src={preview}
                            alt="Preview"
                            className="h-full w-full object-cover"
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-foreground">
                            {fileName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {mode === "camera" ? "Captured from camera" : "Uploaded file"}
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={clearSelection}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            ) : (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {mode === "upload" ? (
                        <FileUpload
                            onFileSelect={handleFileSelect}
                            label="Select Image File"
                            description="Click to browse or drag and drop image"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-xl bg-muted/30 gap-4 transition-all hover:bg-muted/50 hover:border-primary/50 group">
                            <div className="rounded-full bg-primary/10 p-5 group-hover:scale-110 transition-transform">
                                <Camera className="h-10 w-10 text-primary" />
                            </div>
                            <div className="text-center">
                                <p className="font-semibold">Use Live Camera</p>
                                <p className="text-sm text-muted-foreground mt-1">Capture a photo directly from your device</p>
                            </div>
                            <Button onClick={() => setShowCamera(true)} size="lg" className="mt-2 rounded-full px-8">
                                Open Camera
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {showCamera && (
                <CameraCapture
                    onCapture={handleCameraCapture}
                    onClose={() => setShowCamera(false)}
                />
            )}
        </div>
    );
}
