import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const JoinInput = z.object({
  inviteCode: z
    .string()
    .trim()
    .min(6)
    .max(16)
    .regex(/^[A-Za-z0-9]+$/, "Codigo invalido"),
});

export const joinGroupByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => JoinInput.parse(input))
  .handler(async ({ data, context }) => {
    const code = data.inviteCode.toUpperCase();

    const { data: group, error: groupErr } = await supabaseAdmin
      .from("rehearsal_groups")
      .select("id, name")
      .eq("invite_code", code)
      .maybeSingle();

    if (groupErr) throw new Error(groupErr.message);
    if (!group) throw new Error("Codigo de invitacion no encontrado.");

    const userId = context.userId;

    const { error: insertErr } = await supabaseAdmin
      .from("rehearsal_group_members")
      .upsert(
        { group_id: group.id, user_id: userId, role: "member" },
        { onConflict: "group_id,user_id", ignoreDuplicates: true },
      );

    if (insertErr) throw new Error(insertErr.message);

    return { groupId: group.id, groupName: group.name };
  });
