/**
 * =============================================================================
 * UTILITY FUNCTIONS
 * =============================================================================
 * Common helper functions used across the application
 */

import { CONFIG } from './config.js';

/**
 * Debounce function for search inputs
 */
export function debounce(func, wait = CONFIG.SEARCH_DEBOUNCE) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Format price with currency
 */
export function formatPrice(price, currency = 'USD') {
    if (!price) return 'Price N/A';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(price);
}

/**
 * Format storage size
 */
export function formatStorage(gb) {
    if (!gb) return 'N/A';
    if (gb >= 1024) {
        return `${(gb / 1024).toFixed(gb % 1024 === 0 ? 0 : 1)} TB`;
    }
    return `${gb} GB`;
}

/**
 * Format RAM size
 */
export function formatRam(gb) {
    if (!gb) return 'N/A';
    return `${gb} GB`;
}

/**
 * Get Steam header image URL
 */
export function getSteamHeaderImage(appId) {
    return `${CONFIG.STEAM_IMAGE_BASE}/${appId}/header.jpg`;
}

/**
 * Get Steam capsule image URL (smaller)
 */
export function getSteamCapsuleImage(appId) {
    return `${CONFIG.STEAM_IMAGE_BASE}/${appId}/capsule_231x87.jpg`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text, maxLength = 100) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Get URL parameters
 */
export function getUrlParams() {
    return Object.fromEntries(new URLSearchParams(window.location.search));
}

/**
 * Set URL parameters without reload
 */
export function setUrlParams(params) {
    const url = new URL(window.location);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
            url.searchParams.set(key, value);
        } else {
            url.searchParams.delete(key);
        }
    });
    window.history.pushState({}, '', url);
}

/**
 * Get compatibility verdict class
 */
export function getVerdictClass(verdict) {
    const classes = {
        'Excellent': 'verdict-excellent',
        'Good': 'verdict-good',
        'Playable': 'verdict-playable',
        'Struggle': 'verdict-struggle',
        'Unplayable': 'verdict-unplayable'
    };
    return classes[verdict] || 'verdict-unknown';
}

/**
 * Get compatibility verdict color
 */
export function getVerdictColor(verdict) {
    const colors = {
        'Excellent': '#22c55e',
        'Good': '#84cc16',
        'Playable': '#eab308',
        'Struggle': '#f97316',
        'Unplayable': '#ef4444'
    };
    return colors[verdict] || '#6b7280';
}

/**
 * Create element with attributes and children
 */
export function createElement(tag, attributes = {}, children = []) {
    const element = document.createElement(tag);

    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'dataset') {
            Object.entries(value).forEach(([dataKey, dataValue]) => {
                element.dataset[dataKey] = dataValue;
            });
        } else if (key.startsWith('on') && typeof value === 'function') {
            element.addEventListener(key.substring(2).toLowerCase(), value);
        } else {
            element.setAttribute(key, value);
        }
    });

    children.forEach(child => {
        if (typeof child === 'string') {
            element.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            element.appendChild(child);
        }
    });

    return element;
}

/**
 * Show toast notification
 */
export function showToast(message, type = 'info', duration = 3000) {
    const toast = createElement('div', {
        className: `toast toast-${type}`
    }, [message]);

    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Remove after duration
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Loading spinner HTML
 */
export function getLoadingSpinner(size = 'medium') {
    return `<div class="spinner spinner-${size}"></div>`;
}

/**
 * Empty state HTML
 */
export function getEmptyState(message = 'No results found', icon = 'fa-search') {
    return `
        <div class="empty-state">
            <i class="fas ${icon}"></i>
            <p>${message}</p>
        </div>
    `;
}

/**
 * Error state HTML
 */
export function getErrorState(message = 'Something went wrong') {
    return `
        <div class="error-state">
            <i class="fas fa-exclamation-circle"></i>
            <p>${message}</p>
            <button class="btn-secondary" onclick="location.reload()">Try Again</button>
        </div>
    `;
}

/**
 * Format score for display
 */
export function formatScore(score) {
    if (!score) return 'N/A';
    if (score >= 1000) {
        return (score / 1000).toFixed(1) + 'K';
    }
    return score.toString();
}

/**
 * Calculate percentage
 */
export function calculatePercentage(value, max) {
    if (!max || max === 0) return 0;
    return Math.min(100, Math.round((value / max) * 100));
}

/**
 * Local storage helpers with JSON parsing
 */
export const storage = {
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch {
            return defaultValue;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    },

    remove(key) {
        localStorage.removeItem(key);
    }
};

/**
 * Session storage helpers
 */
export const session = {
    get(key, defaultValue = null) {
        try {
            const item = sessionStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch {
            return defaultValue;
        }
    },

    set(key, value) {
        try {
            sessionStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    },

    remove(key) {
        sessionStorage.removeItem(key);
    }
};
