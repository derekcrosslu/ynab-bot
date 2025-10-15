/**
 * SelectAccountFlow - Reusable child flow for account selection
 *
 * Can be invoked by any parent flow that needs the user to select an account.
 * Returns the selected account to the parent flow.
 */

const BaseFlow = require('./BaseFlow');
const ynabService = require('../services/ynab-service');

class SelectAccountFlow extends BaseFlow {
    constructor(userId, options = {}) {
        super(userId);
        this.intent = 'select_account';
        this.state = {
            step: 'start',
            data: {
                budgetName: options.budgetName || null,
                budgetId: options.budgetId || null,
                accounts: options.accounts || [],
                selectedAccount: null,
                showBalance: options.showBalance !== false // Show balance by default
            }
        };

        // Store parent flow info if provided
        if (options.parentFlow) {
            this.parentFlow = options.parentFlow;
        }
    }

    /**
     * This is a child flow, doesn't match text directly
     */
    static matches(messageText) {
        return false;
    }

    /**
     * Start the flow
     */
    async onStart(message) {
        console.log(`🏦 Starting SelectAccountFlow for ${this.userId}`);

        // If accounts not provided, fetch them
        if (this.state.data.accounts.length === 0) {
            if (this.state.data.budgetName) {
                try {
                    const { budgetId, accounts } = await ynabService.getAccounts(this.state.data.budgetName);
                    this.state.data.budgetId = budgetId;
                    this.state.data.accounts = accounts;
                } catch (error) {
                    console.error('Error fetching accounts:', error);
                    this.state.step = 'complete';
                    return `❌ Error obteniendo cuentas: ${error.message}`;
                }
            } else {
                this.state.step = 'complete';
                return '❌ No se especificó presupuesto.';
            }
        }

        return this._showAccounts();
    }

    /**
     * Handle user messages
     */
    async onMessage(message) {
        // Check for common commands
        const commonResponse = this.handleCommonCommands(message);
        if (commonResponse) {
            return commonResponse;
        }

        const normalized = message.trim();

        // Check if it's a number selection
        const numberSelection = parseInt(normalized);
        if (!isNaN(numberSelection)) {
            return this._handleNumberSelection(numberSelection);
        }

        // Try to match account by name
        return this._handleNameSelection(message);
    }

    /**
     * Show accounts
     */
    _showAccounts() {
        const { accounts, budgetName, showBalance } = this.state.data;

        if (accounts.length === 0) {
            this.state.step = 'complete';
            return '❌ No hay cuentas disponibles.';
        }

        this.state.step = 'selecting';

        let message = `🏦 *Selecciona una Cuenta*\n`;
        if (budgetName) {
            message += `*Presupuesto:* ${budgetName}\n`;
        }
        message += `\n`;

        accounts.forEach((account, index) => {
            message += `${index + 1}. ${account.name}`;

            if (showBalance) {
                const balance = (account.balance / 1000).toFixed(2);
                message += ` (${balance})`;
            }

            message += `\n`;
        });

        message += `\nEscribe el número o nombre de la cuenta.`;

        return message;
    }

    /**
     * Handle number selection
     */
    _handleNumberSelection(number) {
        const { accounts } = this.state.data;

        const index = number - 1;

        if (index < 0 || index >= accounts.length) {
            return `❌ Selección inválida. Escribe un número entre 1 y ${accounts.length}.`;
        }

        const selectedAccount = accounts[index];
        return this._completeSelection(selectedAccount);
    }

    /**
     * Handle name selection
     */
    _handleNameSelection(name) {
        const { accounts } = this.state.data;

        // Find account by name (case-insensitive, partial match)
        const account = accounts.find(acc =>
            acc.name.toLowerCase().includes(name.trim().toLowerCase())
        );

        if (account) {
            return this._completeSelection(account);
        } else {
            return `❌ No encontré la cuenta "${name}". Intenta de nuevo o escribe el número.`;
        }
    }

    /**
     * Complete selection and return to parent
     */
    _completeSelection(account) {
        this.state.step = 'complete';
        this.state.data.selectedAccount = account;

        console.log(`✅ Account selected: ${account.name}`);

        // Return result to parent flow
        if (this.parentFlow) {
            this.returnToParent(account);
        }

        const balance = (account.balance / 1000).toFixed(2);
        return `✅ Cuenta seleccionada: *${account.name}* (${balance})`;
    }

    /**
     * Get help for this flow
     */
    getHelp() {
        return `💡 *Ayuda - Seleccionar Cuenta*

Puedes:
- Escribir el número de la cuenta
- Escribir el nombre de la cuenta (o parte del nombre)

Escribe "cancelar" para salir.`;
    }
}

module.exports = SelectAccountFlow;
