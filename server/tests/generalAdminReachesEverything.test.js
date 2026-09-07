import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { requireAdminScope, requireGeneralAdmin } from "../middleware/auth.js";
import { ADMIN_SCOPES } from "../constants/adminScopes.js";

// « L'admin général doit avoir accès à TOUTE l'administration VIT AUTO ; les
// admins assignés gardent un accès restreint. »
//
// Ce fichier ne teste pas une poignée de cas choisis à la main : il PARCOURT
// les fichiers de routes réels et vérifie chaque garde qui y est effectivement
// posée. Une route admin ajoutée demain avec une nouvelle permission sera donc
// couverte automatiquement — y compris si cette permission a été oubliée dans
// la liste des permissions attribuables (le bug exact qui s'est produit :
// 4 domaines étaient gardés côté routes mais inattribuables côté interface).

const ROUTES_DIR = path.join(process.cwd(), "routes");

function collectGuards() {
  const scopes = new Set();
  const filesWithGeneral = [];
  for (const file of fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(ROUTES_DIR, file), "utf8");
    for (const m of src.matchAll(/requireAdminScope\("([^"]+)"\)/g)) scopes.add(m[1]);
    if (/requireGeneralAdmin/.test(src)) filesWithGeneral.push(file);
  }
  return { scopes: [...scopes].sort(), filesWithGeneral };
}

const pass = (middleware, user) => {
  const next = vi.fn();
  const res = { status: vi.fn(() => res), json: vi.fn(() => res) };
  middleware({ user }, res, next);
  return next.mock.calls.length > 0;
};

const GENERAL_ADMIN = { role: "admin", adminScope: ["super_admin"] };

describe("L'administrateur général atteint toute l'administration", () => {
  const { scopes, filesWithGeneral } = collectGuards();

  it("les routes admin posent bien des gardes (le test aurait sinon une valeur nulle)", () => {
    expect(scopes.length).toBeGreaterThan(5);
    expect(filesWithGeneral.length).toBeGreaterThan(0);
  });

  it("passe TOUTES les permissions réellement utilisées par les routes", () => {
    const refusees = scopes.filter((scope) => !pass(requireAdminScope(scope), GENERAL_ADMIN));
    expect(refusees, `permissions refusées à l'admin général : ${refusees.join(", ")}`).toEqual([]);
  });

  it("passe les routes réservées à l'administrateur général", () => {
    expect(pass(requireGeneralAdmin, GENERAL_ADMIN)).toBe(true);
  });

  it("toute permission gardée par une route est attribuable depuis l'interface", () => {
    // Sans ce contrôle, une route peut exiger une permission que personne ne
    // peut recevoir : l'admin général passe (il passe partout), mais AUCUN
    // admin assigné ne pourra jamais accéder à cette partie de la plateforme.
    const inattribuables = scopes.filter((s) => !ADMIN_SCOPES.includes(s));
    expect(inattribuables, `permissions inattribuables : ${inattribuables.join(", ")}`).toEqual([]);
  });

  it("un admin assigné, lui, reste bien restreint à ses domaines", () => {
    const financier = { role: "admin", adminScope: ["finance"] };
    expect(pass(requireAdminScope("finance"), financier)).toBe(true);

    const horsDomaine = scopes.filter((s) => s !== "finance" && s !== "super_admin");
    for (const scope of horsDomaine) {
      expect(pass(requireAdminScope(scope), financier), `l'admin finance ne doit pas passer "${scope}"`).toBe(false);
    }
    expect(pass(requireGeneralAdmin, financier)).toBe(false);
  });
});
