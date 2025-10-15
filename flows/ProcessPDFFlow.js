/**
 * ProcessPDFFlow - Extract and create transactions from PDF/images
 *
 * Handles PDF/image upload, extraction, and transaction creation.
 * Uses DIRECT async Claude call (no tool reliance).
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
     * Start the flow with PDF text
     */
    async onStart(message) {
        console.log(`📄 Starting ProcessPDFFlow for ${this.userId}`);

        // Message should contain the PDF text or be triggered after upload
        this.state.step = 'waiting_budget';

        return `📄 *Extraer Transacciones desde PDF*

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
     * Extract transactions from PDF using DIRECT async Claude call
     */
    async _extractTransactions() {
        if (!this.state.data.pdfText) {
            this.state.step = 'complete';
            return '❌ Error: No hay texto de PDF disponible.';
        }

        try {
            console.log(`📄 Extracting transactions DIRECTLY from PDF for ${this.state.data.budgetName}`);

            // Get categories for intelligent categorization
            const { budgetId, accounts } = await ynabService.getAccounts(this.state.data.budgetName);
            this.state.data.budgetId = budgetId;
            this.state.data.accounts = accounts;

            const categories = await ynabService.getCategories(budgetId);

            // Build extraction prompt
            const extractionPrompt = `Analiza el siguiente texto de estado de cuenta BCP y extrae TODAS las transacciones.

IMPORTANTE:
- Columna CARGOS/DEBE: montos NEGATIVOS (ej: -480.00)
- Columna ABONOS/HABER: montos POSITIVOS (ej: +1.50)
- Fechas DDMMM: Convierte a YYYY-MM-DD (año actual si no se especifica)
- Ignora encabezados, totales, y líneas no-transaccionales

CATEGORÍAS DISPONIBLES:
${categories.map(c => `- ${c.name}`).slice(0, 20).join('\n')}

Responde SOLO con un JSON válido (sin markdown):
{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "amount": -480.00,
      "payee": "Nombre del comercio",
      "categoryName": "Categoría sugerida (de la lista)",
      "memo": "Nota adicional (opcional)"
    }
  ]
}

TEXTO DEL PDF:
${this.state.data.pdfText}`;

            // Call Claude DIRECTLY (not via tool)
            const client = this.anthropicClient || anthropicClient;
            if (!client) {
                throw new Error('Anthropic client not configured');
            }

            const response = await client.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4096,
                messages: [{ role: 'user', content: extractionPrompt }]
            });

            const responseText = response.content.find(c => c.type === 'text')?.text || '{}';

            // Parse JSON response (handle markdown code blocks)
            let jsonText = responseText.trim();
            if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            }

            const extracted = JSON.parse(jsonText);
            const transactions = extracted.transactions || [];

            // AUTO-CACHE the transactions
            this.state.data.extractedTransactions = transactions;

            console.log(`💾 Extracted and cached ${transactions.length} transactions`);

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

        extractedTransactions.slice(0, 10).forEach((tx, index) => {
            const amountStr = tx.amount < 0 ? `${tx.amount}` : `+${tx.amount}`;
            message += `${index + 1}. ${tx.date} | ${tx.payee} | ${amountStr}\n`;
            if (tx.categoryName) {
                message += `   📁 ${tx.categoryName}\n`;
            }
        });

        if (extractedTransactions.length > 10) {
            message += `\n... y ${extractedTransactions.length - 10} más.\n`;
        }

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

                    // Convert amount to milliunits (YNAB uses milliunits)
                    const amountMilliunits = Math.round(tx.amount * 1000);

                    await ynabService.createTransaction(
                        budgetId,
                        accountId,
                        amountMilliunits,
                        tx.payee,
                        categoryId,
                        tx.memo || null
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
        return `💡 *Ayuda - Procesar PDF*

Este flujo extrae transacciones de estados de cuenta en PDF.

1. Envía el PDF
2. Selecciona el presupuesto
3. Revisa las transacciones extraídas
4. Selecciona la cuenta
5. Confirma la creación

Escribe "cancelar" para salir.`;
    }
}

module.exports = ProcessPDFFlow;
