export const createPayment = async (req, res) => {
  try {
    const payment = await Payment.create({
      ...req.body,
      status: "completed",
    });

    res.json(payment);
  } catch (err) {
    res.status(400).json(err);
  }
};


