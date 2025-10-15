/**
 * ProcessImageFlow - Extract and create transactions from Image bank statements
 *
 * Handles Image upload and transaction creation.
 * Uses DIRECT async Claude Vision API for image analysis.
 */

const BaseDocumentFlow = require('./BaseDocumentFlow');

// TODO: Refactor to inject anthropic client via constructor or service
// For now, this will be set by bot.js when initializing the flow
let anthropicClient = null;

class ProcessImageFlow extends BaseDocumentFlow {
    constructor(userId, options = {}) {
        super(userId, 'process_image');

        // Add image-specific data
        this.state.data.imageData = null;

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
     * This flow doesn't match text messages, only image uploads
     * Matching is handled externally when image is received
     */
    static matches(messageText) {
        return false; // Image upload triggers this flow externally
    }

    /**
     * Start the flow with Image
     */
    async onStart(message) {
        console.log(`🖼️ Starting ProcessImageFlow for ${this.userId}`);

        this.state.step = 'waiting_budget';

        return `🖼️ *Extraer Transacciones de Imagen*

He recibido la imagen. ¿De qué presupuesto son estas transacciones?

1. BCP SOLES
2. BCP DOLARES
3. USA BANKS

Escribe el número o nombre del presupuesto.`;
    }

    /**
     * Set image data (called externally for image uploads)
     */
    setImageData(imageData) {
        this.state.data.imageData = imageData;
    }

    /**
     * Extract transactions from Image using Claude Vision API
     */
    async extractTransactionsFromDocument(categories) {
        const { imageData } = this.state.data;

        if (!imageData) {
            throw new Error('No hay imagen disponible para procesar.');
        }

        console.log(`🖼️ Extracting transactions from Image for ${this.state.data.budgetName}`);

        // Get anthropic client
        const client = this.anthropicClient || anthropicClient;
        if (!client) {
            throw new Error('Anthropic client not configured');
        }

        // Build extraction prompt
        const extractionInstructions = this._buildExtractionInstructions(categories);

        // Build message content with image using Vision API
        const messageContent = [
            {
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: imageData.mimetype,
                    data: imageData.data
                }
            },
            {
                type: 'text',
                text: extractionInstructions
            }
        ];

        // Call Claude Vision API DIRECTLY (not via tool)
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
        return `💡 *Ayuda - Procesar Imagen*

Este flujo extrae transacciones de estados de cuenta en imagen.

*Pasos:*
1. Envía la imagen (foto o captura de pantalla)
2. Selecciona el presupuesto
3. Revisa las transacciones extraídas
4. Selecciona la cuenta
5. Confirma o corrige las transacciones
6. Confirma la creación

*Corregir transacciones:*
- "1 es 146.16" - Corrige el monto de la transacción 1
- "1 es 146.16, 4 es 0.00" - Corrige múltiples transacciones

Escribe "cancelar" para salir.`;
    }
}

module.exports = ProcessImageFlow;
