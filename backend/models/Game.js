import mongoose from 'mongoose';

const gameSchema = new mongoose.Schema({
    steam_app_id: { type: Number, unique: true, index: true },
    name: { type: String, index: true },
    description: String, // Short description from Steam
    short_description: String, // Short description for display
    image: String, // Header image URL

    // Raw HTML requirements from Steam (for display)
    pc_requirements: {
        minimum: String,  // Raw HTML from Steam
        recommended: String  // Raw HTML from Steam
    },

    // Parsed/scored requirements for compatibility calculations
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

    // Additional Steam metadata for display
    genres: [{ id: String, description: String }],
    categories: [{ id: Number, description: String }],
    developers: [String],
    publishers: [String],
    release_date: {
        coming_soon: Boolean,
        date: String
    },

    keywords: [String], // For Hybrid Search
    embedding: { type: [Number], select: false } // For Vector Search
});

// Virtual field for frontend compatibility (frontend expects steam_appid, DB stores steam_app_id)
gameSchema.virtual('steam_appid').get(function () {
    return this.steam_app_id;
});

// Ensure virtuals are included when converting to JSON/Object
gameSchema.set('toJSON', { virtuals: true });
gameSchema.set('toObject', { virtuals: true });

gameSchema.index({ name: 'text' });

export default mongoose.model('Game', gameSchema, "Games");