/**
 * Storage Module
 *
 * Provides persistent storage for bot data with Redis (optional) + in-memory fallback.
 * Supports TTL, namespacing, and automatic serialization.
 */

class Storage {
    constructor() {
        this.useRedis = process.env.REDIS_URL && process.env.USE_REDIS === 'true';
        this.redis = null;
        this.memoryStore = new Map();
        this.ttlTimers = new Map(); // For in-memory TTL

        if (this.useRedis) {
            this._initRedis();
        } else {
            console.log('💾 Storage: Using in-memory store (Redis disabled)');
        }
    }

    /**
     * Initialize Redis client
     * @private
     */
    async _initRedis() {
        try {
            // Dynamically import redis (only if Redis is enabled)
            const redis = require('redis');

            this.redis = redis.createClient({
                url: process.env.REDIS_URL
            });

            this.redis.on('error', (err) => {
                console.error('❌ Redis error:', err);
                console.log('⚠️  Falling back to in-memory storage');
                this.useRedis = false;
                this.redis = null;
            });

            await this.redis.connect();
            console.log('✅ Redis connected');
        } catch (error) {
            console.error('❌ Redis initialization failed:', error.message);
            console.log('⚠️  Using in-memory storage');
            this.useRedis = false;
        }
    }

    /**
     * Set a value in storage
     * @param {string} key - Storage key
     * @param {*} value - Value to store (will be JSON serialized)
     * @param {number} ttl - Time to live in seconds (optional)
     */
    async set(key, value, ttl = null) {
        const serialized = JSON.stringify(value);

        if (this.useRedis && this.redis) {
            try {
                if (ttl) {
                    await this.redis.setEx(key, ttl, serialized);
                } else {
                    await this.redis.set(key, serialized);
                }
                return true;
            } catch (error) {
                console.error('❌ Redis set error:', error.message);
                // Fallback to memory
            }
        }

        // In-memory storage
        this.memoryStore.set(key, serialized);

        // Set TTL timer for in-memory
        if (ttl) {
            this._setMemoryTTL(key, ttl);
        }

        return true;
    }

    /**
     * Get a value from storage
     * @param {string} key - Storage key
     * @returns {*} Stored value (deserialized) or null
     */
    async get(key) {
        let serialized = null;

        if (this.useRedis && this.redis) {
            try {
                serialized = await this.redis.get(key);
            } catch (error) {
                console.error('❌ Redis get error:', error.message);
                // Fallback to memory
            }
        }

        // Fallback to in-memory
        if (!serialized) {
            serialized = this.memoryStore.get(key);
        }

        if (!serialized) return null;

        try {
            return JSON.parse(serialized);
        } catch (error) {
            console.error('❌ Error parsing stored value:', error.message);
            return null;
        }
    }

    /**
     * Delete a key from storage
     * @param {string} key - Storage key
     */
    async delete(key) {
        if (this.useRedis && this.redis) {
            try {
                await this.redis.del(key);
            } catch (error) {
                console.error('❌ Redis delete error:', error.message);
            }
        }

        // Also delete from memory
        this.memoryStore.delete(key);

        // Clear TTL timer
        const timer = this.ttlTimers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.ttlTimers.delete(key);
        }
    }

    /**
     * Check if key exists
     * @param {string} key - Storage key
     * @returns {boolean} True if key exists
     */
    async exists(key) {
        if (this.useRedis && this.redis) {
            try {
                return await this.redis.exists(key) === 1;
            } catch (error) {
                console.error('❌ Redis exists error:', error.message);
            }
        }

        return this.memoryStore.has(key);
    }

    /**
     * Get all keys matching a pattern
     * @param {string} pattern - Pattern to match (e.g., "user:*")
     * @returns {Array<string>} Array of matching keys
     */
    async keys(pattern) {
        if (this.useRedis && this.redis) {
            try {
                return await this.redis.keys(pattern);
            } catch (error) {
                console.error('❌ Redis keys error:', error.message);
            }
        }

        // In-memory pattern matching (simple wildcard support)
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return Array.from(this.memoryStore.keys()).filter(key => regex.test(key));
    }

    /**
     * Set TTL for in-memory storage
     * @param {string} key - Storage key
     * @param {number} ttl - Time to live in seconds
     * @private
     */
    _setMemoryTTL(key, ttl) {
        // Clear existing timer
        const existingTimer = this.ttlTimers.get(key);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Set new timer
        const timer = setTimeout(() => {
            this.memoryStore.delete(key);
            this.ttlTimers.delete(key);
        }, ttl * 1000);

        this.ttlTimers.set(key, timer);
    }

    /**
     * Get storage stats
     * @returns {Object} Storage statistics
     */
    async getStats() {
        const stats = {
            backend: this.useRedis ? 'Redis' : 'In-Memory',
            memoryKeys: this.memoryStore.size
        };

        if (this.useRedis && this.redis) {
            try {
                const info = await this.redis.info('stats');
                stats.redis = {
                    connected: true,
                    info: info.split('\n').slice(0, 5).join('\n')
                };
            } catch (error) {
                stats.redis = { connected: false };
            }
        }

        return stats;
    }

    /**
     * Clear all data (use with caution!)
     */
    async clear() {
        if (this.useRedis && this.redis) {
            try {
                await this.redis.flushDb();
            } catch (error) {
                console.error('❌ Redis clear error:', error.message);
            }
        }

        this.memoryStore.clear();

        // Clear all TTL timers
        for (const timer of this.ttlTimers.values()) {
            clearTimeout(timer);
        }
        this.ttlTimers.clear();

        console.log('🧹 Storage cleared');
    }

    /**
     * Close storage connections
     */
    async close() {
        if (this.redis) {
            await this.redis.quit();
        }

        // Clear all timers
        for (const timer of this.ttlTimers.values()) {
            clearTimeout(timer);
        }
        this.ttlTimers.clear();
    }
}

// Convenience methods for common storage patterns

/**
 * User state storage
 */
class UserStorage {
    constructor(storage) {
        this.storage = storage;
        this.prefix = 'user:';
    }

    async set(userId, data, ttl = null) {
        return this.storage.set(this.prefix + userId, data, ttl);
    }

    async get(userId) {
        return this.storage.get(this.prefix + userId);
    }

    async delete(userId) {
        return this.storage.delete(this.prefix + userId);
    }

    async getAllUsers() {
        const keys = await this.storage.keys(this.prefix + '*');
        return keys.map(key => key.replace(this.prefix, ''));
    }
}

/**
 * Cache storage (with TTL)
 */
class CacheStorage {
    constructor(storage) {
        this.storage = storage;
        this.prefix = 'cache:';
        this.defaultTTL = 1800; // 30 minutes
    }

    async set(key, data, ttl = this.defaultTTL) {
        return this.storage.set(this.prefix + key, data, ttl);
    }

    async get(key) {
        return this.storage.get(this.prefix + key);
    }

    async delete(key) {
        return this.storage.delete(this.prefix + key);
    }
}

// Export storage instance and helper classes
const storage = new Storage();

module.exports = {
    storage,
    UserStorage: new UserStorage(storage),
    CacheStorage: new CacheStorage(storage)
};
