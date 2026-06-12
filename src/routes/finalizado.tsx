import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  Calendar,
  Clock,
  Crown,
  Drama,
  Sparkles,
  Check,
  Repeat,
  Home,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import { formatDuration, getLatestRehearsal, getPerfilUsuario } from "@/lib/rehearsal-data";

export const Route = createFileRoute("/finalizado")({
  component: Finalizado,
});

function Finalizado() {
  const { data: report, isLoading } = useQuery({
    queryKey: ["latest-rehearsal-report"],
    queryFn: getLatestRehearsal,
  });
  const { data: profileData } = useQuery({
    queryKey: ["perfil-usuario"],
    queryFn: getPerfilUsuario,
  });
  const profile = profileData?.profile;
  const completed = report?.completed_lines ?? 0;
  const total = report?.total_lines || completed || 1;
  const completedPercent = Math.min(100, Math.round((completed / total) * 100));

  return (
    <AppShell>
      <TopBar back={{ to: "/ensayo", label: "Modo ensayo" }} />

      {isLoading && (
        <div className="bg-card border border-border/60 rounded-xl p-4 mb-5 text-sm text-muted-foreground">
          Cargando reporte desde Postgres...
        </div>
      )}

      <section className="relative rounded-2xl bg-stage border border-border/60 overflow-hidden p-8 lg:p-10 mb-6">
        <div className="absolute inset-0 bg-spotlight pointer-events-none" />
        <div className="relative grid lg:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <p className="text-[11px] tracking-[0.3em] text-muted-foreground uppercase mb-3">
              Ensayo finalizado
            </p>
            <h1 className="font-display text-4xl lg:text-5xl mb-2">
              Buen trabajo, {profile?.display_name ?? "actor"}{" "}
              <Sparkles className="inline w-7 h-7 text-primary" />
            </h1>
            <p className="text-muted-foreground">
              {report
                ? "Reporte sincronizado con rehearsal_sessions."
                : "No hay una sesion registrada todavia."}
            </p>
          </div>
          <Drama className="w-32 h-32 text-primary/70" strokeWidth={0.8} />
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        <div className="bg-card border border-border/60 rounded-xl p-5">
          <h3 className="font-medium mb-4">Resumen de la sesion</h3>
          <dl className="space-y-3 text-sm">
            <Row icon={BookOpen} k="Obra" v={report?.script?.title ?? "Sin libreto"} />
            <Row
              icon={Drama}
              k="Escena"
              v={
                <>
                  <span className="text-xs px-2 py-0.5 rounded-full border border-primary/40 text-primary mr-2">
                    {report?.scene?.title ?? "Sin escena"}
                  </span>
                  {report?.scene?.location ?? report?.scene?.description ?? ""}
                </>
              }
            />
            <Row
              icon={Crown}
              k="Personaje"
              v={
                report?.selectedCharacter
                  ? `${report.selectedCharacter.name} (Tu)`
                  : "Sin personaje"
              }
            />
            <Row
              icon={Sparkles}
              k="Modo"
              v={`${modeLabel(report?.mode ?? "individual")} - IA ${difficultyLabel(report?.ai_difficulty ?? 50)}`}
            />
            <Row icon={Calendar} k="Fecha" v={formatDate(report?.started_at)} />
            <Row
              icon={Clock}
              k="Duracion"
              v={report ? formatDuration(report.started_at, report.ended_at) : "Sin duracion"}
            />
          </dl>
        </div>

        <div className="bg-card border border-border/60 rounded-xl p-5">
          <h3 className="font-medium mb-4">Progreso de la escena</h3>
          <div className="flex justify-between text-xs mb-2">
            <span className="text-muted-foreground">Lineas completadas</span>
            <span>
              {completed} / {total}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface mb-5 overflow-hidden">
            <div
              className="h-full bg-primary-gradient"
              style={{ width: `${completedPercent}%` }}
            />
          </div>
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-muted-foreground">
              Las metricas de desempeno se generaran cuando integremos el analisis con IA.
              Por ahora, registramos el avance de tu sesion.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 bg-card border border-border/60 rounded-xl p-4">
        <Link
          to="/configuracion-ensayo"
          className="inline-flex items-center gap-2 text-sm border border-border bg-surface rounded-lg px-4 py-2 hover:border-primary/40"
        >
          <Repeat className="w-4 h-4" /> Repetir ensayo
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm bg-primary-gradient text-primary-foreground rounded-lg px-5 py-2 font-medium shadow-glow"
        >
          <Home className="w-4 h-4" /> Ir al inicio
        </Link>
      </div>
    </AppShell>
  );
}

function Row({ icon: Icon, k, v }: { icon: typeof BookOpen; k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <dt className="text-muted-foreground w-24 text-xs">{k}</dt>
      <dd className="flex-1 text-sm flex items-center flex-wrap">{v}</dd>
    </div>
  );
}


function formatDate(value?: string) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function difficultyLabel(value: number) {
  if (value < 33) return "facil";
  if (value < 66) return "media";
  return "alta";
}

function modeLabel(value: string) {
  if (value === "grupo") return "En grupo";
  if (value === "lectura") return "Lectura";
  return "Individual";
}
