import mongoose from 'mongoose';

const userLaptopSchema = new mongoose.Schema({
  // Owner reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Laptop name (optional, user can name their laptop)
  name: {
    type: String,
    trim: true,
    default: 'My Laptop'
  },

  // Hardware Specs
  ram_gb: {
    type: Number,
    required: true,
    min: 0
  },
  storage_gb: {
    type: Number,
    required: true,
    min: 0
  },

  // CPU
  cpu_text: {
    type: String,
    required: true,
    trim: true  // e.g., "Intel i5-11th Gen"
  },
  cpu_score: {
    type: Number,
    required: true,
    min: 0
  },

  // GPU
  gpu_text: {
    type: String,
    required: true,
    trim: true  // e.g., "NVIDIA RTX 3060"
  },
  gpu_score: {
    type: Number,
    required: true,
    min: 0
  }

}, { timestamps: true });

// Index for user's laptops lookup
userLaptopSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('UserLaptop', userLaptopSchema, 'User_laptops');
