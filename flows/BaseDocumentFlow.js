/**
 * BaseDocumentFlow - Shared logic for document processing flows
 *
 * Base class for PDF and Image processing flows.
 * Contains shared logic for:
 * - Budget and account selection
 * - Transaction correction and validation
 * - YNAB transaction creation
 * - Confirmation and display
 */

const BaseFlow = require('./BaseFlow');
const ynabService = require('../services/ynab-service');

class BaseDocumentFlow extends BaseFlow {
    constructor(userId, intent) {
        super(userId);
        this.intent = intent;
        this.state = {
            step: 'start',
            data: {
                budgetName: null,
                budgetId: null,
                accountId: null,
                accountName: null,
                accounts: [],
                extractedTransactions: [],
                selectedTransactions: []
            }
        };
    }

    /**
     * Start the flow - must be implemented by subclass
     */
    async onStart(message) {
        throw new Error('onStart() must be implemented by subclass');
    }

    /**
     * Extract transactions from document - must be implemented by subclass
     * Should return extracted transactions array
     */
    async extractTransactionsFromDocument() {
        throw new Error('extractTransactionsFromDocument() must be implemented by subclass');
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

        // Extract transactions from document
        return await this._extractTransactions();
    }

    /**
     * Extract transactions (calls subclass implementation)
     */
    async _extractTransactions() {
        try {
            console.log(`📄 Extracting transactions for ${this.state.data.budgetName}`);

            // Get categories for intelligent categorization
            const { budgetId, accounts } = await ynabService.getAccounts(this.state.data.budgetName);
            this.state.data.budgetId = budgetId;
            this.state.data.accounts = accounts;

            const categories = await ynabService.getCategories(budgetId);

            // Call subclass to extract transactions
            const transactions = await this.extractTransactionsFromDocument(categories);

            // Validate and clean transactions
            const validTransactions = this._validateTransactions(transactions);

            if (validTransactions.length === 0) {
                throw new Error('No se encontraron transacciones válidas en el documento');
            }

            // Cache the validated transactions
            this.state.data.extractedTransactions = validTransactions;

            console.log(`💾 Extracted and cached ${validTransactions.length} transactions`);

            // Now ask user to select account
            return await this._askForAccount();
        } catch (error) {
            console.error('❌ Error extracting transactions:', error);
            this.state.step = 'complete';
            return `❌ Error extrayendo transacciones: ${error.message}`;
        }
    }

    /**
     * Validate transactions
     */
    _validateTransactions(transactions) {
        if (!Array.isArray(transactions)) {
            throw new Error('Formato de respuesta inválido: transactions debe ser un array');
        }

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

        return validTransactions;
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
        message += `¿Crear estas transacciones? (sí/no)\n`;
        message += `\n💡 Tip: Puedes corregir montos antes de confirmar.\n`;
        message += `Ejemplo: "1 es 146.16" o "1 es 146.16, 4 es 0.00"`;

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

        if (normalized === 'sí' || normalized === 'si' || normalized === 'yes') {
            // Create transactions
            return await this._createTransactions();
        }

        // Try to parse corrections (e.g., "1 es 146.16, 4 es 0.00")
        const corrections = this._parseCorrections(message);

        if (corrections.length > 0) {
            // Apply corrections and show updated list
            return await this._applyCorrections(corrections);
        }

        // Not a valid response
        return `❓ No entendí tu respuesta.

💡 Puedes:
- Escribir *sí* para crear las transacciones
- Escribir *no* para cancelar
- Corregir montos: Ej: "1 es 146.16" o "1 es 146.16, 4 es 0.00"
- Escribir *editar N* para cambiar la transacción N

¿Qué deseas hacer?`;
    }

    /**
     * Parse correction messages
     * Supports formats:
     * - "1 es 146.16" (single correction)
     * - "1 es 146.16, 4 es 0.00" (multiple corrections)
     * - "editar 1" (edit transaction 1)
     */
    _parseCorrections(message) {
        const corrections = [];

        // Pattern: "N es AMOUNT" or "N: AMOUNT"
        // Examples: "1 es 146.16", "4 es 0.00", "1: 146.16"
        const correctionPattern = /(\d+)\s*(?:es|:)\s*(-?\d+(?:\.\d{1,2})?)/gi;
        let match;

        while ((match = correctionPattern.exec(message)) !== null) {
            const index = parseInt(match[1]) - 1; // Convert to 0-indexed
            const amount = parseFloat(match[2]);

            if (!isNaN(index) && !isNaN(amount)) {
                corrections.push({ index, amount });
            }
        }

        return corrections;
    }

    /**
     * Apply corrections to extracted transactions
     */
    async _applyCorrections(corrections) {
        const { extractedTransactions } = this.state.data;
        const changes = [];

        for (const correction of corrections) {
            const { index, amount } = correction;

            // Validate index
            if (index < 0 || index >= extractedTransactions.length) {
                return `❌ Transacción ${index + 1} no existe. Solo hay ${extractedTransactions.length} transacciones.`;
            }

            // Store old amount for reporting
            const oldAmount = extractedTransactions[index].amount;

            // Apply correction
            extractedTransactions[index].amount = amount;

            changes.push({
                index: index + 1, // 1-indexed for display
                payee: extractedTransactions[index].payee,
                oldAmount,
                newAmount: amount
            });

            console.log(`✏️ Corrected transaction ${index + 1}: ${oldAmount} → ${amount}`);
        }

        // Show updated list with changes highlighted
        let message = `✅ *Correcciones aplicadas:*\n\n`;

        changes.forEach(change => {
            message += `${change.index}. ${change.payee}\n`;
            message += `   Antes: ${change.oldAmount < 0 ? '' : '+'}${change.oldAmount}\n`;
            message += `   Ahora: ${change.newAmount < 0 ? '' : '+'}${change.newAmount}\n\n`;
        });

        message += `📋 *Lista actualizada:*\n\n`;

        // Show ALL transactions with changes highlighted
        extractedTransactions.forEach((tx, index) => {
            const amountStr = tx.amount < 0 ? `${tx.amount}` : `+${tx.amount}`;
            const isChanged = changes.some(c => c.index === index + 1);
            const marker = isChanged ? '✏️' : '  ';

            message += `${marker} ${index + 1}. ${tx.date} | ${tx.payee} | ${amountStr}\n`;
            if (tx.categoryName) {
                message += `     📁 ${tx.categoryName}\n`;
            }
        });

        message += `\n💡 Total: ${extractedTransactions.length} transacciones\n\n`;
        message += `¿Crear estas transacciones? (sí/no)\n`;
        message += `O puedes hacer más correcciones.`;

        return message;
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

                    // CRITICAL: Do NOT multiply by 1000 here!
                    // ynabService.createTransaction already does this conversion
                    await ynabService.createTransaction(
                        budgetId,
                        accountId,
                        tx.amount,           // Pass amount as-is (NOT multiplied)
                        tx.payee,
                        categoryId,
                        tx.memo || null,
                        tx.date              // Pass the transaction date
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
     * Build extraction instructions for Claude
     */
    _buildExtractionInstructions(categories) {
        return `Analiza este estado de cuenta BCP y extrae TODAS las transacciones.

REGLAS CRÍTICAS PARA JSON:
1. Responde ÚNICAMENTE con JSON válido
2. NO uses markdown (no \`\`\`json)
3. Escapa comillas dobles en strings con \\"
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
    }

    /**
     * Parse JSON response from Claude with robust error handling
     */
    _parseClaudeResponse(responseText) {
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
                throw new Error(`No se pudo parsear la respuesta de Claude. Por favor intenta de nuevo con otro documento o contacta soporte.`);
            }
        }

        const transactions = extracted.transactions || [];

        if (!Array.isArray(transactions)) {
            throw new Error('Formato de respuesta inválido: transactions debe ser un array');
        }

        return transactions;
    }
}

module.exports = BaseDocumentFlow;
