/**
 * =============================================================================
 * SPECMATCH FRONTEND CONFIGURATION
 * =============================================================================
 * Central configuration for API endpoints and Firebase
 */

export const CONFIG = {
    // API Base URL
    API_BASE_URL: 'http://localhost:3000/api',
    
    // Auth Server (if separate)
    AUTH_BASE_URL: 'http://localhost:5000',
    
    // Firebase Configuration
    FIREBASE: {
        apiKey: "AIzaSyCywnIfR3dhZAWLT-1Nn6iz_6BCBgipLqE",
        authDomain: "specmatch-auth.firebaseapp.com",
        projectId: "specmatch-auth",
        storageBucket: "specmatch-auth.firebasestorage.app",
        messagingSenderId: "170230638392",
        appId: "1:170230638392:web:b321a6925f740afd16c3cd",
        measurementId: "G-EJN8RJ4CPH"
    },
    
    // Pagination defaults
    DEFAULT_PAGE_SIZE: 20,
    
    // Debounce delay for search (ms)
    SEARCH_DEBOUNCE: 300,
    
    // Steam header image base URL
    STEAM_IMAGE_BASE: 'https://cdn.akamai.steamstatic.com/steam/apps'
};

// API Endpoints
export const ENDPOINTS = {
    // Laptops
    LAPTOPS: {
        SEARCH: '/laptops/search',
        FILTERS: '/laptops/filters',
        ONBOARDING: '/laptops/onboarding/options',
        TOP: '/laptops/top',
        BY_ID: '/laptops',
        BY_SLUG: '/laptops/slug',
        VARIANTS: '/laptops/variants'
    },
    
    // Games
    GAMES: {
        LOOKUP: '/games/lookup',
        SEARCH_RESULTS: '/games/search-results',
        BY_ID: '/games'
    },
    
    // Compatibility
    COMPATIBILITY: {
        CHECK: '/compatibility/check',
        CHECK_MY_LAPTOP: '/compatibility/check-my-laptop',
        MY_LAPTOPS: '/compatibility/my-laptops',
        LAPTOPS_FOR_GAME: '/compatibility/laptops-for-game'
    },
    
    // Chatbot
    CHAT: {
        MESSAGE: '/chat/message'
    },
    
    // Users
    USERS: {
        SAVE: '/users/save',
        GET: '/users',
        LAPTOPS: '/users'
    }
};
