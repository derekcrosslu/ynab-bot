/**
 * SelectCategoryFlow - Reusable child flow for category selection
 *
 * Can be invoked by any parent flow that needs the user to select a category.
 * Returns the selected category to the parent flow.
 */

const BaseFlow = require('./BaseFlow');
const ynabService = require('../services/ynab-service');

class SelectCategoryFlow extends BaseFlow {
    constructor(userId, options = {}) {
        super(userId);
        this.intent = 'select_category';
        this.state = {
            step: 'start',
            data: {
                budgetId: options.budgetId || null,
                categories: options.categories || [],
                selectedCategory: null,
                showCount: 15 // How many categories to show at once
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
        console.log(`📁 Starting SelectCategoryFlow for ${this.userId}`);

        // If categories not provided, fetch them
        if (this.state.data.categories.length === 0 && this.state.data.budgetId) {
            try {
                const categories = await ynabService.getCategories(this.state.data.budgetId);
                this.state.data.categories = categories;
            } catch (error) {
                console.error('Error fetching categories:', error);
                this.state.step = 'complete';
                return `❌ Error obteniendo categorías: ${error.message}`;
            }
        }

        return this._showCategories();
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

        // Check if it's "more" to show more categories
        if (normalized.toLowerCase() === 'más' || normalized.toLowerCase() === 'more') {
            return this._showMoreCategories();
        }

        // Try to match category by name
        return this._handleNameSelection(message);
    }

    /**
     * Show categories
     */
    _showCategories() {
        const { categories, showCount } = this.state.data;

        if (categories.length === 0) {
            this.state.step = 'complete';
            return '❌ No hay categorías disponibles.';
        }

        this.state.step = 'selecting';

        let message = `📁 *Selecciona una Categoría*\n\n`;

        const categoriesToShow = categories.slice(0, showCount);
        categoriesToShow.forEach((cat, index) => {
            message += `${index + 1}. ${cat.name}\n`;
        });

        if (categories.length > showCount) {
            message += `\n... y ${categories.length - showCount} más.\n`;
            message += `Escribe "más" para ver más categorías.\n`;
        }

        message += `\nEscribe el número o nombre de la categoría.`;
        message += `\nO escribe "ninguna" para omitir.`;

        return message;
    }

    /**
     * Show more categories
     */
    _showMoreCategories() {
        const { categories, showCount } = this.state.data;

        // Increase show count
        const newShowCount = Math.min(showCount + 15, categories.length);
        this.state.data.showCount = newShowCount;

        return this._showCategories();
    }

    /**
     * Handle number selection
     */
    _handleNumberSelection(number) {
        const { categories, showCount } = this.state.data;

        const index = number - 1;

        if (index < 0 || index >= Math.min(showCount, categories.length)) {
            return `❌ Selección inválida. Escribe un número entre 1 y ${Math.min(showCount, categories.length)}.`;
        }

        const selectedCategory = categories[index];
        return this._completeSelection(selectedCategory);
    }

    /**
     * Handle name selection
     */
    _handleNameSelection(name) {
        const normalized = name.trim().toLowerCase();

        // Check for "none" / "ninguna"
        if (normalized === 'ninguna' || normalized === 'none' || normalized === 'skip') {
            return this._completeSelection(null);
        }

        // Find category by name
        const category = ynabService.findCategoryByName(this.state.data.categories, name);

        if (category) {
            return this._completeSelection(category);
        } else {
            return `❌ No encontré la categoría "${name}". Intenta de nuevo o escribe el número.`;
        }
    }

    /**
     * Complete selection and return to parent
     */
    _completeSelection(category) {
        this.state.step = 'complete';
        this.state.data.selectedCategory = category;

        console.log(`✅ Category selected: ${category ? category.name : 'None'}`);

        // Return result to parent flow
        if (this.parentFlow) {
            this.returnToParent(category);
        }

        return category ? `✅ Categoría seleccionada: *${category.name}*` : '⏭️ Categoría omitida.';
    }

    /**
     * Get help for this flow
     */
    getHelp() {
        return `💡 *Ayuda - Seleccionar Categoría*

Puedes:
- Escribir el número de la categoría
- Escribir el nombre de la categoría
- Escribir "más" para ver más opciones
- Escribir "ninguna" para omitir

Escribe "cancelar" para salir.`;
    }
}

module.exports = SelectCategoryFlow;
