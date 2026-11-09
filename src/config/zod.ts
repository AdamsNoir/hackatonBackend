import { z } from "zod";

/* =====================================================================
   ZOD ERROR MESSAGES IN FRENCH
   Replaces zod's default English messages when we did not write one.
   ===================================================================== */
z.setErrorMap((issue, context) => {
  if (issue.code === "invalid_type") {
    return { message: issue.received === "undefined" ? "Champ requis." : "Format de données invalide." };
  }
  if (issue.code === "unrecognized_keys") return { message: "Champs non autorisés." };
  return { message: context.defaultError };
});
