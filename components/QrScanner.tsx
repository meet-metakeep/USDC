"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import jsQR from "jsqr";

/**
 * QR Scanner props interface
 */
interface QrScannerProps {
  onScan: (data: string) => void;
}

/**
 * QR Code Scanner component using device camera
 */
export default function QrScanner({ onScan }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scanLoopRef = useRef<number | undefined>(undefined);

  /**
   * Stops QR code scanning
   */
  const stopScan = useCallback(() => {
    setIsScanning(false);
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = undefined;
    }
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  /**
   * Starts QR code scanning for wallet address
   */
  const startScan = useCallback(async () => {
    try {
      setError(null);
      setIsScanning(true);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Use jsQR for scanning
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      const scanFrame = () => {
        if (!videoRef.current || !context) return;

        if (
          videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA
        ) {
          canvas.height = videoRef.current.videoHeight;
          canvas.width = videoRef.current.videoWidth;
          context.drawImage(
            videoRef.current,
            0,
            0,
            canvas.width,
            canvas.height
          );
          const imageData = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          );
          const code = jsQR(
            imageData.data,
            imageData.width,
            imageData.height,
            {
              inversionAttempts: "dontInvert",
            }
          );

          if (code) {
            stopScan();
            onScan(code.data);
            return;
          }
        }
        if (videoRef.current?.srcObject) {
          scanLoopRef.current = requestAnimationFrame(scanFrame);
        }
      };
      scanLoopRef.current = requestAnimationFrame(scanFrame);
    } catch (error) {
      console.error("QR scan failed", error);
      setIsScanning(false);
      setError(
        "Camera access denied or unavailable. Please paste the address manually."
      );
    }
  }, [onScan, stopScan]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      stopScan();
    };
  }, [stopScan]);

  /**
   * Manual address input fallback
   */
  const [manualAddress, setManualAddress] = useState("");

  const handleManualSubmit = () => {
    if (manualAddress.trim()) {
      onScan(manualAddress.trim());
      setManualAddress("");
    }
  };

  return (
    <div className="space-y-4">
      {/* Video Preview */}
      <div className="relative bg-black rounded-lg overflow-hidden">
        {isScanning ? (
          <video
            ref={videoRef}
            className="w-full h-64 object-cover"
            playsInline
            autoPlay
            muted
          />
        ) : (
          <div className="w-full h-64 flex items-center justify-center bg-black">
            {error ? (
              <p className="text-red-400 text-center text-sm px-4">{error}</p>
            ) : (
              <p className="text-gray-400 text-center text-sm">
                Click &quot;Start Camera&quot; to begin scanning
              </p>
            )}
          </div>
        )}

        {/* Scanning overlay */}
        {isScanning && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-2 border-blue-500 rounded-lg"></div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="space-y-3">
        {!isScanning ? (
          <Button
            onClick={startScan}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:opacity-90 text-white font-semibold py-3"
          >
            Start Camera
          </Button>
        ) : (
          <Button
            onClick={stopScan}
            variant="outline"
            className="w-full bg-[#2a2a2a] border-gray-700 hover:bg-gray-800 text-white py-3"
          >
            Stop Camera
          </Button>
        )}

        {/* Manual entry fallback */}
        <div className="pt-4 border-t border-gray-700">
          <p className="text-sm text-gray-400 mb-2">Or enter address manually:</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Paste wallet address"
              value={manualAddress}
              onChange={(e) => setManualAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleManualSubmit();
                }
              }}
              className="flex-1 bg-[#2a2a2a] border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button
              onClick={handleManualSubmit}
              disabled={!manualAddress.trim()}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4"
            >
              Use
            </Button>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 text-center">
        Point your camera at a QR code to scan
      </p>
    </div>
  );
}
