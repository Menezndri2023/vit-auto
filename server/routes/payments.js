import express from "express";
const router = express.Router();

router.post("/checkout", async (req, res) => {
  const { amount, currency = "EUR", method } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ message: "Montant invalide" });
  }

  // Simuler une transaction (à remplacer par Stripe/MoMo en production)
  const clientSecret = `simulated_client_secret_${Date.now()}`;

  return res.json({ success: true, clientSecret, amount, currency, method });
});

export default router;
