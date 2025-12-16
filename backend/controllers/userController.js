/**
 * User Controller
 * Handles user authentication and profile management
 */

import User from '../models/User.js';
import UserLaptop from '../models/UserLaptop.js';

/**
 * @route   POST /api/users/save
 * @desc    Save or update user after Firebase authentication
 * @access  Public (called after Firebase auth)
 */
export async function saveUser(req, res) {
  try {
    const { firebaseUID, email, name, provider } = req.body;

    if (!firebaseUID || !email) {
      return res.status(400).json({
        success: false,
        message: 'firebaseUID and email are required'
      });
    }

    // Upsert: update if exists, create if not
    const user = await User.findOneAndUpdate(
      { firebaseUID },
      { 
        email, 
        name: name || email.split('@')[0], // Default name from email
        provider: provider || 'email'
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({ success: true, user });

  } catch (error) {
    console.error('Error saving user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error saving user',
      error: error.message 
    });
  }
}

/**
 * @route   GET /api/users/:uid
 * @desc    Get user by Firebase UID
 * @access  Public
 */
export async function getUser(req, res) {
  try {
    const { uid } = req.params;

    const user = await User.findOne({ firebaseUID: uid })
      .populate('userLaptops');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({ success: true, user });

  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error getting user',
      error: error.message 
    });
  }
}

/**
 * @route   POST /api/users/:uid/laptops
 * @desc    Add a laptop to user's collection
 * @access  Public
 */
export async function addUserLaptop(req, res) {
  try {
    const { uid } = req.params;
    const { name, ram_gb, storage_gb, cpu_text, cpu_score, gpu_text, gpu_score } = req.body;

    // Find user
    const user = await User.findOne({ firebaseUID: uid });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Create laptop
    const laptop = await UserLaptop.create({
      userId: user._id,
      name: name || 'My Laptop',
      ram_gb,
      storage_gb,
      cpu_text,
      cpu_score,
      gpu_text,
      gpu_score
    });

    // Add laptop reference to user
    user.userLaptops.push(laptop._id);
    await user.save();

    res.status(201).json({ success: true, laptop });

  } catch (error) {
    console.error('Error adding laptop:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error adding laptop',
      error: error.message 
    });
  }
}

/**
 * @route   GET /api/users/:uid/laptops
 * @desc    Get all laptops for a user
 * @access  Public
 */
export async function getUserLaptops(req, res) {
  try {
    const { uid } = req.params;

    const user = await User.findOne({ firebaseUID: uid });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const laptops = await UserLaptop.find({ userId: user._id })
      .sort({ createdAt: -1 });

    res.json({ success: true, laptops });

  } catch (error) {
    console.error('Error getting laptops:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error getting laptops',
      error: error.message 
    });
  }
}

/**
 * @route   PUT /api/users/:uid/laptops/:laptopId
 * @desc    Update a user's laptop
 * @access  Public
 */
export async function updateUserLaptop(req, res) {
  try {
    const { uid, laptopId } = req.params;
    const updates = req.body;

    // Verify user exists
    const user = await User.findOne({ firebaseUID: uid });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update laptop (ensure it belongs to this user)
    const laptop = await UserLaptop.findOneAndUpdate(
      { _id: laptopId, userId: user._id },
      updates,
      { new: true, runValidators: true }
    );

    if (!laptop) {
      return res.status(404).json({
        success: false,
        message: 'Laptop not found'
      });
    }

    res.json({ success: true, laptop });

  } catch (error) {
    console.error('Error updating laptop:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating laptop',
      error: error.message 
    });
  }
}

/**
 * @route   DELETE /api/users/:uid/laptops/:laptopId
 * @desc    Delete a user's laptop
 * @access  Public
 */
export async function deleteUserLaptop(req, res) {
  try {
    const { uid, laptopId } = req.params;

    // Verify user exists
    const user = await User.findOne({ firebaseUID: uid });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete laptop (ensure it belongs to this user)
    const laptop = await UserLaptop.findOneAndDelete({ 
      _id: laptopId, 
      userId: user._id 
    });

    if (!laptop) {
      return res.status(404).json({
        success: false,
        message: 'Laptop not found'
      });
    }

    // Remove from user's laptops array
    user.userLaptops.pull(laptopId);
    await user.save();

    res.json({ success: true, message: 'Laptop deleted' });

  } catch (error) {
    console.error('Error deleting laptop:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting laptop',
      error: error.message 
    });
  }
}

export default {
  saveUser,
  getUser,
  addUserLaptop,
  getUserLaptops,
  updateUserLaptop,
  deleteUserLaptop
};
