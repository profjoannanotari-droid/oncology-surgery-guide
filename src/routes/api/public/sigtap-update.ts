import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { z } from "zod";

export const Route = createFileRoute("/api/public/sigtap-update")({
  server: { handlers: { POST: async ({ request }) => {
    const failure = await authenticateCronRequest(request);
    if (failure) return failure;
    const body = z.object({ kind: z.literal("daily") }).strict().safeParse(await request.json().catch(() => null));
    if (!body.success) return Response.json({ error: "Solicitação inválida" }, { status: 400 });
    const { updateOfficialSigtap } = await import("@/lib/sigtap-update.server");
    return Response.json(await updateOfficialSigtap());
  } } },
});