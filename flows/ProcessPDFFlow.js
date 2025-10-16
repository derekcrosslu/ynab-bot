/**
 * ProcessPDFFlow - Extract and create transactions from PDF bank statements
 *
 * Handles PDF upload, text extraction, and transaction creation.
 * Uses DIRECT async Claude call for PDF text analysis.
 */

const BaseDocumentFlow = require('./BaseDocumentFlow');

// TODO: Refactor to inject anthropic client via constructor or service
// For now, this will be set by bot.js when initializing the flow
let anthropicClient = null;

class ProcessPDFFlow extends BaseDocumentFlow {
    constructor(userId, options = {}) {
        super(userId, 'process_pdf');

        // Add PDF-specific data
        this.state.data.pdfText = null;

        // Store anthropic client if provided
        if (options.anthropicClient) {
            this.anthropicClient = options.anthropicClient;
        }
    }

    /**
     * Set global anthropic client (called by bot.js)
     */
    static setAnthropicClient(client) {
        anthropicClient = client;
    }

    /**
     * This flow doesn't match text messages, only document uploads
     * Matching is handled externally when document is received
     */
    static matches(messageText) {
        return false; // Document upload triggers this flow externally
    }

    /**
     * Start the flow with PDF
     */
    async onStart(message) {
        console.log(`📄 Starting ProcessPDFFlow for ${this.userId}`);

        this.state.step = 'waiting_budget';

        return `📄 *Extraer Transacciones de PDF*

He recibido el PDF. ¿De qué presupuesto son estas transacciones?

1. BCP SOLES
2. BCP DOLARES
3. USA BANKS

Escribe el número o nombre del presupuesto.`;
    }

    /**
     * Set PDF text (called externally after extraction)
     */
    setPDFText(pdfText) {
        this.state.data.pdfText = pdfText;
    }

    /**
     * Extract transactions from PDF using Claude
     */
    async extractTransactionsFromDocument(categories) {
        const { pdfText } = this.state.data;

        if (!pdfText) {
            throw new Error('No hay texto de PDF disponible para procesar.');
        }

        console.log(`📄 Extracting transactions from PDF for ${this.state.data.budgetName}`);

        // Get anthropic client
        const client = this.anthropicClient || anthropicClient;
        if (!client) {
            throw new Error('Anthropic client not configured');
        }

        // Build extraction prompt
        const extractionInstructions = this._buildExtractionInstructions(categories);

        // Build message content with PDF text
        const messageContent = `${extractionInstructions}

TEXTO DEL PDF:
${pdfText.substring(0, 8000)}`;

        // Call Claude DIRECTLY (not via tool)
        const response = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 8192,  // Increased for large documents
            messages: [{ role: 'user', content: messageContent }]
        });

        const responseText = response.content.find(c => c.type === 'text')?.text || '{}';

        // Parse and return transactions
        return this._parseClaudeResponse(responseText);
    }

    /**
     * Get help for this flow
     */
    getHelp() {
        return `💡 *Ayuda - Procesar PDF*

Este flujo extrae transacciones de estados de cuenta en PDF.

*Pasos:*
1. Envía el PDF
2. Selecciona el presupuesto
3. Revisa las transacciones extraídas
4. Selecciona la cuenta
5. Confirma o corrige las transacciones
6. Confirma la creación

*Corregir transacciones:*
• Montos: "1 es 146.16" o "1 es 146.16, 4 es 0.00"
• Categorías: "1 es Groceries" o "2 es Bank Fees"
• Combinar: "1 es 146.16, 2 es Groceries, 4 es 0.00"

Escribe "cancelar" para salir.`;
    }
}

module.exports = ProcessPDFFlow;
