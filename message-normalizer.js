/**
 * Message Normalization Module
 *
 * Provides comprehensive text normalization for robust intent detection.
 * Handles emojis, punctuation, accents, synonyms, and fuzzy matching.
 */

/**
 * Remove emojis from text
 * @param {string} text - Input text
 * @returns {string} Text without emojis
 */
function stripEmojis(text) {
    // Remove emojis using regex (covers most emoji ranges)
    return text.replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
        .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Misc Symbols and Pictographs
        .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport and Map
        .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // Flags
        .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Misc symbols
        .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
        .replace(/[\u{FE00}-\u{FE0F}]/gu, '')   // Variation Selectors
        .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental Symbols and Pictographs
        .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '') // Chess Symbols
        .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '') // Symbols and Pictographs Extended-A
        .replace(/[\u{200D}]/gu, '');            // Zero Width Joiner
}

/**
 * Remove punctuation and extra whitespace
 * @param {string} text - Input text
 * @returns {string} Cleaned text
 */
function stripPunctuation(text) {
    return text
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()¿?¡!'"]/g, ' ') // Replace punctuation with space
        .replace(/\s+/g, ' ') // Collapse multiple spaces
        .trim();
}

/**
 * Normalize accents and diacritics (Spanish)
 * @param {string} text - Input text
 * @returns {string} Text without accents
 */
function normalizeAccents(text) {
    const accentMap = {
        'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
        'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
        'ñ': 'n', 'Ñ': 'N',
        'ü': 'u', 'Ü': 'U'
    };

    return text.replace(/[áéíóúÁÉÍÓÚñÑüÜ]/g, match => accentMap[match] || match);
}

/**
 * Convert number words to digits (Spanish and English)
 * @param {string} text - Input text
 * @returns {string} Text with numbers as digits
 */
function convertNumberWords(text) {
    const numberMap = {
        // Spanish
        'cero': '0', 'uno': '1', 'dos': '2', 'tres': '3', 'cuatro': '4',
        'cinco': '5', 'seis': '6', 'siete': '7', 'ocho': '8', 'nueve': '9',
        // English
        'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
        'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9'
    };

    let normalized = text;
    for (const [word, digit] of Object.entries(numberMap)) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        normalized = normalized.replace(regex, digit);
    }
    return normalized;
}

/**
 * Expand synonyms for common commands
 * @param {string} text - Input text
 * @returns {string} Text with expanded synonyms
 */
function expandSynonyms(text) {
    const synonymGroups = {
        // Cancel synonyms
        'cancel': ['cancelar', 'cancela', 'salir', 'exit', 'terminar', 'parar', 'stop'],
        // Back synonyms
        'back': ['volver', 'atras', 'regresar', 'anterior', 'regresa'],
        // Help synonyms
        'help': ['ayuda', 'info', 'informacion', 'auxilio'],
        // Menu synonyms
        'menu': ['inicio', 'start', 'comenzar', 'principal'],
        // Reset synonyms
        'reset': ['reiniciar', 'resetear', 'limpiar', 'borrar']
    };

    let normalized = text.toLowerCase();

    // Check each word in the text
    for (const [canonical, synonyms] of Object.entries(synonymGroups)) {
        for (const synonym of synonyms) {
            // Match whole words only
            const regex = new RegExp(`\\b${synonym}\\b`, 'g');
            if (regex.test(normalized)) {
                return canonical; // Return canonical form if synonym found
            }
        }
    }

    return normalized;
}

/**
 * Intent definitions with patterns and keywords
 */
const INTENTS = {
    cancel: {
        keywords: ['cancel', 'cancelar', 'salir', 'exit', 'terminar', 'parar', 'stop'],
        patterns: [
            /^(cancel|cancelar|salir|exit)$/i,
            /\b(cancelar|cancel)\b/i  // Match word within phrase
        ]
    },
    back: {
        keywords: ['back', 'volver', 'atras', 'atrás', 'regresar', 'anterior'],
        patterns: [
            /^(back|volver|atras|regresar)$/i,
            /^(anterior|regresa)$/i,
            /\b(volver|back|atras|regresar)\b/i  // Match word within phrase
        ]
    },
    help: {
        keywords: ['help', 'ayuda', 'info', 'informacion', 'información', 'auxilio'],
        patterns: [
            /^(help|ayuda|info)$/i,
            /\b(ayuda|help)\b/i  // Match word within phrase
        ]
    },
    menu: {
        keywords: ['menu', 'menú', 'inicio', 'start', 'comenzar', 'principal'],
        patterns: [
            /^(menu|inicio|start)$/i,
            /\b(menu|inicio)\b/i  // Match word within phrase
        ]
    },
    reset: {
        keywords: ['reset', 'reiniciar', 'resetear', 'limpiar', 'borrar'],
        patterns: [
            /^(reset|reiniciar|limpiar)$/i,
            /\b(reset|reiniciar)\b/i  // Match word within phrase
        ]
    },
    debug: {
        keywords: ['debug', 'debuguear', 'depurar'],
        patterns: [
            /^(debug|depurar)$/i,
            /\b(debug|depurar)\b/i  // Match word within phrase
        ]
    }
};

/**
 * Full normalization pipeline
 * @param {string} text - Raw input text
 * @returns {Object} Normalized text and detected intents
 */
function normalizeMessage(text) {
    if (!text || typeof text !== 'string') {
        return {
            original: text,
            normalized: '',
            intents: [],
            isEmpty: true
        };
    }

    // Step 1: Strip emojis
    let normalized = stripEmojis(text);

    // Step 2: Normalize accents
    normalized = normalizeAccents(normalized);

    // Step 3: Convert number words to digits
    normalized = convertNumberWords(normalized);

    // Step 4: Strip punctuation
    normalized = stripPunctuation(normalized);

    // Step 5: Lowercase
    normalized = normalized.toLowerCase().trim();

    // Step 6: Detect intents
    const intents = detectIntents(normalized);

    return {
        original: text,
        normalized: normalized,
        intents: intents,
        isEmpty: normalized.length === 0
    };
}

/**
 * Detect intents from normalized text
 * @param {string} normalized - Normalized text
 * @returns {Array<string>} Array of detected intent names
 */
function detectIntents(normalized) {
    const detected = [];

    for (const [intentName, intentDef] of Object.entries(INTENTS)) {
        // Check patterns first (more precise)
        for (const pattern of intentDef.patterns) {
            if (pattern.test(normalized)) {
                detected.push(intentName);
                break;
            }
        }

        // If no pattern match, check keywords
        if (!detected.includes(intentName)) {
            for (const keyword of intentDef.keywords) {
                if (normalized === keyword) {
                    detected.push(intentName);
                    break;
                }
            }
        }
    }

    return detected;
}

/**
 * Check if normalized text matches a specific intent
 * @param {string} text - Input text (will be normalized)
 * @param {string} intentName - Intent to check for
 * @returns {boolean} True if intent matches
 */
function hasIntent(text, intentName) {
    const result = normalizeMessage(text);
    return result.intents.includes(intentName);
}

/**
 * Check if text is a menu number option (0-9)
 * @param {string} text - Input text
 * @returns {boolean|string} False or the digit
 */
function isMenuOption(text) {
    const result = normalizeMessage(text);
    const match = result.normalized.match(/^[0-9]$/);
    return match ? match[0] : false;
}

/**
 * Levenshtein distance for fuzzy matching
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance
 */
function levenshteinDistance(a, b) {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Fuzzy match text against a list of options
 * @param {string} text - Input text
 * @param {Array<string>} options - List of valid options
 * @param {number} threshold - Maximum edit distance (default 2)
 * @returns {string|null} Best match or null
 */
function fuzzyMatch(text, options, threshold = 2) {
    const normalized = normalizeMessage(text).normalized;

    let bestMatch = null;
    let bestDistance = Infinity;

    for (const option of options) {
        const normalizedOption = normalizeMessage(option).normalized;
        const distance = levenshteinDistance(normalized, normalizedOption);

        if (distance < bestDistance && distance <= threshold) {
            bestDistance = distance;
            bestMatch = option;
        }
    }

    return bestMatch;
}

/**
 * Get statistics about normalization
 * @param {string} text - Input text
 * @returns {Object} Statistics
 */
function getStats(text) {
    const result = normalizeMessage(text);

    // Count emojis using regex (matches emoji sequences)
    const emojiMatches = text.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}]/gu) || [];
    const emojisRemoved = emojiMatches.length;

    const punctuationRemoved = (text.match(/[.,\/#!$%\^&\*;:{}=\-_`~()¿?¡!'"]/g) || []).length;
    const accentsNormalized = (text.match(/[áéíóúÁÉÍÓÚñÑüÜ]/g) || []).length;

    return {
        original: text,
        normalized: result.normalized,
        originalLength: text.length,
        normalizedLength: result.normalized.length,
        emojisRemoved,
        punctuationRemoved,
        accentsNormalized,
        intentsDetected: result.intents,
        reduction: `${Math.round((1 - result.normalized.length / text.length) * 100)}%`
    };
}

module.exports = {
    // Core functions
    normalizeMessage,
    detectIntents,
    hasIntent,
    isMenuOption,
    fuzzyMatch,

    // Utility functions
    stripEmojis,
    stripPunctuation,
    normalizeAccents,
    convertNumberWords,
    expandSynonyms,
    levenshteinDistance,

    // Stats
    getStats,

    // Constants
    INTENTS
};
