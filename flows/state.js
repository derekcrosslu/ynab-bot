/**
 * Flow State Manager
 *
 * Manages active flow sessions for each user.
 * Handles flow lifecycle: start, message handling, completion, timeouts.
 */

// Session storage: userId -> { flowInstance, startTime, lastActivity }
const sessionState = new Map();

// Flow timeout configuration (30 minutes)
const FLOW_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Get user's current flow session
 * @param {string} userId - User ID
 * @returns {Object|null} Session object or null if no active flow
 */
function getUserSession(userId) {
    const session = sessionState.get(userId);

    if (!session) {
        return null;
    }

    // Check if session has expired
    const inactiveTime = Date.now() - session.lastActivity;
    if (inactiveTime > FLOW_TIMEOUT_MS) {
        console.log(`⏰ Flow session expired for ${userId} (inactive for ${Math.floor(inactiveTime / 1000 / 60)} min)`);
        clearUserSession(userId);
        return null;
    }

    return session;
}

/**
 * Start a new flow for user
 * @param {string} userId - User ID
 * @param {BaseFlow} flowInstance - Flow instance
 */
function startFlowForUser(userId, flowInstance) {
    console.log(`🔄 Starting flow "${flowInstance.intent}" for ${userId}`);

    sessionState.set(userId, {
        flowInstance: flowInstance,
        startTime: Date.now(),
        lastActivity: Date.now()
    });
}

/**
 * Update user's last activity timestamp
 * @param {string} userId - User ID
 */
function updateUserActivity(userId) {
    const session = sessionState.get(userId);
    if (session) {
        session.lastActivity = Date.now();
        sessionState.set(userId, session);
    }
}

/**
 * Handle message for user's active flow
 * @param {string} userId - User ID
 * @param {string} message - User message
 * @returns {Promise<string|Object>} Flow response
 */
async function handleFlowMessage(userId, message) {
    const session = getUserSession(userId);

    if (!session) {
        return null; // No active flow
    }

    // Update activity timestamp
    updateUserActivity(userId);

    const flowInstance = session.flowInstance;

    // Check if message is in child flow
    if (flowInstance.childFlow) {
        const childResponse = await flowInstance.childFlow.onMessage(message);

        // Check if child flow is complete
        if (flowInstance.childFlow.isComplete()) {
            const childResult = flowInstance.childFlow.state.data;
            flowInstance.childFlow = null;

            // Handle completion in parent flow
            const parentResponse = await flowInstance.onChildFlowComplete(childResult);

            // Check if parent flow is now complete
            if (flowInstance.isComplete()) {
                clearUserSession(userId);
            }

            return parentResponse || childResponse;
        }

        return childResponse;
    }

    // Handle message in main flow
    const response = await flowInstance.onMessage(message);

    // Check if flow is complete
    if (flowInstance.isComplete()) {
        console.log(`✅ Flow "${flowInstance.intent}" completed for ${userId}`);
        clearUserSession(userId);
    }

    return response;
}

/**
 * Clear user's flow session
 * @param {string} userId - User ID
 */
function clearUserSession(userId) {
    const session = sessionState.get(userId);
    if (session) {
        console.log(`🧹 Clearing flow session for ${userId} (intent: ${session.flowInstance.intent})`);
    }
    sessionState.delete(userId);
}

/**
 * Check if user has an active flow
 * @param {string} userId - User ID
 * @returns {boolean} True if user has active flow
 */
function hasActiveFlow(userId) {
    return getUserSession(userId) !== null;
}

/**
 * Get all active sessions (for debugging)
 * @returns {Array} Array of session info
 */
function getAllSessions() {
    const sessions = [];
    sessionState.forEach((session, userId) => {
        sessions.push({
            userId: userId,
            intent: session.flowInstance.intent,
            step: session.flowInstance.state.step,
            startTime: session.startTime,
            lastActivity: session.lastActivity,
            inactiveMinutes: Math.floor((Date.now() - session.lastActivity) / 1000 / 60)
        });
    });
    return sessions;
}

module.exports = {
    getUserSession,
    startFlowForUser,
    updateUserActivity,
    handleFlowMessage,
    clearUserSession,
    hasActiveFlow,
    getAllSessions
};
