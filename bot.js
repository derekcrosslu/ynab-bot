const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const fs = require('fs');
const pdf = require('pdf-parse');
require('dotenv').config();

// Configurar Claude
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// Detectar el path de Chrome según el entorno
function getChromePath() {
    // En Docker, usar Chrome del sistema (instalado en el Dockerfile)
    const dockerChromePath = '/usr/bin/google-chrome-stable';

    // En macOS, usar la ruta de la aplicación
    const macChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

    // Detectar si estamos en Docker
    if (fs.existsSync('/.dockerenv') || fs.existsSync(dockerChromePath)) {
        console.log('🐳 Detectado entorno Docker, usando Chrome del sistema');
        return dockerChromePath;
    }

    // Si estamos en macOS
    if (fs.existsSync(macChromePath)) {
        console.log('🍎 Detectado entorno macOS, usando Chrome local');
        return macChromePath;
    }

    // Si no se encuentra Chrome, dejar que Puppeteer use su Chromium por defecto
    console.log('⚠️  No se encontró Chrome, usando Chromium de Puppeteer');
    return undefined;
}

// Extraer texto de PDF
async function extractTextFromPDF(pdfBuffer) {
    try {
        console.log('📄 Extrayendo texto del PDF...');
        const data = await pdf(pdfBuffer);
        console.log(`✅ Texto extraído: ${data.text.length} caracteres`);
        return data.text;
    } catch (error) {
        console.error('Error extrayendo texto del PDF:', error);
        throw error;
    }
}


// ===== SISTEMA DE MENÚS ESTRUCTURADOS =====

// Cargar estructura de menús
const menuStructure = JSON.parse(fs.readFileSync('./menu-structure.json', 'utf8'));

// Estado de navegación por usuario
const userMenuState = new Map();

// Inicializar estado de menú para un usuario
function initializeUserMenuState(userId) {
    userMenuState.set(userId, {
        currentMenu: 'main',
        level: 1,
        state: 'menu',  // 'menu', 'processing', 'conversation', 'waiting_document'
        conversationContext: {},
        menuPath: ['main']
    });
}

// Obtener o crear estado de menú
function getUserMenuState(userId) {
    if (!userMenuState.has(userId)) {
        initializeUserMenuState(userId);
    }
    return userMenuState.get(userId);
}

// Renderizar menú actual
function renderMenu(menuId) {
    const menu = menuId === 'main' ? menuStructure.root : menuStructure.menus[menuId];
    if (!menu) {
        return '❌ Menú no encontrado';
    }

    let menuText = `${menu.title}\n\n${menu.description}\n\n`;

    menu.options.forEach(option => {
        menuText += `*${option.key}*. ${option.label}\n`;
    });

    return menuText;
}

// Agregar Status Menu footer
function addStatusFooter(message, userId) {
    const state = getUserMenuState(userId);
    const menu = state.currentMenu === 'main' ? menuStructure.root : menuStructure.menus[state.currentMenu];

    let stateEmoji = '✅';
    let stateText = 'Listo para input';

    if (state.state === 'processing') {
        stateEmoji = '⏳';
        stateText = 'Procesando...';
    } else if (state.state === 'conversation') {
        stateEmoji = '💬';
        stateText = 'En conversación';
    } else if (state.state === 'waiting_document') {
        stateEmoji = '📄';
        stateText = 'Esperando documento';
    }

    const footer = `\n━━━━━━━━━━━━━━━━\n📍 *Status Menu:*\nNivel: ${state.level} - ${menu ? menu.title.replace(/[🏠💰📊💵🏷️📄]/g, '').trim() : 'Menu'} | Estado: ${stateEmoji} ${stateText}`;

    return message + footer;
}

// Procesar selección de menú
async function handleMenuSelection(userId, selection) {
    const state = getUserMenuState(userId);
    const menu = state.currentMenu === 'main' ? menuStructure.root : menuStructure.menus[state.currentMenu];

    if (!menu) {
        return { response: '❌ Error: menú no encontrado', stayInMenu: true };
    }

    const option = menu.options.find(opt => opt.key === selection.trim());

    if (!option) {
        return { response: '❌ Opción inválida. Por favor elige una opción del menú.', stayInMenu: true };
    }

    // Procesar acción
    switch (option.action) {
        case 'navigate':
            // Navegar a otro menú
            const nextMenu = option.next_menu === 'main' ? menuStructure.root : menuStructure.menus[option.next_menu];
            state.currentMenu = option.next_menu;
            state.level = nextMenu.level;
            state.menuPath.push(option.next_menu);

            // Actualizar estado según el tipo de menú
            if (nextMenu.state_type) {
                state.state = nextMenu.state_type;
            } else {
                state.state = 'menu';
            }

            userMenuState.set(userId, state);

            // Si tiene opciones, renderizar menú normal
            if (nextMenu.options) {
                return { response: renderMenu(option.next_menu), stayInMenu: true };
            }

            // Si no tiene opciones (waiting_document), mostrar descripción
            return {
                response: `${nextMenu.title}\n\n${nextMenu.description}`,
                stayInMenu: true
            };

        case 'execute_claude':
            // Ejecutar función con Claude y volver
            state.state = 'processing';
            userMenuState.set(userId, state);
            return {
                response: null,
                stayInMenu: false,
                action: 'execute_claude',
                function: option.function,
                params: option.params,
                returnTo: option.return_to
            };

        case 'enter_conversation':
            // Entrar en modo conversacional
            state.state = 'conversation';
            state.conversationContext = option.params || {};
            userMenuState.set(userId, state);
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

// Funciones ejecutoras de Claude para acciones del menú
async function executeClaudeFunction(functionName, params, userId) {
    switch (functionName) {
        case 'show_balances':
            return await executeClaudeBalances(params, userId);

        case 'show_account_balance':
            return await executeClaudeAccountBalance(params, userId);

        case 'show_transactions':
            return await executeClaudeTransactions(params, userId);

        case 'create_transaction_conversation':
            return await executeClaudeCreateTransaction(params, userId);

        case 'categorize_conversation':
            return await executeCategorizeConversation(params, userId);

        default:
            return '❌ Función no implementada';
    }
}

// Mostrar balances de un presupuesto
async function executeClaudeBalances(params, userId) {
    const prompt = `Muestra los balances de todas las cuentas del presupuesto "${params.budgetName}". Usa get_ynab_accounts y muestra: nombre de cuenta, balance, y tipo. Sé breve y conciso.`;
    return await askClaude(prompt, [], userId, null, null);
}

// Mostrar balance de una cuenta específica
async function executeClaudeAccountBalance(params, userId) {
    const prompt = `Muestra el balance de la cuenta que contenga "${params.accountFilter}" en el presupuesto "${params.budgetName}". Usa get_ynab_accounts y filtra la cuenta. Muestra balance y tipo. Sé breve.`;
    return await askClaude(prompt, [], userId, null, null);
}

// Mostrar transacciones recientes
async function executeClaudeTransactions(params, userId) {
    const accountFilter = params.accountFilter ? ` que contenga "${params.accountFilter}"` : '';
    const prompt = `Muestra las últimas 10 transacciones de la cuenta${accountFilter} del presupuesto "${params.budgetName}". Usa get_ynab_accounts primero para obtener el accountId, luego get_ynab_transactions. Muestra: fecha, payee, monto, categoría. Sé breve.`;
    return await askClaude(prompt, [], userId, null, null);
}

// Crear transacción manual (modo conversacional)
async function executeClaudeCreateTransaction(params, userId) {
    const prompt = `El usuario quiere registrar una transacción manual en el presupuesto "${params.budgetName}". Pregúntale conversacionalmente: 1) ¿Es gasto o ingreso? 2) ¿Cuánto? 3) ¿Dónde/quién? 4) ¿Categoría? (opcional). Luego usa get_ynab_accounts para "${params.budgetName}" y create_ynab_transaction. Sé amigable y breve.`;
    return await askClaude(prompt, [], userId, null, null);
}

// Categorizar transacciones (modo conversacional)
async function executeCategorizeConversation(params, userId) {
    const prompt = `El usuario quiere categorizar transacciones pendientes del presupuesto "${params.budgetName}". Usa get_ynab_transactions para obtener las pendientes, luego get_ynab_categories, y sugiere categorizaciones inteligentes. Pregunta si está de acuerdo antes de aplicar. Sé conversacional y amigable.`;
    return await askClaude(prompt, [], userId, null, null);
}

const whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
        executablePath: getChromePath()
    }
});

// ===== FUNCIONES PARA YNAB =====

async function getYnabBudgets() {
    try {
        const response = await axios.get('https://api.ynab.com/v1/budgets', {
            headers: {
                'Authorization': `Bearer ${process.env.YNAB_API_KEY}`
            }
        });

        return response.data.data.budgets;
    } catch (error) {
        console.error('Error obteniendo presupuestos:', error.message);
        throw error;
    }
}

async function getYnabAccounts(budgetName = null) {
    try {
        const budgets = await getYnabBudgets();

        let targetBudget;
        if (budgetName) {
            // Buscar presupuesto por nombre (case-insensitive)
            targetBudget = budgets.find(b =>
                b.name.toUpperCase().includes(budgetName.toUpperCase())
            );
            if (!targetBudget) {
                throw new Error(`No se encontró el presupuesto "${budgetName}"`);
            }
        } else {
            // Si no se especifica, usar el primer presupuesto
            targetBudget = budgets[0];
        }

        const accountsResponse = await axios.get(
            `https://api.ynab.com/v1/budgets/${targetBudget.id}/accounts`,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.YNAB_API_KEY}`
                }
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

async function getYnabTransactions(budgetId, accountId = null, days = 90) {
    try {
        const url = accountId
            ? `https://api.ynab.com/v1/budgets/${budgetId}/accounts/${accountId}/transactions`
            : `https://api.ynab.com/v1/budgets/${budgetId}/transactions`;

        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${process.env.YNAB_API_KEY}`
            },
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

async function createYnabTransaction(budgetId, accountId, amount, payee, categoryId, memo, date = null) {
    try {
        const transactionData = {
            account_id: accountId,
            date: date || new Date().toISOString().split('T')[0],  // Usar fecha proporcionada o hoy
            amount: Math.round(amount * 1000), // YNAB usa miliunidades
            payee_name: payee,
            memo: memo,
            cleared: 'cleared'
        };

        // Agregar category_id solo si se proporciona
        if (categoryId) {
            transactionData.category_id = categoryId;
        }

        const response = await axios.post(
            `https://api.ynab.com/v1/budgets/${budgetId}/transactions`,
            {
                transaction: transactionData
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.YNAB_API_KEY}`
                }
            }
        );

        return response.data.data.transaction;
    } catch (error) {
        console.error('Error creando transacción:', error.message);
        throw error;
    }
}

async function getYnabCategories(budgetId) {
    try {
        const response = await axios.get(
            `https://api.ynab.com/v1/budgets/${budgetId}/categories`,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.YNAB_API_KEY}`
                }
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

async function updateYnabTransaction(budgetId, transactionId, categoryId, keepApprovedStatus = false) {
    try {
        const transactionUpdate = {
            category_id: categoryId
        };

        // Solo cambiar approved si no queremos mantener el estado actual
        if (!keepApprovedStatus) {
            transactionUpdate.approved = true;
        }

        const response = await axios.put(
            `https://api.ynab.com/v1/budgets/${budgetId}/transactions/${transactionId}`,
            {
                transaction: transactionUpdate
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.YNAB_API_KEY}`
                }
            }
        );

        return response.data.data.transaction;
    } catch (error) {
        console.error('Error actualizando transacción:', error.message);
        throw error;
    }
}

// ===== DEFINICIÓN DE HERRAMIENTAS PARA CLAUDE =====

const tools = [
    {
        name: "get_ynab_budgets",
        description: "Obtiene la lista de presupuestos (budgets) disponibles en YNAB. El usuario tiene múltiples presupuestos: BCP SOLES, BCP DOLARES y USA BANKS. Usa esta herramienta primero para saber qué presupuesto usar.",
        input_schema: {
            type: "object",
            properties: {},
            required: []
        }
    },
    {
        name: "get_ynab_accounts",
        description: "Obtiene todas las cuentas de YNAB de un presupuesto específico. Si el usuario menciona 'BCP SOLES', 'BCP DOLARES' o 'USA BANKS', usa ese nombre de presupuesto.",
        input_schema: {
            type: "object",
            properties: {
                budgetName: {
                    type: "string",
                    description: "Nombre del presupuesto: 'BCP SOLES', 'BCP DOLARES' o 'USA BANKS'. Si no se especifica, usa el primero disponible."
                }
            },
            required: []
        }
    },
    {
        name: "get_ynab_transactions",
        description: "Obtiene las transacciones recientes de YNAB. Puede obtener todas las transacciones o filtrar por una cuenta específica usando el accountId. Esta herramienta devuelve transacciones ya importadas del banco, separadas en dos grupos: 'unapproved' (transacciones que el usuario aún no ha aprobado/categorizado) y 'approved' (transacciones ya revisadas). Usa esta herramienta cuando el usuario pregunte por transacciones, historial de gastos, transacciones pendientes de revisar, o transacciones sin categorizar.",
        input_schema: {
            type: "object",
            properties: {
                accountId: {
                    type: "string",
                    description: "ID de la cuenta de YNAB para filtrar transacciones. Si no se proporciona, devuelve todas las transacciones."
                },
                days: {
                    type: "number",
                    description: "Número de días hacia atrás para obtener transacciones. Por defecto 90 días."
                }
            },
            required: []
        }
    },
    {
        name: "create_ynab_transaction",
        description: "Crea una nueva transacción en YNAB. Usa esta herramienta cuando el usuario quiera registrar un gasto o ingreso. Opcionalmente puedes asignar una categoría al momento de crear la transacción.",
        input_schema: {
            type: "object",
            properties: {
                accountId: {
                    type: "string",
                    description: "ID de la cuenta de YNAB donde se registrará la transacción"
                },
                amount: {
                    type: "number",
                    description: "Monto de la transacción en dólares (usa números negativos para gastos y positivos para ingresos)"
                },
                payee: {
                    type: "string",
                    description: "Nombre del lugar, persona o entidad de la transacción (ej: Starbucks, Amazon, Salario)"
                },
                categoryName: {
                    type: "string",
                    description: "Nombre EXACTO de la categoría para la transacción (opcional). Debe ser una categoría existente de get_ynab_categories. Ejemplos: 'Eating Out', 'Groceries', 'Entertainment', 'Drinks'."
                },
                memo: {
                    type: "string",
                    description: "Nota o descripción opcional de la transacción"
                }
            },
            required: ["accountId", "amount", "payee"]
        }
    },
    {
        name: "get_ynab_categories",
        description: "Obtiene todas las categorías disponibles en YNAB organizadas por grupos. IMPORTANTE: SIEMPRE usa esta herramienta ANTES de analizar imágenes de estados de cuenta, para saber qué categorías puedes sugerir. Solo sugiere categorías que existan en la respuesta de esta herramienta.",
        input_schema: {
            type: "object",
            properties: {
                budgetName: {
                    type: "string",
                    description: "Nombre del presupuesto: 'BCP SOLES', 'BCP DOLARES' o 'USA BANKS'. Si no se especifica, usa el primero disponible."
                }
            },
            required: []
        }
    },
    {
        name: "categorize_transaction",
        description: "Asigna una categoría a una transacción. PREFERIBLEMENTE usa el 'index' de la transacción que viste en get_ynab_transactions (más rápido y seguro). Alternativamente, puedes usar 'payee' si no tienes el índice.",
        input_schema: {
            type: "object",
            properties: {
                index: {
                    type: "number",
                    description: "Índice de la transacción de get_ynab_transactions (1, 2, 3, etc.). Este es el método PREFERIDO - es más rápido y no requiere búsqueda."
                },
                payee: {
                    type: "string",
                    description: "Nombre del payee (solo si no tienes el índice). La búsqueda es case-insensitive y parcial."
                },
                categoryName: {
                    type: "string",
                    description: "Nombre EXACTO de la categoría tal como aparece en get_ynab_categories. Ejemplos: 'Eating Out', 'Groceries', 'Entertainment', 'Drinks'."
                },
                accountId: {
                    type: "string",
                    description: "ID de la cuenta (opcional, solo necesario si usas 'payee' en lugar de 'index')"
                }
            },
            required: ["categoryName"]
        }
    },
    {
        name: "create_multiple_transactions",
        description: "Crea múltiples transacciones en YNAB de una vez. Útil para procesar transacciones extraídas de estados de cuenta. Solo funciona con cuentas BCP (BCP SOLES o BCP DOLARES).",
        input_schema: {
            type: "object",
            properties: {
                budgetName: {
                    type: "string",
                    description: "Nombre del presupuesto: 'BCP SOLES', 'BCP DOLARES' o 'USA BANKS'"
                },
                accountId: {
                    type: "string",
                    description: "ID de la cuenta BCP donde se registrarán todas las transacciones"
                },
                transactions: {
                    type: "array",
                    description: "Array de transacciones a crear",
                    items: {
                        type: "object",
                        properties: {
                            date: {
                                type: "string",
                                description: "Fecha de la transacción en formato YYYY-MM-DD (ej: 2024-10-15)"
                            },
                            amount: {
                                type: "number",
                                description: "Monto (negativo para gastos, positivo para ingresos)"
                            },
                            payee: {
                                type: "string",
                                description: "Nombre del comercio o persona"
                            },
                            categoryName: {
                                type: "string",
                                description: "Nombre EXACTO de la categoría (opcional)"
                            },
                            memo: {
                                type: "string",
                                description: "Nota opcional"
                            }
                        },
                        required: ["date", "amount", "payee"]
                    }
                }
            },
            required: ["accountId", "transactions"]
        }
    },
    {
        name: "cache_extracted_transactions",
        description: "🚨 CRÍTICO: Guarda transacciones extraídas de PDF/imagen en caché temporal. ⚠️ OBLIGATORIO: DEBES usar esta herramienta INMEDIATAMENTE después de extraer transacciones de un PDF o imagen, ANTES de mostrarlas al usuario. Sin este paso, las transacciones se perderán y no se podrán crear. El flujo correcto es: 1) Extraer transacciones, 2) Llamar cache_extracted_transactions, 3) Mostrar al usuario, 4) Esperar confirmación, 5) Usar get_cached_transactions, 6) Crear con create_multiple_transactions.",
        input_schema: {
            type: "object",
            properties: {
                budgetName: {
                    type: "string",
                    description: "Nombre del presupuesto donde se crearán: 'BCP SOLES', 'BCP DOLARES'"
                },
                transactions: {
                    type: "array",
                    description: "Array de transacciones extraídas",
                    items: {
                        type: "object",
                        properties: {
                            date: {
                                type: "string",
                                description: "Fecha en formato YYYY-MM-DD"
                            },
                            amount: {
                                type: "number",
                                description: "Monto (negativo para gastos, positivo para ingresos)"
                            },
                            payee: {
                                type: "string",
                                description: "Nombre del comercio/payee"
                            },
                            categoryName: {
                                type: "string",
                                description: "Nombre de la categoría (opcional)"
                            },
                            memo: {
                                type: "string",
                                description: "Nota opcional"
                            }
                        },
                        required: ["date", "amount", "payee"]
                    }
                }
            },
            required: ["budgetName", "transactions"]
        }
    },
    {
        name: "get_cached_transactions",
        description: "Recupera transacciones extraídas previamente de PDF/imagen. Usa esta herramienta cuando el usuario confirme que quiere crear las transacciones que le mostraste.",
        input_schema: {
            type: "object",
            properties: {},
            required: []
        }
    },
    {
        name: "extract_transactions_from_image",
        description: "Extrae transacciones de una IMAGEN de estado de cuenta BCP. Usa esta herramienta cuando el usuario envíe una IMAGEN (no PDF). La imagen ya está cargada en el contexto de la conversación. Esta herramienta analiza la imagen, extrae las transacciones, las categoriza, las cachea automáticamente y retorna la lista para mostrar al usuario.",
        input_schema: {
            type: "object",
            properties: {
                budgetName: {
                    type: "string",
                    description: "Nombre del presupuesto: 'BCP SOLES' o 'BCP DOLARES'"
                }
            },
            required: ["budgetName"]
        }
    },
    {
        name: "extract_transactions_from_pdf_text",
        description: "Extrae transacciones de TEXTO ya extraído de un PDF de estado de cuenta BCP. Usa esta herramienta cuando el usuario envíe un PDF (no imagen). El texto del PDF ya fue extraído y está disponible en el contexto. Esta herramienta analiza el texto, extrae las transacciones (CARGOS/DEBE como negativos, ABONOS/HABER como positivos), las categoriza, las cachea automáticamente y retorna la lista para mostrar al usuario.",
        input_schema: {
            type: "object",
            properties: {
                budgetName: {
                    type: "string",
                    description: "Nombre del presupuesto: 'BCP SOLES' o 'BCP DOLARES'"
                }
            },
            required: ["budgetName"]
        }
    }
];

// ===== FUNCIÓN PARA EJECUTAR HERRAMIENTAS =====

async function executeToolCall(toolName, toolInput, userId = 'default') {
    // Track tool call in debug stats
    const userStats = debugStats.get(userId) || {
        lastToolCalls: [],
        imagesProcessed: 0,
        pdfsProcessed: 0,
        lastBudget: null,
        lastAccount: null
    };

    userStats.lastToolCalls.unshift({
        tool: toolName,
        timestamp: new Date().toISOString(),
        input: toolInput
    });

    // Keep only last 10 tool calls
    if (userStats.lastToolCalls.length > 10) {
        userStats.lastToolCalls = userStats.lastToolCalls.slice(0, 10);
    }

    debugStats.set(userId, userStats);

    try {
        switch(toolName) {
            case 'get_ynab_budgets':
                const budgets = await getYnabBudgets();
                return {
                    budgets: budgets.map(b => ({
                        id: b.id,
                        name: b.name,
                        lastModified: b.last_modified_on
                    }))
                };

            case 'get_ynab_accounts':
                const ynabData = await getYnabAccounts(toolInput.budgetName || null);

                // Track budget context
                const stats = debugStats.get(userId);
                if (stats) {
                    stats.lastBudget = ynabData.budgetName;
                    debugStats.set(userId, stats);
                }

                return {
                    budgetId: ynabData.budgetId,
                    budgetName: ynabData.budgetName,
                    accounts: ynabData.accounts.map(acc => ({
                        id: acc.id,
                        name: acc.name,
                        balance: (acc.balance / 1000).toFixed(2),
                        type: acc.type
                    }))
                };

            case 'get_ynab_transactions':
                // Obtener budgetId del presupuesto especificado o el primero
                const txYnabData = await getYnabAccounts(toolInput.budgetName || null);
                const txBudgetId = txYnabData.budgetId;

                const transactions = await getYnabTransactions(
                    txBudgetId,
                    toolInput.accountId || null,
                    toolInput.days || 90
                );

                console.log(`📊 Total transacciones obtenidas: ${transactions.length}`);

                // Separar por estado de aprobación y categoría
                const unapproved = transactions.filter(tx => tx.approved === false);
                const uncategorized = transactions.filter(tx =>
                    tx.category_name === 'Uncategorized' && tx.approved === true
                );
                const needsCategorization = [...unapproved, ...uncategorized];

                console.log(`📊 Unapproved: ${unapproved.length}, Uncategorized (approved): ${uncategorized.length}`);

                // Ordenar por fecha descendente (más recientes primero)
                needsCategorization.sort((a, b) => new Date(b.date) - new Date(a.date));

                // GUARDAR EN CACHÉ con índices
                const userCache = {
                    timestamp: Date.now(),
                    transactions: {}
                };

                needsCategorization.slice(0, 15).forEach((tx, index) => {
                    userCache.transactions[index + 1] = {
                        id: tx.id,
                        payee: tx.payee_name,
                        amount: (tx.amount / 1000).toFixed(2),
                        category_id: tx.category_id
                    };
                });

                transactionCache.set(userId, userCache);
                console.log(`💾 Guardadas ${Object.keys(userCache.transactions).length} transacciones en caché para ${userId}`);

                return {
                    total: transactions.length,
                    needs_categorization: needsCategorization.length,
                    transactions_to_categorize: needsCategorization.slice(0, 15).map((tx, index) => ({
                        index: index + 1,  // ← Índice simple para referencia
                        date: tx.date,
                        amount: (tx.amount / 1000).toFixed(2),
                        payee: tx.payee_name || 'N/A',
                        memo: tx.memo || '',
                        category: tx.category_name || 'Sin categoría',
                        status: tx.approved ? 'approved (Uncategorized)' : 'unapproved'
                    }))
                };

            case 'create_ynab_transaction':
                // Obtener datos del presupuesto
                const createYnabData = await getYnabAccounts(toolInput.budgetName || null);
                const createBudgetId = createYnabData.budgetId;

                // Validar que la cuenta exista
                const targetAccount = createYnabData.accounts.find(acc => acc.id === toolInput.accountId);

                if (!targetAccount) {
                    return {
                        error: `No se encontró la cuenta con ID ${toolInput.accountId}`
                    };
                }

                // Validar que el PRESUPUESTO sea BCP (no USA BANKS que se sincroniza automáticamente)
                const allowedCreateBudgets = ['BCP SOLES', 'BCP DOLARES'];
                const createBudgetNameUpper = createYnabData.budgetName.toUpperCase();
                const isCreateAllowed = allowedCreateBudgets.some(allowed => createBudgetNameUpper.includes(allowed));

                if (!isCreateAllowed) {
                    return {
                        error: `Solo puedes crear transacciones manualmente en presupuestos BCP (BCP SOLES o BCP DOLARES). El presupuesto "${createYnabData.budgetName}" se sincroniza automáticamente con el banco.`
                    };
                }

                let categoryId = null;

                // Si se proporcionó un nombre de categoría, buscarla
                if (toolInput.categoryName) {
                    const allCategories = await getYnabCategories(createBudgetId);
                    let targetCategory = allCategories.find(cat =>
                        cat.name === toolInput.categoryName
                    );

                    // Fallback: búsqueda case-insensitive
                    if (!targetCategory) {
                        targetCategory = allCategories.find(cat =>
                            cat.name.toLowerCase() === toolInput.categoryName.toLowerCase()
                        );

                        if (targetCategory) {
                            console.log(`   ⚠️  Categoría encontrada con diferente case: "${targetCategory.name}" (buscabas "${toolInput.categoryName}")`);
                        }
                    }

                    if (!targetCategory) {
                        const availableCategories = allCategories.map(c => c.name).join(', ');
                        return {
                            error: `No se encontró una categoría con nombre "${toolInput.categoryName}". Categorías disponibles: ${availableCategories}`
                        };
                    }

                    categoryId = targetCategory.id;
                    console.log(`   ✓ Categoría para nueva transacción: ${targetCategory.name} (ID: ${categoryId})`);
                }

                const newTransaction = await createYnabTransaction(
                    createBudgetId,
                    toolInput.accountId,
                    toolInput.amount,
                    toolInput.payee,
                    categoryId,
                    toolInput.memo || ''
                );
                return {
                    success: true,
                    transaction: {
                        id: newTransaction.id,
                        amount: (newTransaction.amount / 1000).toFixed(2),
                        payee: newTransaction.payee_name,
                        category: newTransaction.category_name || 'Sin categoría',
                        date: newTransaction.date
                    }
                };

            case 'get_ynab_categories':
                // Obtener budgetId del presupuesto especificado o el primero
                const catYnabData = await getYnabAccounts(toolInput.budgetName || null);
                const catBudgetId = catYnabData.budgetId;

                const categories = await getYnabCategories(catBudgetId);
                // Agrupar por grupo para mejor presentación
                const categoryGroups = {};
                categories.forEach(cat => {
                    if (!categoryGroups[cat.group]) {
                        categoryGroups[cat.group] = [];
                    }
                    categoryGroups[cat.group].push({
                        id: cat.id,
                        name: cat.name
                    });
                });
                return {
                    total: categories.length,
                    categories: categories,
                    grouped: categoryGroups
                };

            case 'categorize_transaction':
                // Obtener budgetId del presupuesto especificado o el primero
                const categYnabData = await getYnabAccounts(toolInput.budgetName || null);
                const categBudgetId = categYnabData.budgetId;

                console.log(`🏷️  Intentando categorizar:`);
                console.log(`   Index: ${toolInput.index || 'N/A'}`);
                console.log(`   Payee: ${toolInput.payee || 'N/A'}`);
                console.log(`   Category Name: ${toolInput.categoryName}`);

                let transactionId, transactionPayee;

                // MÉTODO 1: Buscar por índice en el caché (PREFERIDO)
                if (toolInput.index) {
                    const userCache = transactionCache.get(userId);

                    if (!userCache) {
                        return {
                            error: `No hay transacciones en caché. Por favor ejecuta get_ynab_transactions primero.`
                        };
                    }

                    // Validar que el caché no sea muy antiguo (30 minutos)
                    const cacheAge = Date.now() - userCache.timestamp;
                    if (cacheAge > 30 * 60 * 1000) {
                        return {
                            error: `El caché de transacciones expiró. Por favor ejecuta get_ynab_transactions de nuevo.`
                        };
                    }

                    const cachedTx = userCache.transactions[toolInput.index];
                    if (!cachedTx) {
                        return {
                            error: `Índice ${toolInput.index} no encontrado en caché. Índices disponibles: ${Object.keys(userCache.transactions).join(', ')}`
                        };
                    }

                    transactionId = cachedTx.id;
                    transactionPayee = cachedTx.payee;
                    console.log(`   ✓ Transacción encontrada en caché: ${transactionPayee} (ID: ${transactionId})`);
                }
                // MÉTODO 2: Buscar por nombre de payee (FALLBACK)
                else if (toolInput.payee) {
                    const allTransactions = await getYnabTransactions(
                        categBudgetId,
                        toolInput.accountId || null,
                        90
                    );

                    const payeeToSearch = toolInput.payee.toLowerCase().trim();

                    // Buscar primero en unapproved, luego en approved con Uncategorized
                    let targetTransaction = allTransactions.find(tx =>
                        tx.approved === false &&
                        tx.payee_name &&
                        tx.payee_name.toLowerCase().includes(payeeToSearch)
                    );

                    // Si no hay unapproved, buscar en approved pero con categoría "Uncategorized"
                    if (!targetTransaction) {
                        targetTransaction = allTransactions.find(tx =>
                            tx.category_name === 'Uncategorized' &&
                            tx.payee_name &&
                            tx.payee_name.toLowerCase().includes(payeeToSearch)
                        );
                    }

                    if (!targetTransaction) {
                        const unapprovedPayees = allTransactions
                            .filter(tx => tx.approved === false)
                            .map(tx => tx.payee_name)
                            .slice(0, 10);

                        const uncategorizedPayees = allTransactions
                            .filter(tx => tx.category_name === 'Uncategorized')
                            .map(tx => tx.payee_name)
                            .slice(0, 10);

                        return {
                            error: `No se encontró una transacción con payee que contenga "${toolInput.payee}". Payees unapproved disponibles: ${unapprovedPayees.join(', ') || 'ninguno'}. Payees en Uncategorized: ${uncategorizedPayees.join(', ') || 'ninguno'}`
                        };
                    }

                    transactionId = targetTransaction.id;
                    transactionPayee = targetTransaction.payee_name;
                    console.log(`   ✓ Transacción encontrada por búsqueda: ${transactionPayee} (ID: ${transactionId})`);
                } else {
                    return {
                        error: `Debes proporcionar 'index' (preferido) o 'payee' para identificar la transacción.`
                    };
                }

                // Buscar la categoría por nombre (búsqueda exacta case-sensitive)
                const allCategories = await getYnabCategories(categBudgetId);
                let targetCategory = allCategories.find(cat =>
                    cat.name === toolInput.categoryName
                );

                // Fallback: búsqueda case-insensitive
                if (!targetCategory) {
                    targetCategory = allCategories.find(cat =>
                        cat.name.toLowerCase() === toolInput.categoryName.toLowerCase()
                    );

                    if (targetCategory) {
                        console.log(`   ⚠️  Categoría encontrada con diferente case: "${targetCategory.name}" (buscabas "${toolInput.categoryName}")`);
                    }
                }

                if (!targetCategory) {
                    const availableCategories = allCategories.map(c => c.name).join(', ');
                    return {
                        error: `No se encontró una categoría con nombre "${toolInput.categoryName}". Categorías disponibles: ${availableCategories}`
                    };
                }

                console.log(`   ✓ Categoría encontrada: ${targetCategory.name} (ID: ${targetCategory.id})`);

                // Actualizar la transacción
                const updatedTx = await updateYnabTransaction(
                    categBudgetId,
                    transactionId,  // ← Usar el ID que encontramos (del caché o de la búsqueda)
                    targetCategory.id
                );

                console.log(`✅ Transacción categorizada exitosamente: ${transactionPayee} → ${targetCategory.name}`);

                return {
                    success: true,
                    transaction: {
                        payee: transactionPayee,
                        amount: (updatedTx.amount / 1000).toFixed(2),
                        category: updatedTx.category_name,
                        approved: updatedTx.approved
                    }
                };

            case 'create_multiple_transactions':
                // Obtener datos del presupuesto
                const multiYnabData = await getYnabAccounts(toolInput.budgetName || null);
                const multiBudgetId = multiYnabData.budgetId;

                console.log(`📝 Creando múltiples transacciones: ${toolInput.transactions.length} transacciones`);

                // Validar que la cuenta exista
                const multiAccount = multiYnabData.accounts.find(acc => acc.id === toolInput.accountId);

                if (!multiAccount) {
                    return {
                        error: `No se encontró la cuenta con ID ${toolInput.accountId}`
                    };
                }

                // Validar que el PRESUPUESTO sea BCP (no USA BANKS que se sincroniza automáticamente)
                const allowedBudgets = ['BCP SOLES', 'BCP DOLARES'];
                const budgetNameUpper = multiYnabData.budgetName.toUpperCase();
                const isBudgetAllowed = allowedBudgets.some(allowed => budgetNameUpper.includes(allowed));

                if (!isBudgetAllowed) {
                    return {
                        error: `Solo puedes crear transacciones manualmente en presupuestos BCP (BCP SOLES o BCP DOLARES). El presupuesto "${multiYnabData.budgetName}" se sincroniza automáticamente con el banco.`
                    };
                }

                // Obtener todas las categorías una vez
                const allCategoriesForMulti = await getYnabCategories(multiBudgetId);

                // Crear transacciones en secuencia
                const createdTransactions = [];
                const errors = [];

                for (let i = 0; i < toolInput.transactions.length; i++) {
                    const tx = toolInput.transactions[i];
                    try {
                        let txCategoryId = null;

                        // Buscar categoría si se proporcionó
                        if (tx.categoryName) {
                            let txCategory = allCategoriesForMulti.find(cat =>
                                cat.name === tx.categoryName
                            );

                            // Fallback case-insensitive
                            if (!txCategory) {
                                txCategory = allCategoriesForMulti.find(cat =>
                                    cat.name.toLowerCase() === tx.categoryName.toLowerCase()
                                );
                            }

                            if (txCategory) {
                                txCategoryId = txCategory.id;
                            } else {
                                console.log(`   ⚠️ Categoría no encontrada para ${tx.payee}: ${tx.categoryName}`);
                            }
                        }

                        const createdTx = await createYnabTransaction(
                            multiBudgetId,
                            toolInput.accountId,
                            tx.amount,
                            tx.payee,
                            txCategoryId,
                            tx.memo || '',
                            tx.date
                        );

                        createdTransactions.push({
                            payee: createdTx.payee_name,
                            amount: (createdTx.amount / 1000).toFixed(2),
                            date: createdTx.date,
                            category: createdTx.category_name || 'Sin categoría'
                        });

                        console.log(`   ✅ ${i + 1}/${toolInput.transactions.length}: ${tx.payee} - ${tx.amount}`);

                    } catch (error) {
                        console.error(`   ❌ Error creando transacción ${i + 1}: ${error.message}`);
                        errors.push({
                            index: i + 1,
                            payee: tx.payee,
                            error: error.message
                        });
                    }
                }

                console.log(`✅ Transacciones creadas: ${createdTransactions.length}/${toolInput.transactions.length}`);

                return {
                    success: true,
                    created: createdTransactions.length,
                    total: toolInput.transactions.length,
                    transactions: createdTransactions,
                    errors: errors.length > 0 ? errors : undefined
                };

            case 'cache_extracted_transactions':
                // Guardar transacciones en caché temporal
                imageTransactionsCache.set(userId, {
                    timestamp: Date.now(),
                    budgetName: toolInput.budgetName,
                    transactions: toolInput.transactions
                });
                console.log(`💾 Cached ${toolInput.transactions.length} transactions for ${userId} in budget ${toolInput.budgetName}`);
                return {
                    success: true,
                    cached: toolInput.transactions.length,
                    budgetName: toolInput.budgetName,
                    message: `Transacciones guardadas en caché: ${toolInput.transactions.length} transacciones para ${toolInput.budgetName}`
                };

            case 'get_cached_transactions':
                // Recuperar transacciones del caché
                const cachedData = imageTransactionsCache.get(userId);
                if (!cachedData) {
                    return {
                        error: "No hay transacciones en caché. Necesito que primero me envíes un estado de cuenta (imagen o PDF) para extraer las transacciones."
                    };
                }

                // Validar que el caché no sea muy antiguo (30 minutos)
                const cacheAge = Date.now() - cachedData.timestamp;
                if (cacheAge > 30 * 60 * 1000) {
                    imageTransactionsCache.delete(userId);
                    return {
                        error: "El caché de transacciones expiró (más de 30 minutos). Por favor envía el estado de cuenta de nuevo."
                    };
                }

                console.log(`📤 Retrieved ${cachedData.transactions.length} transactions from cache for ${userId}`);
                return {
                    success: true,
                    budgetName: cachedData.budgetName,
                    transactions: cachedData.transactions,
                    count: cachedData.transactions.length,
                    cacheAge: Math.floor(cacheAge / 1000) // segundos
                };

            case 'extract_transactions_from_image':
                // Esta herramienta es una señal para Claude de que debe analizar la IMAGEN
                // La imagen ya está en el contexto de la conversación
                console.log(`📸 Señal para Claude: extraer transacciones de IMAGEN para ${toolInput.budgetName}`);
                return {
                    success: true,
                    message: "Por favor analiza la IMAGEN de estado de cuenta que el usuario envió. Extrae todas las transacciones de las columnas CARGOS/DEBE (negativos) y ABONOS/HABER (positivos). Convierte las fechas de formato DDMMM a YYYY-MM-DD. Una vez extraídas, DEBES llamar inmediatamente a cache_extracted_transactions antes de mostrarlas al usuario.",
                    budgetName: toolInput.budgetName,
                    sourceType: "image"
                };

            case 'extract_transactions_from_pdf_text':
                // Recuperar texto del PDF del caché
                const pdfCachedData = pdfTextCache.get(userId);
                if (!pdfCachedData) {
                    return {
                        error: "No hay texto de PDF en caché. Por favor envía el PDF de nuevo."
                    };
                }

                // Validar que el caché no sea muy antiguo (5 minutos)
                const pdfCacheAge = Date.now() - pdfCachedData.timestamp;
                if (pdfCacheAge > 5 * 60 * 1000) {
                    pdfTextCache.delete(userId);
                    return {
                        error: "El caché del PDF expiró. Por favor envía el PDF de nuevo."
                    };
                }

                console.log(`📄 Retornando texto de PDF para que Claude lo procese (${toolInput.budgetName})`);

                // Retornar el TEXTO del PDF para que Claude lo analice
                return {
                    success: true,
                    budgetName: toolInput.budgetName,
                    pdfText: pdfCachedData.text,
                    textLength: pdfCachedData.text.length,
                    instruction: `Analiza el siguiente texto extraído del PDF de estado de cuenta BCP. Extrae TODAS las transacciones identificando:
- Columna CARGOS/DEBE: montos NEGATIVOS
- Columna ABONOS/HABER: montos POSITIVOS
- Fechas en formato DDMMM (ejemplo: 03ABR, 29ABR)
- Convierte fechas a YYYY-MM-DD
- Extrae el payee/descripción

Después de extraer las transacciones, DEBES llamar INMEDIATAMENTE a cache_extracted_transactions con el array de transacciones ANTES de mostrarlas al usuario.`,
                    pdfTextPreview: pdfCachedData.text.substring(0, 500) + '...'
                };

            default:
                throw new Error(`Herramienta desconocida: ${toolName}`);
        }
    } catch (error) {
        console.error(`Error ejecutando ${toolName}:`, error.message);
        return { error: error.message };
    }
}

// ===== FUNCIÓN PARA HABLAR CON CLAUDE =====

async function askClaude(userMessage, conversationHistory = [], userId = 'default', imageData = null, pdfText = null) {
    try {
        const systemPrompt = `Eres un asistente financiero personal conectado a YNAB (You Need A Budget).

IMPORTANTE: El usuario tiene 3 presupuestos separados en YNAB:
- **BCP SOLES**: Para transacciones en soles peruanos del BCP
- **BCP DOLARES**: Para transacciones en dólares del BCP
- **USA BANKS**: Para cuentas bancarias de USA (CHASE, PayPal, etc.)

Cuando el usuario mencione "BCP SOLES" o "BCP DOLARES", DEBES usar ese presupuesto específico.
Cuando mencione cuentas USA (CHASE, PayPal, etc.), usa el presupuesto "USA BANKS".

Puedes ayudar al usuario con:
1. Ver presupuestos disponibles (usa get_ynab_budgets)
2. Ver balances de cuentas (usa get_ynab_accounts con budgetName)
3. Ver transacciones recientes (usa get_ynab_transactions con budgetName)
4. Registrar nuevos gastos o ingresos (usa create_ynab_transaction con budgetName)
5. Categorizar transacciones existentes (usa get_ynab_categories y categorize_transaction con budgetName)
6. Analizar gastos y dar consejos financieros

IMPORTANTE sobre presupuestos y transacciones:
- Cuando el usuario pregunte por transacciones de una cuenta o por "pending"/"pendientes"/"sin categorizar":
  1. SIEMPRE usa get_ynab_accounts PRIMERO para obtener la lista actualizada de cuentas
  2. Busca en la respuesta la cuenta que coincida con el número o nombre que el usuario mencionó
  3. USA EL ID EXACTO de esa cuenta (NO inventes o uses IDs de memoria)
  4. Llama get_ynab_transactions con ese accountId exacto
  5. La herramienta devuelve dos grupos:
     - **unapproved_transactions**: Transacciones sin aprobar/categorizar (approved=false)
     - **recent_approved**: Transacciones ya aprobadas

- Ejemplo: Si el usuario dice "5861", busca una cuenta cuyo nombre contenga "5861" y usa su ID
- NUNCA uses accountIds de conversaciones anteriores - siempre obtenlos frescos con get_ynab_accounts

- Cuando el usuario pregunte por "pending" o "pendientes", muestra las UNAPPROVED
- Estas son transacciones ya importadas del banco pero que el usuario aún no ha revisado
- Ejemplos: "Librerías Crisol", "Demo Cafe", "Cineplanet", etc.

CATEGORIZACIÓN AUTOMÁTICA:
- Cuando el usuario pida categorizar transacciones:
  1. Primero obtén las transacciones unapproved con get_ynab_transactions
  2. Obtén las categorías disponibles con get_ynab_categories
  3. Analiza el payee de cada transacción y sugiere una categoría apropiada SOLO de las que obtuviste
  4. Pregunta al usuario si está de acuerdo con la categorización sugerida
  5. Si acepta, usa categorize_transaction con el NOMBRE del payee y el NOMBRE EXACTO de la categoría

- IMPORTANTE sobre categorize_transaction:
  * payee: Cualquier parte del nombre (búsqueda flexible). Ej: "meier" encontrará "Meier Ramirez SAC"
  * categoryName: DEBE ser el nombre EXACTO de una categoría que obtuviste con get_ynab_categories
  * SOLO puedes sugerir categorías que existen en get_ynab_categories
  * Copia el nombre de la categoría EXACTAMENTE como aparece (case-sensitive)

- Reglas de categorización inteligente:
  * Restaurantes/Cafés → "Eating Out"
  * Supermercados → "Groceries"
  * Gasolineras → "Transportation"
  * Uber/Taxi → "Transportation"
  * Tiendas de libros → "Entertainment" o "Education"
  * Servicios públicos (luz, agua) → "Electric" o "Water"
  * Internet/Celular → "Internet" o "Cellphone"
  * Bars → "Drinks"
  * Fee → "Fees"

- NOTA: Las transacciones completamente pendientes en el banco NO están disponibles en la API

CREAR NUEVAS TRANSACCIONES:
- IMPORTANTE: Solo puedes crear transacciones en cuentas BCP (BCP SOLES o BCP DOLARES)
- Las cuentas USA BANKS se sincronizan automáticamente con el banco - NO crear transacciones manuales ahí
- Para registrar transacciones con create_ynab_transaction:
  * Primero usa get_ynab_accounts con budgetName "BCP SOLES" o "BCP DOLARES"
  * Si el usuario no especifica, pregunta en qué presupuesto BCP (soles o dólares)
  * SIEMPRE pasa budgetName al crear transacciones
  * Gastos: monto NEGATIVO (ej: -50 para un gasto de $50)
  * Ingresos: monto POSITIVO (ej: 1000 para un ingreso de $1000)
  * Categoría (opcional): Puedes asignar una categoría al momento de crear la transacción usando categoryName
  * Si el usuario menciona una categoría, usa el nombre EXACTO de get_ynab_categories con budgetName
  * Si no se especifica categoría, la transacción se creará como "Uncategorized"

Ejemplos:
- "Registra un gasto de $50 en Starbucks" → Pregunta: ¿En BCP Soles o Dólares?
- "Registra $30 en Uber como transporte en BCP soles" → budgetName: "BCP SOLES", amount: -30, payee: "Uber", categoryName: "Transportation"
- "Agrega mi salario de $2000 en BCP dólares" → budgetName: "BCP DOLARES", amount: 2000, payee: "Salario"

ANÁLISIS DE ESTADOS DE CUENTA (IMÁGENES Y PDFs):

🚨 **HAY DOS FLUJOS SEPARADOS - USA LA HERRAMIENTA CORRECTA** 🚨

📸 **FLUJO 1: IMAGEN**
Si el usuario envió una IMAGEN:
1. ✅ Llama a get_ynab_categories con budgetName (BCP SOLES o BCP DOLARES)
2. ✅ Llama a extract_transactions_from_image con budgetName
3. ✅ La herramienta te dirá que analices la imagen - HAZLO en tu siguiente respuesta
4. ✅ Extrae transacciones de CARGOS/DEBE (negativos) y ABONOS/HABER (positivos)
5. ✅ Convierte fechas DDMMM → YYYY-MM-DD
6. ✅ INMEDIATAMENTE llama a cache_extracted_transactions con las transacciones
7. ✅ Muestra lista al usuario y pregunta cuenta

📄 **FLUJO 2: PDF (TEXTO)**
Si el usuario envió un PDF (verás "[Contenido del PDF extraído]:" en el mensaje):
1. ✅ Llama a get_ynab_categories con budgetName (BCP SOLES o BCP DOLARES)
2. ✅ Llama a extract_transactions_from_pdf_text con budgetName
3. ✅ La herramienta te retornará el TEXTO del PDF en el campo "pdfText"
4. ✅ ANALIZA el pdfText y extrae todas las transacciones:
   - Identifica columnas CARGOS/DEBE (negativos) y ABONOS/HABER (positivos)
   - Convierte fechas DDMMM a YYYY-MM-DD (ej: 03ABR → 2025-04-03, 29ABR → 2025-04-29)
   - Extrae payee/descripción
5. ✅ INMEDIATAMENTE llama a cache_extracted_transactions con las transacciones extraídas
6. ✅ LUEGO muestra la lista al usuario con categorías sugeridas y pregunta cuenta

⚠️ **REGLAS CRÍTICAS:**
- NUNCA confundas los flujos - usa la herramienta correcta según el tipo
- SIEMPRE llama a cache_extracted_transactions ANTES de mostrar al usuario
- Sin cache, las transacciones se perderán cuando el usuario confirme
- CARGOS/DEBE = montos NEGATIVOS (-480)
- ABONOS/HABER = montos POSITIVOS (+1.50)

**CUANDO USUARIO CONFIRME:**
1. get_cached_transactions → recuperar transacciones guardadas
2. get_ynab_accounts → obtener accountId de la cuenta que mencionó
3. create_multiple_transactions → crear todas las transacciones

Responde de forma conversacional, amigable y en español. Sé breve en WhatsApp (máximo 2-3 párrafos).`;

        // Construir el mensaje del usuario (con o sin imagen/PDF)
        let userContent;
        if (imageData) {
            // Si hay imagen, el contenido es un array con texto e imagen
            userContent = [
                {
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: imageData.mimetype,
                        data: imageData.data
                    }
                }
            ];

            // Agregar texto si existe
            if (userMessage && userMessage.trim()) {
                userContent.push({
                    type: 'text',
                    text: userMessage
                });
            } else {
                // Si no hay texto, pedir que analice la imagen
                userContent.push({
                    type: 'text',
                    text: 'Analiza esta imagen de estado de cuenta y extrae todas las transacciones que encuentres.'
                });
            }
        } else if (pdfText) {
            // Si hay PDF, incluir el texto extraído
            if (userMessage && userMessage.trim()) {
                userContent = `${userMessage}\n\n[Contenido del PDF extraído]:\n${pdfText}`;
            } else {
                userContent = `Analiza este estado de cuenta en PDF y extrae todas las transacciones que encuentres.\n\n[Contenido del PDF]:\n${pdfText}`;
            }
        } else {
            // Sin imagen ni PDF, solo texto
            userContent = userMessage;
        }

        let messages = [
            ...conversationHistory,
            {
                role: 'user',
                content: userContent
            }
        ];

        // Loop para manejar tool calls
        let continueLoop = true;
        let finalResponse = '';

        while (continueLoop) {
            const response = await anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 2048,
                system: systemPrompt,
                messages: messages,
                tools: tools
            });

            // Si Claude terminó sin usar herramientas
            if (response.stop_reason === 'end_turn') {
                finalResponse = response.content.find(c => c.type === 'text')?.text || '';
                continueLoop = false;
                break;
            }

            // Si Claude quiere usar herramientas
            if (response.stop_reason === 'tool_use') {
                // Agregar respuesta de Claude a mensajes
                messages.push({
                    role: 'assistant',
                    content: response.content
                });

                // Ejecutar todas las herramientas solicitadas
                const toolResults = [];
                for (const content of response.content) {
                    if (content.type === 'tool_use') {
                        console.log(`🔧 Ejecutando herramienta: ${content.name}`, content.input);
                        const result = await executeToolCall(content.name, content.input, userId);
                        console.log(`✅ Resultado:`, result);

                        // Si hay error, incluirlo en el resultado pero seguir
                        if (result.error) {
                            console.log(`⚠️  Error en herramienta ${content.name}:`, result.error);
                        }

                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: content.id,
                            content: JSON.stringify(result),
                            is_error: !!result.error
                        });
                    }
                }

                // Agregar resultados de herramientas
                messages.push({
                    role: 'user',
                    content: toolResults
                });
            } else {
                // Cualquier otra razón de parada
                finalResponse = response.content.find(c => c.type === 'text')?.text || 'No pude procesar tu solicitud.';
                continueLoop = false;
            }
        }

        return finalResponse;
    } catch (error) {
        console.error('Error con Claude:', error.message);
        return 'Disculpa, tuve un problema procesando tu mensaje. ¿Puedes intentar de nuevo?';
    }
}

// ===== CONFIGURACIÓN DE WHATSAPP =====

whatsappClient.on('qr', (qr) => {
    console.log('📱 Escanea este código QR con WhatsApp:');
    qrcode.generate(qr, { small: true });
});

whatsappClient.on('ready', () => {
    console.log('✅ Bot de WhatsApp listo!');
    console.log('💬 Ya puedes enviar mensajes');
});

// Almacenar conversaciones por usuario
const conversations = new Map();

// Caché temporal de transacciones por usuario (para categorización)
const transactionCache = new Map();

// Caché de transacciones extraídas de imágenes (pendientes de crear en YNAB)
const imageTransactionsCache = new Map();

// Caché temporal de texto extraído de PDFs (para procesamiento)
const pdfTextCache = new Map();

// Estadísticas de debug por usuario
const debugStats = new Map();

whatsappClient.on('message', async (msg) => {
    console.log('========================================');
    console.log('📨 MENSAJE RECIBIDO:');
    console.log('De:', msg.from);
    console.log('Cuerpo:', msg.body);
    console.log('Tipo:', msg.type);
    console.log('Es de grupo?', msg.from.includes('@g.us'));
    console.log('Es estado?', msg.from.includes('status'));
    console.log('========================================');
    
    try {
        // Ignorar mensajes de grupos y de estados
        if (msg.from.includes('@g.us') || msg.from.includes('status')) {
            console.log('⏭️  Mensaje ignorado (grupo o estado)');
            return;
        }

        console.log(`📩 Procesando mensaje de ${msg.from}: ${msg.body}`);

        // Obtener o inicializar estado de menú
        const menuState = getUserMenuState(msg.from);

        // Comandos especiales
        if (msg.body.toLowerCase() === '/reset') {
            conversations.delete(msg.from);
            initializeUserMenuState(msg.from);
            console.log(`🔄 Historial y menú reiniciados para ${msg.from}`);
            const welcomeMsg = renderMenu('main');
            await msg.reply(addStatusFooter(welcomeMsg, msg.from));
            return;
        }

        if (msg.body.toLowerCase() === '/menu' || msg.body.toLowerCase() === '/done') {
            // Volver al menú principal
            conversations.delete(msg.from);
            initializeUserMenuState(msg.from);
            const welcomeMsg = renderMenu('main');
            await msg.reply(addStatusFooter(welcomeMsg, msg.from));
            return;
        }

        if (msg.body.toLowerCase() === '/debug') {
            try {
                const history = conversations.get(msg.from) || [];
                const txCache = transactionCache.get(msg.from);
                const userStats = debugStats.get(msg.from);
                const memUsage = process.memoryUsage();

                console.log(`📊 Debug para ${msg.from}:`);
                console.log(`Mensajes en historial: ${history.length}`);
                console.log('Últimos 2 mensajes:', JSON.stringify(history.slice(-2), null, 2));

            let debugMessage = `📊 *Debug Info*\n\n`;

            // Conversation history
            debugMessage += `💬 *Conversación:*\n`;
            debugMessage += `- Mensajes en historial: ${history.length}\n\n`;

            // Transaction cache
            debugMessage += `💾 *Caché de Transacciones:*\n`;
            if (txCache) {
                const cacheAge = Math.floor((Date.now() - txCache.timestamp) / 1000 / 60);
                debugMessage += `- Transacciones en caché: ${Object.keys(txCache.transactions).length}\n`;
                debugMessage += `- Edad del caché: ${cacheAge} min\n\n`;
            } else {
                debugMessage += `- No hay transacciones en caché\n\n`;
            }

            // PDF/Image processing stats
            debugMessage += `📄 *Procesamiento:*\n`;
            if (userStats) {
                debugMessage += `- Imágenes procesadas: ${userStats.imagesProcessed}\n`;
                debugMessage += `- PDFs procesados: ${userStats.pdfsProcessed}\n\n`;
            } else {
                debugMessage += `- No hay estadísticas\n\n`;
            }

            // Last tool calls
            debugMessage += `🔧 *Últimas Herramientas:*\n`;
            if (userStats && userStats.lastToolCalls.length > 0) {
                userStats.lastToolCalls.slice(0, 5).forEach((call, index) => {
                    const time = new Date(call.timestamp).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
                    debugMessage += `${index + 1}. ${call.tool} (${time})\n`;
                });
                debugMessage += `\n`;
            } else {
                debugMessage += `- No hay llamadas recientes\n\n`;
            }

            // Budget/Account context
            debugMessage += `🏦 *Contexto YNAB:*\n`;
            if (userStats && userStats.lastBudget) {
                debugMessage += `- Último presupuesto: ${userStats.lastBudget}\n`;
            } else {
                debugMessage += `- Sin contexto de presupuesto\n`;
            }
            if (userStats && userStats.lastAccount) {
                debugMessage += `- Última cuenta: ${userStats.lastAccount}\n\n`;
            } else {
                debugMessage += `\n`;
            }

            // Memory usage
            debugMessage += `🖥️ *Memoria (MB):*\n`;
            debugMessage += `- RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB\n`;
            debugMessage += `- Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}/${Math.round(memUsage.heapTotal / 1024 / 1024)}MB\n\n`;

                debugMessage += `💡 Usa /reset para limpiar historial`;

                await msg.reply(debugMessage);
                return;
            } catch (debugError) {
                console.error('❌ Error en /debug:', debugError);
                await msg.reply(`❌ Error generando debug info:\n${debugError.message}\n\nDetalles: ${debugError.stack?.substring(0, 200)}`);
                return;
            }
        }

        if (msg.body.toLowerCase() === '/help') {
            const helpMsg = `🤖 *Ayuda - Bot YNAB*

*Navegación por Menús:*
Usa los números (1, 2, 3, etc.) para navegar por las opciones del menú.

*Comandos disponibles:*
📱 /menu - Volver al menú principal
🔄 /reset - Reiniciar todo
🐛 /debug - Ver información del sistema
❓ /help - Ver esta ayuda

*Funcionalidades:*
• Ver balances de cuentas
• Revisar transacciones recientes
• Registrar gastos/ingresos
• Categorizar pendientes
• Extraer de PDF/imagen

El bot combina menús estructurados con conversación inteligente de Claude AI.`;
            await msg.reply(addStatusFooter(helpMsg, msg.from));
            return;
        }

        // Detectar si el mensaje tiene imagen o PDF
        let imageData = null;
        let pdfText = null;
        if (msg.hasMedia) {
            console.log('📷 Mensaje contiene media, descargando...');
            try {
                const media = await msg.downloadMedia();

                // Procesar imágenes
                if (media.mimetype.startsWith('image/')) {
                    imageData = {
                        mimetype: media.mimetype,
                        data: media.data  // Ya viene en base64
                    };
                    console.log(`✅ Imagen descargada: ${media.mimetype}`);

                    // Track image processing
                    const userStats = debugStats.get(msg.from) || {
                        lastToolCalls: [],
                        imagesProcessed: 0,
                        pdfsProcessed: 0,
                        lastBudget: null,
                        lastAccount: null
                    };
                    userStats.imagesProcessed++;
                    debugStats.set(msg.from, userStats);
                }
                // Procesar PDFs
                else if (media.mimetype === 'application/pdf') {
                    console.log('📄 PDF detectado, extrayendo texto...');
                    const pdfBuffer = Buffer.from(media.data, 'base64');
                    pdfText = await extractTextFromPDF(pdfBuffer);
                    console.log(`✅ PDF procesado: ${pdfText.length} caracteres extraídos`);

                    // Guardar texto del PDF en caché para que las herramientas puedan accederlo
                    pdfTextCache.set(msg.from, {
                        timestamp: Date.now(),
                        text: pdfText
                    });
                    console.log(`💾 PDF text guardado en caché para ${msg.from}`);

                    // Track PDF processing
                    const userStats = debugStats.get(msg.from) || {
                        lastToolCalls: [],
                        imagesProcessed: 0,
                        pdfsProcessed: 0,
                        lastBudget: null,
                        lastAccount: null
                    };
                    userStats.pdfsProcessed++;
                    debugStats.set(msg.from, userStats);
                }
            } catch (error) {
                console.error('Error descargando/procesando media:', error);
                await msg.reply('❌ No pude descargar o procesar el archivo. Intenta de nuevo.');
                return;
            }
        }

        // Procesar según el estado actual
        if (menuState.state === 'menu') {
            // Modo menú: procesar selección
            const menuResult = await handleMenuSelection(msg.from, msg.body);

            if (menuResult.stayInMenu) {
                // Responder con el nuevo menú o mensaje
                await msg.reply(addStatusFooter(menuResult.response, msg.from));
                return;
            }

            // Ejecutar acción fuera del menú
            if (menuResult.action === 'execute_claude') {
                // Ejecutar función con Claude
                menuState.state = 'processing';
                userMenuState.set(msg.from, menuState);

                const claudeResponse = await executeClaudeFunction(
                    menuResult.function,
                    menuResult.params,
                    msg.from
                );

                // Volver al menú
                menuState.state = 'menu';
                userMenuState.set(msg.from, menuState);

                await msg.reply(addStatusFooter(claudeResponse, msg.from));
                return;
            }

            if (menuResult.action === 'enter_conversation') {
                // Entrar en modo conversacional
                const conversationPrompt = await executeClaudeFunction(
                    menuResult.function,
                    menuResult.params,
                    msg.from
                );

                await msg.reply(addStatusFooter(conversationPrompt, msg.from));
                return;
            }
        }

        // Modo conversacional, waiting_document, o procesamiento de PDF/imagen
        if (menuState.state === 'conversation' || menuState.state === 'waiting_document' || imageData || pdfText) {
            let history = conversations.get(msg.from) || [];

            // Si recibimos PDF/imagen en waiting_document, cambiar a modo conversación
            if ((imageData || pdfText) && menuState.state === 'waiting_document') {
                menuState.state = 'conversation';
                userMenuState.set(msg.from, menuState);
            }

            // Procesar con Claude
            const response = await askClaude(msg.body, history, msg.from, imageData, pdfText);

            // Guardar en historial
            history.push(
                { role: 'user', content: msg.body },
                { role: 'assistant', content: response }
            );

            // Limitar historial
            if (history.length > 20) {
                history = history.slice(-20);
            }

            conversations.set(msg.from, history);

            // Responder con footer
            await msg.reply(addStatusFooter(response, msg.from));
            return;
        }

        // Si no estamos en ningún estado reconocido, mostrar menú principal
        initializeUserMenuState(msg.from);
        const welcomeMsg = renderMenu('main');
        await msg.reply(addStatusFooter(welcomeMsg, msg.from));

    } catch (error) {
        console.error('Error procesando mensaje:', error);
        await msg.reply('❌ Hubo un error. Intenta de nuevo o escribe /reset');
    }
});

whatsappClient.on('disconnected', (reason) => {
    console.log('❌ WhatsApp desconectado:', reason);
});

// Iniciar el bot
console.log('🚀 Iniciando bot...');
whatsappClient.initialize();