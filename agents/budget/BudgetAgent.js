/**
 * BudgetAgent - Enhanced budget management agent
 *
 * Capabilities:
 * - View balances (existing)
 * - Create transactions (existing)
 * - Categorize transactions (existing)
 * - View transactions (existing)
 * - Analyze spending (enhanced)
 * - Proactive alerts (NEW)
 */

const BaseAgent = require('../base/BaseAgent');

class BudgetAgent extends BaseAgent {
    constructor(anthropic, ynabService) {
        super('BudgetAgent', [
            'view_balance',
            'create_transaction',
            'categorize_transactions',
            'view_transactions',
            'analyze_spending',
            'general_query'
        ]);

        this.ynabService = ynabService;
        this.anthropic = anthropic;
    }

    /**
     * Handle a budget-related request
     * @param {Object} request - Request object
     * @param {string} request.intent - The intent/action
     * @param {Object} request.params - Parameters
     * @param {string} request.originalMessage - Original user message
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Response
     */
    async handleRequest(request, context) {
        const { intent, params, originalMessage } = request;

        this.log(`Handling ${intent}`, 'info');

        try {
            switch (intent) {
                case 'view_balance':
                    return await this.viewBalance(params, context);

                case 'create_transaction':
                    return await this.createTransaction(params, context);

                case 'categorize_transactions':
                    return await this.categorizeTransactions(params, context);

                case 'view_transactions':
                    return await this.viewTransactions(params, context);

                case 'analyze_spending':
                    return await this.analyzeSpending(params, context);

                case 'general_query':
                default:
                    // Fallback: use Claude with full YNAB context
                    return await this.handleGeneralQuery(originalMessage, context);
            }
        } catch (error) {
            this.log(`Error handling ${intent}: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * View account balances
     */
    async viewBalance(params, context) {
        try {
            const budgetName = params.budgetName || null;
            const { budgetId, budgetName: name, accounts } = await this.ynabService.getAccounts(budgetName);

            let message = `💰 *${name} - Account Balances*\n\n`;

            accounts.forEach(acc => {
                const balance = (acc.balance / 1000).toFixed(2);
                const emoji = balance >= 0 ? '✅' : '⚠️';
                message += `${emoji} *${acc.name}*\n`;
                message += `   $${balance} (${acc.type})\n\n`;
            });

            const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0) / 1000;
            message += `📊 *Total Balance:* $${totalBalance.toFixed(2)}`;

            this.log('Balance view completed', 'success');

            return this.formatResponse(message);
        } catch (error) {
            this.log(`Failed to view balance: ${error.message}`, 'error');
            return this.formatResponse(`❌ Error viewing balance: ${error.message}`);
        }
    }

    /**
     * Create a new transaction
     */
    async createTransaction(params, context) {
        try {
            const { budgetName, accountId, amount, payee, categoryName, memo } = params;

            // Validate budget is BCP (not USA BANKS which syncs automatically)
            const allowedBudgets = ['BCP SOLES', 'BCP DOLARES'];
            const ynabData = await this.ynabService.getAccounts(budgetName || null);

            const budgetNameUpper = ynabData.budgetName.toUpperCase();
            const isAllowed = allowedBudgets.some(allowed => budgetNameUpper.includes(allowed));

            if (!isAllowed) {
                return this.formatResponse(
                    `❌ Can only create transactions in BCP accounts (BCP SOLES or BCP DOLARES).\n\n` +
                    `The budget "${ynabData.budgetName}" syncs automatically with the bank.`
                );
            }

            // Get category ID if category name provided
            let categoryId = null;
            if (categoryName) {
                const categories = await this.ynabService.getCategories(ynabData.budgetId);
                const category = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
                if (category) {
                    categoryId = category.id;
                } else {
                    this.log(`Category '${categoryName}' not found`, 'warn');
                }
            }

            // Create the transaction
            const transaction = await this.ynabService.createTransaction(
                ynabData.budgetId,
                accountId,
                amount,
                payee,
                categoryId,
                memo || ''
            );

            const amountStr = (transaction.amount / 1000).toFixed(2);
            let message = `✅ *Transaction Created*\n\n`;
            message += `💵 Amount: $${amountStr}\n`;
            message += `🏪 Payee: ${transaction.payee_name}\n`;
            message += `📁 Category: ${transaction.category_name || 'Uncategorized'}\n`;
            message += `📅 Date: ${transaction.date}\n`;

            if (memo) {
                message += `💭 Memo: ${memo}\n`;
            }

            // Save to Beads for tracking
            if (this.memory) {
                await this.saveToMemory({
                    title: `Transaction: ${payee} $${Math.abs(amountStr)}`,
                    type: 'task',
                    priority: 1,
                    description: `Created transaction in ${ynabData.budgetName}`
                });
            }

            this.log('Transaction created successfully', 'success');

            return this.formatResponse(message);
        } catch (error) {
            this.log(`Failed to create transaction: ${error.message}`, 'error');
            return this.formatResponse(`❌ Error creating transaction: ${error.message}`);
        }
    }

    /**
     * View recent transactions
     */
    async viewTransactions(params, context) {
        try {
            const { budgetName, accountId, days } = params;

            const ynabData = await this.ynabService.getAccounts(budgetName || null);
            const transactions = await this.ynabService.getTransactions(
                ynabData.budgetId,
                accountId || null,
                days || 30
            );

            if (transactions.length === 0) {
                return this.formatResponse('📊 No recent transactions found.');
            }

            // Sort by date descending and take last 10
            const recent = transactions
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 10);

            let message = `📊 *Recent Transactions* (Last ${recent.length})\n`;
            message += `Budget: ${ynabData.budgetName}\n\n`;

            recent.forEach((tx, index) => {
                const amount = (tx.amount / 1000).toFixed(2);
                const amountStr = tx.amount < 0 ? `-$${Math.abs(amount)}` : `+$${amount}`;
                const emoji = tx.amount < 0 ? '🔴' : '🟢';

                message += `${index + 1}. ${emoji} *${tx.payee_name || 'N/A'}*\n`;
                message += `   ${amountStr} | ${tx.date}\n`;
                message += `   📁 ${tx.category_name || 'Uncategorized'}\n\n`;
            });

            message += `💡 Total: ${transactions.length} transactions in last ${days || 30} days`;

            this.log('Transactions view completed', 'success');

            return this.formatResponse(message);
        } catch (error) {
            this.log(`Failed to view transactions: ${error.message}`, 'error');
            return this.formatResponse(`❌ Error viewing transactions: ${error.message}`);
        }
    }

    /**
     * Categorize pending transactions
     */
    async categorizeTransactions(params, context) {
        try {
            const { budgetName } = params;

            const ynabData = await this.ynabService.getAccounts(budgetName || null);
            const transactions = await this.ynabService.getTransactions(
                ynabData.budgetId,
                null,
                90
            );

            // Find uncategorized
            const uncategorized = transactions.filter(tx =>
                tx.approved === false || tx.category_name === 'Uncategorized'
            );

            if (uncategorized.length === 0) {
                return this.formatResponse('✅ All transactions are categorized!');
            }

            // Get categories
            const categories = await this.ynabService.getCategories(ynabData.budgetId);

            // Use Claude to suggest categorizations
            const prompt = `You are helping categorize budget transactions.

Uncategorized transactions:
${uncategorized.slice(0, 10).map((tx, i) => `${i + 1}. ${tx.payee_name} - $${(tx.amount / 1000).toFixed(2)} - ${tx.date}`).join('\n')}

Available categories:
${categories.map(c => c.name).join(', ')}

Suggest appropriate categories for each transaction.
Respond with a simple list:
1. CategoryName
2. CategoryName
...`;

            const response = await this.askClaude(prompt);

            let message = `📋 *Transactions Needing Categorization*\n\n`;
            message += `Found ${uncategorized.length} uncategorized transactions.\n\n`;
            message += `📝 *Suggestions:*\n${response}\n\n`;
            message += `💡 To apply these categories, please confirm or adjust as needed.`;

            this.log('Categorization suggestions generated', 'success');

            return this.formatResponse(message);
        } catch (error) {
            this.log(`Failed to categorize transactions: ${error.message}`, 'error');
            return this.formatResponse(`❌ Error categorizing: ${error.message}`);
        }
    }

    /**
     * Analyze spending patterns
     */
    async analyzeSpending(params, context) {
        try {
            const { budgetName, days } = params;

            const ynabData = await this.ynabService.getAccounts(budgetName || null);
            const transactions = await this.ynabService.getTransactions(
                ynabData.budgetId,
                null,
                days || 30
            );

            // Calculate total spending
            const totalSpent = transactions
                .filter(tx => tx.amount < 0)
                .reduce((sum, tx) => sum + Math.abs(tx.amount), 0) / 1000;

            // Group by category
            const byCategory = {};
            transactions.filter(tx => tx.amount < 0).forEach(tx => {
                const cat = tx.category_name || 'Uncategorized';
                byCategory[cat] = (byCategory[cat] || 0) + Math.abs(tx.amount / 1000);
            });

            // Sort by spending
            const sorted = Object.entries(byCategory)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            let message = `📊 *Spending Analysis*\n`;
            message += `Period: Last ${days || 30} days\n\n`;
            message += `💰 Total Spent: $${totalSpent.toFixed(2)}\n\n`;
            message += `📁 *Top 5 Categories:*\n`;

            sorted.forEach(([cat, amount], i) => {
                const percent = ((amount / totalSpent) * 100).toFixed(1);
                message += `${i + 1}. ${cat}: $${amount.toFixed(2)} (${percent}%)\n`;
            });

            this.log('Spending analysis completed', 'success');

            return this.formatResponse(message);
        } catch (error) {
            this.log(`Failed to analyze spending: ${error.message}`, 'error');
            return this.formatResponse(`❌ Error analyzing: ${error.message}`);
        }
    }

    /**
     * Handle general budget queries using Claude
     */
    async handleGeneralQuery(message, context) {
        try {
            this.log('Handling general query with Claude', 'info');

            const prompt = `You are a budget assistant with access to YNAB.

User question: "${message}"

Please provide a helpful response. If the question requires accessing YNAB data, mention what data would be needed.

Keep your response concise and friendly (2-3 sentences).`;

            const response = await this.askClaude(prompt);

            return this.formatResponse(response);
        } catch (error) {
            this.log(`Failed to handle general query: ${error.message}`, 'error');
            return this.formatResponse(`❌ Error: ${error.message}`);
        }
    }
}

module.exports = BudgetAgent;
