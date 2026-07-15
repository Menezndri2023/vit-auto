import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import * as fav from "../controllers/favoriteController.js";

const router = Router();

router.get("/",                         authenticate, fav.getFavorites);
router.get("/ids",                      authenticate, fav.getFavoriteIds);
router.post("/",                        authenticate, fav.addFavorite);
router.delete("/:itemType/:itemId",     authenticate, validateObjectId("itemId"), fav.removeFavorite);

export default router;
