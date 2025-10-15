/**
 * ProcessPDFFlow - Extract and create transactions from PDFs and Images
 *
 * Handles PDF and image upload, extraction, and transaction creation.
 * Uses DIRECT async Claude call with Vision API for images (no tool reliance).
 */

const BaseFlow = require('./BaseFlow');
const ynabService = require('../services/ynab-service');
const pdfService = require('../services/pdf-service');

// TODO: Refactor to inject anthropic client via constructor or service
// For now, this will be set by bot.js when initializing the flow
let anthropicClient = null;

class ProcessPDFFlow extends BaseFlow {
    constructor(userId, options = {}) {
        super(userId);
        this.intent = 'process_pdf';
        this.state = {
            step: 'start',
            data: {
                pdfText: null,
                imageData: null,  // For image uploads
                budgetName: null,
                accountId: null,
                extractedTransactions: [],
                selectedTransactions: []
            }
        };

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
     * Start the flow with PDF or Image
     */
    async onStart(message) {
        const docType = this.state.data.imageData ? 'imagen' : 'PDF';
        console.log(`📄 Starting ProcessPDFFlow (${docType}) for ${this.userId}`);

        // Message should contain the PDF text or image data
        this.state.step = 'waiting_budget';

        return `📄 *Extraer Transacciones*

He recibido el documento. ¿De qué presupuesto son estas transacciones?

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
     * Set image data (called externally for image uploads)
     */
    setImageData(imageData) {
        this.state.data.imageData = imageData;
    }

    /**
     * Handle user messages during flow
     */
    async onMessage(message) {
        // Check for common commands
        const commonResponse = this.handleCommonCommands(message);
        if (commonResponse) {
            return commonResponse;
        }

        switch (this.state.step) {
            case 'waiting_budget':
                return await this._handleBudgetSelection(message);

            case 'waiting_account':
                return await this._handleAccountSelection(message);

            case 'showing_transactions':
                return await this._handleTransactionConfirmation(message);

            default:
                return '❌ Estado inválido. Escribe "cancelar" para salir.';
        }
    }

    /**
     * Handle budget selection
     */
    async _handleBudgetSelection(message) {
        const normalized = message.trim().toLowerCase();

        let budgetName = null;
        if (normalized === '1' || normalized.includes('bcp soles')) {
            budgetName = 'BCP SOLES';
        } else if (normalized === '2' || normalized.includes('bcp dolares') || normalized.includes('bcp dólares')) {
            budgetName = 'BCP DOLARES';
        } else if (normalized === '3' || normalized.includes('usa')) {
            budgetName = 'USA BANKS';
        }

        if (!budgetName) {
            return '❌ Opción inválida. Escribe 1, 2 o 3.';
        }

        this.state.data.budgetName = budgetName;

        // Extract transactions from PDF
        return await this._extractTransactions();
    }

    /**
     * Extract transactions from PDF or Image using DIRECT async Claude call
     */
    async _extractTransactions() {
        const { pdfText, imageData } = this.state.data;

        if (!pdfText && !imageData) {
            this.state.step = 'complete';
            return '❌ Error: No hay documento disponible para procesar.';
        }

        try {
            const docType = imageData ? 'Image' : 'PDF';
            console.log(`📄 Extracting transactions DIRECTLY from ${docType} for ${this.state.data.budgetName}`);

            // Get categories for intelligent categorization
            const { budgetId, accounts } = await ynabService.getAccounts(this.state.data.budgetName);
            this.state.data.budgetId = budgetId;
            this.state.data.accounts = accounts;

            const categories = await ynabService.getCategories(budgetId);

            // Build extraction prompt (same for both PDF and Image)
            const extractionInstructions = `Analiza este estado de cuenta BCP y extrae TODAS las transacciones.

REGLAS CRÍTICAS PARA JSON:
1. Responde ÚNICAMENTE con JSON válido
2. NO uses markdown (no \`\`\`json)
3. Escapa comillas dobles en strings con \\\"
4. NO incluyas explicaciones antes o después del JSON
5. Si no hay transacciones, devuelve {"transactions": []}

REGLAS DE EXTRACCIÓN:
- Columna CARGOS/DEBE: montos NEGATIVOS (ej: -480.00)
- Columna ABONOS/HABER: montos POSITIVOS (ej: +1.50)
- Fechas DDMMM: Convierte a YYYY-MM-DD (usa 2025 como año)
- Ignora encabezados, totales, saldos y líneas no-transaccionales
- Limpia el payee (sin caracteres especiales innecesarios)

CATEGORÍAS DISPONIBLES (solo usa estas):
${categories.map(c => c.name).slice(0, 15).join(', ')}

FORMATO DE RESPUESTA (SOLO JSON, sin texto adicional):
{
  "transactions": [
    {
      "date": "2025-01-15",
      "amount": -150.00,
      "payee": "Nombre comercio",
      "categoryName": "Categoria exacta de la lista",
      "memo": ""
    }
  ]
}`;

            // Build message content (text or image)
            let messageContent;
            if (imageData) {
                // For images, use vision API
                messageContent = [
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
            } else {
                // For PDFs, include the text
                messageContent = `${extractionInstructions}

TEXTO DEL PDF:
${pdfText.substring(0, 8000)}`;
            }

            // Call Claude DIRECTLY (not via tool)
            const client = this.anthropicClient || anthropicClient;
            if (!client) {
                throw new Error('Anthropic client not configured');
            }

            const response = await client.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 8192,  // Increased for large documents
                messages: [{ role: 'user', content: messageContent }]
            });

            const responseText = response.content.find(c => c.type === 'text')?.text || '{}';
            console.log(`📄 Raw Claude response length: ${responseText.length} chars`);

            // Robust JSON parsing with multiple fallbacks
            let jsonText = responseText.trim();

            // Remove markdown code blocks if present
            if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            }

            // Try to extract JSON if there's text before/after
            const jsonMatch = jsonText.match(/\{[\s\S]*"transactions"[\s\S]*\}/);
            if (jsonMatch) {
                jsonText = jsonMatch[0];
            }

            // Log first 500 chars for debugging
            console.log(`📄 JSON to parse (first 500): ${jsonText.substring(0, 500)}`);

            let extracted;
            try {
                extracted = JSON.parse(jsonText);
            } catch (parseError) {
                console.error(`❌ JSON parse error: ${parseError.message}`);
                console.error(`❌ Failed JSON (first 1000 chars): ${jsonText.substring(0, 1000)}`);

                // Try to fix common issues
                try {
                    // Fix unescaped quotes in strings (basic attempt)
                    const fixedJson = jsonText
                        .replace(/([^\\])"([^"]*)":/g, '$1\\"$2":')  // Fix keys
                        .replace(/: "([^"]*)"([^,}\]])/g, ': "$1\\"$2');  // Fix values

                    extracted = JSON.parse(fixedJson);
                    console.log('✅ JSON fixed and parsed successfully');
                } catch (fixError) {
                    throw new Error(`No se pudo parsear la respuesta de Claude. Por favor intenta de nuevo con otro PDF o contacta soporte.`);
                }
            }

            const transactions = extracted.transactions || [];

            if (!Array.isArray(transactions)) {
                throw new Error('Formato de respuesta inválido: transactions debe ser un array');
            }

            // Validate and clean transactions
            const validTransactions = transactions.filter(tx => {
                // Must have required fields
                if (!tx.date || !tx.amount || !tx.payee) {
                    console.warn(`⚠️ Skipping invalid transaction: ${JSON.stringify(tx)}`);
                    return false;
                }

                // Validate date format (YYYY-MM-DD)
                if (!/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
                    console.warn(`⚠️ Invalid date format: ${tx.date} for ${tx.payee}`);
                    return false;
                }

                // Validate amount is a number
                if (typeof tx.amount !== 'number' || isNaN(tx.amount)) {
                    console.warn(`⚠️ Invalid amount: ${tx.amount} for ${tx.payee}`);
                    return false;
                }

                return true;
            });

            console.log(`✅ Validated ${validTransactions.length}/${transactions.length} transactions`);

            if (validTransactions.length === 0) {
                throw new Error('No se encontraron transacciones válidas en el PDF');
            }

            // AUTO-CACHE the validated transactions
            this.state.data.extractedTransactions = validTransactions;

            console.log(`💾 Extracted and cached ${validTransactions.length} transactions`);

            // Now ask user to select account
            return await this._askForAccount();
        } catch (error) {
            console.error('❌ Error extracting transactions from PDF:', error);
            this.state.step = 'complete';
            return `❌ Error extrayendo transacciones: ${error.message}`;
        }
    }

    /**
     * Ask for account
     */
    async _askForAccount() {
        const { accounts, extractedTransactions } = this.state.data;

        if (extractedTransactions.length === 0) {
            this.state.step = 'complete';
            return '❌ No se pudieron extraer transacciones del documento.';
        }

        if (accounts.length === 0) {
            this.state.step = 'complete';
            return '❌ No se encontraron cuentas en este presupuesto.';
        }

        this.state.step = 'waiting_account';

        let message = `✅ *${extractedTransactions.length} transacciones extraídas*\n\n`;
        message += `🏦 *Selecciona la cuenta para crear las transacciones:*\n\n`;

        accounts.forEach((account, index) => {
            const balance = (account.balance / 1000).toFixed(2);
            message += `${index + 1}. ${account.name} (${balance})\n`;
        });

        message += `\nEscribe el número de la cuenta.`;

        return message;
    }

    /**
     * Handle account selection
     */
    async _handleAccountSelection(message) {
        const selection = parseInt(message.trim()) - 1;
        const accounts = this.state.data.accounts;

        if (isNaN(selection) || selection < 0 || selection >= accounts.length) {
            return '❌ Selección inválida. Escribe el número de la cuenta.';
        }

        this.state.data.accountId = accounts[selection].id;
        this.state.data.accountName = accounts[selection].name;

        // Show transactions for confirmation
        return await this._showTransactionsForConfirmation();
    }

    /**
     * Show extracted transactions for confirmation
     */
    async _showTransactionsForConfirmation() {
        const { extractedTransactions, accountName } = this.state.data;

        this.state.step = 'showing_transactions';

        let message = `📋 *Transacciones a crear en ${accountName}:*\n\n`;

        // Show ALL transactions so user can validate them
        extractedTransactions.forEach((tx, index) => {
            const amountStr = tx.amount < 0 ? `${tx.amount}` : `+${tx.amount}`;
            message += `${index + 1}. ${tx.date} | ${tx.payee} | ${amountStr}\n`;
            if (tx.categoryName) {
                message += `   📁 ${tx.categoryName}\n`;
            }
        });

        message += `\n💡 Total: ${extractedTransactions.length} transacciones\n\n`;
        message += `¿Crear estas transacciones? (sí/no)`;

        return message;
    }

    /**
     * Handle transaction creation confirmation
     */
    async _handleTransactionConfirmation(message) {
        const normalized = message.trim().toLowerCase();

        if (normalized === 'no' || normalized === 'cancelar') {
            this.state.step = 'cancelled';
            return '❌ Creación de transacciones cancelada.';
        }

        if (normalized !== 'sí' && normalized !== 'si' && normalized !== 'yes') {
            return '¿Crear transacciones? Escribe "sí" o "no".';
        }

        // Create transactions
        return await this._createTransactions();
    }

    /**
     * Create all transactions in YNAB
     */
    async _createTransactions() {
        try {
            const { budgetId, accountId, extractedTransactions } = this.state.data;

            console.log(`📝 Creating ${extractedTransactions.length} transactions...`);

            let created = 0;
            let failed = 0;

            // Get categories for mapping
            const categories = await ynabService.getCategories(budgetId);

            for (const tx of extractedTransactions) {
                try {
                    // Find category by name if specified
                    let categoryId = null;
                    if (tx.categoryName) {
                        const category = ynabService.findCategoryByName(categories, tx.categoryName);
                        if (category) {
                            categoryId = category.id;
                        }
                    }

                    // CRITICAL FIX: Do NOT multiply by 1000 here!
                    // ynabService.createTransaction already does this conversion (line 129)
                    // Passing the amount directly prevents double conversion bug
                    await ynabService.createTransaction(
                        budgetId,
                        accountId,
                        tx.amount,           // Pass amount as-is (NOT multiplied)
                        tx.payee,
                        categoryId,
                        tx.memo || null,
                        tx.date              // CRITICAL FIX: Pass the transaction date
                    );

                    created++;
                } catch (error) {
                    console.error(`Error creating transaction: ${tx.payee}`, error);
                    failed++;
                }
            }

            this.state.step = 'complete';

            let message = `✅ *Transacciones Creadas*\n\n`;
            message += `✅ Creadas: ${created}\n`;
            if (failed > 0) {
                message += `❌ Fallidas: ${failed}\n`;
            }
            message += `📊 Total procesadas: ${extractedTransactions.length}`;

            return message;
        } catch (error) {
            console.error('Error creating transactions:', error);
            this.state.step = 'complete';
            return `❌ Error creando transacciones: ${error.message}`;
        }
    }

    /**
     * Get help for this flow
     */
    getHelp() {
        return `💡 *Ayuda - Procesar Documentos*

Este flujo extrae transacciones de estados de cuenta (PDF o imagen).

1. Envía el PDF o imagen
2. Selecciona el presupuesto
3. Revisa las transacciones extraídas
4. Selecciona la cuenta
5. Confirma la creación

Escribe "cancelar" para salir.`;
    }
}

module.exports = ProcessPDFFlow;
