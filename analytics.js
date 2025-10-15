/**
 * Analytics and Structured Logging Module
 *
 * Tracks bot usage, performance, and errors.
 * Provides insights into user behavior and flow completion.
 */

const fs = require('fs');
const path = require('path');

class Analytics {
    constructor() {
        // In-memory analytics data
        this.sessions = new Map(); // userId -> session data
        this.events = []; // Array of all events
        this.flowMetrics = new Map(); // flowId -> metrics
        this.errorLog = []; // Array of errors

        // Configuration
        this.maxEvents = 10000; // Keep last 10k events in memory
        this.maxErrors = 1000; // Keep last 1k errors
        this.logToFile = process.env.ANALYTICS_LOG_FILE === 'true';
        this.logDir = './logs';

        // Create logs directory if logging to file
        if (this.logToFile && !fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    /**
     * Track a user event
     * @param {string} userId - WhatsApp user ID
     * @param {string} eventType - Type of event (message, menu_navigate, tool_use, etc.)
     * @param {Object} data - Additional event data
     */
    trackEvent(userId, eventType, data = {}) {
        const event = {
            userId: this._anonymize(userId),
            eventType,
            timestamp: new Date().toISOString(),
            data
        };

        this.events.push(event);

        // Trim events if too many
        if (this.events.length > this.maxEvents) {
            this.events = this.events.slice(-this.maxEvents);
        }

        // Log to file if enabled
        if (this.logToFile) {
            this._logToFile('events', event);
        }

        // Update session
        this._updateSession(userId, eventType, data);
    }

    /**
     * Track flow start
     * @param {string} userId - WhatsApp user ID
     * @param {string} flowId - Flow identifier
     */
    startFlow(userId, flowId) {
        const session = this._getSession(userId);
        session.currentFlow = flowId;
        session.flowStartTime = Date.now();

        this.trackEvent(userId, 'flow_start', { flowId });
    }

    /**
     * Track flow completion
     * @param {string} userId - WhatsApp user ID
     * @param {string} flowId - Flow identifier
     * @param {boolean} success - Whether flow completed successfully
     */
    endFlow(userId, flowId, success = true) {
        const session = this._getSession(userId);
        const duration = Date.now() - (session.flowStartTime || Date.now());

        // Update flow metrics
        if (!this.flowMetrics.has(flowId)) {
            this.flowMetrics.set(flowId, {
                flowId,
                totalStarts: 0,
                totalCompletions: 0,
                totalAbandoned: 0,
                totalTime: 0,
                avgTime: 0
            });
        }

        const metrics = this.flowMetrics.get(flowId);
        metrics.totalStarts++;

        if (success) {
            metrics.totalCompletions++;
            metrics.totalTime += duration;
            metrics.avgTime = metrics.totalTime / metrics.totalCompletions;
        } else {
            metrics.totalAbandoned++;
        }

        session.currentFlow = null;
        session.flowStartTime = null;

        this.trackEvent(userId, 'flow_end', { flowId, success, duration });
    }

    /**
     * Track an error
     * @param {string} userId - WhatsApp user ID
     * @param {string} errorType - Type of error
     * @param {Error|string} error - Error object or message
     * @param {Object} context - Additional context
     */
    trackError(userId, errorType, error, context = {}) {
        const errorLog = {
            userId: this._anonymize(userId),
            errorType,
            message: error.message || error,
            stack: error.stack || null,
            timestamp: new Date().toISOString(),
            context
        };

        this.errorLog.push(errorLog);

        // Trim errors if too many
        if (this.errorLog.length > this.maxErrors) {
            this.errorLog = this.errorLog.slice(-this.maxErrors);
        }

        // Log to file if enabled
        if (this.logToFile) {
            this._logToFile('errors', errorLog);
        }

        console.error(`❌ ${errorType}:`, error.message || error);
    }

    /**
     * Get session data for a user
     * @param {string} userId - WhatsApp user ID
     * @returns {Object} Session data
     * @private
     */
    _getSession(userId) {
        if (!this.sessions.has(userId)) {
            this.sessions.set(userId, {
                userId: this._anonymize(userId),
                firstSeen: Date.now(),
                lastSeen: Date.now(),
                messageCount: 0,
                toolCalls: 0,
                flows: {},
                currentFlow: null,
                flowStartTime: null
            });
        }
        return this.sessions.get(userId);
    }

    /**
     * Update session with new event
     * @param {string} userId - WhatsApp user ID
     * @param {string} eventType - Event type
     * @param {Object} data - Event data
     * @private
     */
    _updateSession(userId, eventType, data) {
        const session = this._getSession(userId);
        session.lastSeen = Date.now();

        if (eventType === 'message_received') {
            session.messageCount++;
        } else if (eventType === 'tool_use') {
            session.toolCalls++;
        } else if (eventType === 'flow_end' && data.success) {
            const flowId = data.flowId;
            if (!session.flows[flowId]) {
                session.flows[flowId] = { completions: 0, totalTime: 0 };
            }
            session.flows[flowId].completions++;
            session.flows[flowId].totalTime += data.duration;
        }
    }

    /**
     * Anonymize user ID for privacy
     * @param {string} userId - WhatsApp user ID
     * @returns {string} Anonymized ID
     * @private
     */
    _anonymize(userId) {
        // Simple anonymization: keep first 4 and last 4 chars
        if (userId.length <= 8) return '****';
        return userId.substring(0, 4) + '****' + userId.substring(userId.length - 4);
    }

    /**
     * Log to file
     * @param {string} type - Log type (events, errors, etc.)
     * @param {Object} data - Data to log
     * @private
     */
    _logToFile(type, data) {
        const date = new Date().toISOString().split('T')[0];
        const filename = path.join(this.logDir, `${type}-${date}.jsonl`);

        try {
            fs.appendFileSync(filename, JSON.stringify(data) + '\n');
        } catch (error) {
            console.error('Error writing to log file:', error.message);
        }
    }

    /**
     * Get analytics summary
     * @returns {Object} Analytics summary
     */
    getSummary() {
        const now = Date.now();
        const last24h = now - 24 * 60 * 60 * 1000;

        // Active users (last 24h)
        const activeUsers = Array.from(this.sessions.values())
            .filter(s => s.lastSeen > last24h)
            .length;

        // Total events
        const totalEvents = this.events.length;
        const recentEvents = this.events.filter(e =>
            new Date(e.timestamp).getTime() > last24h
        ).length;

        // Total errors
        const totalErrors = this.errorLog.length;
        const recentErrors = this.errorLog.filter(e =>
            new Date(e.timestamp).getTime() > last24h
        ).length;

        // Flow metrics
        const flows = Array.from(this.flowMetrics.values()).map(m => ({
            flowId: m.flowId,
            completionRate: m.totalStarts > 0
                ? ((m.totalCompletions / m.totalStarts) * 100).toFixed(1) + '%'
                : '0%',
            avgTime: m.avgTime > 0
                ? (m.avgTime / 1000).toFixed(1) + 's'
                : '0s',
            totalStarts: m.totalStarts,
            totalCompletions: m.totalCompletions
        }));

        return {
            users: {
                total: this.sessions.size,
                active24h: activeUsers
            },
            events: {
                total: totalEvents,
                last24h: recentEvents
            },
            errors: {
                total: totalErrors,
                last24h: recentErrors
            },
            flows
        };
    }

    /**
     * Get detailed user analytics
     * @param {string} userId - WhatsApp user ID
     * @returns {Object|null} User analytics or null if not found
     */
    getUserAnalytics(userId) {
        const session = this.sessions.get(userId);
        if (!session) return null;

        const userEvents = this.events.filter(e => e.userId === this._anonymize(userId));

        return {
            session,
            totalEvents: userEvents.length,
            recentEvents: userEvents.slice(-10)
        };
    }

    /**
     * Clear old data (for memory management)
     * @param {number} daysToKeep - Number of days of data to keep
     */
    cleanup(daysToKeep = 7) {
        const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

        // Remove old events
        this.events = this.events.filter(e =>
            new Date(e.timestamp).getTime() > cutoff
        );

        // Remove old errors
        this.errorLog = this.errorLog.filter(e =>
            new Date(e.timestamp).getTime() > cutoff
        );

        // Remove inactive sessions
        for (const [userId, session] of this.sessions.entries()) {
            if (session.lastSeen < cutoff) {
                this.sessions.delete(userId);
            }
        }

        console.log(`🧹 Analytics cleanup: kept ${this.events.length} events, ${this.errorLog.length} errors, ${this.sessions.size} sessions`);
    }
}

module.exports = new Analytics();
