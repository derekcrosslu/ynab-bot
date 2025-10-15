/**
 * Flow Registry
 *
 * Central registry for all conversational flows.
 * Exports flow classes and state management functions.
 */

const BaseFlow = require('./BaseFlow');
const flowState = require('./state');

// Import flow implementations
const AddExpenseFlow = require('./AddExpenseFlow');
const ViewTransactionsFlow = require('./ViewTransactionsFlow');
const ViewBalanceFlow = require('./ViewBalanceFlow');
const ProcessPDFFlow = require('./ProcessPDFFlow');
const CategorizeTransactionsFlow = require('./CategorizeTransactionsFlow');

// Import child flows
const SelectCategoryFlow = require('./SelectCategoryFlow');
const SelectAccountFlow = require('./SelectAccountFlow');

/**
 * Registry of all available flows
 * Each flow must extend BaseFlow and implement static matches() method
 */
const flowRegistry = [
    AddExpenseFlow,
    ViewTransactionsFlow,
    ViewBalanceFlow,
    ProcessPDFFlow,
    CategorizeTransactionsFlow,
];

/**
 * Find matching flow class for a message
 * @param {string} messageText - User message
 * @returns {Class|null} Flow class that matches, or null
 */
function findMatchingFlow(messageText) {
    for (const FlowClass of flowRegistry) {
        if (FlowClass.matches(messageText)) {
            return FlowClass;
        }
    }
    return null;
}

/**
 * Get all available flow intents (for help messages)
 * @returns {Array<string>} List of intent names
 */
function getAvailableIntents() {
    return flowRegistry.map(FlowClass => {
        const instance = new FlowClass('dummy');
        return instance.intent;
    });
}

/**
 * Validate that all flows extend BaseFlow
 * @returns {boolean} True if all valid
 */
function validateFlowRegistry() {
    for (const FlowClass of flowRegistry) {
        const instance = new FlowClass('test');
        if (!(instance instanceof BaseFlow)) {
            console.error(`❌ Flow ${FlowClass.name} does not extend BaseFlow`);
            return false;
        }
        if (typeof FlowClass.matches !== 'function') {
            console.error(`❌ Flow ${FlowClass.name} missing static matches() method`);
            return false;
        }
    }
    return true;
}

// Export base class
module.exports.BaseFlow = BaseFlow;

// Export flow classes
module.exports.AddExpenseFlow = AddExpenseFlow;
module.exports.ViewTransactionsFlow = ViewTransactionsFlow;
module.exports.ViewBalanceFlow = ViewBalanceFlow;
module.exports.ProcessPDFFlow = ProcessPDFFlow;
module.exports.CategorizeTransactionsFlow = CategorizeTransactionsFlow;

// Export child flows
module.exports.SelectCategoryFlow = SelectCategoryFlow;
module.exports.SelectAccountFlow = SelectAccountFlow;

// Export state management
module.exports.flowState = flowState;

// Export registry utilities
module.exports.flowRegistry = flowRegistry;
module.exports.findMatchingFlow = findMatchingFlow;
module.exports.getAvailableIntents = getAvailableIntents;
module.exports.validateFlowRegistry = validateFlowRegistry;
