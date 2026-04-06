/**
 * =============================================================================
 * AUTHENTICATION SERVICE
 * =============================================================================
 * Handles Firebase authentication and session management
 */

import { CONFIG } from './config.js';
import { api } from './api.js';

// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    GoogleAuthProvider,
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

class AuthService {
    constructor() {
        this.app = initializeApp(CONFIG.FIREBASE);
        this.auth = getAuth(this.app);
        this.googleProvider = new GoogleAuthProvider();
        this.currentUser = null;

        // Listen for auth state changes
        onAuthStateChanged(this.auth, (user) => {
            this.currentUser = user;
            this.onAuthStateChange(user);
        });
    }

    /**
     * Callback for auth state changes - override in pages
     */
    onAuthStateChange(user) {
        // Dispatch custom event for pages to listen
        window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { user } }));
    }

    /**
     * Get current user
     */
    getUser() {
        return this.currentUser;
    }

    /**
     * Check if user is logged in
     */
    isLoggedIn() {
        return !!this.currentUser;
    }

    /**
     * Sign up with email/password
     */
    async signUp(email, password, name) {
        try {
            const result = await createUserWithEmailAndPassword(this.auth, email, password);

            // Update profile with name
            await updateProfile(result.user, { displayName: name });

            // Save user to backend
            await this.saveUserToBackend(result.user, name, 'email');

            return { success: true, user: result.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Sign in with email/password
     */
    async signIn(email, password) {
        try {
            const result = await signInWithEmailAndPassword(this.auth, email, password);
            return { success: true, user: result.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Sign in with Google
     */
    async signInWithGoogle() {
        try {
            const result = await signInWithPopup(this.auth, this.googleProvider);

            // Save user to backend
            await this.saveUserToBackend(result.user, result.user.displayName, 'google');

            return { success: true, user: result.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Sign out
     */
    async signOut() {
        try {
            await signOut(this.auth);
            localStorage.removeItem('specmatch_user');
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Save user to MongoDB backend
     */
    async saveUserToBackend(user, name, provider) {
        try {
            const userData = {
                firebaseUID: user.uid,
                email: user.email,
                name: name || user.displayName || user.email.split('@')[0],
                provider: provider
            };

            const result = await api.saveUser(userData);

            // Store user data locally
            localStorage.setItem('specmatch_user', JSON.stringify({
                uid: user.uid,
                email: user.email,
                name: userData.name
            }));

            return result;
        } catch (error) {
            console.error('Error saving user to backend:', error);
            throw error;
        }
    }

    /**
     * Add laptop to user (during onboarding or later)
     */
    async addUserLaptop(laptopData) {
        if (!this.currentUser) {
            throw new Error('User not authenticated');
        }

        return api.addUserLaptop(this.currentUser.uid, laptopData);
    }

    /**
     * Get user's laptops
     */
    async getUserLaptops() {
        if (!this.currentUser) {
            throw new Error('User not authenticated');
        }

        return api.getUserLaptops(this.currentUser.uid);
    }

    /**
     * Get stored user from localStorage
     */
    getStoredUser() {
        const stored = localStorage.getItem('specmatch_user');
        return stored ? JSON.parse(stored) : null;
    }

    /**
     * Require authentication - redirect to login if not authenticated
     */
    requireAuth(redirectUrl = 'login.html') {
        if (!this.isLoggedIn()) {
            window.location.href = redirectUrl;
            return false;
        }
        return true;
    }
}

// Export singleton instance
export const auth = new AuthService();
export default auth;
