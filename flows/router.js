/**
 * Intent Router - 4-Layer Intent Routing System
 *
 * Routes incoming messages to appropriate flows using a layered approach:
 * 1. Active Flow Check - If user in flow, delegate to flow
 * 2. Rule-Based Matching - Fast regex/keyword matching
 * 3. Parameter Extraction - Extract params and start flow
 * 4. AI Fallback - Use Claude to detect intent
 */

const flowState = require('./state');
const {
    findMatchingFlow,
    flowRegistry
} = require('./index');

// Import flow classes
const AddExpenseFlow = require('./AddExpenseFlow');
const ViewTransactionsFlow = require('./ViewTransactionsFlow');
const ViewBalanceFlow = require('./ViewBalanceFlow');
const ProcessPDFFlow = require('./ProcessPDFFlow');
const CategorizeTransactionsFlow = require('./CategorizeTransactionsFlow');

// TODO: Inject anthropic client
let anthropicClient = null;

/**
 * Set anthropic client for AI fallback
 */
function setAnthropicClient(client) {
    anthropicClient = client;
}

/**
 * Main entry point for routing incoming messages
 * @param {string} userId - User ID
 * @param {string} messageText - User message
 * @param {Object} options - Additional options (document, media, etc.)
 * @returns {Promise<string>} Response to user
 */
async function handleIncomingMessage(userId, messageText, options = {}) {
    console.log(`🔀 Routing message for ${userId}: "${messageText.substring(0, 50)}..."`);

    // ===== LAYER 1: ACTIVE FLOW CHECK =====
    const activeFlowResponse = await checkActiveFlow(userId, messageText);
    if (activeFlowResponse) {
        console.log(`✅ Layer 1: Routed to active flow`);
        return activeFlowResponse;
    }

    // ===== LAYER 2: RULE-BASED MATCHING =====
    const ruleBasedResponse = await ruleBasedMatching(userId, messageText, options);
    if (ruleBasedResponse) {
        console.log(`✅ Layer 2: Matched via rules`);
        return ruleBasedResponse;
    }

    // ===== LAYER 3: PARAMETER EXTRACTION =====
    const paramExtractionResponse = await parameterExtraction(userId, messageText);
    if (paramExtractionResponse) {
        console.log(`✅ Layer 3: Matched via parameter extraction`);
        return paramExtractionResponse;
    }

    // ===== LAYER 4: AI FALLBACK =====
    const aiFallbackResponse = await aiFallback(userId, messageText);
    if (aiFallbackResponse) {
        console.log(`✅ Layer 4: Matched via AI`);
        return aiFallbackResponse;
    }

    // ===== NO MATCH =====
    console.log(`❌ No route found for message`);
    return `❌ No entendí tu mensaje. Intenta:
- "Agregar gasto"
- "Ver transacciones"
- "Ver balances"
- "Categorizar pendientes"

O escribe /help para ayuda.`;
}

/**
 * LAYER 1: Check if user has active flow
 */
async function checkActiveFlow(userId, messageText) {
    const session = flowState.getUserSession(userId);

    if (!session) {
        return null; // No active flow
    }

    console.log(`📍 Layer 1: Active flow detected - ${session.flowInstance.intent}`);

    // Delegate message to active flow
    const response = await flowState.handleFlowMessage(userId, messageText);

    return response;
}

/**
 * LAYER 2: Rule-based keyword matching
 */
async function ruleBasedMatching(userId, messageText, options) {
    console.log(`🔍 Layer 2: Rule-based matching`);

    // Check each flow's matches() method
    const flowClasses = [
        AddExpenseFlow,
        ViewTransactionsFlow,
        ViewBalanceFlow,
        CategorizeTransactionsFlow
        // ProcessPDFFlow doesn't match text (only documents)
    ];

    for (const FlowClass of flowClasses) {
        if (FlowClass.matches(messageText)) {
            console.log(`✅ Matched flow: ${FlowClass.name}`);

            // Create flow instance
            const flowInstance = new FlowClass(userId, {
                anthropicClient: anthropicClient
            });

            // Start flow
            flowState.startFlowForUser(userId, flowInstance);
            const response = await flowInstance.onStart(messageText);

            return response;
        }
    }

    // Check for document upload (PDF or Image)
    if (options.hasDocument || options.isPDF || options.isImage) {
        const docType = options.isPDF ? 'PDF' : options.isImage ? 'Image' : 'Document';
        console.log(`✅ Matched flow: ProcessPDFFlow (${docType} upload)`);

        const flowInstance = new ProcessPDFFlow(userId, {
            anthropicClient: anthropicClient
        });

        // Set PDF text if provided
        if (options.pdfText) {
            flowInstance.setPDFText(options.pdfText);
        }

        // Set image data if provided
        if (options.imageData) {
            flowInstance.setImageData(options.imageData);
        }

        flowState.startFlowForUser(userId, flowInstance);
        const response = await flowInstance.onStart(messageText);

        return response;
    }

    return null; // No match
}

/**
 * LAYER 3: Parameter extraction
 */
async function parameterExtraction(userId, messageText) {
    console.log(`🔍 Layer 3: Parameter extraction`);

    // Try to extract parameters from message
    // This is useful for messages like "spent $50 at Starbucks" where
    // we can extract amount and payee even if matches() didn't catch it

    const flowClasses = [
        AddExpenseFlow,
        ViewTransactionsFlow,
        ViewBalanceFlow
    ];

    for (const FlowClass of flowClasses) {
        if (typeof FlowClass.extractParams === 'function') {
            const params = FlowClass.extractParams(messageText);

            // If we extracted meaningful params, start the flow
            if (Object.keys(params).length > 0) {
                console.log(`✅ Extracted params for ${FlowClass.name}:`, params);

                const flowInstance = new FlowClass(userId, {
                    anthropicClient: anthropicClient
                });

                flowState.startFlowForUser(userId, flowInstance);
                const response = await flowInstance.onStart(messageText);

                return response;
            }
        }
    }

    return null; // No meaningful params extracted
}

/**
 * LAYER 4: AI fallback (Claude intent detection)
 */
async function aiFallback(userId, messageText) {
    console.log(`🔍 Layer 4: AI fallback`);

    if (!anthropicClient) {
        console.log(`⚠️ AI fallback unavailable (no anthropic client)`);
        return null;
    }

    try {
        const intent = await detectIntentWithAI(messageText);

        console.log(`🤖 AI detected intent: ${intent}`);

        switch (intent) {
            case 'add_expense':
                const addExpenseFlow = new AddExpenseFlow(userId, { anthropicClient });
                flowState.startFlowForUser(userId, addExpenseFlow);
                return await addExpenseFlow.onStart(messageText);

            case 'view_transactions':
                const viewTxFlow = new ViewTransactionsFlow(userId, { anthropicClient });
                flowState.startFlowForUser(userId, viewTxFlow);
                return await viewTxFlow.onStart(messageText);

            case 'view_balance':
                const viewBalanceFlow = new ViewBalanceFlow(userId, { anthropicClient });
                flowState.startFlowForUser(userId, viewBalanceFlow);
                return await viewBalanceFlow.onStart(messageText);

            case 'categorize_transactions':
                const categorizeFlow = new CategorizeTransactionsFlow(userId, { anthropicClient });
                flowState.startFlowForUser(userId, categorizeFlow);
                return await categorizeFlow.onStart(messageText);

            case 'help':
                return getHelpMessage();

            case 'unknown':
            default:
                return null; // Fall through to "no match" message
        }
    } catch (error) {
        console.error('Error in AI fallback:', error);
        return null;
    }
}

/**
 * Detect intent using Claude AI
 */
async function detectIntentWithAI(messageText) {
    try {
        const prompt = `Analyze this user message and determine their intent. Respond with ONLY one of these intents:

- add_expense (user wants to record a new transaction/expense/income)
- view_transactions (user wants to see recent transactions)
- view_balance (user wants to see account balances)
- categorize_transactions (user wants to categorize pending transactions)
- help (user needs help)
- unknown (doesn't match any intent)

User message: "${messageText}"

Respond with just the intent name, nothing else.`;

        const response = await anthropicClient.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 20,
            messages: [{ role: 'user', content: prompt }]
        });

        const intent = response.content.find(c => c.type === 'text')?.text.trim().toLowerCase();

        return intent || 'unknown';
    } catch (error) {
        console.error('Error detecting intent with AI:', error);
        return 'unknown';
    }
}

/**
 * Get help message
 */
function getHelpMessage() {
    return `🤖 *Ayuda del Bot YNAB*

*Comandos disponibles:*

💰 *Agregar Gasto*
- "Gasté $50 en Starbucks"
- "Agregar gasto"

📊 *Ver Transacciones*
- "Mostrar transacciones"
- "Últimas 10 transacciones"

💵 *Ver Balances*
- "Ver balances"
- "Saldo de BCP SOLES"

🏷️ *Categorizar Pendientes*
- "Categorizar transacciones"
- "Pendientes sin categoría"

📄 *Procesar PDF*
- Envía un PDF de estado de cuenta

*Comandos especiales:*
/reset - Reiniciar sesión
/debug - Ver estado del sistema
/help - Esta ayuda

Escribe "cancelar" para salir de cualquier conversación.`;
}

/**
 * Handle global commands (reset, debug, help)
 */
function handleGlobalCommand(userId, command) {
    const normalized = command.trim().toLowerCase();

    switch (normalized) {
        case '/reset':
        case 'reset':
            flowState.clearUserSession(userId);
            return '🔄 Sesión reiniciada. ¿En qué puedo ayudarte?';

        case '/help':
        case 'help':
        case 'ayuda':
            return getHelpMessage();

        case '/debug':
            return getDebugInfo(userId);

        case 'cancelar':
        case '/cancel':
        case 'cancel':
            const session = flowState.getUserSession(userId);
            if (session) {
                flowState.clearUserSession(userId);
                return '❌ Conversación cancelada. ¿En qué más puedo ayudarte?';
            }
            return '✅ No hay conversación activa.';

        default:
            return null;
    }
}

/**
 * Get debug info
 */
function getDebugInfo(userId) {
    const session = flowState.getUserSession(userId);
    const allSessions = flowState.getAllSessions();

    let message = `🔧 *Debug Info*\n\n`;

    if (session) {
        message += `*Tu sesión:*\n`;
        message += `- Flow: ${session.flowInstance.intent}\n`;
        message += `- Step: ${session.flowInstance.state.step}\n`;
        message += `- Inactive: ${Math.floor((Date.now() - session.lastActivity) / 1000 / 60)} min\n\n`;
    } else {
        message += `*Tu sesión:* No hay flow activo\n\n`;
    }

    message += `*Sesiones activas:* ${allSessions.length}\n`;

    if (allSessions.length > 0) {
        message += `\nTodas las sesiones:\n`;
        allSessions.forEach(s => {
            message += `- ${s.userId.substring(0, 10)}: ${s.intent} (${s.step})\n`;
        });
    }

    return message;
}

module.exports = {
    handleIncomingMessage,
    setAnthropicClient,
    handleGlobalCommand,
    getHelpMessage,
    getDebugInfo
};
