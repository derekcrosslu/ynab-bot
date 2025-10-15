/**
 * State Manager
 *
 * Manages user state, menu navigation, session timeouts, and caches.
 * Centralized state management for the bot.
 */

const fs = require('fs');

class StateManager {
    constructor() {
        // User menu state
        this.userMenuState = new Map();

        // Conversation history
        this.conversations = new Map();

        // Transaction cache (for categorization)
        this.transactionCache = new Map();

        // Image transactions cache (extracted from docs)
        this.imageTransactionsCache = new Map();

        // PDF text cache
        this.pdfTextCache = new Map();

        // Debug stats
        this.debugStats = new Map();

        // Session timeout configuration
        this.SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

        // Load menu structure
        this.menuStructure = JSON.parse(fs.readFileSync('./menu-structure.json', 'utf8'));
    }

    // ===== USER MENU STATE =====

    /**
     * Initialize menu state for a user
     * @param {string} userId - User ID
     */
    initializeMenuState(userId) {
        this.userMenuState.set(userId, {
            currentMenu: 'main',
            level: 1,
            state: 'menu',  // 'menu', 'processing', 'conversation', 'waiting_document'
            conversationContext: {},
            menuPath: ['main'],
            lastActivity: Date.now()
        });
    }

    /**
     * Get or create menu state for a user
     * @param {string} userId - User ID
     * @returns {Object} User menu state
     */
    getMenuState(userId) {
        if (!this.userMenuState.has(userId)) {
            this.initializeMenuState(userId);
        }
        return this.userMenuState.get(userId);
    }

    /**
     * Update menu state
     * @param {string} userId - User ID
     * @param {Object} state - New state
     */
    setMenuState(userId, state) {
        this.userMenuState.set(userId, state);
    }

    // ===== SESSION TIMEOUT =====

    /**
     * Check if session has expired
     * @param {string} userId - User ID
     * @returns {boolean} True if session expired
     */
    checkSessionTimeout(userId) {
        const state = this.userMenuState.get(userId);
        if (!state) return false;

        const inactiveTime = Date.now() - state.lastActivity;
        const hasExpired = inactiveTime > this.SESSION_TIMEOUT_MS;

        if (hasExpired) {
            console.log(`⏰ Sesión expirada para ${userId} (inactivo por ${Math.floor(inactiveTime / 1000 / 60)} min)`);
            // Clean all data
            this.clearUserData(userId);
            // Reset state
            this.initializeMenuState(userId);
            return true;
        }

        return false;
    }

    /**
     * Update last activity timestamp
     * @param {string} userId - User ID
     */
    updateLastActivity(userId) {
        const state = this.userMenuState.get(userId);
        if (state) {
            state.lastActivity = Date.now();
            this.userMenuState.set(userId, state);
        }
    }

    // ===== MENU RENDERING =====

    /**
     * Render menu by ID
     * @param {string} menuId - Menu ID
     * @returns {string} Rendered menu text
     */
    renderMenu(menuId) {
        const menu = menuId === 'main' ? this.menuStructure.root : this.menuStructure.menus[menuId];
        if (!menu) {
            return '❌ Menú no encontrado';
        }

        let menuText = `${menu.title}\n\n${menu.description}\n\n`;

        menu.options.forEach(option => {
            menuText += `*${option.key}*. ${option.label}\n`;
        });

        return menuText;
    }

    /**
     * Add status footer to message
     * @param {string} message - Message content
     * @param {string} userId - User ID
     * @returns {string} Message with footer
     */
    addStatusFooter(message, userId) {
        const state = this.getMenuState(userId);
        const menu = state.currentMenu === 'main' ? this.menuStructure.root : this.menuStructure.menus[state.currentMenu];

        let stateEmoji = '✅';
        let stateText = 'Listo para input';
        let hint = '';

        if (state.state === 'processing') {
            stateEmoji = '⏳';
            stateText = 'Procesando...';
        } else if (state.state === 'conversation') {
            stateEmoji = '💬';
            stateText = 'En conversación';
            hint = '\n💡 Escribe "cancelar" o /cancel para salir';
        } else if (state.state === 'waiting_document') {
            stateEmoji = '📄';
            stateText = 'Esperando documento';
            hint = '\n💡 Escribe "cancelar" o /cancel para salir';
        }

        const footer = `\n━━━━━━━━━━━━━━━━\n📍 *Status Menu:*\nNivel: ${state.level} - ${menu ? menu.title.replace(/[🏠💰📊💵🏷️📄]/g, '').trim() : 'Menu'} | Estado: ${stateEmoji} ${stateText}${hint}`;

        return message + footer;
    }

    // ===== CACHES =====

    /**
     * Get conversation history
     * @param {string} userId - User ID
     * @returns {Array} Conversation history
     */
    getConversation(userId) {
        return this.conversations.get(userId) || [];
    }

    /**
     * Set conversation history
     * @param {string} userId - User ID
     * @param {Array} history - Conversation history
     */
    setConversation(userId, history) {
        this.conversations.set(userId, history);
    }

    /**
     * Delete conversation history
     * @param {string} userId - User ID
     */
    deleteConversation(userId) {
        this.conversations.delete(userId);
    }

    /**
     * Clear all user data
     * @param {string} userId - User ID
     */
    clearUserData(userId) {
        this.conversations.delete(userId);
        this.transactionCache.delete(userId);
        this.imageTransactionsCache.delete(userId);
        this.pdfTextCache.delete(userId);
    }

    // ===== MENU NAVIGATION =====

    /**
     * Handle menu selection
     * @param {string} userId - User ID
     * @param {string} selection - Selected option
     * @returns {Promise<Object>} Menu result
     */
    async handleMenuSelection(userId, selection) {
        const state = this.getMenuState(userId);
        const menu = state.currentMenu === 'main' ? this.menuStructure.root : this.menuStructure.menus[state.currentMenu];

        if (!menu) {
            return { response: '❌ Error: menú no encontrado', stayInMenu: true };
        }

        const option = menu.options.find(opt => opt.key === selection.trim());

        if (!option) {
            // Build helpful error message with available options
            const availableKeys = menu.options.map(opt => opt.key).join(', ');
            const errorMsg = `❌ Opción inválida: "${selection}"\n\n💡 Opciones disponibles: ${availableKeys}\n\nPor favor elige un número del menú.`;
            return { response: errorMsg, stayInMenu: true };
        }

        // Process action
        switch (option.action) {
            case 'navigate':
                // Navigate to another menu
                const nextMenu = option.next_menu === 'main' ? this.menuStructure.root : this.menuStructure.menus[option.next_menu];
                state.currentMenu = option.next_menu;
                state.level = nextMenu.level;
                state.menuPath.push(option.next_menu);

                // Update state based on menu type
                if (nextMenu.state_type) {
                    state.state = nextMenu.state_type;
                } else {
                    state.state = 'menu';
                }

                this.setMenuState(userId, state);

                // If menu has options, render normal menu
                if (nextMenu.options) {
                    return { response: this.renderMenu(option.next_menu), stayInMenu: true };
                }

                // If no options (waiting_document), show description
                return {
                    response: `${nextMenu.title}\n\n${nextMenu.description}`,
                    stayInMenu: true
                };

            case 'execute_claude':
                // Execute function with Claude and return
                state.state = 'processing';
                this.setMenuState(userId, state);
                return {
                    response: null,
                    stayInMenu: false,
                    action: 'execute_claude',
                    function: option.function,
                    params: option.params,
                    returnTo: option.return_to
                };

            case 'enter_conversation':
                // Enter conversational mode
                state.state = 'conversation';
                state.conversationContext = option.params || {};
                this.setMenuState(userId, state);
                return {
                    response: null,
                    stayInMenu: false,
                    action: 'enter_conversation',
                    function: option.function,
                    params: option.params,
                    returnTo: option.return_to
                };

            case 'show_help':
                return {
                    response: `🤖 *Ayuda del Bot YNAB*\n\nNavega usando los números de las opciones.\n\n📊 *Funcionalidades:*\n- Ver balances de tus cuentas\n- Revisar transacciones recientes\n- Registrar gastos/ingresos\n- Categorizar pendientes\n- Extraer de PDF/imagen\n\n*Comandos especiales:*\n/reset - Reiniciar\n/debug - Ver debug\n/help - Esta ayuda`,
                    stayInMenu: true
                };

            default:
                return { response: '❌ Acción no reconocida', stayInMenu: true };
        }
    }
}

// Export singleton instance
module.exports = new StateManager();
