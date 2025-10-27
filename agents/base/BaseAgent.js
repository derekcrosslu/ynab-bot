/**
 * BaseAgent - Abstract base class for all agents
 *
 * Provides common functionality:
 * - Memory access (Beads integration)
 * - Tool execution (MCP integration)
 * - Logging and error handling
 * - Context management
 */

class BaseAgent {
    /**
     * Create a new agent
     * @param {string} name - Agent name
     * @param {Array<string>} capabilities - List of capabilities this agent provides
     */
    constructor(name, capabilities = []) {
        if (this.constructor === BaseAgent) {
            throw new Error('BaseAgent is abstract and cannot be instantiated directly');
        }

        this.name = name;
        this.capabilities = capabilities;
        this.memory = null; // Beads integration (set by orchestrator)
        this.mcpTools = null; // MCP tools (set by orchestrator)
        this.anthropic = null; // Claude client (set by orchestrator)
    }

    /**
     * Handle a request - MUST be implemented by subclasses
     * @param {Object} request - The request object
     * @param {string} request.intent - The intent/action to perform
     * @param {Object} request.params - Parameters for the intent
     * @param {Object} context - Execution context
     * @param {string} context.userId - User ID making the request
     * @param {Object} context.memory - Beads memory integration
     * @param {boolean} context.approvalRequired - Whether user approval needed
     * @returns {Promise<Object>} Response object
     */
    async handleRequest(request, context) {
        throw new Error(`Agent ${this.name} must implement handleRequest()`);
    }

    /**
     * Set the memory system (Beads integration)
     * @param {Object} memory - Beads integration instance
     */
    setMemory(memory) {
        this.memory = memory;
        this.log('Memory system connected', 'info');
    }

    /**
     * Set MCP tools
     * @param {Object} mcpTools - MCP tools instance
     */
    setMCPTools(mcpTools) {
        this.mcpTools = mcpTools;
        this.log('MCP tools connected', 'info');
    }

    /**
     * Set Anthropic client
     * @param {Object} anthropic - Anthropic Claude client
     */
    setAnthropicClient(anthropic) {
        this.anthropic = anthropic;
        this.log('Anthropic client connected', 'info');
    }

    /**
     * Log a message
     * @param {string} message - Log message
     * @param {string} level - Log level (info, warn, error)
     */
    log(message, level = 'info') {
        const emoji = {
            info: '💬',
            warn: '⚠️',
            error: '❌',
            success: '✅'
        }[level] || '📝';

        const prefix = `${emoji} [${this.name}]`;

        switch (level) {
            case 'error':
                console.error(`${prefix} ${message}`);
                break;
            case 'warn':
                console.warn(`${prefix} ${message}`);
                break;
            default:
                console.log(`${prefix} ${message}`);
        }
    }

    /**
     * Save data to memory (Beads)
     * @param {Object} data - Data to save
     * @param {string} data.title - Task title
     * @param {string} data.type - Task type (task, epic, bug, feature)
     * @param {number} data.priority - Priority (1-5)
     * @param {string} data.description - Description
     * @returns {Promise<Object>} Created task
     */
    async saveToMemory(data) {
        if (!this.memory) {
            this.log('Memory not available, skipping save', 'warn');
            return null;
        }

        try {
            const task = await this.memory.createIssue({
                title: data.title,
                type: data.type || 'task',
                priority: data.priority || 2,
                description: data.description || '',
                assignee: this.name
            });

            this.log(`Saved to memory: ${task.id} - ${data.title}`, 'success');
            return task;
        } catch (error) {
            this.log(`Failed to save to memory: ${error.message}`, 'warn');
            // Return null instead of throwing - makes Beads optional
            return null;
        }
    }

    /**
     * Query memory (Beads)
     * @param {Object} query - Query parameters
     * @param {string} query.status - Filter by status
     * @param {string} query.assignee - Filter by assignee
     * @param {number} query.limit - Limit results
     * @returns {Promise<Array>} Matching tasks
     */
    async queryMemory(query = {}) {
        if (!this.memory) {
            this.log('Memory not available', 'warn');
            return [];
        }

        try {
            const tasks = await this.memory.listIssues({
                assignee: query.assignee || this.name,
                status: query.status || null,
                limit: query.limit || 10
            });

            this.log(`Found ${tasks.length} tasks in memory`, 'info');
            return tasks;
        } catch (error) {
            this.log(`Failed to query memory: ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * Update a task in memory
     * @param {string} taskId - Task ID
     * @param {Object} updates - Updates to apply
     * @returns {Promise<Object>} Updated task
     */
    async updateMemory(taskId, updates) {
        if (!this.memory) {
            this.log('Memory not available', 'warn');
            return null;
        }

        try {
            await this.memory.updateIssue(taskId, updates);
            this.log(`Updated task ${taskId}`, 'success');
            return { id: taskId, ...updates };
        } catch (error) {
            this.log(`Failed to update memory: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Use an MCP tool
     * @param {string} toolName - Name of the tool
     * @param {Object} params - Tool parameters
     * @returns {Promise<Object>} Tool result
     */
    async useTool(toolName, params) {
        if (!this.mcpTools) {
            this.log('MCP tools not available', 'warn');
            throw new Error('MCP tools not configured');
        }

        try {
            this.log(`Using tool: ${toolName}`, 'info');
            const result = await this.mcpTools.call(toolName, params);
            this.log(`Tool ${toolName} completed`, 'success');
            return result;
        } catch (error) {
            this.log(`Tool ${toolName} failed: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Call Claude for AI-powered tasks
     * @param {string} prompt - Prompt for Claude
     * @param {Array} conversationHistory - Optional conversation history
     * @returns {Promise<string>} Claude's response
     */
    async askClaude(prompt, conversationHistory = []) {
        if (!this.anthropic) {
            this.log('Anthropic client not available', 'warn');
            throw new Error('Anthropic client not configured');
        }

        try {
            this.log('Consulting Claude...', 'info');

            const messages = [
                ...conversationHistory,
                { role: 'user', content: prompt }
            ];

            const response = await this.anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 2048,
                messages: messages
            });

            const text = response.content.find(c => c.type === 'text')?.text || '';
            this.log('Claude response received', 'success');
            return text;
        } catch (error) {
            this.log(`Claude call failed: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Format a response for the user
     * @param {string} message - Message to send
     * @param {Object} options - Formatting options
     * @returns {Object} Formatted response
     */
    formatResponse(message, options = {}) {
        return {
            message: message,
            agent: this.name,
            timestamp: new Date().toISOString(),
            tasks: options.tasks || [],
            requiresApproval: options.requiresApproval || false,
            nextSteps: options.nextSteps || []
        };
    }

    /**
     * Check if this agent can handle a given intent
     * @param {string} intent - Intent to check
     * @returns {boolean} True if agent can handle this intent
     */
    canHandle(intent) {
        return this.capabilities.includes(intent);
    }

    /**
     * Get agent status information
     * @returns {Object} Agent status
     */
    getStatus() {
        return {
            name: this.name,
            capabilities: this.capabilities,
            hasMemory: !!this.memory,
            hasMCPTools: !!this.mcpTools,
            hasAnthropicClient: !!this.anthropic,
            ready: !!(this.memory && this.anthropic)
        };
    }
}

module.exports = BaseAgent;
