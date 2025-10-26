/**
 * Orchestrator - Central coordinator for multi-agent system
 *
 * Responsibilities:
 * - Parse user requests and determine intent
 * - Route to appropriate agent(s)
 * - Manage multi-step workflows
 * - Enforce decision autonomy rules
 * - Handle approvals via WhatsApp
 * - Coordinate between agents
 */

const BeadsIntegration = require('./BeadsIntegration');
const BudgetAgent = require('../budget/BudgetAgent');
const TripAgent = require('../trip/TripAgent');

class Orchestrator {
    constructor(anthropic, ynabService) {
        this.anthropic = anthropic;
        this.ynabService = ynabService;

        // Initialize Beads memory system
        this.beads = new BeadsIntegration(process.cwd());

        // Initialize agents
        this.agents = {
            budget: new BudgetAgent(anthropic, ynabService),
            trip: new TripAgent(anthropic, null) // budgetAgent will be set after initialization
        };

        // Connect budgetAgent to tripAgent for expense tracking
        this.agents.trip.budgetAgent = this.agents.budget;

        // Connect memory and clients to all agents
        this.setupAgents();

        console.log('🎯 Orchestrator initialized with agents:', Object.keys(this.agents));
    }

    /**
     * Setup agents with necessary dependencies
     */
    setupAgents() {
        Object.values(this.agents).forEach(agent => {
            agent.setMemory(this.beads);
            agent.setAnthropicClient(this.anthropic);
        });
    }

    /**
     * Handle a user request
     * @param {string} userId - User ID
     * @param {Object} request - Request object
     * @param {string} request.type - Request type ('parse_and_route', 'direct', etc.)
     * @param {string} request.message - User message
     * @param {Object} request.context - Additional context
     * @returns {Promise<Object>} Response object
     */
    async handleUserRequest(userId, request) {
        try {
            console.log(`🎯 Orchestrator handling request from ${userId}:`, request.message?.substring(0, 50));

            // Parse intent from user message
            const intent = await this.parseIntent(request.message, request.context);

            console.log(`🎯 Detected intent: ${intent.action} (agent: ${intent.agent}, confidence: ${intent.confidence})`);

            // Select appropriate agent
            const agent = this.selectAgent(intent.agent);

            if (!agent) {
                return {
                    message: `❌ No agent available to handle: ${intent.action}\n\nAvailable agents: ${Object.keys(this.agents).join(', ')}`,
                    handled: false
                };
            }

            // Check if approval needed
            const approvalRequired = this.checkApprovalNeeded(intent);

            // Execute the request via the agent
            const agentRequest = {
                intent: intent.action,
                params: intent.params,
                originalMessage: request.message
            };

            const context = {
                userId: userId,
                memory: this.beads,
                approvalRequired: approvalRequired
            };

            const result = await agent.handleRequest(agentRequest, context);

            // Format and return response
            return {
                message: result.message || result.response || 'Request processed',
                agent: agent.name,
                tasks: result.tasks || [],
                requiresApproval: approvalRequired,
                handled: true
            };

        } catch (error) {
            console.error('❌ Orchestrator error:', error);
            return {
                message: `❌ Error processing request: ${error.message}\n\nPlease try again or use /budgetok to switch to legacy mode.`,
                error: error.message,
                handled: false
            };
        }
    }

    /**
     * Parse user intent using Claude
     * @param {string} message - User message
     * @param {Object} context - Additional context
     * @returns {Promise<Object>} Intent object
     */
    async parseIntent(message, context = {}) {
        try {
            const prompt = `Analyze this user message and determine their intent.

User message: "${message}"

Available agents and their capabilities:
- BudgetAgent: view_balance, create_transaction, categorize_transactions, view_transactions, analyze_spending
- TripAgent: plan_trip, search_flights, search_hotels, create_itinerary, track_booking, get_trip_suggestions

Context: ${context.hasDocument ? 'User sent a document (PDF/Image)' : 'No document attached'}

Return a JSON object with:
{
  "agent": "budget|trip|email|calendar",
  "action": "specific_action_name",
  "confidence": 0.0-1.0,
  "params": {
    "param1": "value1"
  }
}

Examples:
- "show me my balance" → {"agent": "budget", "action": "view_balance", "confidence": 0.95, "params": {}}
- "add $50 expense at Starbucks" → {"agent": "budget", "action": "create_transaction", "confidence": 0.90, "params": {"amount": -50, "payee": "Starbucks"}}
- "categorize pending transactions" → {"agent": "budget", "action": "categorize_transactions", "confidence": 0.85, "params": {}}
- "plan trip to NYC Dec 11-21" → {"agent": "trip", "action": "plan_trip", "confidence": 0.90, "params": {"destination": "NYC", "dates": "Dec 11-21"}}
- "suggest beach destinations" → {"agent": "trip", "action": "get_trip_suggestions", "confidence": 0.85, "params": {"interests": "beach"}}

Respond ONLY with the JSON object, no markdown, no explanations.`;

            const response = await this.anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 500,
                messages: [{ role: 'user', content: prompt }]
            });

            const text = response.content.find(c => c.type === 'text')?.text || '{}';

            // Parse JSON (handle markdown code blocks if any)
            let jsonText = text.trim();
            if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            }

            const intent = JSON.parse(jsonText);

            return {
                agent: intent.agent || 'budget',
                action: intent.action || 'unknown',
                confidence: intent.confidence || 0.5,
                params: intent.params || {}
            };

        } catch (error) {
            console.error('❌ Intent parsing failed:', error.message);

            // Fallback: default to budget agent with generic action
            return {
                agent: 'budget',
                action: 'general_query',
                confidence: 0.3,
                params: { message: message }
            };
        }
    }

    /**
     * Select the appropriate agent based on intent
     * @param {string} agentName - Name of the agent
     * @returns {Object|null} Agent instance or null
     */
    selectAgent(agentName) {
        const agent = this.agents[agentName];

        if (!agent) {
            console.warn(`⚠️ Agent '${agentName}' not found. Available: ${Object.keys(this.agents).join(', ')}`);
            // Fallback to budget agent
            return this.agents.budget;
        }

        return agent;
    }

    /**
     * Check if user approval is required for this action
     * Decision matrix based on autonomy rules
     *
     * Autonomous (<$150):
     * - View balances/transactions
     * - Categorize transactions
     * - Create transactions < $150
     *
     * Requires Approval (>$150):
     * - Create transactions >= $150
     * - Trip bookings
     * - Calendar changes affecting others
     *
     * @param {Object} intent - Parsed intent
     * @returns {boolean} True if approval required
     */
    checkApprovalNeeded(intent) {
        const { action, params } = intent;

        // Read-only actions never need approval
        const readOnlyActions = ['view_balance', 'view_transactions', 'analyze_spending'];
        if (readOnlyActions.includes(action)) {
            return false;
        }

        // Categorization is autonomous
        if (action === 'categorize_transactions') {
            return false;
        }

        // Transaction creation: check amount
        if (action === 'create_transaction') {
            const amount = Math.abs(params.amount || 0);
            if (amount >= 150) {
                console.log(`⚠️ Approval required: transaction amount $${amount} >= $150`);
                return true;
            }
            return false; // < $150 is autonomous
        }

        // Trip-related actions always need approval
        if (action.startsWith('trip_') || action.startsWith('book_')) {
            return true;
        }

        // Calendar actions affecting others need approval
        if (action.startsWith('calendar_') && params.invitees) {
            return true;
        }

        // Default: autonomous for low-risk actions
        return false;
    }

    /**
     * Get orchestrator status
     * @returns {Object} Status information
     */
    getStatus() {
        const agentStatuses = {};
        Object.entries(this.agents).forEach(([name, agent]) => {
            agentStatuses[name] = agent.getStatus();
        });

        return {
            ready: true,
            agents: agentStatuses,
            beadsInitialized: this.beads.initialized
        };
    }

    /**
     * Add a new agent to the orchestrator
     * @param {string} name - Agent name
     * @param {Object} agent - Agent instance
     */
    addAgent(name, agent) {
        this.agents[name] = agent;
        agent.setMemory(this.beads);
        agent.setAnthropicClient(this.anthropic);
        console.log(`✅ Added agent: ${name}`);
    }
}

module.exports = Orchestrator;
