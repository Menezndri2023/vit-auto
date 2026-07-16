# Politique de continuité d'activité — VIT AUTO

> Document interne. Rédigé le 2026-07-16 — décrit l'état réel, signale clairement ce qui n'est pas encore en place.

## 1. Dépendances critiques de la plateforme

| Service | Rôle | Impact si indisponible |
|---|---|---|
| MongoDB Atlas | Base de données principale | Arrêt total du site |
| Railway | Hébergement backend (API) | Arrêt total du site |
| Vercel | Hébergement frontend | Site inaccessible (API pourrait rester joignable directement) |
| Upstash (Redis) | Cache + files d'attente (BullMQ) | Dégradation gracieuse déjà en place — voir §2 |
| Stripe | Paiement carte | Paiement carte indisponible, autres moyens de paiement fonctionnent toujours |
| Resend | Envoi d'emails | Notifications email non envoyées, le reste du site continue de fonctionner |

## 2. Résilience déjà en place

- **Circuit-breaker Redis** : en cas de dépassement de quota ou de panne Upstash, les workers de file d'attente se mettent en pause automatiquement puis reprennent — les fonctionnalités principales (réservation, paiement, publication) ne dépendent pas de Redis pour fonctionner, seulement les tâches asynchrones (email, SMS, PDF) qui sont différées plutôt que bloquantes.
- **Fallback synchrone** : si BullMQ/Redis est totalement indisponible, certaines tâches basculent en traitement synchrone plutôt que d'échouer silencieusement.

## 3. Ce qui n'existe pas à ce jour (ne pas présenter comme couvert)

- **Pas de plan de reprise après sinistre (PRA) documenté et testé** — en cas de panne prolongée de MongoDB Atlas ou Railway, il n'existe pas de procédure de bascule vers un environnement de secours.
- **Pas d'environnement de secours/multi-région** — un seul environnement de production (voir ARCHITECTURE.md, note de vérification 2026-07-16).
- **Pas de test de restauration de sauvegarde régulier documenté.**
- **Pas d'astreinte formalisée** (qui est réveillé en cas de panne à 3h du matin, sur quel canal) — à définir avant toute croissance significative du trafic.

## 4. Recommandations avant mise à l'échelle

1. Documenter et tester au moins une fois une procédure de restauration complète depuis une sauvegarde MongoDB Atlas.
2. Définir un point de contact d'astreinte et un canal d'alerte (déjà partiellement outillé via Sentry, à compléter par une alerte téléphonique/SMS pour les pannes critiques).
3. Évaluer le coût d'un environnement de secours a minima pour la base de données (le frontend/backend redéploient vite depuis Git, la donnée est le vrai point de fragilité).
