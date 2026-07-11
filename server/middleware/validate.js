import { ZodError } from "zod";

// ── Middleware de validation Zod ─────────────────────────────────────────────
// Usage : router.post("/", validate(mySchema), controller)
// Par défaut valide req.body. Passer target="query" ou "params" pour les autres.
export function validate(schema, target = "body") {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req[target]);
      req[target] = parsed; // remplace par les données parsées/nettoyées
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        // Zod v4 : les issues sont exposées via `.issues` (`.errors` n'existe plus —
        // avec l'ancien code ceci levait une TypeError et transformait tout 422 en 500).
        const errors = (err.issues || err.errors || []).map((e) => ({
          field:   e.path.join("."),
          message: e.message,
        }));
        return res.status(422).json({
          success: false,
          error:   "Données invalides",
          details: errors,
        });
      }
      next(err);
    }
  };
}
