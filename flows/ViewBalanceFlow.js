/**
 * ViewBalanceFlow - Display account balances
 *
 * Shows account balances from YNAB budgets.
 * Replaces executeClaudeBalances with direct implementation.
 */

const BaseFlow = require('./BaseFlow');
const ynabService = require('../services/ynab-service');

class ViewBalanceFlow extends BaseFlow {
    constructor(userId) {
        super(userId);
        this.intent = 'view_balance';
        this.state = {
            step: 'start',
            data: {
                budgetName: null,
                accountFilter: null
            }
        };
    }

    /**
     * Check if message matches balance viewing intent
     */
    static matches(messageText) {
        const patterns = [
            /\b(show|view|see|ver|mostrar|dame)\s+(balance|saldo|cuenta)/i,
            /\b(balance|saldo|cuenta)s?\s+(for|from|de|en)\b/i,
            /\b(cu[aá]nto\s+(tengo|hay|queda)|how\s+much)/i,
            /\bcheck\s+(balance|account)/i
        ];
        return patterns.some(pattern => pattern.test(messageText));
    }

    /**
     * Extract parameters from message
     */
    static extractParams(message) {
        const params = {};

        // Extract budget name
        if (message.toLowerCase().includes('bcp soles')) {
            params.budgetName = 'BCP SOLES';
        } else if (message.toLowerCase().includes('bcp dolares') || message.toLowerCase().includes('bcp dólares')) {
            params.budgetName = 'BCP DOLARES';
        } else if (message.toLowerCase().includes('usa')) {
            params.budgetName = 'USA BANKS';
        }

        // Extract account name/filter
        const accountMatch = message.match(/\b(from|de|en|for|in)\s+([A-Z][A-Za-z0-9\s]+)/);
        if (accountMatch) {
            params.accountFilter = accountMatch[2].trim();
        }

        return params;
    }

    /**
     * Start the flow
     */
    async onStart(message) {
        console.log(`💰 Starting ViewBalanceFlow for ${this.userId}`);

        // Extract params from initial message
        const extracted = ViewBalanceFlow.extractParams(message);
        Object.assign(this.state.data, extracted);

        // If we have budget, proceed to show balances
        if (this.state.data.budgetName) {
            return await this._showBalances();
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

            case 'showing_balances':
                // After showing balances, complete flow
                this.state.step = 'complete';
                return '✅ Listo. Escribe otra consulta cuando quieras.';

            default:
                return '❌ Estado inválido. Escribe "cancelar" para salir.';
        }
    }

    /**
     * Ask for budget
     */
    _askForBudget() {
        return `💰 *Ver Balances*

¿De qué presupuesto?

1. BCP SOLES
2. BCP DOLARES
3. USA BANKS
4. TODOS

Escribe el número o nombre del presupuesto.`;
    }

    /**
     * Handle budget selection
     */
    async _handleBudgetSelection(message) {
        const normalized = message.trim().toLowerCase();

        if (normalized === '4' || normalized === 'todos' || normalized === 'all') {
            return await this._showAllBudgets();
        }

        let budgetName = null;
        if (normalized === '1' || normalized.includes('bcp soles')) {
            budgetName = 'BCP SOLES';
        } else if (normalized === '2' || normalized.includes('bcp dolares') || normalized.includes('bcp dólares')) {
            budgetName = 'BCP DOLARES';
        } else if (normalized === '3' || normalized.includes('usa')) {
            budgetName = 'USA BANKS';
        }

        if (!budgetName) {
            return '❌ Opción inválida. Escribe 1, 2, 3, o 4.';
        }

        this.state.data.budgetName = budgetName;
        return await this._showBalances();
    }

    /**
     * Show all budgets
     */
    async _showAllBudgets() {
        try {
            const budgets = await ynabService.getBudgets();

            let message = `💰 *Resumen de Todos los Presupuestos*\n\n`;

            for (const budget of budgets) {
                const { accounts } = await ynabService.getAccounts(budget.name);

                const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
                const balanceStr = (totalBalance / 1000).toFixed(2);

                message += `📊 *${budget.name}*\n`;
                message += `   Saldo Total: ${balanceStr}\n`;
                message += `   Cuentas: ${accounts.length}\n\n`;
            }

            this.state.step = 'complete';
            return message;
        } catch (error) {
            console.error('Error showing all budgets:', error);
            this.state.step = 'complete';
            return `❌ Error obteniendo presupuestos: ${error.message}`;
        }
    }

    /**
     * Show balances for selected budget
     */
    async _showBalances() {
        try {
            const { budgetName, accountFilter } = this.state.data;

            console.log(`💰 Showing balances for ${budgetName}`);

            // Get accounts
            const { budgetId, accounts } = await ynabService.getAccounts(budgetName);

            if (accounts.length === 0) {
                this.state.step = 'complete';
                return `❌ No se encontraron cuentas en ${budgetName}.`;
            }

            // Filter accounts if specified
            let filteredAccounts = accounts;
            if (accountFilter) {
                filteredAccounts = accounts.filter(acc =>
                    acc.name.toLowerCase().includes(accountFilter.toLowerCase())
                );

                if (filteredAccounts.length === 0) {
                    this.state.step = 'complete';
                    return `❌ No se encontró cuenta con "${accountFilter}" en ${budgetName}`;
                }
            }

            // Calculate total balance
            const totalBalance = filteredAccounts.reduce((sum, acc) => sum + acc.balance, 0);

            // Format output
            let message = `💰 *Balances - ${budgetName}*\n\n`;

            // Group accounts by type (if desired)
            const groupedAccounts = this._groupAccountsByType(filteredAccounts);

            for (const [type, accs] of Object.entries(groupedAccounts)) {
                if (accs.length > 0) {
                    message += `📁 *${type}*\n`;
                    accs.forEach(account => {
                        const balance = (account.balance / 1000).toFixed(2);
                        const balanceEmoji = account.balance >= 0 ? '💚' : '🔴';
                        message += `   ${balanceEmoji} ${account.name}: ${balance}\n`;
                    });
                    message += `\n`;
                }
            }

            const totalStr = (totalBalance / 1000).toFixed(2);
            message += `━━━━━━━━━━━━━━━━\n`;
            message += `💵 *Total:* ${totalStr}\n`;
            message += `📊 *Cuentas:* ${filteredAccounts.length}`;

            this.state.step = 'showing_balances';
            return message;
        } catch (error) {
            console.error('Error showing balances:', error);
            this.state.step = 'complete';
            return `❌ Error obteniendo balances: ${error.message}`;
        }
    }

    /**
     * Group accounts by type
     */
    _groupAccountsByType(accounts) {
        const groups = {
            'Checking': [],
            'Savings': [],
            'Credit Card': [],
            'Other': []
        };

        accounts.forEach(account => {
            const type = account.type || 'other';

            if (type.toLowerCase().includes('checking')) {
                groups['Checking'].push(account);
            } else if (type.toLowerCase().includes('savings')) {
                groups['Savings'].push(account);
            } else if (type.toLowerCase().includes('credit')) {
                groups['Credit Card'].push(account);
            } else {
                groups['Other'].push(account);
            }
        });

        // Remove empty groups
        return Object.fromEntries(
            Object.entries(groups).filter(([key, value]) => value.length > 0)
        );
    }

    /**
     * Get help for this flow
     */
    getHelp() {
        return `💡 *Ayuda - Ver Balances*

Puedes decir:
- "Mostrar balances"
- "Saldo de BCP SOLES"
- "Cuánto tengo en USA BANKS"
- "Balance de CHASE"

O seguir el flujo paso a paso.

Escribe "cancelar" para salir.`;
    }
}

module.exports = ViewBalanceFlow;
