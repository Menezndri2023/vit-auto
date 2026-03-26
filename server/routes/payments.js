import express from "express";
import * as paymentController from "../controllers/paymentController.js";

const router = express.Router();

router.post("/", paymentController.createPayment);

export default router;
