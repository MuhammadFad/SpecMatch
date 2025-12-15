import mongoose from 'mongoose';

const gameSchema = new mongoose.Schema({
    steam_app_id: { type: Number, unique: true, index: true },
    name: { type: String, index: true },
    image: String, // Header image URL

    // We map these DIRECTLY to Laptop Schema fields
    requirements: {
        minimum: {
            // Functional Gates
            ram_gb: { type: Number, default: 0 },
            storage_gb: { type: Number, default: 0 },

            // Performance Gates (Scores)
            gpu_score: { type: Number, default: 0 }, // The Critical Field
            cpu_score: { type: Number, default: 0 }, // The Critical Field

            // For display/debugging
            gpu_text: String,
            cpu_text: String
        },
        recommended: {
            ram_gb: { type: Number, default: 0 },
            storage_gb: { type: Number, default: 0 },
            gpu_score: { type: Number, default: 0 },
            cpu_score: { type: Number, default: 0 },
            gpu_text: String,
            cpu_text: String
        }
    },

    keywords: [String], // For Hybrid Search
    embedding: { type: [Number], select: false } // For Vector Search
});

gameSchema.index({ name: 'text' });

export default mongoose.model('Game', gameSchema, "Games");