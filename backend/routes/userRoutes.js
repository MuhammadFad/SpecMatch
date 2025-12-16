/**
 * =============================================================================
 * USER ROUTES
 * =============================================================================
 *
 * BASE URL: /api/users
 *
 * PURPOSE:
 * Handle user authentication sync and user laptop management.
 *
 * AVAILABLE ENDPOINTS:
 *
 * | Method | Endpoint              | Description                    |
 * |--------|-----------------------|--------------------------------|
 * | POST   | /save                 | Save/update user after auth    |
 * | GET    | /:uid                 | Get user by Firebase UID       |
 * | POST   | /:uid/laptops         | Add a laptop to user           |
 * | GET    | /:uid/laptops         | Get all user's laptops         |
 * | PUT    | /:uid/laptops/:id     | Update a user's laptop         |
 * | DELETE | /:uid/laptops/:id     | Delete a user's laptop         |
 */

import express from 'express';
import * as userController from '../controllers/userController.js';

const router = express.Router();

// =============================================================================
// USER AUTHENTICATION SYNC
// =============================================================================

/**
 * @route   POST /api/users/save
 * @desc    Save or update user after Firebase authentication
 * @body    { firebaseUID, email, name, provider }
 */
router.post('/save', userController.saveUser);

/**
 * @route   GET /api/users/:uid
 * @desc    Get user by Firebase UID (includes populated laptops)
 */
router.get('/:uid', userController.getUser);

// =============================================================================
// USER LAPTOPS CRUD
// =============================================================================

/**
 * @route   POST /api/users/:uid/laptops
 * @desc    Add a new laptop to user's collection
 * @body    { name?, ram_gb, storage_gb, cpu_text, cpu_score, gpu_text, gpu_score }
 */
router.post('/:uid/laptops', userController.addUserLaptop);

/**
 * @route   GET /api/users/:uid/laptops
 * @desc    Get all laptops belonging to a user
 */
router.get('/:uid/laptops', userController.getUserLaptops);

/**
 * @route   PUT /api/users/:uid/laptops/:laptopId
 * @desc    Update a specific laptop
 * @body    { name?, ram_gb?, storage_gb?, cpu_text?, cpu_score?, gpu_text?, gpu_score? }
 */
router.put('/:uid/laptops/:laptopId', userController.updateUserLaptop);

/**
 * @route   DELETE /api/users/:uid/laptops/:laptopId
 * @desc    Delete a laptop from user's collection
 */
router.delete('/:uid/laptops/:laptopId', userController.deleteUserLaptop);

export default router;
