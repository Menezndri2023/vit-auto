// Double de socket.io-client pour les tests de rendu.
//
// SocketContext ouvre une vraie connexion avec `reconnectionAttempts: Infinity`
// et un délai de reconnexion de 2 à 30 s. En test, aucun serveur n'écoute :
// chaque écran monté laissait donc derrière lui une connexion qui se relançait
// indéfiniment, avec ses requêtes de transport. Au septième écran, la suite se
// figeait — un blocage synchrone, que le délai d'expiration des tests ne peut
// pas interrompre.
//
// Ce double n'émet ni ne reçoit rien : les tests de rendu vérifient qu'un écran
// s'affiche sans exception, pas le temps réel, qui relève de la suite serveur.

const bruit = () => {};

export const io = () => ({
  id: "socket-de-test",
  connected: false,
  on: bruit,
  off: bruit,
  once: bruit,
  emit: bruit,
  connect: bruit,
  disconnect: bruit,
  removeAllListeners: bruit,
  io: { on: bruit, off: bruit },
});

export default { io };
