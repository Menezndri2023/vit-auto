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

const MODEL = "claude-opus-4-8";
const MAX_HISTORY_MESSAGES = 20; // fenêtre de contexte envoyée à Claude (les plus récents)

// Faits vérifiés sur le programme partenaire VIT AUTO — le modèle ne doit
// jamais inventer un chiffre ou une règle absente d'ici : mieux vaut escalader
// que répondre une donnée fausse à un futur partenaire (commissions, quotas).
const SYSTEM_PROMPT = `Tu es l'assistant WhatsApp de VIT AUTO, plateforme de location et vente de véhicules en Afrique de l'Ouest (14 pays), qui répond aux prospects et futurs partenaires (loueurs, concessionnaires, exportateurs) qui écrivent sur ce numéro.

Ton rôle : présenter clairement le programme partenaire VIT AUTO et orienter le prospect vers les bonnes étapes. Réponses courtes et adaptées à WhatsApp (pas de longs pavés), ton chaleureux et professionnel, en français sauf si le prospect écrit dans une autre langue.

Faits vérifiés que tu peux utiliser (n'invente jamais de chiffre ou de règle qui n'est pas ici) :
- Programme "Founding Partner" : réservé aux 20 premiers partenaires par pays, avantages commerciaux (commissions réduites la première année) contre un engagement fort (LOI puis Accord de partenariat signés en ligne).
- Toute publication d'annonce nécessite une vérification d'identité (KYC) pour un particulier, ou une certification entreprise complète (documents légaux, représentant, activité commerciale, compte bancaire professionnel) pour une société.
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
export async function generateBotReply(messages) {
  const client = getClient();
  if (!client) {
    logger.warn("[WhatsAppBot] ANTHROPIC_API_KEY absente — bot désactivé");
    return {
      reply: "Merci pour votre message — un conseiller VIT AUTO va vous répondre dès que possible.",
      escalate: true,
      escalationReason: "bot_non_configure",
    };
  }

  // admin -> assistant pour l'API (Claude ne connaît que user/assistant) ;
  // le rôle "admin" n'existe que côté stockage pour distinguer une réponse
  // humaine d'une réponse du bot dans l'historique affiché en admin.
  const apiMessages = messages
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: apiMessages,
      output_config: {
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
