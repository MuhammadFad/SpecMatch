import mongoose from 'mongoose';

const steamAppSchema = new mongoose.Schema({
    appid: { type: Number, required: true, unique: true },
    name: { type: String, required: true }
});

// Index for fast prefix searches
steamAppSchema.index({ name: 1 });

// Text index for text search (optional fallback)
steamAppSchema.index({ name: 'text' });

export default mongoose.model('SteamApp', steamAppSchema, "SteamApps");