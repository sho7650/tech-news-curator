import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.enum(["healthy", "unhealthy"]),
  db: z.enum(["connected", "disconnected"]),
});
