/**
 * ViewTransactionsFlow - Display recent transactions
 *
 * Shows transactions from YNAB accounts with filtering options.
 * Replaces executeClaudeTransactions with direct implementation.
 */

const BaseFlow = require('./BaseFlow');
const ynabService = require('../services/ynab-service');

class ViewTransactionsFlow extends BaseFlow {
    constructor(userId) {
        super(userId);
        this.intent = 'view_transactions';
        this.state = {
            step: 'start',
            data: {
                budgetName: null,
                accountFilter: null,
                limit: 10,
                days: 90
            }
        };
    }

    /**
     * Check if message matches transaction viewing intent
     */
    static matches(messageText) {
        const patterns = [
            /\b(show|view|see|ver|mostrar|dame)\s+(transactions?|transacci[oó]n(es)?)/i,
            /\b([uú]ltim[ao]s?)\s+(\d+)?\s*(transactions?|transacci[oó]n(es)?)/i,
            /\btransactions?\s+(for|from|de|en)\b/i,
            /\blist\s+transactions?\b/i
        ];
        return patterns.some(pattern => pattern.test(messageText));
    }

    /**
     * Extract parameters from message
     */
    static extractParams(message) {
        const params = {};

        // Extract limit (number of transactions)
        const limitMatch = message.match(/\b([uú]ltim[ao]s?|last|recent)\s+(\d+)/i);
        if (limitMatch) {
            params.limit = parseInt(limitMatch[2]);
        }

        // Extract days
        const daysMatch = message.match(/(\d+)\s+(days?|d[ií]as?)/i);
        if (daysMatch) {
            params.days = parseInt(daysMatch[1]);
        }

        // Extract budget name
        if (message.toLowerCase().includes('bcp soles')) {
            params.budgetName = 'BCP SOLES';
        } else if (message.toLowerCase().includes('bcp dolares') || message.toLowerCase().includes('bcp dólares')) {
            params.budgetName = 'BCP DOLARES';
        } else if (message.toLowerCase().includes('usa')) {
            params.budgetName = 'USA BANKS';
        }

        // Extract account name/filter
        const accountMatch = message.match(/\b(from|de|en|for)\s+([A-Z][A-Za-z0-9\s]+)/);
        if (accountMatch) {
            params.accountFilter = accountMatch[2].trim();
        }

        return params;
    }

    /**
     * Start the flow
     */
    async onStart(message) {
        console.log(`📊 Starting ViewTransactionsFlow for ${this.userId}`);

        // Extract params from initial message
        const extracted = ViewTransactionsFlow.extractParams(message);
        Object.assign(this.state.data, extracted);

        // If we have budget, proceed to show transactions
        if (this.state.data.budgetName) {
            return await this._showTransactions();
        }

        // Ask for budget
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

            case 'select_account':
                return await this._handleAccountSelection(message);

            case 'showing_transactions':
                // After showing transactions, allow refinement
                return await this._handleRefinement(message);

            default:
                return '❌ Estado inválido. Escribe "cancelar" para salir.';
        }
    }

    /**
     * Ask for budget
     */
    _askForBudget() {
        return `📊 *Ver Transacciones*

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

        // Ask if they want specific account or all
        return await this._askForAccount();
    }

    /**
     * Ask for account (optional)
     */
    async _askForAccount() {
        this.state.step = 'select_account';
        return `🏦 ¿De qué cuenta?

Escribe el nombre de la cuenta o "todas" para ver todas las cuentas.`;
    }

    /**
     * Handle account selection
     */
    async _handleAccountSelection(message) {
        const normalized = message.trim().toLowerCase();

        if (normalized === 'todas' || normalized === 'all' || normalized === 'todo') {
            this.state.data.accountFilter = null;
        } else {
            this.state.data.accountFilter = message.trim();
        }

        return await this._showTransactions();
    }

    /**
     * Show transactions
     */
    async _showTransactions() {
        try {
            const { budgetName, accountFilter, limit, days } = this.state.data;

            console.log(`📊 Showing transactions for ${budgetName} - ${accountFilter || 'all accounts'}`);

            // Get accounts
            const { budgetId, accounts } = await ynabService.getAccounts(budgetName);

            // Find account by filter if specified
            let account = null;
            if (accountFilter) {
                account = accounts.find(acc =>
                    acc.name.toLowerCase().includes(accountFilter.toLowerCase())
                );

                if (!account) {
                    this.state.step = 'complete';
                    return `❌ No se encontró cuenta con "${accountFilter}" en ${budgetName}`;
                }
            }

            // Get transactions
            const transactions = await ynabService.getTransactions(
                budgetId,
                account ? account.id : null,
                days
            );

            if (transactions.length === 0) {
                this.state.step = 'complete';
                return `📊 No hay transacciones recientes en ${account ? account.name : budgetName}.`;
            }

            // Sort by date descending and limit
            const recentTransactions = transactions
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, limit);

            // Format output
            let message = `📊 *Últimas ${recentTransactions.length} Transacciones*\n`;
            if (account) {
                message += `*Cuenta:* ${account.name}\n`;
            }
            message += `*Presupuesto:* ${budgetName}\n`;
            message += `*Período:* Últimos ${days} días\n\n`;

            recentTransactions.forEach((tx, index) => {
                const amount = (tx.amount / 1000).toFixed(2);
                const amountStr = tx.amount < 0 ? `-${Math.abs(amount)}` : `+${amount}`;
                const category = tx.category_name || 'Sin categoría';
                const status = tx.approved ? '✅' : '⏳';

                message += `${index + 1}. *${tx.date}*\n`;
                message += `   ${tx.payee_name || 'N/A'} | ${amountStr}\n`;
                message += `   📁 ${category} ${status}\n`;
                if (tx.memo) {
                    message += `   💭 ${tx.memo}\n`;
                }
                message += `\n`;
            });

            message += `💡 Total: ${transactions.length} transacciones en últimos ${days} días\n\n`;
            message += `Escribe "más" para ver más, o "cancelar" para salir.`;

            this.state.step = 'showing_transactions';
            this.state.data.currentOffset = limit;
            this.state.data.allTransactions = transactions;

            return message;
        } catch (error) {
            console.error('Error showing transactions:', error);
            this.state.step = 'complete';
            return `❌ Error obteniendo transacciones: ${error.message}`;
        }
    }

    /**
     * Handle refinement after showing transactions
     */
    async _handleRefinement(message) {
        const normalized = message.trim().toLowerCase();

        if (normalized === 'más' || normalized === 'more' || normalized === 'next') {
            return await this._showMoreTransactions();
        }

        if (normalized.includes('filtrar') || normalized.includes('filter')) {
            this.state.step = 'select_account';
            return '🔍 ¿Qué cuenta quieres filtrar?';
        }

        // Complete flow
        this.state.step = 'complete';
        return '✅ Listo. Escribe otra consulta cuando quieras.';
    }

    /**
     * Show more transactions (pagination)
     */
    async _showMoreTransactions() {
        const { allTransactions, currentOffset, limit } = this.state.data;

        if (!allTransactions || currentOffset >= allTransactions.length) {
            this.state.step = 'complete';
            return '📊 No hay más transacciones.';
        }

        const nextBatch = allTransactions.slice(currentOffset, currentOffset + limit);

        if (nextBatch.length === 0) {
            this.state.step = 'complete';
            return '📊 No hay más transacciones.';
        }

        let message = `📊 *Siguientes ${nextBatch.length} Transacciones*\n\n`;

        nextBatch.forEach((tx, index) => {
            const amount = (tx.amount / 1000).toFixed(2);
            const amountStr = tx.amount < 0 ? `-${Math.abs(amount)}` : `+${amount}`;
            const category = tx.category_name || 'Sin categoría';
            const status = tx.approved ? '✅' : '⏳';

            message += `${currentOffset + index + 1}. *${tx.date}*\n`;
            message += `   ${tx.payee_name || 'N/A'} | ${amountStr}\n`;
            message += `   📁 ${category} ${status}\n`;
            if (tx.memo) {
                message += `   💭 ${tx.memo}\n`;
            }
            message += `\n`;
        });

        this.state.data.currentOffset += limit;
        message += `\nEscribe "más" para continuar, o "cancelar" para salir.`;

        return message;
    }

    /**
     * Get help for this flow
     */
    getHelp() {
        return `💡 *Ayuda - Ver Transacciones*

Puedes decir:
- "Mostrar transacciones"
- "Últimas 10 transacciones de BCP SOLES"
- "Ver transacciones de CHASE"
- "Transacciones de los últimos 30 días"

O seguir el flujo paso a paso.

Escribe "cancelar" para salir.`;
    }
}

module.exports = ViewTransactionsFlow;
