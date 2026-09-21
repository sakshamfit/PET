import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, Check, X, Upload, AlertCircle } from 'lucide-react';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageDataUrl: string) => void;
  studentName?: string;
  title?: string;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  studentName,
  title,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize camera
  const startCamera = async (facing: 'user' | 'environment') => {
    setIsLoading(true);
    setCameraError(null);
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 640 },
          height: { ideal: 640 },
        },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setCameraError(
        'Camera permission was not granted or camera is not available. You can upload a photo from your device instead.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && !capturedImage) {
      startCamera(facingMode);
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isOpen, facingMode]);

  // Stop camera when closing
  const handleClose = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    setCapturedImage(null);
    setCameraError(null);
    onClose();
  };

  // Switch camera front/back
  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
  };

  // Take snapshot
  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const size = Math.min(video.videoWidth || 480, video.videoHeight || 480);

    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw centered square crop
    const sx = ((video.videoWidth || 480) - size) / 2;
    const sy = ((video.videoHeight || 480) - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImage(dataUrl);

    // Stop live stream to save battery
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  // Retake
  const handleRetake = () => {
    setCapturedImage(null);
    startCamera(facingMode);
  };

  // Confirm photo
  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      handleClose();
    }
  };

  // File upload fallback
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = event => {
        if (event.target?.result) {
          setCapturedImage(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md overflow-hidden bg-white rounded-[20px] border border-[#e5e5ea] shadow-2xl text-[#1d1d1f]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#f0f0f0] bg-white px-5 py-4">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0066cc]/10 text-[#0066cc]">
              <Camera className="h-4 w-4" />
            </div>
            <h3 className="font-semibold text-sm text-[#1d1d1f]">
              {title || (studentName ? `Photo: ${studentName}` : 'Capture Photo')}
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f] flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Viewfinder / Preview */}
        <div className="relative aspect-square w-full bg-[#1d1d1f] flex items-center justify-center overflow-hidden">
          {capturedImage ? (
            <img
              src={capturedImage}
              alt="Captured"
              className="h-full w-full object-cover"
            />
          ) : cameraError ? (
            <div className="p-6 text-center text-white">
              <AlertCircle className="mx-auto mb-3 h-10 w-10 text-[#ff3b30]" />
              <p className="text-xs text-[#86868b] mb-4">{cameraError}</p>
              <label className="inline-flex cursor-pointer items-center space-x-2 apple-btn-primary">
                <Upload className="h-4 w-4 shrink-0" />
                <span>Upload From Device</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              {/* Reticle */}
              <div className="pointer-events-none absolute inset-10 rounded-full border-2 border-dashed border-white/60"></div>
              <div className="pointer-events-none absolute bottom-4 text-center text-xs font-medium text-white/90 bg-black/50 px-3 py-1 rounded-full backdrop-blur-xs">
                Align face inside the circle
              </div>
            </>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Action Controls */}
        <div className="bg-white p-4">
          {capturedImage ? (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleRetake}
                className="flex-1 apple-btn-secondary py-2.5 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                <span>Retake</span>
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 apple-btn-primary py-2.5 text-xs"
              >
                <Check className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                <span>Confirm Photo</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-around">
              {/* File upload fallback */}
              <label className="flex flex-col items-center justify-center cursor-pointer text-[#86868b] hover:text-[#1d1d1f] p-2">
                <Upload className="h-5 w-5 shrink-0" />
                <span className="text-[11px] mt-1 font-medium">Upload</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              {/* Shutter Button */}
              <button
                type="button"
                onClick={takePhoto}
                disabled={Boolean(cameraError) || isLoading}
                className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#e5e5ea] bg-white p-1 shadow-sm active:scale-95 disabled:opacity-50"
              >
                <div className="h-10 w-10 rounded-full bg-[#0066cc] hover:bg-[#0077ed] transition-colors"></div>
              </button>

              {/* Switch Camera */}
              <button
                type="button"
                onClick={toggleFacingMode}
                disabled={Boolean(cameraError)}
                className="flex flex-col items-center justify-center text-[#86868b] hover:text-[#1d1d1f] p-2 disabled:opacity-40"
              >
                <RefreshCw className="h-5 w-5 shrink-0" />
                <span className="text-[11px] mt-1 font-medium">Flip</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
