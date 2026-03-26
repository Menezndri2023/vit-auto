import mongoose from "mongoose";
import offlineDB from "./offlineDB.js";

let isMongoConnected = false;

export const initDatabase = async () => {
  const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/vitauto";

  try {
    await mongoose.connect(MONGO_URI);
    isMongoConnected = true;
    console.log("✅ MongoDB connecté");
  } catch (err) {
    console.warn("⚠️  MongoDB indisponible, utilisation du mode offline");
    isMongoConnected = false;
  }
};

export const useDB = (mongoModel, collectionName) => {
  if (isMongoConnected) {
    return mongoModel;
  }
  return createOfflineProxy(offlineDB, collectionName);
};

const createOfflineProxy = (db, collectionName) => {
  return {
    find: (query) => db.find(collectionName, query),
    findOne: (query) => db.findOne(collectionName, query),
    findById: (id) => db.findById(collectionName, id),
    create: (data) => db.create(collectionName, data),
    updateOne: (query, update) => db.updateOne(collectionName, query, update),
    findByIdAndUpdate: (id, update) => db.findByIdAndUpdate(collectionName, id, update),
    deleteOne: (query) => db.deleteOne(collectionName, query),
  };
};

export default offlineDB;

