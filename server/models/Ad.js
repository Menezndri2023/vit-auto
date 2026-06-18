import mongoose from "mongoose";

const adSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  image:       { type: String },          // base64 ou URL externe
  link:        { type: String },          // URL de redirection au clic
  linkLabel:   { type: String, default: "En savoir plus" },
  position:    {
    type: String,
    enum: ["featured_section", "catalogue_top", "catalogue_mid", "sidebar"],
    default: "featured_section",
  },
  active:    { type: Boolean, default: true },
  priority:  { type: Number, default: 0 },   // plus grand = affiché en premier
  startDate: { type: Date, default: null },
  endDate:   { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  clicks:    { type: Number, default: 0 },
  views:     { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

adSchema.index({ position: 1, active: 1, priority: -1 });

const Ad = mongoose.models.Ad || mongoose.model("Ad", adSchema);
export default Ad;
