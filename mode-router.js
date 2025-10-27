/**
 * Mode Router - Dual-Mode System
 *
 * Routes messages between Legacy Mode (existing flows) and Multi-Agent Mode (new system)
 *
 * Commands:
 *   /budgetok, /budgetlegacy -> Switch to legacy mode
 *   /budgetnew -> Switch to multi-agent mode
 *   /mode -> Check current mode
 *
 * Configuration:
 *   DEFAULT_MODE env variable: 'legacy' or 'multi-agent'
 */

const flowRouter = require('./flows/router');

class ModeRouter {
  constructor() {
    this.userModes = new Map(); // Track per-user mode preference
    this.defaultMode = process.env.DEFAULT_MODE || 'multi-agent'; // Multi-agent is now default
    this.orchestrator = null; // Will be set when multi-agent is ready

    console.log(`📍 Mode Router initialized with default: ${this.defaultMode}`);
  }

  /**
   * Set the multi-agent orchestrator (when it's ready)
   */
  setOrchestrator(orchestrator) {
    this.orchestrator = orchestrator;
    console.log('✅ Multi-agent orchestrator connected to Mode Router');
  }

  /**
   * Main message handler - routes to legacy or multi-agent mode
   */
  async handleMessage(userId, message, context = {}) {
    const messageText = typeof message === 'string' ? message : message.body || '';
    const lowerMessage = messageText.toLowerCase().trim();

    // === MODE SWITCH COMMANDS ===

    if (lowerMessage === '/budgetok' || lowerMessage === '/budgetlegacy') {
      this.userModes.set(userId, 'legacy');
      console.log(`🔵 ${userId} switched to LEGACY mode`);

      return {
        response: `🔄 **Legacy Mode Activated**

✅ Using proven budget flows (unchanged)
📊 Budget features only
🔒 Stable and battle-tested

💡 Send any message to return to multi-agent mode (default).
💡 Type \`/mode\` to check your current mode.`,
        mode: 'legacy',
        handled: true
      };
    }

    if (lowerMessage === '/budgetnew') {
      if (!this.orchestrator) {
        return {
          response: `⚠️ **Multi-Agent Mode Not Available Yet**

The new multi-agent system is still being built.
Currently using legacy mode.

💡 Stay tuned for updates!`,
          mode: 'legacy',
          handled: true
        };
      }

      // Remove user's preference to return to default (multi-agent)
      this.userModes.delete(userId);
      console.log(`🟢 ${userId} returned to DEFAULT (MULTI-AGENT) mode`);

      return {
        response: `✨ **Multi-Agent Mode Active** (Default)

🤖 Enhanced AI orchestrator
✈️ Flight & hotel search/booking
🎯 Trip planning
📅 Calendar integration
📍 Google Maps

💡 Type \`/budgetok\` for legacy mode.
💡 Type \`/mode\` to check your current mode.`,
        mode: 'multi-agent',
        handled: true
      };
    }

    if (lowerMessage === '/mode') {
      const currentMode = this.getUserMode(userId);
      const modeEmoji = currentMode === 'legacy' ? '🔵' : '🟢';
      const modeName = currentMode === 'legacy' ? 'Legacy Mode' : 'Multi-Agent Mode';

      return {
        response: `${modeEmoji} **Current Mode**: ${modeName}

**Available Commands:**
• \`/budgetok\` or \`/budgetlegacy\` → Legacy mode
• \`/budgetnew\` → Multi-agent mode
• \`/mode\` → Check current mode (this)

**Mode Comparison:**
🔵 Legacy: Proven flows, budget only, fast
🟢 Multi-Agent: New features, trip planning, autonomous`,
        mode: currentMode,
        handled: true
      };
    }

    // === ROUTE TO APPROPRIATE MODE ===

    const mode = this.getUserMode(userId);

    if (mode === 'legacy') {
      return await this.handleLegacyMode(userId, message, context);
    } else {
      return await this.handleMultiAgentMode(userId, message, context);
    }
  }

  /**
   * Get user's current mode (legacy or multi-agent)
   */
  getUserMode(userId) {
    // Check if user has explicit preference
    if (this.userModes.has(userId)) {
      return this.userModes.get(userId);
    }

    // Check if user is in beta list (gets multi-agent by default)
    const betaUsers = process.env.BETA_USERS?.split(',').map(u => u.trim()) || [];
    if (betaUsers.includes(userId)) {
      return 'multi-agent';
    }

    // Otherwise use system default
    return this.defaultMode;
  }

  /**
   * Handle message in LEGACY mode (uses existing flow system)
   */
  async handleLegacyMode(userId, message, context) {
    console.log(`🔵 LEGACY MODE: ${userId} - ${typeof message === 'string' ? message : message.body}`);

    // Use existing flow router (completely unchanged)
    const flowResponse = await flowRouter.handleIncomingMessage(
      userId,
      typeof message === 'string' ? message : message.body,
      context
    );

    return {
      response: flowResponse,
      mode: 'legacy',
      handled: !!flowResponse // If flow router handled it
    };
  }

  /**
   * Handle message in MULTI-AGENT mode (uses orchestrator)
   */
  async handleMultiAgentMode(userId, message, context) {
    console.log(`🟢 MULTI-AGENT MODE: ${userId} - ${typeof message === 'string' ? message : message.body}`);

    // If orchestrator not ready yet, fall back to legacy with notification
    if (!this.orchestrator) {
      console.log('⚠️ Multi-agent orchestrator not ready, falling back to legacy');

      return {
        response: `⚠️ Multi-agent mode not fully ready yet. Using legacy flows.

💡 Type \`/budgetok\` to explicitly use legacy mode.`,
        mode: 'legacy',
        handled: false,
        fallback: true
      };
    }

    try {
      // Use new orchestrator
      const agentResponse = await this.orchestrator.handleUserRequest(
        userId,
        {
          type: 'parse_and_route', // Let orchestrator determine intent
          message: typeof message === 'string' ? message : message.body,
          context: context
        }
      );

      // Ensure response is a string
      let responseMessage = agentResponse.message || agentResponse.response || 'No response from agent';

      if (typeof responseMessage !== 'string') {
        console.error('❌ Agent returned non-string response:', typeof responseMessage, responseMessage);
        if (Array.isArray(responseMessage)) {
          responseMessage = responseMessage.join('\n');
        } else if (typeof responseMessage === 'object') {
          responseMessage = JSON.stringify(responseMessage, null, 2);
        } else {
          responseMessage = String(responseMessage);
        }
      }

      return {
        response: responseMessage,
        mode: 'multi-agent',
        handled: true,
        tasks: agentResponse.tasks || [] // Beads task IDs if any
      };
    } catch (error) {
      console.error('❌ Multi-agent mode error:', error);

      // Graceful fallback to legacy
      console.log('⚠️ Falling back to legacy mode due to error');

      return {
        response: `⚠️ Multi-agent error. Falling back to legacy mode.

💡 Type \`/budgetok\` to use legacy mode explicitly.`,
        mode: 'legacy',
        handled: false,
        fallback: true,
        error: error.message
      };
    }
  }

  /**
   * Reset user's mode preference (for /reset command)
   */
  resetUserMode(userId) {
    this.userModes.delete(userId);
    console.log(`🔄 Reset mode preference for ${userId}`);
  }

  /**
   * Get mode statistics (for monitoring/debugging)
   */
  getModeStats() {
    const legacyUsers = Array.from(this.userModes.values())
      .filter(mode => mode === 'legacy').length;
    const multiAgentUsers = Array.from(this.userModes.values())
      .filter(mode => mode === 'multi-agent').length;
    const totalUsers = this.userModes.size;

    return {
      defaultMode: this.defaultMode,
      totalUsers: totalUsers,
      legacyUsers: legacyUsers,
      multiAgentUsers: multiAgentUsers,
      ratios: {
        legacy: totalUsers > 0 ? ((legacyUsers / totalUsers) * 100).toFixed(1) + '%' : '0%',
        multiAgent: totalUsers > 0 ? ((multiAgentUsers / totalUsers) * 100).toFixed(1) + '%' : '0%'
      },
      orchestratorReady: !!this.orchestrator
    };
  }

  /**
   * Check if multi-agent mode is available
   */
  isMultiAgentAvailable() {
    return !!this.orchestrator;
  }
}

// Export singleton instance
module.exports = new ModeRouter();
