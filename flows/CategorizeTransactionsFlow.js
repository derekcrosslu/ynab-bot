/**
 * CategorizeTransactionsFlow - Categorize pending transactions
 *
 * Helps users categorize uncategorized transactions with AI suggestions.
 */

const BaseFlow = require('./BaseFlow');
const ynabService = require('../services/ynab-service');

// TODO: Inject anthropic client
let anthropicClient = null;

class CategorizeTransactionsFlow extends BaseFlow {
    constructor(userId, options = {}) {
        super(userId);
        this.intent = 'categorize_transactions';
        this.state = {
            step: 'start',
            data: {
                budgetName: null,
                budgetId: null,
                uncategorizedTransactions: [],
                categories: [],
                currentIndex: 0,
                categorized: 0
            }
        };

        if (options.anthropicClient) {
            this.anthropicClient = options.anthropicClient;
        }
    }

    /**
     * Set global anthropic client
     */
    static setAnthropicClient(client) {
        anthropicClient = client;
    }

    /**
     * Check if message matches categorization intent
     */
    static matches(messageText) {
        const patterns = [
            /\b(categorize|categorizar)\s+(transactions?|transacci[oó]n(es)?|pending|pendientes?)/i,
            /\bpending\s+(transactions?|transacci[oó]n(es)?)/i,
            /\buncategorized\b/i,
            /\bsin\s+categor[ií]a/i
        ];
        return patterns.some(pattern => pattern.test(messageText));
    }

    /**
     * Start the flow
     */
    async onStart(message) {
        console.log(`🏷️ Starting CategorizeTransactionsFlow for ${this.userId}`);

        this.state.step = 'select_budget';
        return this._askForBudget();
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
            case 'select_budget':
                return await this._handleBudgetSelection(message);

            case 'categorizing':
                return await this._handleCategorySelection(message);

            default:
                return '❌ Estado inválido. Escribe "cancelar" para salir.';
        }
    }

    /**
     * Ask for budget
     */
    _askForBudget() {
        return `🏷️ *Categorizar Transacciones Pendientes*

¿De qué presupuesto?

1. BCP SOLES
2. BCP DOLARES
3. USA BANKS

Escribe el número o nombre del presupuesto.`;
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

        // Get uncategorized transactions
        return await this._getUncategorizedTransactions();
    }

    /**
     * Get uncategorized transactions
     */
    async _getUncategorizedTransactions() {
        try {
            const { budgetName } = this.state.data;

            console.log(`🏷️ Getting uncategorized transactions for ${budgetName}`);

            // Get accounts and transactions
            const { budgetId, accounts } = await ynabService.getAccounts(budgetName);
            this.state.data.budgetId = budgetId;

            // Get recent transactions (last 90 days)
            const allTransactions = await ynabService.getTransactions(budgetId, null, 90);

            // Filter uncategorized
            const uncategorized = allTransactions.filter(tx =>
                !tx.category_id || tx.category_name === 'Uncategorized'
            );

            if (uncategorized.length === 0) {
                this.state.step = 'complete';
                return `✅ ¡Excelente! No hay transacciones sin categorizar en ${budgetName}.`;
            }

            // Get categories
            const categories = await ynabService.getCategories(budgetId);
            this.state.data.categories = categories;
            this.state.data.uncategorizedTransactions = uncategorized;

            console.log(`📊 Found ${uncategorized.length} uncategorized transactions`);

            // Start categorizing
            return await this._showNextTransaction();
        } catch (error) {
            console.error('Error getting uncategorized transactions:', error);
            this.state.step = 'complete';
            return `❌ Error obteniendo transacciones: ${error.message}`;
        }
    }

    /**
     * Show next transaction to categorize
     */
    async _showNextTransaction() {
        const { uncategorizedTransactions, currentIndex, categorized } = this.state.data;

        if (currentIndex >= uncategorizedTransactions.length) {
            this.state.step = 'complete';
            return `✅ *¡Listo!*\n\nCategorized: ${categorized} transactions\nRemaining: ${uncategorizedTransactions.length - categorized}`;
        }

        const tx = uncategorizedTransactions[currentIndex];

        this.state.step = 'categorizing';

        // Get AI suggestion for category
        const suggestedCategory = await this._suggestCategory(tx);

        const amount = (tx.amount / 1000).toFixed(2);
        const amountStr = tx.amount < 0 ? `${amount}` : `+${amount}`;

        let message = `🏷️ *Transacción ${currentIndex + 1}/${uncategorizedTransactions.length}*\n\n`;
        message += `📅 ${tx.date}\n`;
        message += `🏪 ${tx.payee_name || 'N/A'}\n`;
        message += `💵 ${amountStr}\n`;
        if (tx.memo) {
            message += `💭 ${tx.memo}\n`;
        }
        message += `\n`;

        if (suggestedCategory) {
            message += `💡 Categoría sugerida: *${suggestedCategory.name}*\n\n`;
            message += `Opciones:\n`;
            message += `1. Usar sugerencia (${suggestedCategory.name})\n`;
            message += `2. Elegir otra categoría\n`;
            message += `3. Saltar esta transacción\n`;
            message += `\nEscribe 1, 2, o 3.`;
        } else {
            message += `💡 No pude sugerir una categoría.\n\n`;
            message += `Opciones:\n`;
            message += `1. Elegir categoría\n`;
            message += `2. Saltar esta transacción\n`;
            message += `\nEscribe 1 o 2.`;
        }

        return message;
    }

    /**
     * Suggest category using AI
     */
    async _suggestCategory(transaction) {
        try {
            const { categories } = this.state.data;
            const client = this.anthropicClient || anthropicClient;

            if (!client) {
                console.warn('Anthropic client not configured, skipping AI suggestion');
                return null;
            }

            // Build suggestion prompt
            const prompt = `Given this transaction, suggest the most appropriate category.

Transaction:
- Payee: ${transaction.payee_name}
- Amount: ${(transaction.amount / 1000).toFixed(2)}
- Memo: ${transaction.memo || 'N/A'}

Available categories:
${categories.map(c => `- ${c.name}`).join('\n')}

Respond with ONLY the category name from the list above, or "Unknown" if unsure.`;

            const response = await client.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 50,
                messages: [{ role: 'user', content: prompt }]
            });

            const suggestedName = response.content.find(c => c.type === 'text')?.text.trim();

            // Find matching category
            if (suggestedName && suggestedName !== 'Unknown') {
                const category = ynabService.findCategoryByName(categories, suggestedName);
                return category;
            }

            return null;
        } catch (error) {
            console.error('Error suggesting category:', error);
            return null;
        }
    }

    /**
     * Handle category selection
     */
    async _handleCategorySelection(message) {
        const normalized = message.trim();
        const { uncategorizedTransactions, currentIndex, categories } = this.state.data;
        const tx = uncategorizedTransactions[currentIndex];

        if (normalized === '1') {
            // Use suggestion or prompt for category
            const suggestedCategory = await this._suggestCategory(tx);

            if (suggestedCategory) {
                // Apply suggested category
                return await this._applyCategoryToTransaction(tx, suggestedCategory);
            } else {
                // No suggestion, ask for category
                return this._askForCategoryName();
            }
        } else if (normalized === '2') {
            // Choose different category
            return this._askForCategoryName();
        } else if (normalized === '3' || normalized.toLowerCase() === 'skip' || normalized.toLowerCase() === 'saltar') {
            // Skip this transaction
            this.state.data.currentIndex++;
            return await this._showNextTransaction();
        } else {
            // Assume it's a category name
            const category = ynabService.findCategoryByName(categories, message);

            if (category) {
                return await this._applyCategoryToTransaction(tx, category);
            } else {
                return `❌ No encontré la categoría "${message}". Intenta de nuevo o escribe "skip".`;
            }
        }
    }

    /**
     * Ask for category name
     */
    _askForCategoryName() {
        const { categories } = this.state.data;

        let message = `📁 *Elige una categoría:*\n\n`;
        message += categories.slice(0, 15).map(c => `- ${c.name}`).join('\n');

        if (categories.length > 15) {
            message += `\n... y ${categories.length - 15} más.`;
        }

        message += `\n\nEscribe el nombre de la categoría, o "skip" para saltar.`;

        return message;
    }

    /**
     * Apply category to transaction
     */
    async _applyCategoryToTransaction(transaction, category) {
        try {
            const { budgetId } = this.state.data;

            console.log(`🏷️ Applying category "${category.name}" to transaction ${transaction.id}`);

            await ynabService.updateTransaction(
                budgetId,
                transaction.id,
                { category_id: category.id }
            );

            this.state.data.categorized++;
            this.state.data.currentIndex++;

            return `✅ Categoría aplicada: *${category.name}*\n\n` + await this._showNextTransaction();
        } catch (error) {
            console.error('Error applying category:', error);
            return `❌ Error aplicando categoría: ${error.message}\n\nIntentando siguiente transacción...\n\n` + await this._showNextTransaction();
        }
    }

    /**
     * Get help for this flow
     */
    getHelp() {
        return `💡 *Ayuda - Categorizar Transacciones*

Este flujo te ayuda a categorizar transacciones pendientes con sugerencias de IA.

1. Selecciona el presupuesto
2. Revisa cada transacción
3. Acepta la sugerencia o elige otra
4. Continúa hasta terminar

Escribe "skip" para saltar una transacción.
Escribe "cancelar" para salir.`;
    }
}

module.exports = CategorizeTransactionsFlow;
