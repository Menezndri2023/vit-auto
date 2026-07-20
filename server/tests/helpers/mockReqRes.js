import { vi } from "vitest";

// Les controllers de ce repo sont de simples fonctions (req, res) => {...},
// jamais montées via un vrai serveur HTTP dans ces tests (voir tests/README
// / plan : server.js n'exporte pas `app` et démarre au chargement du module).
// On les appelle donc directement avec un req/res factice sur une vraie DB
// en mémoire — ça exerce la vraie logique métier sans dépendre du transport HTTP.
export function mockReqRes({ body = {}, params = {}, user = null, query = {} } = {}) {
  const req = {
    body, params, user, query,
    headers: {}, ip: "127.0.0.1", method: "TEST", originalUrl: "/test",
  };
  const res = {
    statusCode: 200,
    status: vi.fn(function status(code) {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn(function json(payload) {
      res.body = payload;
      return res;
    }),
    send: vi.fn(function send(payload) {
      res.body = payload;
      return res;
    }),
    sendStatus: vi.fn(function sendStatus(code) {
      res.statusCode = code;
      return res;
    }),
  };
  return { req, res };
}
