import mongoose from "mongoose";

export function validateObjectId(...paramNames) {
  const names = paramNames.length ? paramNames : ["id"];
  return (req, res, next) => {
    for (const name of names) {
      const value = req.params[name];
      if (value !== undefined && !mongoose.Types.ObjectId.isValid(value)) {
        return res.status(400).json({ message: `Paramètre '${name}' invalide.` });
      }
    }
    next();
  };
}
