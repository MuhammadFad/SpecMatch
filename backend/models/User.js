import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  // Firebase Authentication
  firebaseUID: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  
  // User Info
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true
  },
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  provider: { 
    type: String, 
    enum: ['google', 'email', 'github', 'facebook'],
    default: 'email'
  },
  
  // User's Laptops (references to User_laptops collection)
  userLaptops: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserLaptop'
  }]

}, { timestamps: true });

// Index for faster lookups
userSchema.index({ email: 1 });

export default mongoose.model('User', userSchema, 'Users');
