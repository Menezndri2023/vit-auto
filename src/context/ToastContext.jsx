import React, { createContext, useContext, useState, useCallback } from "react";

const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  // Déclaré AVANT addToast, qui l'utilise : la référence était faite avant la
  // déclaration. Sans conséquence ici (elle n'est lue qu'au déclenchement du
  // minuteur), mais c'est exactement la forme qui, dans un TABLEAU DE
  // DÉPENDANCES, a fait planter tout le panneau d'administration en septembre.
  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = "info", duration = 3000) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
    return id;
  }, [removeToast]);

  const success = useCallback((message, duration = 3000) => addToast(message, "success", duration), [addToast]);
  const error = useCallback((message, duration = 5000) => addToast(message, "error", duration), [addToast]);
  const info = useCallback((message, duration = 3000) => addToast(message, "info", duration), [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, info }}>
      {children}
    </ToastContext.Provider>
  );
};
