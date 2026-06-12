import { useMemo, useRef, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Square,
  Crown,
  Drama,
  Mic,
  MicOff,
  Volume2,
  SkipBack,
  SkipForward,
  RotateCcw,
  Play,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import {
  finalizeRehearsalSession,
  getLatestRehearsal,
  getScriptSetup,
  syncRecordingToBackend,
  type ScriptLineWithCharacter,
} from "@/lib/rehearsal-data";

import { startMicRecording, type RecorderHandle } from "@/lib/teleprompter-recorder";
import { transcribeAudio } from "@/lib/teleprompter.functions";
import { recordingService } from "@/services/recordingService";
import { syncService } from "@/services/syncService";

export const Route = createFileRoute("/ensayo")({
  component: Ensayo,
});

function Wave({ active }: { active?: boolean }) {
  return (
    <div className="flex items-end gap-0.5 h-5">
      {Array.from({ length: 14 }).map((_, i) => (
        <span
          key={i}
          className={`w-0.5 rounded-full ${active ? "bg-primary" : "bg-muted-foreground/40"}`}
          style={{ height: `${30 + Math.sin(i) * 30 + (i % 3) * 20}%` }}
        />
      ))}
    </div>
  );
}

function Ensayo() {
  const [connectionStatus, setConnectionStatus] = useState("Esperando para iniciar...");
  const [isRehearsing, setIsRehearsing] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const recorderRef = useRef<RecorderHandle | null>(null);
  const transcribe = useServerFn(transcribeAudio);
  const syncRecording = useServerFn(syncRecordingToBackend);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Initialize IndexedDB + sync services on mount
  useEffect(() => {
    recordingService.init().catch(console.error);
    syncService.init().catch(console.error);
    syncService.syncNow().catch(console.error); // Initial sync
  }, []);

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (recorderRef.current) {
        try {
          await recorderRef.current.stop();
        } catch {
          /* ignore */
        }
        recorderRef.current = null;
      }
      setIsRehearsing(false);
      if (!latest?.id) return null;
      return finalizeRehearsalSession(latest.id, {
        completed_lines: Math.max(latest.completed_lines ?? 0, activeLineIndex + 1),
        total_lines: latest.total_lines || lines.length,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["latest-rehearsal"] });
      queryClient.invalidateQueries({ queryKey: ["rehearsal-sessions"] });
      toast.success("Ensayo finalizado");
      navigate({ to: "/finalizado" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo finalizar"),
  });

  const handleFinalizar = () => finalizeMutation.mutate();

  const { data: latest, isLoading: rehearsalLoading } = useQuery({
    queryKey: ["latest-rehearsal"],
    queryFn: getLatestRehearsal,
  });
  const { data: setup, isLoading: setupLoading } = useQuery({
    queryKey: ["script-setup", latest?.script_id, latest?.scene_id],
    queryFn: () => getScriptSetup(latest?.script_id ?? undefined, latest?.scene_id ?? undefined),
    enabled: Boolean(latest?.script_id),
  });

  const loading = rehearsalLoading || setupLoading;
  const lines = useMemo(() => setup?.lines ?? [], [setup?.lines]);
  
  // Líneas actual, siguiente y posterior
  const currentLine = lines[activeLineIndex] ?? null;
  const nextLine = lines[activeLineIndex + 1] ?? null;
  const afterLine = lines[activeLineIndex + 2] ?? null;

  const selectedCharacter =
    latest?.selectedCharacter ??
    setup?.characters.find((item) => item.actor_type === "user") ??
    null;

  const completed = Math.max(latest?.completed_lines ?? 0, activeLineIndex);
  const total = latest?.total_lines || lines.length || 1;
  const progress = Math.min(100, Math.round((completed / total) * 100));
  const teleprompterSessionId = latest?.teleprompter_session_id ?? null;

  const isMyTurn = currentLine?.character_id === selectedCharacter?.id;

  // ─── Recording with MediaRecorder + IndexedDB storage + transcription ───
  const handleToggleRecording = async () => {
    if (!selectedCharacter || !currentLine) {
      toast.error("Selecciona personaje y línea antes de grabar.");
      return;
    }

    if (isRehearsing && recorderRef.current) {
      try {
        setConnectionStatus("Guardando en IndexedDB...");
        setIsRehearsing(false);
        
        // Get Blob (no Base64 encoding - instant! ⚡)
        const { audioBlob, mediaType, durationMs } = await recorderRef.current.stop();
        recorderRef.current = null;

        // Save Blob to IndexedDB (instant, no UI blocking)
        const currentSessionId = latest?.id ?? 'unknown';
        const recordingId = await recordingService.saveRecording({
          sessionId: currentSessionId,
          userId: 'current-user', // TODO: Get from auth context
          audioBlob,
          audioFormat: mediaType,
          durationMs,
        });

        setConnectionStatus("Enviando a transcripción...");

        // Send Blob to backend via FormData (not Base64!)
        // 1. Convertimos el audio a texto (Base64) 
        const base64Audio = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => resolve(reader.result as string);
        });

        // 2. Lo enviamos como un objeto normal 
        const { transcript } = await transcribeAudio({ // Asegúrar de que el nombre coincida con tu importación
          data: {
          audioBase64: base64Audio,
          sessionId: currentSessionId,
          referenceText: currentLine.text ?? ''
          }
        }as any);

        // Update recording with transcript
        await recordingService.updateRecording(recordingId, {
          transcript,
          synced: false, // Will be synced via sync service
        });

        // Add to sync queue for metadata sync
        await recordingService.addToSyncQueue(recordingId, {
          sessionId: latest?.id ?? 'unknown',
          transcript,
          duration_ms: durationMs,
        });

        // Attempt immediate backend metadata sync
        try {
          await syncRecording({
            data: {
              sessionId: currentSessionId,
              transcript,
              confidence: 0.95,
              duration_ms: durationMs,
            },
          });

          await recordingService.updateRecording(recordingId, {
            synced: true,
          });
        } catch (syncError) {
          console.warn("Metadata sync deferred:", syncError);
        }

        setLastTranscript(transcript);
        setConnectionStatus(`Transcripción línea ${activeLineIndex + 1}`);
        toast.success("Audio guardado y transcrito ✨");
        
        if (activeLineIndex < lines.length - 1) {
          setActiveLineIndex((prev) => prev + 1);
        }
      } catch (error) {
        console.error(error);
        toast.error("Error al procesar el audio.");
        setConnectionStatus("Error en transcripción");
      }
    } else {
      try {
        setConnectionStatus("Grabando micrófono...");
        const handle = await startMicRecording();
        recorderRef.current = handle;
        setIsRehearsing(true);
      } catch (error) {
        console.error(error);
        setIsRehearsing(false);
        toast.error("No se pudo acceder al micrófono.");
        setConnectionStatus("Sin acceso al micrófono");
      }
    }
  };

  const handleSkipForward = () => {
    setActiveLineIndex((prev) => Math.min(lines.length - 1, prev + 1));
  };

  const handleSkipBackward = () => {
    setActiveLineIndex((prev) => Math.max(0, prev - 1));
  };

  const handleReset = () => {
    setActiveLineIndex(0);
    setConnectionStatus("Escena reiniciada.");
  };

  return (
    <AppShell>
      <TopBar back={{ to: "/", label: "Modo ensayo" }} />

      {loading && (
        <div className="bg-card border border-border/60 rounded-xl p-4 mb-5 text-sm text-muted-foreground">
          Cargando sesion desde Postgres...
        </div>
      )}

      <div className="bg-card border border-border/60 rounded-xl p-4 flex flex-wrap items-center gap-6 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display text-lg">{setup?.script?.title ?? "Sin libreto"}</span>
            <span className="text-xs px-2 py-0.5 rounded-full border border-primary/40 text-primary">
              {setup?.scene?.title ?? "Sin escena"}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {setup?.scene?.location ?? setup?.scene?.description ?? "Escena sincronizada"}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto sm:ml-0">
          <Crown className="w-5 h-5 text-primary" />
          <div>
            <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              Interpretas
            </div>
            <div className="text-sm">
              {selectedCharacter ? `${selectedCharacter.name} (Tu)` : "Sin personaje"}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleFinalizar}
          disabled={finalizeMutation.isPending}
          className="ml-auto inline-flex items-center gap-2 border border-destructive/50 text-destructive rounded-lg px-3 py-2 text-sm hover:bg-destructive/10 disabled:opacity-60"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
          {finalizeMutation.isPending ? "Finalizando..." : "Finalizar ensayo"}
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-5">
        <div className="space-y-4">
          <LineCard
            title="Linea actual"
            line={currentLine}
            selectedCharacterId={selectedCharacter?.id ?? null}
            active
          />
          <LineCard
            title="Siguiente linea"
            line={nextLine}
            selectedCharacterId={selectedCharacter?.id ?? null}
          />
          <LineCard
            title="Despues"
            line={afterLine}
            selectedCharacterId={selectedCharacter?.id ?? null}
            faded
          />

          <div className="bg-card border border-border/60 rounded-xl p-4 mt-6 flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs">
              <div className="flex items-center gap-1.5 text-success">
                <span className={`w-1.5 h-1.5 rounded-full ${isRehearsing ? "bg-destructive animate-pulse" : "bg-success"}`} />{" "}
                Teleprompter {isRehearsing ? "(Grabando)" : "(Listo)"}
              </div>
              <div className="font-mono text-foreground mt-0.5">{connectionStatus}</div>
            </div>
            <div className="flex items-center gap-2">
              <ControlBtn icon={SkipBack} label="Retroceder linea" onClick={handleSkipBackward} />
              <button
                onClick={handleToggleRecording}
                disabled={!teleprompterSessionId}
                className={`w-14 h-14 rounded-full grid place-items-center shadow-glow ring-4 disabled:opacity-50 disabled:shadow-none transition-all ${
                  isRehearsing 
                    ? "bg-destructive text-destructive-foreground ring-destructive/20" 
                    : "bg-primary-gradient text-primary-foreground ring-primary/20"
                }`}
              >
                {isRehearsing ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-6 h-6" />}
              </button>
              <ControlBtn icon={SkipForward} label="Siguiente linea" onClick={handleSkipForward} />
              <ControlBtn icon={RotateCcw} label="Reiniciar" onClick={handleReset} />
            </div>
            <div />
          </div>
        </div>

        <aside className="space-y-4">
          <Card title="Personajes en escena">
            <div className="space-y-3">
              {(setup?.characters ?? []).slice(0, 4).map((character) => (
                <CharRow
                  key={character.id}
                  icon={character.id === selectedCharacter?.id ? Crown : Drama}
                  name={character.name}
                  status={character.id === currentLine?.character_id ? "Activo" : "En espera"}
                  muted={character.id === selectedCharacter?.id}
                  playing={isRehearsing && character.id === currentLine?.character_id}
                />
              ))}
            </div>
          </Card>

          <Card title="Teleprompter en vivo">
            <Quick label="Sesion FastAPI" value={teleprompterSessionId ? "Conectado" : "Desconectado"} />
            <Quick label="Turno actual" value={isMyTurn ? "Tu turno" : "Escucha"} />
            <div className="mt-3 rounded-lg border border-border/60 bg-surface p-3">
              <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mb-1">
                Estado
              </div>
              <p className="text-xs leading-relaxed text-foreground min-h-10">
                {isRehearsing 
                  ? "Grabando... Cuando termines tu línea, presiona Stop para avanzar." 
                  : "Presiona el micrófono para iniciar la grabación de la línea actual."}
              </p>
            </div>
          </Card>

          <Card title="Progreso de la escena">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-muted-foreground">Lineas</span>
              <span>
                {completed} / {total}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-surface overflow-hidden">
              <div className="h-full bg-primary-gradient transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}

function LineCard({
  title,
  line,
  selectedCharacterId,
  active,
  faded,
}: {
  title: string;
  line: ScriptLineWithCharacter | null;
  selectedCharacterId: string | null;
  active?: boolean;
  faded?: boolean;
}) {
  const isUserLine = line?.character_id === selectedCharacterId;
  const tone = isUserLine ? "text-primary" : "text-success";

  return (
    <div>
      <p className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mb-2">{title}</p>
      <div
        className={`${active ? "border-2 border-primary/60 bg-primary/5 shadow-glow" : "border border-border/60 bg-card"} ${
          faded ? "opacity-70" : ""
        } rounded-xl p-5 relative`}
      >
        {active && (
          <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-primary text-primary-foreground grid place-items-center">
            <Play className="w-3 h-3 fill-current" />
          </div>
        )}
        {line ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-sm font-semibold ${tone}`}>
                {line.character?.name.toUpperCase() ?? "NARRADOR"}
              </span>
              <Wave active={active} />
              {!active && (
                <span className="ml-auto text-xs text-muted-foreground">
                  00:{String(line.duration_seconds).padStart(2, "0")}
                </span>
              )}
            </div>
            <p className="text-lg leading-relaxed font-display italic">"{line.text}"</p>
            {line.cue && <div className="text-xs text-primary/80 text-right mt-2">{line.cue}</div>}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No hay linea registrada para esta posicion.
          </p>
        )}
      </div>
    </div>
  );
}

function ControlBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Mic;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg border border-border/60 bg-surface hover:border-primary/40 hover:text-primary transition disabled:opacity-50 disabled:hover:border-border/60 disabled:hover:text-inherit cursor-pointer"
    >
      <Icon className="w-4 h-4" />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border/60 rounded-xl p-4">
      <p className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mb-3">{title}</p>
      {children}
    </div>
  );
}

function CharRow({
  icon: Icon,
  name,
  status,
  muted,
  playing,
}: {
  icon: typeof Crown;
  name: string;
  status: string;
  muted?: boolean;
  playing?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm">{name}</div>
        <div className="text-[10px] flex items-center gap-1.5 text-muted-foreground">
          {status} <Wave active={playing} />
        </div>
      </div>
      {muted ? (
        <MicOff className="w-4 h-4 text-muted-foreground" />
      ) : (
        <Volume2 className="w-4 h-4 text-primary" />
      )}
    </div>
  );
}

function Quick({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-xs border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function difficultyLabel(value: number) {
  if (value < 33) return "Facil";
  if (value < 66) return "Media";
  return "Alta";
}

function modeLabel(value: string) {
  if (value === "grupo") return "En grupo";
  if (value === "lectura") return "Lectura";
  return "Individual";
}