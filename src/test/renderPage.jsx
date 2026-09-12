import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { vi } from "vitest";

import { ToastProvider } from "../context/ToastContext";
import { AuthProvider } from "../context/AuthContext";
import { SocketProvider } from "../context/SocketContext";
import { NotificationProvider } from "../context/NotificationContext";
import { ChatProvider } from "../context/ChatContext";
import { I18nProvider } from "../context/I18nContext";
import { CurrencyProvider } from "../context/CurrencyContext";
import { LocationProvider } from "../context/LocationContext";
import { VehicleProvider } from "../context/VehicleContext";
import { FavoritesProvider } from "../context/FavoritesContext";
import { CartProvider } from "../context/CartContext";

// Pile de contextes IDENTIQUE à celle d'App.jsx. Monter un écran hors de sa
// pile réelle testerait un composant qui n'existe pas en production — et
// laisserait justement passer les erreurs d'ordre d'initialisation.

export const utilisateurTest = (role = "client", extra = {}) => ({
  _id: "000000000000000000000001",
  firstName: "Test", lastName: "Utilisateur",
  email: "test@vit-auto.test",
  role,
  country: "MA",
  emailVerified: true,
  isActive: true,
  ...extra,
});

// Réponse par défaut d'une API : un objet contenant les clés de liste usuelles,
// toutes vides. Un écran doit savoir s'afficher SANS données — c'est même son
// premier rendu réel, avant l'arrivée des réponses.
const CHARGE_VIDE = {
  users: [], vehicles: [], bookings: [], drivers: [], activities: [],
  requests: [], transactions: [], invoices: [], notifications: [], chats: [],
  reports: [], reviews: [], onboardings: [], certifications: [], listings: [],
  conversations: [], subscriptions: [], profiles: [], items: [], results: [],
  data: [], payments: [], contracts: [], total: 0,
};

// Installe un `fetch` simulé. Toute route non prévue renvoie la charge vide :
// l'objectif est que l'écran se rende, pas de rejouer le backend.
export function simulerApi({ user = null, routes = {} } = {}) {
  const appels = [];
  const fetchSimule = vi.fn(async (input) => {
    const url = typeof input === "string" ? input : input?.url || "";
    appels.push(url);

    for (const [motif, charge] of Object.entries(routes)) {
      if (url.includes(motif)) {
        return { ok: true, status: 200, json: async () => charge, text: async () => JSON.stringify(charge) };
      }
    }
    if (url.includes("/api/auth/me")) {
      return user
        ? { ok: true, status: 200, json: async () => ({ user }) }
        : { ok: false, status: 401, json: async () => ({ message: "Non authentifié" }) };
    }
    return { ok: true, status: 200, json: async () => ({ ...CHARGE_VIDE }), text: async () => "{}" };
  });
  globalThis.fetch = fetchSimule;
  return { appels, fetchSimule };
}

export function connecter(user) {
  try {
    localStorage.setItem("vit-auto-token", "jeton-de-test");
    localStorage.setItem("vit-auto-refresh", "refresh-de-test");
  } catch { /* stockage indisponible */ }
  return simulerApi({ user });
}

// ⚠️ NE PAS DÉPASSER ~5 APPELS À renderPage() PAR FICHIER DE TEST.
// Monter l'arbre de contextes complet épuise l'environnement jsdom : au 7ᵉ
// montage dans un même fichier, le processus se fige — blocage SYNCHRONE, que
// le délai d'expiration des tests ne peut pas interrompre, et qui ressemble
// donc à une suite qui « rame » plutôt qu'à un échec. Vérifié : en déplaçant un
// test en tête, le blocage suit la POSITION et non la page. Chaque fichier
// ayant son propre environnement, la parade est de répartir les écrans sur
// plusieurs fichiers courts.

// Surveille la console pour attraper les exceptions qu'un ErrorBoundary
// avalerait : sans cela, un écran remplacé par l'écran d'erreur passerait pour
// un test réussi.
export function surveillerErreurs() {
  const erreurs = [];
  vi.spyOn(console, "error").mockImplementation((...args) => {
    erreurs.push(args.map(String).join(" "));
  });
  return erreurs;
}

export const MOTIFS_DE_PLANTAGE =
  /before initialization|is not a function|Cannot read propert|is not defined|Rendered (more|fewer) hooks|Maximum update depth/;

// `path` : motif de route (ex. "/vehicle/:id") quand l'écran lit useParams —
// sans lui, le motif serait l'URL littérale et le paramètre resterait vide.
export function renderPage(ui, { route = "/", path = route } = {}) {
  // GoogleOAuthProvider vit dans main.jsx, pas dans App.jsx — mais Login et
  // Register en dépendent (bouton « Continuer avec Google »). L'omettre faisait
  // échouer ces deux écrans sur « Google OAuth components must be used within
  // GoogleOAuthProvider » : un défaut du harnais, pas de l'application.
  return render(
    <GoogleOAuthProvider clientId="test-client-id">
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <NotificationProvider>
              <ChatProvider>
                <I18nProvider>
                  <CurrencyProvider>
                    <LocationProvider>
                      <VehicleProvider>
                        <FavoritesProvider>
                          <CartProvider>
                            {/* L'écran est monté DANS un <Routes>, comme dans
                                App.jsx. Ce n'est pas un détail : plusieurs
                                pages se protègent elles-mêmes par
                                <Navigate to="/login"> tant que la session
                                n'est pas résolue. Montée directement, sans
                                route, la page naviguait, se re-rendait,
                                naviguait encore — boucle infinie SYNCHRONE
                                que le délai d'expiration ne peut pas
                                interrompre. Avec une route de repli, la
                                navigation démonte l'écran, exactement comme
                                en production. */}
                            <Routes>
                              <Route path={path} element={ui} />
                              <Route path="*" element={<div data-testid="redirige" />} />
                            </Routes>
                          </CartProvider>
                        </FavoritesProvider>
                      </VehicleProvider>
                    </LocationProvider>
                  </CurrencyProvider>
                </I18nProvider>
              </ChatProvider>
            </NotificationProvider>
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
    </GoogleOAuthProvider>
  );
}
