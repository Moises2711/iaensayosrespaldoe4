import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, LogOut, Plus, Trash2, Users, KeyRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import {
  createRehearsalGroup,
  deleteRehearsalGroup,
  getMyRehearsalGroups,
  leaveRehearsalGroup,
} from "@/lib/rehearsal-data";
import { joinGroupByCode } from "@/lib/groups.functions";

export const Route = createFileRoute("/grupos")({
  component: Grupos,
});

function Grupos() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const join = useServerFn(joinGroupByCode);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["rehearsal-groups"],
    queryFn: getMyRehearsalGroups,
    enabled: Boolean(user),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["rehearsal-groups"] });
    queryClient.invalidateQueries({ queryKey: ["scripts"] });
  };

  const createMutation = useMutation({
    mutationFn: () => createRehearsalGroup({ name: newName, description: newDesc }),
    onSuccess: () => {
      setNewName("");
      setNewDesc("");
      refresh();
      toast.success("Grupo creado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo crear el grupo"),
  });

  const joinMutation = useMutation({
    mutationFn: () => join({ data: { inviteCode: joinCode.trim() } }),
    onSuccess: (res) => {
      setJoinCode("");
      refresh();
      toast.success(`Te uniste a "${res.groupName}"`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo unir al grupo"),
  });

  const leaveMutation = useMutation({
    mutationFn: (groupId: string) => leaveRehearsalGroup(groupId),
    onSuccess: () => {
      refresh();
      toast.success("Saliste del grupo");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo salir"),
  });

  const deleteMutation = useMutation({
    mutationFn: (groupId: string) => deleteRehearsalGroup(groupId),
    onSuccess: () => {
      refresh();
      toast.success("Grupo eliminado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo eliminar"),
  });

  const copyCode = (code: string) => {
    navigator.clipboard?.writeText(code);
    toast.success(`Codigo ${code} copiado`);
  };

  if (!user) {
    return (
      <AppShell>
        <TopBar />
        <div className="bg-card border border-border/60 rounded-xl p-6 text-sm text-muted-foreground">
          Inicia sesion para administrar tus grupos de ensayo.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <TopBar />

      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-4xl">Grupos de ensayo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crea grupos privados, comparte el codigo y manten los libretos solo entre miembros.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mb-6">
        <div className="bg-card border border-border/60 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Plus className="w-4 h-4 text-primary" />
            <h3 className="font-medium">Crear grupo</h3>
          </div>
          <div className="space-y-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre del grupo"
              maxLength={120}
              className="w-full bg-surface border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Descripcion (opcional)"
              rows={2}
              className="w-full bg-surface border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50 resize-none"
            />
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newName.trim() || createMutation.isPending}
              className="w-full"
            >
              {createMutation.isPending ? "Creando..." : "Crear grupo"}
            </Button>
          </div>
        </div>

        <div className="bg-card border border-border/60 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <KeyRound className="w-4 h-4 text-primary" />
            <h3 className="font-medium">Unirse con codigo</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Ingresa el codigo de invitacion que te compartio el dueño del grupo.
          </p>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABCD1234"
              maxLength={16}
              className="flex-1 bg-surface border border-border/60 rounded-lg px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:border-primary/50"
            />
            <Button
              onClick={() => joinMutation.mutate()}
              disabled={joinCode.trim().length < 6 || joinMutation.isPending}
              variant="secondary"
            >
              {joinMutation.isPending ? "Uniendo..." : "Unirme"}
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border/60 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="font-medium">Mis grupos</h3>
        </div>

        {isLoading && (
          <p className="text-sm text-muted-foreground">Cargando grupos...</p>
        )}

        {!isLoading && groups.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aun no perteneces a ningun grupo. Crea uno o unete con un codigo.
          </p>
        )}

        <div className="space-y-3">
          {groups.map((group) => (
            <div
              key={group.id}
              className="flex flex-wrap items-center gap-4 border border-border/40 bg-surface/60 rounded-lg p-4"
            >
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2">
                  <span className="font-display text-lg">{group.name}</span>
                  {group.myRole === "owner" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                      OWNER
                    </span>
                  )}
                </div>
                {group.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>
                )}
                <p className="text-[11px] text-muted-foreground mt-1">
                  {group.memberCount} miembro{group.memberCount === 1 ? "" : "s"}
                </p>
              </div>

              <button
                onClick={() => copyCode(group.invite_code)}
                className="inline-flex items-center gap-1.5 font-mono text-sm border border-border/60 bg-background rounded-md px-3 py-1.5 hover:border-primary/40"
                title="Copiar codigo"
              >
                {group.invite_code} <Copy className="w-3.5 h-3.5" />
              </button>

              {group.myRole === "owner" ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="w-3.5 h-3.5" /> Eliminar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eliminar grupo "{group.name}"?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se eliminara el grupo y todas las membresias. Los libretos vinculados
                        quedaran sin grupo (no se borran).
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteMutation.mutate(group.id)}>
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => leaveMutation.mutate(group.id)}
                  disabled={leaveMutation.isPending}
                >
                  <LogOut className="w-3.5 h-3.5" /> Salir
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
