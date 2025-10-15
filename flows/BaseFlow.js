/**
 * BaseFlow - Base class for all conversational flows
 *
 * All flows inherit from this class and implement:
 * - static matches(messageText) - Check if message triggers this flow
 * - onStart(message) - Initialize flow state
 * - onMessage(message) - Handle user messages during flow
 */

class BaseFlow {
    /**
     * @param {string} userId - WhatsApp user ID
     */
    constructor(userId) {
        this.userId = userId;
        this.intent = ''; // Override in subclass
        this.state = {
            step: 'start',
            data: {}
        };
        this.childFlow = null; // For child flow pattern
        this.parentFlow = null; // For returning to parent
    }

    /**
     * Check if message matches this flow's intent
     * @param {string} messageText - User message
     * @returns {boolean} True if message matches flow
     */
    static matches(messageText) {
        // Override in subclass with regex or keyword matching
        return false;
    }

    /**
     * Extract parameters from initial message
     * @param {string} message - User message
     * @returns {Object} Extracted parameters
     */
    static extractParams(message) {
        // Override in subclass to extract specific params
        return {};
    }

    /**
     * Start the flow with initial message
     * @param {string} message - Initial user message
     * @returns {Promise<string>} Response to user
     */
    async onStart(message) {
        // Override in subclass
        throw new Error('onStart() must be implemented by subclass');
    }

    /**
     * Handle user message during flow
     * @param {string} message - User message
     * @returns {Promise<string|Object>} Response or flow result
     */
    async onMessage(message) {
        // Override in subclass
        throw new Error('onMessage() must be implemented by subclass');
    }

    /**
     * Invoke a child flow (for reusable sub-flows)
     * @param {BaseFlow} childFlowInstance - Child flow to invoke
     * @param {string} message - Message to pass to child
     * @returns {Promise<string>} Child flow response
     */
    async invokeChildFlow(childFlowInstance, message) {
        this.childFlow = childFlowInstance;
        childFlowInstance.parentFlow = this;
        return await childFlowInstance.onStart(message);
    }

    /**
     * Return from child flow to parent
     * @param {*} result - Result from child flow
     */
    returnToParent(result) {
        if (this.parentFlow) {
            this.parentFlow.childFlow = null;
            this.parentFlow.onChildFlowComplete(result);
        }
    }

    /**
     * Handle child flow completion
     * @param {*} result - Result from child flow
     * @returns {Promise<string>} Response after handling child result
     */
    async onChildFlowComplete(result) {
        // Override in subclass if using child flows
        return null;
    }

    /**
     * Check if flow is complete
     * @returns {boolean} True if flow is finished
     */
    isComplete() {
        return this.state.step === 'complete' || this.state.step === 'cancelled';
    }

    /**
     * Cancel the flow
     * @returns {string} Cancellation message
     */
    cancel() {
        this.state.step = 'cancelled';
        return '❌ Operación cancelada. Regresando al menú principal...';
    }

    /**
     * Handle common commands (cancel, help, back)
     * @param {string} message - User message
     * @returns {string|null} Response if command handled, null otherwise
     */
    handleCommonCommands(message) {
        const normalized = message.trim().toLowerCase();

        if (normalized === 'cancelar' || normalized === '/cancel') {
            return this.cancel();
        }

        if (normalized === 'ayuda' || normalized === '/help') {
            return this.getHelp();
        }

        return null;
    }

    /**
     * Get help message for this flow
     * @returns {string} Help message
     */
    getHelp() {
        return '💡 Escribe "cancelar" para salir de esta conversación.';
    }

    /**
     * Validate state before proceeding
     * @returns {boolean} True if state is valid
     */
    validateState() {
        // Override in subclass for specific validation
        return true;
    }
}

module.exports = BaseFlow;
