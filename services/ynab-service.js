/**
 * YNAB Service
 *
 * Handles all interactions with the YNAB API.
 * Provides a clean interface for budget, account, transaction, and category operations.
 */

const axios = require('axios');
require('dotenv').config();

class YnabService {
    constructor() {
        this.apiKey = process.env.YNAB_API_KEY;
        this.baseUrl = 'https://api.ynab.com/v1';
    }

    /**
     * Get HTTP headers for YNAB API requests
     * @private
     */
    _getHeaders() {
        return {
            'Authorization': `Bearer ${this.apiKey}`
        };
    }

    /**
     * Get all budgets
     * @returns {Promise<Array>} List of budgets
     */
    async getBudgets() {
        try {
            const response = await axios.get(`${this.baseUrl}/budgets`, {
                headers: this._getHeaders()
            });

            return response.data.data.budgets;
        } catch (error) {
            console.error('Error obteniendo presupuestos:', error.message);
            throw error;
        }
    }

    /**
     * Get accounts for a budget
     * @param {string|null} budgetName - Budget name (case-insensitive) or null for first budget
     * @returns {Promise<Object>} Object with budgetId, budgetName, accounts, allBudgets
     */
    async getAccounts(budgetName = null) {
        try {
            const budgets = await this.getBudgets();

            let targetBudget;
            if (budgetName) {
                // Search budget by name (case-insensitive)
                targetBudget = budgets.find(b =>
                    b.name.toUpperCase().includes(budgetName.toUpperCase())
                );
                if (!targetBudget) {
                    throw new Error(`No se encontró el presupuesto "${budgetName}"`);
                }
            } else {
                // Use first budget if not specified
                targetBudget = budgets[0];
            }

            const accountsResponse = await axios.get(
                `${this.baseUrl}/budgets/${targetBudget.id}/accounts`,
                {
                    headers: this._getHeaders()
                }
            );

            return {
                budgetId: targetBudget.id,
                budgetName: targetBudget.name,
                accounts: accountsResponse.data.data.accounts,
                allBudgets: budgets
            };
        } catch (error) {
            console.error('Error obteniendo cuentas:', error.message);
            throw error;
        }
    }

    /**
     * Get transactions for a budget/account
     * @param {string} budgetId - Budget ID
     * @param {string|null} accountId - Account ID (optional)
     * @param {number} days - Number of days to look back (default 90)
     * @returns {Promise<Array>} List of transactions
     */
    async getTransactions(budgetId, accountId = null, days = 90) {
        try {
            const url = accountId
                ? `${this.baseUrl}/budgets/${budgetId}/accounts/${accountId}/transactions`
                : `${this.baseUrl}/budgets/${budgetId}/transactions`;

            const response = await axios.get(url, {
                headers: this._getHeaders(),
                params: {
                    since_date: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                }
            });

            return response.data.data.transactions;
        } catch (error) {
            console.error('Error obteniendo transacciones:', error.message);
            throw error;
        }
    }

    /**
     * Create a single transaction
     * @param {string} budgetId - Budget ID
     * @param {string} accountId - Account ID
     * @param {number} amount - Amount in currency (YNAB uses miliunits)
     * @param {string} payee - Payee name
     * @param {string|null} categoryId - Category ID (optional)
     * @param {string} memo - Memo/note
     * @param {string|null} date - Date in YYYY-MM-DD format (optional, defaults to today)
     * @returns {Promise<Object>} Created transaction
     */
    async createTransaction(budgetId, accountId, amount, payee, categoryId, memo, date = null) {
        try {
            console.log(`\n🔧 DEBUG: ynabService.createTransaction() called`);
            console.log(`   INPUT budgetId: ${budgetId}`);
            console.log(`   INPUT accountId: ${accountId}`);
            console.log(`   INPUT amount: ${amount} (type: ${typeof amount})`);
            console.log(`   INPUT payee: ${payee}`);
            console.log(`   INPUT categoryId: ${categoryId}`);
            console.log(`   INPUT memo: ${memo}`);
            console.log(`   INPUT date: ${date}`);

            const transactionData = {
                account_id: accountId,
                date: date || new Date().toISOString().split('T')[0],
                amount: Math.round(amount * 1000), // YNAB uses miliunits
                payee_name: payee,
                memo: memo,
                cleared: 'cleared'
            };

            // Add category_id only if provided
            if (categoryId) {
                transactionData.category_id = categoryId;
            }

            console.log(`   BUILT transactionData:`, JSON.stringify(transactionData, null, 2));

            const url = `${this.baseUrl}/budgets/${budgetId}/transactions`;
            console.log(`   API URL: ${url}`);

            console.log(`   🚀 Sending POST request to YNAB...`);
            const response = await axios.post(
                url,
                {
                    transaction: transactionData
                },
                {
                    headers: this._getHeaders()
                }
            );

            console.log(`   ✅ YNAB API Response status: ${response.status}`);
            console.log(`   ✅ Transaction created:`, JSON.stringify(response.data.data.transaction, null, 2));

            return response.data.data.transaction;
        } catch (error) {
            console.error(`\n❌ ERROR in ynabService.createTransaction:`);
            console.error(`   Error message: ${error.message}`);
            if (error.response) {
                console.error(`   HTTP Status: ${error.response.status}`);
                console.error(`   Response data:`, JSON.stringify(error.response.data, null, 2));
            }
            console.error(`   Error stack:`, error.stack);
            throw error;
        }
    }

    /**
     * Get categories for a budget
     * @param {string} budgetId - Budget ID
     * @returns {Promise<Array>} List of categories
     */
    async getCategories(budgetId) {
        try {
            const response = await axios.get(
                `${this.baseUrl}/budgets/${budgetId}/categories`,
                {
                    headers: this._getHeaders()
                }
            );

            const categories = [];
            response.data.data.category_groups.forEach(group => {
                if (!group.hidden && !group.deleted) {
                    group.categories.forEach(cat => {
                        if (!cat.hidden && !cat.deleted) {
                            categories.push({
                                id: cat.id,
                                name: cat.name,
                                group: group.name
                            });
                        }
                    });
                }
            });

            return categories;
        } catch (error) {
            console.error('Error obteniendo categorías:', error.message);
            throw error;
        }
    }

    /**
     * Update a transaction (e.g., to categorize it)
     * @param {string} budgetId - Budget ID
     * @param {string} transactionId - Transaction ID
     * @param {string} categoryId - Category ID
     * @param {boolean} keepApprovedStatus - Whether to keep current approved status
     * @returns {Promise<Object>} Updated transaction
     */
    async updateTransaction(budgetId, transactionId, categoryId, keepApprovedStatus = false) {
        try {
            const transactionUpdate = {
                category_id: categoryId
            };

            // Only change approved if we don't want to keep current status
            if (!keepApprovedStatus) {
                transactionUpdate.approved = true;
            }

            const response = await axios.put(
                `${this.baseUrl}/budgets/${budgetId}/transactions/${transactionId}`,
                {
                    transaction: transactionUpdate
                },
                {
                    headers: this._getHeaders()
                }
            );

            return response.data.data.transaction;
        } catch (error) {
            console.error('Error actualizando transacción:', error.message);
            throw error;
        }
    }

    /**
     * Validate that a budget allows manual transaction creation
     * @param {string} budgetName - Budget name
     * @returns {boolean} True if budget allows creation
     */
    isBudgetAllowedForCreation(budgetName) {
        const allowedBudgets = ['BCP SOLES', 'BCP DOLARES'];
        const budgetNameUpper = budgetName.toUpperCase();
        return allowedBudgets.some(allowed => budgetNameUpper.includes(allowed));
    }

    /**
     * Find category by name (with case-insensitive fallback)
     * @param {Array} categories - List of categories
     * @param {string} categoryName - Category name to find
     * @returns {Object|null} Found category or null
     */
    findCategoryByName(categories, categoryName) {
        // Exact match first (case-sensitive)
        let category = categories.find(cat => cat.name === categoryName);

        // Fallback: case-insensitive
        if (!category) {
            category = categories.find(cat =>
                cat.name.toLowerCase() === categoryName.toLowerCase()
            );

            if (category) {
                console.log(`   ⚠️  Categoría encontrada con diferente case: "${category.name}" (buscabas "${categoryName}")`);
            }
        }

        return category || null;
    }
}

// Export singleton instance
module.exports = new YnabService();
