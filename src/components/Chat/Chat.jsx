import { useState, useRef, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useChat } from "../../context/ChatContext";
import { getAssistantResponse } from "./VirtualAssistant";
import styles from "./Chat.module.css";

const timeAgo = (dateStr) => {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  if (m < 1)  return "à l'instant";
  if (m < 60) return `${m}min`;
  if (h < 24) return `${h}h`;
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
};

const CHANNELS = [
  { id: "assistant", icon: "🤖", name: "Assistant VIT AUTO", desc: "Réponses instantanées 24h/24", color: "#ecfdf5", bot: true },
  { id: "support",   icon: "🎧", name: "Service Client",     desc: "Notre équipe vous répond",   color: "#f0f6ff", type: "client_support" },
];

// Libellé et icône selon le type de conversation
const CHAT_META = {
  client_partner:  { icon: "🤝", label: "Partenaire",           color: "#f5f3ff" },
  client_support:  { icon: "🎧", label: "Service Client VIT AUTO", color: "#f0f6ff" },
  partner_support: { icon: "🎧", label: "Support Partenaires",  color: "#fff7ed" },
};

// ── Composant message individuel ──────────────────────────────────────────
function Bubble({ msg, isMe, isBot }) {
  const cls = isMe ? styles.bubbleMine : isBot ? styles.bubbleBot : styles.bubbleOther;
  return (
    <div className={`${styles.bubble} ${cls}`}>
      {!isMe && !isBot && msg.sender && (
        <div className={styles.bubbleSender}>
          {msg.sender.role === "admin"
            ? "🎧 Service Client VIT AUTO"
            : `${msg.sender.firstName} ${msg.sender.lastName}`}
        </div>
      )}
      {isBot && <div className={styles.bubbleSender}>🤖 Assistant VIT AUTO</div>}
      <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
      {isMe
        ? <div className={styles.bubbleTime}>{timeAgo(msg.createdAt)}</div>
        : <div className={styles.bubbleTimeOther}>{timeAgo(msg.createdAt)}</div>
      }
    </div>
  );
}

// ── Vue : liste des canaux / conversations ────────────────────────────────
function ChannelList({ onSelect, onOpenChannel, user }) {
  const { chats } = useChat();

  // Toutes les conversations réelles déjà ouvertes (tous types)
  const existingChats = chats.filter((c) =>
    c.type === "client_partner" ||
    c.type === "client_support"  ||
    c.type === "partner_support"
  );

  // Canaux "Assistance" à afficher selon le rôle
  const visibleChannels = user?.role === "partenaire"
    ? [
        CHANNELS[0], // assistant
        { id: "partner_support", icon: "🎧", name: "Support Partenaires", desc: "Aide pour votre espace partenaire", color: "#fff7ed", type: "partner_support" },
      ]
    : CHANNELS; // assistant + service client pour clients

  return (
    <div className={styles.channelList}>
      <div className={styles.divider}>Assistance</div>
      {visibleChannels.map((ch) => (
        <div key={ch.id} className={styles.channelCard} onClick={() => onOpenChannel(ch)}>
          <div className={styles.channelIcon} style={{ background: ch.color }}>{ch.icon}</div>
          <div className={styles.channelInfo}>
            <div className={styles.channelName}>{ch.name}</div>
            <div className={styles.channelDesc}>{ch.desc}</div>
          </div>
        </div>
      ))}

      {existingChats.length > 0 && (
        <>
          <div className={styles.divider}>Conversations actives</div>
          {existingChats.map((c) => {
            const meta     = CHAT_META[c.type] || CHAT_META.client_partner;
            const other    = c.other;
            // Pour les conversations support, afficher "Service Client VIT AUTO"
            const isSupport = c.type === "client_support" || c.type === "partner_support";
            const name     = isSupport
              ? meta.label
              : other ? `${other.firstName} ${other.lastName}` : "Partenaire";
            const initials = isSupport
              ? meta.icon
              : other ? (other.firstName?.[0] || "?").toUpperCase() : "?";

            return (
              <div key={c._id} className={styles.channelCard} onClick={() => onSelect(c)}>
                <div className={styles.channelIcon} style={{ background: meta.color, fontSize: isSupport ? "1.2rem" : "1rem", fontWeight: 700 }}>
                  {isSupport
                    ? meta.icon
                    : other?.profilePhoto
                      ? <img src={other.profilePhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} />
                      : initials}
                </div>
                <div className={styles.channelInfo}>
                  <div className={styles.channelName}>{name}</div>
                  <div className={styles.channelLast}>{c.lastMessage || "Conversation ouverte"}</div>
                </div>
                {c.unread > 0 && <span className={styles.channelBadge}>{c.unread}</span>}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── Vue : conversation ────────────────────────────────────────────────────
function ConversationView({ channel }) {
  const { user }   = useAuth();
  const { messages, sendMessage } = useChat();
  const [text, setText]  = useState("");
  const [botMsgs, setBotMsgs] = useState([
    { _id: "bot-0", content: "Bonjour ! 👋 Je suis l'assistant virtuel VIT AUTO. Comment puis-je vous aider aujourd'hui ?", isBot: true, createdAt: new Date().toISOString() },
  ]);
  const bottomRef = useRef(null);
  const isBot     = channel?.bot;

  const displayedMsgs = isBot ? botMsgs : messages;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayedMsgs]);

  const handleSend = async () => {
    if (!text.trim()) return;
    const userMsg = text.trim();
    setText("");

    if (isBot) {
      const userBubble = { _id: `u-${Date.now()}`, content: userMsg, isMe: true, createdAt: new Date().toISOString() };
      setBotMsgs((prev) => [...prev, userBubble]);
      setTimeout(() => {
        const reply = getAssistantResponse(userMsg);
        setBotMsgs((prev) => [...prev, { _id: `b-${Date.now()}`, content: reply, isBot: true, createdAt: new Date().toISOString() }]);
      }, 600);
    } else {
      await sendMessage(userMsg);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };


  return (
    <>
      <div className={styles.messages}>
        {displayedMsgs.map((msg) => {
          const isMe  = msg.isMe || (msg.sender && (msg.sender._id === user?._id || msg.sender === user?._id));
          const bot   = msg.isBot;
          return <Bubble key={msg._id || msg.createdAt} msg={msg} isMe={isMe} isBot={bot} />;
        })}
        {!isBot && displayedMsgs.length === 0 && (
          <div className={styles.emptyMsg}>
            <span>💬</span>
            <p>Démarrez la conversation</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className={styles.inputRow}>
        <textarea
          className={styles.input}
          placeholder="Votre message..."
          value={text}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
        />
        <button className={styles.sendBtn} onClick={handleSend} disabled={!text.trim()}>
          ➤
        </button>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════
export default function Chat() {
  const { user, isAuthenticated } = useAuth();
  const { open, setOpen, closeChat, openOrCreateChat, selectChat, unreadTotal, loading } = useChat();

  const [view, setView]             = useState("list"); // "list" | "convo"
  const [activeChannel, setActiveChannel] = useState(null);

  if (!isAuthenticated) return null;

  const handleFab = () => {
    if (open) { closeChat(); setView("list"); }
    else setOpen(true);
  };

  const handleOpenChannel = async (ch) => {
    if (ch.bot) {
      setActiveChannel(ch);
      setView("convo");
    } else {
      const type = ch.type || "client_support";
      const chat = await openOrCreateChat(type);
      if (chat) {
        setActiveChannel(ch);
        setView("convo");
      }
    }
  };

  const handleSelectChat = async (chat) => {
    await selectChat(chat);
    const meta = CHAT_META[chat.type] || CHAT_META.client_partner;
    const isSupport = chat.type === "client_support" || chat.type === "partner_support";
    const name = isSupport
      ? meta.label
      : chat.other ? `${chat.other.firstName} ${chat.other.lastName}` : "Conversation";
    setActiveChannel({ name, icon: meta.icon, color: meta.color });
    setView("convo");
  };

  const handleBack = () => {
    setView("list");
    setActiveChannel(null);
  };

  const channelName = activeChannel?.name || "Chat";
  const channelSub  = activeChannel?.bot ? "Assistant virtuel · 24h/24" : "Conversation";

  return (
    <>
      {/* ── Bouton flottant ── */}
      <div className={styles.fab}>
        <button className={styles.fabBtn} onClick={handleFab} aria-label="Ouvrir le chat">
          {open ? "✕" : "💬"}
          {!open && unreadTotal > 0 && (
            <span className={styles.fabBadge}>{unreadTotal > 9 ? "9+" : unreadTotal}</span>
          )}
        </button>
      </div>

      {/* ── Fenêtre ── */}
      {open && (
        <div className={styles.window}>
          {/* Header */}
          <div className={styles.header}>
            {view === "convo" && (
              <button className={styles.headerBack} onClick={handleBack}>←</button>
            )}
            <div className={styles.headerAvatar}>
              {view === "convo"
                ? (activeChannel?.icon || "💬")
                : "💬"}
            </div>
            <div className={styles.headerInfo}>
              <div className={styles.headerName}>{view === "list" ? "VIT AUTO Chat" : channelName}</div>
              <div className={styles.headerSub}>{view === "list" ? `Bonjour ${user?.firstName || ""}` : channelSub}</div>
            </div>
            <button className={styles.headerClose} onClick={handleFab}>✕</button>
          </div>

          {/* Corps */}
          {loading ? (
            <div className={styles.loadingMsg}>⏳ Chargement...</div>
          ) : view === "list" ? (
            <ChannelList
              onSelect={handleSelectChat}
              onOpenChannel={handleOpenChannel}
              user={user}
            />
          ) : (
            <ConversationView channel={activeChannel} />
          )}
        </div>
      )}
    </>
  );
}
