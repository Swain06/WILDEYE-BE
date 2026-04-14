import { useState, useEffect, useRef } from 'react';
import { Camera, RefreshCw, Check, RotateCcw, X, AlertCircle, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface CameraCaptureProps {
    onCapture: (file: File, previewUrl: string) => void;
    onClose: () => void;
    aspectRatio?: "square" | "landscape"; // default: landscape
}

type CameraState = "idle" | "camera_starting" | "live_preview" | "captured" | "error";

export function CameraCapture({ onCapture, onClose, aspectRatio = "landscape" }: CameraCaptureProps) {
    const [state, setState] = useState<CameraState>("idle");
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [currentDeviceId, setCurrentDeviceId] = useState<string>("");
    const [error, setError] = useState<string>("");
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [capturedFile, setCapturedFile] = useState<File | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Initialize camera
    useEffect(() => {
        startCamera();
        enumerateDevices();

        return () => {
            stopCamera();
        };
    }, []);

    const enumerateDevices = async () => {
        try {
            const allDevices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = allDevices.filter(device => device.kind === 'videoinput');
            setDevices(videoDevices);
        } catch (err) {
            console.error("Error enumerating devices:", err);
        }
    };

    const startCamera = async (deviceId?: string) => {
        stopCamera();
        setState("camera_starting");
        setError("");

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setState("error");
            setError("Camera not supported on this browser. Please use Chrome or Safari.");
            return;
        }

        try {
            const constraints: MediaStreamConstraints = {
                video: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    facingMode: deviceId ? undefined : 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };

            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            setStream(newStream);
            if (videoRef.current) {
                videoRef.current.srcObject = newStream;
            }
            setState("live_preview");

            // Update current device ID if not set
            if (!deviceId) {
                const videoTrack = newStream.getVideoTracks()[0];
                if (videoTrack) {
                    setCurrentDeviceId(videoTrack.getSettings().deviceId || "");
                }
            } else {
                setCurrentDeviceId(deviceId);
            }
        } catch (err: any) {
            console.error("Camera access error:", err);
            setState("error");
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setError("Camera access denied. Please allow camera permission in your browser settings.");
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                setError("No camera detected on this device.");
            } else {
                setError(`Camera error: ${err.message || 'Unknown error'}`);
            }
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    const switchCamera = () => {
        if (devices.length < 2) return;
        const currentIndex = devices.findIndex(d => d.deviceId === currentDeviceId);
        const nextIndex = (currentIndex + 1) % devices.length;
        startCamera(devices[nextIndex].deviceId);
    };

    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (context) {
            // Set canvas dimensions to match video
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // If square aspect ratio is requested, crop to center square
            if (aspectRatio === "square") {
                const size = Math.min(video.videoWidth, video.videoHeight);
                const x = (video.videoWidth - size) / 2;
                const y = (video.videoHeight - size) / 2;
                canvas.width = size;
                canvas.height = size;
                context.drawImage(video, x, y, size, size, 0, 0, size, size);
            } else {
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
            }

            canvas.toBlob((blob) => {
                if (blob) {
                    const filename = `camera_capture_${Date.now()}.jpg`;
                    const file = new File([blob], filename, { type: 'image/jpeg' });
                    const url = URL.createObjectURL(blob);
                    setCapturedImage(url);
                    setCapturedFile(file);
                    setState("captured");
                    stopCamera();
                }
            }, 'image/jpeg', 0.9);
        }
    };

    const retake = () => {
        setCapturedImage(null);
        setCapturedFile(null);
        startCamera(currentDeviceId);
    };

    const usePhoto = () => {
        if (capturedFile && capturedImage) {
            onCapture(capturedFile, capturedImage);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <Card className="w-full max-w-2xl bg-slate-900 border-slate-800 flex flex-col overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800">
                    <div className="flex items-center gap-2 text-white font-semibold">
                        <Camera className="h-5 w-5 text-primary" />
                        Live Camera Capture
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-400 hover:text-white hover:bg-slate-800">
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* Preview Area */}
                <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
                    {state === "camera_starting" && (
                        <div className="flex flex-col items-center gap-3 text-slate-400">
                            <RefreshCw className="h-8 w-8 animate-spin" />
                            <p>Starting camera...</p>
                        </div>
                    )}

                    {state === "error" && (
                        <div className="flex flex-col items-center gap-4 text-center p-6">
                            {error.includes("permission") ? (
                                <Settings className="h-12 w-12 text-amber-500" />
                            ) : (
                                <AlertCircle className="h-12 w-12 text-destructive" />
                            )}
                            <div className="space-y-1">
                                <p className="text-white font-medium">{error}</p>
                                <p className="text-sm text-slate-400">Camera requires HTTPS on iOS devices</p>
                            </div>
                            <Button variant="outline" onClick={() => startCamera()} className="mt-2">
                                Retry Connection
                            </Button>
                        </div>
                    )}

                    {state === "live_preview" && (
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`w-full h-full object-cover ${aspectRatio === 'square' ? 'aspect-square' : ''}`}
                        />
                    )}

                    {state === "captured" && capturedImage && (
                        <img
                            src={capturedImage}
                            alt="Captured"
                            className="w-full h-full object-cover"
                        />
                    )}

                    {/* Hidden Canvas */}
                    <canvas ref={canvasRef} className="hidden" />
                </div>

                {/* Status & Controls */}
                <div className="p-6 bg-slate-900 border-t border-slate-800 flex flex-col items-center gap-6">
                    <div className="text-sm font-medium">
                        {state === "live_preview" && <span className="text-primary animate-pulse flex items-center gap-2">● <span className="text-slate-300">Camera ready — position your subject</span></span>}
                        {state === "captured" && <span className="text-success flex items-center gap-2"><Check className="h-4 w-4" /> Photo captured!</span>}
                        {state === "camera_starting" && <span className="text-slate-500">Initializing hardware...</span>}
                    </div>

                    <div className="flex items-center gap-3 w-full justify-center">
                        {state === "live_preview" && (
                            <>
                                <Button
                                    size="lg"
                                    onClick={capturePhoto}
                                    className="rounded-full px-8 bg-primary hover:bg-primary/90 text-white h-14 text-lg shadow-lg hover:scale-105 transition-transform"
                                >
                                    <Camera className="mr-2 h-6 w-6" />
                                    Capture Photo
                                </Button>
                                {devices.length > 1 && (
                                    <Button
                                        size="lg"
                                        variant="outline"
                                        onClick={switchCamera}
                                        className="rounded-full border-slate-700 text-slate-300 h-14 w-14 p-0"
                                    >
                                        <RefreshCw className="h-6 w-6" />
                                    </Button>
                                )}
                            </>
                        )}

                        {state === "captured" && (
                            <>
                                <Button
                                    size="lg"
                                    onClick={usePhoto}
                                    className="rounded-full px-8 bg-success hover:bg-success/90 text-white h-14 text-lg"
                                >
                                    <Check className="mr-2 h-6 w-6" />
                                    Use This Photo
                                </Button>
                                <Button
                                    size="lg"
                                    variant="outline"
                                    onClick={retake}
                                    className="rounded-full px-8 border-slate-700 text-slate-300 h-14 text-lg"
                                >
                                    <RotateCcw className="mr-2 h-6 w-6" />
                                    Retake
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
}
