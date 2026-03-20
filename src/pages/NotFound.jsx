import React from "react";
import { Link } from "react-router-dom";

const NotFound = () => {
  return (
    <div style={{ padding: "60px", textAlign: "center" }}>
      <h1>404</h1>
      <p>Page introuvable.</p>
      <Link to="/">Retour à l'accueil</Link>
    </div>
  );
};

export default NotFound;
