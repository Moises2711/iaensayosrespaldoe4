import { createServerFn } from "@tanstack/react-start";

export const transcribeAudio = createServerFn({
  method: "POST",
})
  .handler(async (context: any) => {
    // 1. EL ABRELATAS: TanStack envuelve los envíos en una propiedad "data". 
    // Buscamos las variables sin importar cuántas capas tenga el sobre.
    const payload = context?.data?.audioBase64 
      ? context.data 
      : (context?.data?.data || context || {});

    const { audioBase64, sessionId, referenceText } = payload;

    if (!audioBase64 || !sessionId) {
      // Si vuelve a fallar, este error nos dirá exactamente qué llaves sí llegaron
      const llavesRecibidas = Object.keys(payload).join(", ");
      throw new Error(`Faltan datos requeridos. Solo se recibió: [${llavesRecibidas}]`);
    }

    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) throw new Error("OPENAI_API_KEY no configurada");

    // 2. Reconstruimos el audio real a partir del texto Base64
    const base64Data = audioBase64.split(',')[1] || audioBase64;
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const audioBlob = new Blob([bytes], { type: 'audio/webm' });

    // 3. Empaquetamos para OpenAI en formato FormData (A ellos sí les gusta)
    const formData = new FormData();
    formData.append("file", audioBlob, "grabacion.webm");
    formData.append("model", "whisper-1");
    formData.append("language", "es");
    
    if (referenceText && referenceText.trim().length > 0) {
      formData.append("prompt", `Hint: "${referenceText}"`);
    }

    // 4. Enviamos a la IA
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI transcription error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return { transcript: data.text?.trim() ?? "", confidence: 0.95 };
  });