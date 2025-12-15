import mongoose from 'mongoose';

const steamAppSchema = new mongoose.Schema({
    appid: { type: Number, required: true, unique: true },
    name: { type: String, required: true }
});

steamAppSchema.index({ name: 1 });

export default mongoose.model('SteamApp', steamAppSchema, "SteamApps");