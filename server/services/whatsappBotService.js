/**
 * VIT AUTO — Bot WhatsApp partenaires (Claude)
 *
 * Répond automatiquement aux prospects/partenaires qui écrivent sur le numéro
 * WhatsApp Business (Meta Cloud API, déjà utilisé en sortie — voir
 * WhatsAppChannel.js). Bascule vers un humain (status="escalated") dès que
 * Claude juge la demande hors de son périmètre : négociation commerciale,
 * plainte, litige, ou question dont il n'est pas sûr de la réponse.
 */
import Anthropic from "@anthropic-ai/sdk";
import logger from "../utils/logger.js";
import { captureException } from "../config/sentry.js";

// Modèle réglable sans redéploiement (variable Render WHATSAPP_BOT_MODEL) :
// claude-haiku-4-5 coûte environ 5 fois moins cher que claude-opus-5.
const modele = () => (process.env.WHATSAPP_BOT_MODEL || "claude-opus-5").trim();
const MAX_HISTORY_MESSAGES = 10; // fenêtre de contexte envoyée à Claude (les plus récents)
const MAX_CARACTERES_MESSAGE = 1500; // un pavé collé ne doit pas coûter un roman

// Plafonds de dépense : au-delà, réponse d'attente sans appel à Claude et
// conversation remise à un conseiller (le bot ne reprend plus la main).
const plafond = (nom, defaut) => {
  const n = parseInt(process.env[nom], 10);
  return Number.isFinite(n) && n >= 0 ? n : defaut;
};
const PLAFOND_PAR_NUMERO_24H = () => plafond("WHATSAPP_BOT_MAX_PAR_NUMERO_24H", 15);
const PLAFOND_GLOBAL_JOUR    = () => plafond("WHATSAPP_BOT_MAX_PAR_JOUR", 200);
// Compteur global en mémoire (un seul serveur Render) ; remis à zéro chaque jour.
const appelsDuJour = { jour: "", n: 0 };
export function _reinitialiserCompteurBot() { appelsDuJour.jour = ""; appelsDuJour.n = 0; }

// Faits vérifiés sur le programme partenaire VIT AUTO — le modèle ne doit
// jamais inventer un chiffre ou une règle absente d'ici : mieux vaut escalader
// que répondre une donnée fausse à un futur partenaire (commissions, quotas).
const SYSTEM_PROMPT = `Tu es l'assistant WhatsApp de VIT AUTO, plateforme de location et vente de véhicules en Afrique de l'Ouest (14 pays), qui répond aux prospects et futurs partenaires (loueurs, concessionnaires, exportateurs) qui écrivent sur ce numéro.

Ton rôle : présenter clairement le programme partenaire VIT AUTO et orienter le prospect vers les bonnes étapes. Réponses courtes et adaptées à WhatsApp (pas de longs pavés), ton chaleureux et professionnel, en français sauf si le prospect écrit dans une autre langue.

Faits vérifiés que tu peux utiliser (n'invente jamais de chiffre ou de règle qui n'est pas ici) :
- Programme "Founding Partner" : étape obligatoire pour tout nouveau partenaire (particulier, professionnel, entreprise, exportateur), aucune limite de places — avantages commerciaux (commissions réduites pendant 12 mois) contre la signature en ligne d'une LOI puis d'un Accord de partenariat.
- Toute publication d'annonce nécessite d'avoir complété ce programme Founding Partner (identité + LOI + Accord signés) au préalable.
- VIT AUTO couvre location, vente, chauffeur privé, leasing/crédit, et l'import/export de véhicules entre partenaires.
- Le processus d'inscription se fait entièrement en ligne sur vit-auto.com.

Ce que tu NE dois JAMAIS faire :
- Annoncer un taux de commission précis, un tarif, ou une exception commerciale — dis que ça dépend du dossier et qu'un conseiller confirmera.
- Confirmer ou infirmer le statut d'une candidature précise (tu n'as pas accès à la base de données).
- Prendre un engagement contractuel au nom de VIT AUTO.

Réponds au format JSON demandé. Mets escalate=true si : le prospect négocie des conditions commerciales, se plaint, décrit un litige, insiste pour parler à un humain, ou pose une question à laquelle tu ne peux pas répondre avec certitude à partir des faits ci-dessus.`;

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

/**
 * Génère la réponse du bot pour un message entrant, à partir de l'historique
 * de conversation déjà persisté (messages passés + le nouveau message inclus).
 * @param {{role: "user"|"assistant"|"admin", content: string}[]} messages
 * @returns {Promise<{reply: string, escalate: boolean, escalationReason: string|null}>}
 */
const REPONSE_ATTENTE = "Merci pour votre message — un conseiller VIT AUTO va vous répondre dès que possible.";

export async function generateBotReply(messages) {
  const client = getClient();
  if (!client) {
    logger.warn("[WhatsAppBot] ANTHROPIC_API_KEY absente — bot désactivé");
    return { reply: REPONSE_ATTENTE, escalate: true, escalationReason: "bot_non_configure" };
  }

  const depuis = Date.now() - 24 * 3600 * 1000;
  const reponsesBot24h = messages.filter((m) => m.role === "assistant" && new Date(m.timestamp || 0).getTime() >= depuis).length;
  if (reponsesBot24h >= PLAFOND_PAR_NUMERO_24H()) {
    logger.warn("[WhatsAppBot] Plafond par numéro atteint — conversation remise à un conseiller");
    return { reply: REPONSE_ATTENTE, escalate: true, escalationReason: "plafond_par_numero" };
  }
  const jour = new Date().toISOString().slice(0, 10);
  if (appelsDuJour.jour !== jour) { appelsDuJour.jour = jour; appelsDuJour.n = 0; }
  if (appelsDuJour.n >= PLAFOND_GLOBAL_JOUR()) {
    logger.warn("[WhatsAppBot] Plafond quotidien global atteint — conversation remise à un conseiller");
    return { reply: REPONSE_ATTENTE, escalate: true, escalationReason: "plafond_quotidien" };
  }
  appelsDuJour.n += 1;

  // admin -> assistant pour l'API (Claude ne connaît que user/assistant) ;
  // le rôle "admin" n'existe que côté stockage pour distinguer une réponse
  // humaine d'une réponse du bot dans l'historique affiché en admin.
  const apiMessages = messages
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: String(m.content).slice(0, MAX_CARACTERES_MESSAGE) }));
  // La fenêtre peut commencer par une réponse : l'API exige un premier message « user ».
  while (apiMessages.length && apiMessages[0].role !== "user") apiMessages.shift();
  const model = modele();
  // Haiku ne connaît ni le niveau d'effort ni le repli serveur.
  const famillePremium = /^claude-(opus|fable|sonnet)-/.test(model);

  try {
    // Réflexion active par défaut sur ce modèle : effort bas (réponse de chat
    // courte) et marge de jetons pour que le JSON ne soit jamais tronqué.
    // En cas de refus, l'API rejoue la requête sur un modèle de repli.
    const response = await client.beta.messages.create({
      model,
      max_tokens: famillePremium ? 4096 : 1024,
      ...(/^claude-(opus-5|fable-5)/.test(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
      system: SYSTEM_PROMPT,
      messages: apiMessages,
      output_config: {
        ...(famillePremium ? { effort: "low" } : {}),
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              reply: {
                type: "string",
                description: "Réponse à envoyer telle quelle au prospect sur WhatsApp.",
              },
              escalate: {
                type: "boolean",
                description: "true si un humain doit reprendre la conversation.",
              },
              escalationReason: {
                type: ["string", "null"],
                description: "Motif court de l'escalade (null si escalate=false).",
              },
            },
            required: ["reply", "escalate", "escalationReason"],
            additionalProperties: false,
          },
        },
      },
    });

    if (response.stop_reason === "refusal") {
      logger.warn("[WhatsAppBot] Réponse refusée par les classifieurs de sécurité");
      return {
        reply: "Merci pour votre message — un conseiller VIT AUTO va vous répondre dès que possible.",
        escalate: true,
        escalationReason: "refus_securite",
      };
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) throw new Error("Réponse Claude sans bloc texte");

    const parsed = JSON.parse(textBlock.text);
    return {
      reply: parsed.reply,
      escalate: !!parsed.escalate,
      escalationReason: parsed.escalationReason || null,
    };
  } catch (err) {
    logger.error("[WhatsAppBot] Erreur génération réponse:", err.message);
    captureException(err, { context: "whatsappBotService.generateBotReply" });
    return {
      reply: "Merci pour votre message — un conseiller VIT AUTO va vous répondre dès que possible.",
      escalate: true,
      escalationReason: "erreur_technique",
    };
  }
}
