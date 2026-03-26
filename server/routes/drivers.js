import express from "express";
import * as driverController from "../controllers/driverController.js";

const router = express.Router();

router.get("/", driverController.getDrivers);
router.get("/mine", driverController.getMyDrivers);
router.post("/", driverController.createDriver);

export default router;

