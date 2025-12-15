import mongoose from 'mongoose';

const laptopSchema = new mongoose.Schema({
    // --- IDENTIFIERS ---
    slug: { type: String, unique: true, index: true },
    group_id: { type: String, index: true },
    is_base_variant: { type: Boolean, default: false },

    // --- BASIC INFO ---
    name: { type: String, index: true },
    brand: { type: String, index: true }, // e.g., "Asus"
    model_family: { type: String, index: true }, // e.g., "VivoBook"
    product_url: String, // from 'link'
    images: [String],

    // --- STEAM COMPATIBILITY GATES (The Permutation Drivers) ---
    // These fields define this specific variant. 

    os: { type: String, index: true }, // "Windows 10 Home"
    architecture: { type: String, default: 'x64' },

    cpu: {
        name: String,
        manufacturer: String,
        cores: Number,
        threads: Number,
        base_clock_ghz: Number, // from 'clocks'
        boost_clock_ghz: Number, // from 'maxtf'
        tdp_watts: Number,      // from 'tdp'
        score: { type: Number, index: true } // from 'rating'
    },

    gpu: {
        name: String,
        manufacturer: String,
        vram_gb: { type: Number, index: true },
        tgp_watts: Number,      // from 'power'
        integrated: Boolean,    // from 'typegpu'
        features: [String],     // Extracted from 'msc' (e.g. DLSS, G-Sync)
        score: { type: Number, index: true } // from 'rating'
    },

    ram: {
        size_gb: { type: Number, index: true },
        type: { type: String },           // from 'prod' (DDR4/DDR5)
        frequency_mhz: Number,  // from 'freq'
        score: Number           // from 'rating'
    },

    storage: {
        capacity_gb: { type: Number, index: true },
        type: { type: String },           // SSD/HDD
        read_speed_mbps: Number, // from 'readspeed'
        score: Number           // from 'rating'
    },

    // --- AGGREGATED ATTRIBUTES (Arrays of Options) ---
    // These did NOT trigger a new document variation. 
    // If a laptop has multiple screen options with the SAME CPU/GPU, they appear here.

    displays: [{
        size_inch: Number,
        resolution_h: Number,
        resolution_v: Number,
        refresh_rate_hz: Number,
        panel_type: String,     // IPS/TN
        touch: Boolean,
        surface: String,        // from 'surft' (Matte/Glossy)
        srgb_coverage: Number,  // from 'sRGB'
        score: Number           // from 'rating'
    }],

    chassis: {
        colors: [String],       // from 'color'
        materials: [String],    // from 'made'
        thickness_mm: Number,   // from 'thic'
        weight_kg: { type: Number, index: true },
        webcam_mp: Number,      // from 'web'
        ports: [String],        // from 'pi'
        score: Number           // from 'rating'
    },

    battery: {
        capacity_wh: Number,    // from 'cap'
        score: Number           // from 'rating'
    },

    networking: {
        wifi_standards: [String], // from 'stand' (e.g. ["Wi-Fi 6", "Wi-Fi 5"])
        score: Number            // from 'rating'
    },

    // --- PRICING & SEARCH ---
    pricing: {
        estimated_price_usd: { type: Number, index: true },
        currency: { type: String, default: 'USD' }
    },

    keywords: [String], // For Hybrid Search
    embedding: { type: [Number], select: false } // For Vector Search

}, { timestamps: true });

// --- INDEXES ---
// 1. Performance Sorting
laptopSchema.index({ 'cpu.score': -1, 'gpu.score': -1 });
laptopSchema.index({ 'pricing.estimated_price_usd': 1, 'performance.gaming_score': -1 });

// 2. Hardware Filters
laptopSchema.index({ 'ram.size_gb': 1 });
laptopSchema.index({ 'storage.capacity_gb': 1 });
laptopSchema.index({ 'displays.refresh_rate_hz': -1 });
laptopSchema.index({ 'displays.srgb_coverage': -1 });
laptopSchema.index({ 'displays.touch': 1 });

// 3. Text Search
laptopSchema.index(
    { name: 'text', brand: 'text', 'cpu.name': 'text', 'gpu.name': 'text', keywords: 'text' },
    { weights: { name: 10, keywords: 5 } }
);

export default mongoose.model('Laptop', laptopSchema, "Laptops");