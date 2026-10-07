import { describe, it, expect } from "vitest";
import { inventaireIntegrations } from "../utils/inventaireIntegrations.js";
import { numeroWhatsApp } from "../services/communication/channels/WhatsAppChannel.js";

describe("inventaireIntegrations", () => {
  it("classe chaque intégration sans jamais renvoyer de valeur", () => {
    const env = {
      MONGO_URI: "mongodb+srv://secret@hote/db",
      WHATSAPP_TOKEN: "EAAG-secret",
      WHATSAPP_PHONE_ID: "  ",
      AT_USERNAME: "vitauto",
      AT_API_KEY: "atsk_xxxxxxxxxxxxxxxxxxxx",
    };
    const r = inventaireIntegrations(env);
    expect(r["Base de données (MongoDB)"]).toEqual({ etat: "configuré", manquantes: [] });
    expect(r["WhatsApp — envoi (Meta)"]).toEqual({ etat: "incomplet", manquantes: ["WHATSAPP_PHONE_ID"] });
    expect(r["WhatsApp — webhook (Meta)"].etat).toBe("absent");
    // Une valeur d'exemple recopiée n'est pas une configuration.
    expect(r["SMS Afrique (Africa's Talking)"]).toEqual({ etat: "incomplet", manquantes: ["AT_API_KEY"] });
    const texte = JSON.stringify(r);
    expect(texte).not.toContain("secret");
    expect(texte).not.toContain("EAAG");
  });
});

describe("numeroWhatsApp", () => {
  it("ne garde que les chiffres, indicatif compris", () => {
    expect(numeroWhatsApp("+225 07-01.02(03)04")).toBe("2250701020304");
    expect(numeroWhatsApp("00212 6 12 34 56 78")).toBe("212612345678");
    expect(numeroWhatsApp("212612345678")).toBe("212612345678");
  });
});
