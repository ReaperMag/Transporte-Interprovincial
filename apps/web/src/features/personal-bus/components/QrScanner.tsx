import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

interface QrScannerProps {
  /** Se llama con el texto del QR leído. */
  onCode: (code: string) => void;
  /** Mientras es falso, la cámara sigue encendida pero no lee códigos. */
  enabled: boolean;
}

// Evita leer el mismo boleto varias veces seguidas mientras sigue frente a la cámara.
const SAME_CODE_PAUSE_MS = 4000;
const SCAN_INTERVAL_MS = 250;

export function QrScanner({ onCode, enabled }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCodeRef = useRef(onCode);
  const enabledRef = useRef(enabled);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    onCodeRef.current = onCode;
    enabledRef.current = enabled;
  }, [onCode, enabled]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let cancelled = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      void Promise.resolve().then(() =>
        setCameraError(
          'Este navegador no permite usar la cámara aquí. Abre la página con HTTPS o escribe el código a mano.',
        ),
      );
      return undefined;
    }

    const scan = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && enabledRef.current) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(image.data, image.width, image.height, {
            inversionAttempts: 'dontInvert',
          });
          const code = result?.data.trim();
          const last = lastCodeRef.current;
          const now = Date.now();
          if (code && !(last && last.code === code && now - last.at < SAME_CODE_PAUSE_MS)) {
            lastCodeRef.current = { code, at: now };
            onCodeRef.current(code);
          }
        }
      }
      timer = window.setTimeout(scan, SCAN_INTERVAL_MS);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((mediaStream) => {
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = mediaStream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = mediaStream;
          void video.play();
        }
        scan();
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError(
            'No se pudo abrir la cámara. Revisa el permiso del navegador o escribe el código a mano.',
          );
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (cameraError) {
    return (
      <p className="oficinista-operations__alert" role="alert">
        {cameraError}
      </p>
    );
  }

  return (
    <div className="personal-bus__scanner">
      <video ref={videoRef} muted playsInline aria-label="Vista de la cámara para leer el QR" />
      <canvas ref={canvasRef} hidden />
      <span className="personal-bus__scanner-frame" aria-hidden="true" />
    </div>
  );
}
