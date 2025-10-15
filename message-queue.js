/**
 * Message Queue Manager
 *
 * Prevents race conditions by queueing messages per user.
 * Ensures messages are processed sequentially for each user.
 */

class MessageQueue {
    constructor() {
        // Map of userId -> queue of pending messages
        this.queues = new Map();
        // Map of userId -> processing lock
        this.locks = new Map();
    }

    /**
     * Add a message to the user's queue and process it
     * @param {string} userId - WhatsApp user ID
     * @param {Function} handler - Async function to process the message
     */
    async enqueue(userId, handler) {
        // Initialize queue for new users
        if (!this.queues.has(userId)) {
            this.queues.set(userId, []);
        }

        // Add handler to queue
        const queue = this.queues.get(userId);
        queue.push(handler);

        // If not already processing, start processing queue
        if (!this.locks.get(userId)) {
            await this._processQueue(userId);
        }
    }

    /**
     * Process all pending messages for a user sequentially
     * @param {string} userId - WhatsApp user ID
     * @private
     */
    async _processQueue(userId) {
        // Acquire lock
        this.locks.set(userId, true);

        const queue = this.queues.get(userId);

        while (queue.length > 0) {
            const handler = queue.shift();

            try {
                await handler();
            } catch (error) {
                console.error(`❌ Error processing message for ${userId}:`, error);
                // Continue processing next message even if this one failed
            }
        }

        // Release lock
        this.locks.set(userId, false);
    }

    /**
     * Get queue length for a user (for debugging)
     * @param {string} userId - WhatsApp user ID
     * @returns {number} Number of pending messages
     */
    getQueueLength(userId) {
        return this.queues.get(userId)?.length || 0;
    }

    /**
     * Check if user's queue is being processed
     * @param {string} userId - WhatsApp user ID
     * @returns {boolean} True if processing
     */
    isProcessing(userId) {
        return this.locks.get(userId) || false;
    }

    /**
     * Clear queue for a user (e.g., on /reset)
     * @param {string} userId - WhatsApp user ID
     */
    clearQueue(userId) {
        this.queues.set(userId, []);
        this.locks.set(userId, false);
    }

    /**
     * Get stats for all queues (for debugging)
     * @returns {Object} Stats object
     */
    getStats() {
        const stats = {
            totalUsers: this.queues.size,
            activeQueues: 0,
            totalPending: 0,
            users: []
        };

        for (const [userId, queue] of this.queues.entries()) {
            const isProcessing = this.locks.get(userId) || false;
            const pending = queue.length;

            if (pending > 0 || isProcessing) {
                stats.activeQueues++;
            }

            stats.totalPending += pending;

            stats.users.push({
                userId: userId.substring(0, 15) + '...',
                pending,
                isProcessing
            });
        }

        return stats;
    }
}

module.exports = new MessageQueue();
