// Browser-only helpers for capturing microphone audio with MediaRecorder.

export type RecorderHandle = {
  stop: () => Promise<{ audioBlob: Blob; mediaType: string; durationMs: number }>;
  cancel: () => void;
};

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const mt of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mt)) {
      return mt;
    }
  }
  return "audio/webm";
}

export async function startMicRecording(): Promise<RecorderHandle> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Tu navegador no soporta acceso al micrófono.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mediaType = pickMimeType();
  const recorder = new MediaRecorder(stream, { mimeType: mediaType });
  const chunks: BlobPart[] = [];
  const startedAt = Date.now();
  let cancelled = false;

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  recorder.start();

  const cleanup = () => {
    stream.getTracks().forEach((t) => t.stop());
  };

  return {
    stop: () =>
      new Promise((resolve, reject) => {
        recorder.onstop = async () => {
          cleanup();
          if (cancelled) return;
          try {
            const audioBlob = new Blob(chunks, { type: mediaType });
            resolve({
              audioBlob,
              mediaType: mediaType.split(";")[0],
              durationMs: Date.now() - startedAt,
            });
          } catch (err) {
            reject(err);
          }
        };
        if (recorder.state !== "inactive") recorder.stop();
      }),
    cancel: () => {
      cancelled = true;
      if (recorder.state !== "inactive") recorder.stop();
      cleanup();
    },
  };
}
