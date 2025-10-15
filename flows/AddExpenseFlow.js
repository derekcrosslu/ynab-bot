/**
 * AddExpenseFlow - Handle expense/transaction creation
 *
 * Conversational flow for adding expenses/income to YNAB.
 * Extracts amount, payee, category, account from user messages.
 */

const BaseFlow = require('./BaseFlow');
const ynabService = require('../services/ynab-service');

class AddExpenseFlow extends BaseFlow {
    constructor(userId) {
        super(userId);
        this.intent = 'add_expense';
        this.state = {
            step: 'start',
            data: {
                budgetName: null,
                accountId: null,
                amount: null,
                payee: null,
                categoryId: null,
                memo: null
            }
        };
    }

    /**
     * Check if message matches expense intent
     */
    static matches(messageText) {
        const patterns = [
            /\b(expense|spent|spend|purchase|bought|buy|paid|pagu[ée]|compr[ée]|gast[oe])\b/i,
            /\b(agregar|crear|registrar)\s+(gasto|transacci[oó]n|expense)/i,
            /\$([\d,]+\.?\d*)/,  // Dollar amount
            /S\/?\s*([\d,]+\.?\d*)/,  // Soles amount
        ];
        return patterns.some(pattern => pattern.test(messageText));
    }

    /**
     * Extract parameters from message
     */
    static extractParams(message) {
        const params = {};

        // Extract amount
        const dollarMatch = message.match(/\$\s*([\d,]+\.?\d*)/);
        const solesMatch = message.match(/S\/?\s*([\d,]+\.?\d*)/);
        const plainNumberMatch = message.match(/\b([\d,]+\.?\d*)\s*(soles|dollars?|usd|pen)\b/i);

        if (dollarMatch) {
            params.amount = -parseFloat(dollarMatch[1].replace(/,/g, ''));
            params.currency = 'USD';
        } else if (solesMatch) {
            params.amount = -parseFloat(solesMatch[1].replace(/,/g, ''));
            params.currency = 'PEN';
        } else if (plainNumberMatch) {
            params.amount = -parseFloat(plainNumberMatch[1].replace(/,/g, ''));
            params.currency = plainNumberMatch[2].toLowerCase().includes('sol') ? 'PEN' : 'USD';
        }

        // Extract payee (look for common patterns)
        const atMatch = message.match(/\b(at|en|in)\s+([A-Z][a-zA-Z\s]+)/);
        const forMatch = message.match(/\b(for|para)\s+([A-Z][a-zA-Z\s]+)/);

        if (atMatch) {
            params.payee = atMatch[2].trim();
        } else if (forMatch) {
            params.payee = forMatch[2].trim();
        }

        return params;
    }

    /**
     * Start the flow
     */
    async onStart(message) {
        console.log(`💰 Starting AddExpenseFlow for ${this.userId}`);

        // Try to extract params from initial message
        const extracted = AddExpenseFlow.extractParams(message);
        Object.assign(this.state.data, extracted);

        // Determine next step based on what we have
        if (!this.state.data.budgetName) {
            this.state.step = 'select_budget';
            return this._askForBudget();
        } else if (!this.state.data.amount) {
            this.state.step = 'ask_amount';
            return '💵 ¿Cuál es el monto? (Ej: -50 o $50)';
        } else if (!this.state.data.payee) {
            this.state.step = 'ask_payee';
            return '🏪 ¿En dónde fue el gasto? (Nombre del comercio/persona)';
        } else {
            // Have amount and payee, proceed to account selection
            return await this._selectAccount();
        }
    }

    /**
     * Handle user messages during flow
     */
    async onMessage(message) {
        // Check for common commands first
        const commonResponse = this.handleCommonCommands(message);
        if (commonResponse) {
            return commonResponse;
        }

        switch (this.state.step) {
            case 'select_budget':
                return await this._handleBudgetSelection(message);

            case 'select_account':
                return await this._handleAccountSelection(message);

            case 'ask_amount':
                return await this._handleAmount(message);

            case 'ask_payee':
                return await this._handlePayee(message);

            case 'ask_category':
                return await this._handleCategory(message);

            case 'ask_memo':
                return await this._handleMemo(message);

            case 'confirm':
                return await this._handleConfirmation(message);

            default:
                return '❌ Estado inválido. Escribe "cancelar" para reiniciar.';
        }
    }

    /**
     * Ask user to select budget
     */
    _askForBudget() {
        return `💰 *Registrar Gasto*

¿En qué presupuesto?

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
        } else if (normalized === '2' || normalized.includes('bcp dolares')) {
            budgetName = 'BCP DOLARES';
        } else if (normalized === '3' || normalized.includes('usa')) {
            budgetName = 'USA BANKS';
        }

        if (!budgetName) {
            return '❌ Opción inválida. Escribe 1, 2 o 3.';
        }

        this.state.data.budgetName = budgetName;

        // Move to account selection
        return await this._selectAccount();
    }

    /**
     * Select account within budget
     */
    async _selectAccount() {
        try {
            const { budgetId, accounts } = await ynabService.getAccounts(this.state.data.budgetName);
            this.state.data.budgetId = budgetId;

            if (accounts.length === 0) {
                this.state.step = 'complete';
                return '❌ No se encontraron cuentas en este presupuesto.';
            }

            // If only one account, auto-select
            if (accounts.length === 1) {
                this.state.data.accountId = accounts[0].id;
                return await this._askForAmount();
            }

            // Multiple accounts, ask user
            this.state.step = 'select_account';
            this.state.data.accounts = accounts;

            let message = `🏦 *Selecciona la cuenta:*\n\n`;
            accounts.forEach((account, index) => {
                const balance = (account.balance / 1000).toFixed(2);
                message += `${index + 1}. ${account.name} (${balance})\n`;
            });
            message += `\nEscribe el número de la cuenta.`;

            return message;
        } catch (error) {
            console.error('Error selecting account:', error);
            this.state.step = 'complete';
            return `❌ Error: ${error.message}`;
        }
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

        return await this._askForAmount();
    }

    /**
     * Ask for amount
     */
    async _askForAmount() {
        if (this.state.data.amount) {
            return await this._askForPayee();
        }

        this.state.step = 'ask_amount';
        return '💵 ¿Cuál es el monto?\n\nEj: -50, $50, 100 soles\n(Negativo para gasto, positivo para ingreso)';
    }

    /**
     * Handle amount input
     */
    async _handleAmount(message) {
        const extracted = AddExpenseFlow.extractParams(message);

        if (!extracted.amount) {
            // Try plain number
            const plainMatch = message.match(/([-+]?\d+\.?\d*)/);
            if (plainMatch) {
                this.state.data.amount = parseFloat(plainMatch[1]);
            } else {
                return '❌ No entendí el monto. Intenta: -50, $50, o 100 soles';
            }
        } else {
            this.state.data.amount = extracted.amount;
        }

        return await this._askForPayee();
    }

    /**
     * Ask for payee
     */
    async _askForPayee() {
        if (this.state.data.payee) {
            return await this._askForCategory();
        }

        this.state.step = 'ask_payee';
        return '🏪 ¿En dónde fue el gasto?\n\nEj: Starbucks, Amazon, Uber, etc.';
    }

    /**
     * Handle payee input
     */
    async _handlePayee(message) {
        this.state.data.payee = message.trim();
        return await this._askForCategory();
    }

    /**
     * Ask for category
     */
    async _askForCategory() {
        this.state.step = 'ask_category';
        return `📁 ¿Categoría? (opcional)

Ej: Food, Transportation, Shopping, etc.

Escribe la categoría o "skip" para omitir.`;
    }

    /**
     * Handle category input
     */
    async _handleCategory(message) {
        const normalized = message.trim().toLowerCase();

        if (normalized === 'skip' || normalized === 'omitir' || normalized === 'ninguna') {
            this.state.data.categoryId = null;
            return await this._askForMemo();
        }

        // Find category by name
        try {
            const categories = await ynabService.getCategories(this.state.data.budgetId);
            const category = ynabService.findCategoryByName(categories, message);

            if (category) {
                this.state.data.categoryId = category.id;
                this.state.data.categoryName = category.name;
            } else {
                this.state.data.categoryId = null;
            }

            return await this._askForMemo();
        } catch (error) {
            console.error('Error finding category:', error);
            return await this._askForMemo();
        }
    }

    /**
     * Ask for memo
     */
    async _askForMemo() {
        this.state.step = 'ask_memo';
        return '💭 ¿Nota adicional? (opcional)\n\nEscribe una nota o "skip" para omitir.';
    }

    /**
     * Handle memo input
     */
    async _handleMemo(message) {
        const normalized = message.trim().toLowerCase();

        if (normalized !== 'skip' && normalized !== 'omitir' && normalized !== 'ninguna') {
            this.state.data.memo = message.trim();
        }

        return await this._confirmTransaction();
    }

    /**
     * Show confirmation
     */
    async _confirmTransaction() {
        this.state.step = 'confirm';

        const { accountName, amount, payee, categoryName, memo } = this.state.data;
        const amountStr = amount > 0 ? `+${amount}` : `${amount}`;

        let message = `✅ *Confirmar Transacción*\n\n`;
        message += `🏦 Cuenta: ${accountName}\n`;
        message += `💵 Monto: ${amountStr}\n`;
        message += `🏪 Comercio: ${payee}\n`;
        if (categoryName) {
            message += `📁 Categoría: ${categoryName}\n`;
        }
        if (memo) {
            message += `💭 Nota: ${memo}\n`;
        }
        message += `\n¿Confirmar? (sí/no)`;

        return message;
    }

    /**
     * Handle confirmation
     */
    async _handleConfirmation(message) {
        const normalized = message.trim().toLowerCase();

        if (normalized === 'no' || normalized === 'cancelar') {
            this.state.step = 'cancelled';
            return '❌ Transacción cancelada.';
        }

        if (normalized !== 'sí' && normalized !== 'si' && normalized !== 'yes') {
            return '¿Confirmar? Escribe "sí" o "no".';
        }

        // Create transaction
        try {
            const { budgetId, accountId, amount, payee, categoryId, memo } = this.state.data;

            const transaction = await ynabService.createTransaction(
                budgetId,
                accountId,
                amount,
                payee,
                categoryId,
                memo
            );

            this.state.step = 'complete';

            const amountStr = amount > 0 ? `+${(amount / 1000).toFixed(2)}` : `${(amount / 1000).toFixed(2)}`;
            return `✅ *Transacción creada*\n\n💵 ${amountStr}\n🏪 ${payee}\n📅 ${transaction.date}`;
        } catch (error) {
            console.error('Error creating transaction:', error);
            this.state.step = 'complete';
            return `❌ Error creando transacción: ${error.message}`;
        }
    }

    /**
     * Get help for this flow
     */
    getHelp() {
        return `💡 *Ayuda - Agregar Gasto*

Puedes decir cosas como:
- "Gasté $50 en Starbucks"
- "Pagué 100 soles en Uber"
- "Compré en Amazon por $25"

O seguir el flujo paso a paso.

Escribe "cancelar" para salir.`;
    }
}

module.exports = AddExpenseFlow;
