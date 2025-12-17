/**
 * =============================================================================
 * API SERVICE
 * =============================================================================
 * Centralized API communication layer
 */

import { CONFIG, ENDPOINTS } from './config.js';

class ApiService {
    constructor() {
        this.baseUrl = CONFIG.API_BASE_URL;
    }

    /**
     * Generic fetch wrapper with error handling
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;

        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const finalOptions = { ...defaultOptions, ...options };

        try {
            const response = await fetch(url, finalOptions);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || `HTTP error! status: ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error(`API Error [${endpoint}]:`, error);
            throw error;
        }
    }

    /**
     * GET request helper
     */
    async get(endpoint, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        return this.request(url);
    }

    /**
     * POST request helper
     */
    async post(endpoint, body = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    // =========================================================================
    // LAPTOP ENDPOINTS
    // =========================================================================

    /**
     * Search laptops with filters and optional ranking
     */
    async searchLaptops(params = {}) {
        return this.get(ENDPOINTS.LAPTOPS.SEARCH, params);
    }

    /**
     * Get filter options for dropdowns
     */
    async getFilterOptions() {
        return this.get(ENDPOINTS.LAPTOPS.FILTERS);
    }

    /**
     * Get onboarding options (CPUs, GPUs, RAM sizes)
     */
    async getOnboardingOptions() {
        return this.get(ENDPOINTS.LAPTOPS.ONBOARDING);
    }

    /**
     * Get top laptops by category
     */
    async getTopLaptops(category = 'overall', limit = 6) {
        return this.get(`${ENDPOINTS.LAPTOPS.TOP}/${category}`, { limit });
    }

    /**
     * Get laptop by MongoDB ID
     */
    async getLaptopById(id) {
        return this.get(`${ENDPOINTS.LAPTOPS.BY_ID}/${id}`);
    }

    /**
     * Get laptop by slug
     */
    async getLaptopBySlug(slug) {
        return this.get(`${ENDPOINTS.LAPTOPS.BY_SLUG}/${slug}`);
    }

    /**
     * Get laptop variants by group ID
     */
    async getLaptopVariants(groupId) {
        return this.get(`${ENDPOINTS.LAPTOPS.VARIANTS}/${groupId}`);
    }

    // =========================================================================
    // GAME ENDPOINTS
    // =========================================================================

    /**
     * Autocomplete search for games
     */
    async lookupGames(query, limit = 10) {
        return this.get(ENDPOINTS.GAMES.LOOKUP, { q: query, limit });
    }

    /**
     * Get game search results (for Enter key)
     */
    async getGameSearchResults(query, page = 1, limit = 20) {
        return this.get(ENDPOINTS.GAMES.SEARCH_RESULTS, { q: query, page, limit });
    }

    /**
     * Get game by Steam App ID
     */
    async getGameById(steamAppId) {
        return this.get(`${ENDPOINTS.GAMES.BY_ID}/${steamAppId}`);
    }

    /**
     * Alias for getGameById
     */
    async getGameByAppId(steamAppId) {
        return this.getGameById(steamAppId);
    }

    // =========================================================================
    // COMPATIBILITY ENDPOINTS
    // =========================================================================

    /**
     * Check catalog laptop vs game
     */
    async checkCompatibility(laptopId, gameId) {
        return this.post(ENDPOINTS.COMPATIBILITY.CHECK, { laptopId, gameId });
    }

    /**
     * Check user's laptop vs game
     */
    async checkMyLaptopCompatibility(gameId, uid) {
        // Get uid from localStorage if not provided
        if (!uid) {
            const user = JSON.parse(localStorage.getItem('specmatch_user'));
            uid = user?.uid;
        }
        if (!uid) {
            throw new Error('User not authenticated');
        }
        return this.get(`${ENDPOINTS.COMPATIBILITY.MY_LAPTOPS}/${gameId}`, { uid });
    }

    /**
     * Check all user's laptops vs game
     */
    async checkAllMyLaptops(gameId, uid) {
        return this.get(`${ENDPOINTS.COMPATIBILITY.MY_LAPTOPS}/${gameId}`, { uid });
    }

    /**
     * Get laptops that can run a game
     */
    async getLaptopsForGame(gameId, params = {}) {
        return this.get(`${ENDPOINTS.COMPATIBILITY.LAPTOPS_FOR_GAME}/${gameId}`, params);
    }

    // =========================================================================
    // CHATBOT ENDPOINTS
    // =========================================================================

    /**
     * Send message to chatbot
     */
    async sendChatMessage(message, history = []) {
        return this.post(ENDPOINTS.CHAT.MESSAGE, { message, history });
    }

    // =========================================================================
    // USER ENDPOINTS
    // =========================================================================

    /**
     * Save user after Firebase auth
     */
    async saveUser(userData) {
        return this.post(ENDPOINTS.USERS.SAVE, userData);
    }

    /**
     * Get user by Firebase UID
     */
    async getUser(uid) {
        return this.get(`${ENDPOINTS.USERS.GET}/${uid}`);
    }

    /**
     * Add laptop to user
     */
    async addUserLaptop(uid, laptopData) {
        return this.post(`${ENDPOINTS.USERS.LAPTOPS}/${uid}/laptops`, laptopData);
    }

    /**
     * Get user's laptops
     */
    async getUserLaptops(uid) {
        return this.get(`${ENDPOINTS.USERS.LAPTOPS}/${uid}/laptops`);
    }

    /**
     * Update user laptop
     */
    async updateUserLaptop(uid, laptopId, updates) {
        return this.request(`${ENDPOINTS.USERS.LAPTOPS}/${uid}/laptops/${laptopId}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    }

    /**
     * Delete user laptop
     */
    async deleteUserLaptop(uid, laptopId) {
        return this.request(`${ENDPOINTS.USERS.LAPTOPS}/${uid}/laptops/${laptopId}`, {
            method: 'DELETE'
        });
    }
}

// Export singleton instance
export const api = new ApiService();
export default api;
