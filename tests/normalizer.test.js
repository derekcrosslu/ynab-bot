/**
 * Message Normalizer Tests
 *
 * Tests the message normalization functionality to ensure robust intent detection.
 * Run with: node tests/normalizer.test.js
 */

const {
    normalizeMessage,
    hasIntent,
    isMenuOption,
    fuzzyMatch,
    stripEmojis,
    stripPunctuation,
    normalizeAccents,
    convertNumberWords,
    getStats
} = require('../message-normalizer');

// Test counter
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
        passed++;
    } catch (error) {
        console.log(`❌ ${name}`);
        console.log(`   Error: ${error.message}`);
        failed++;
    }
}

function assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}. ${message}`);
    }
}

function assertContains(array, item, message = '') {
    if (!array.includes(item)) {
        throw new Error(`Expected array to contain ${item}. ${message}`);
    }
}

console.log('\n🧪 Testing Message Normalizer...\n');

// ===== EMOJI STRIPPING =====
console.log('📝 Testing Emoji Stripping:');

test('Remove basic emojis', () => {
    const result = stripEmojis('Hola 👋 mundo 🌍');
    assertEqual(result, 'Hola  mundo ');
});

test('Remove multiple emoji types', () => {
    const result = stripEmojis('🎉 Cancelar 🚫 ahora ✅');
    assertEqual(result, ' Cancelar  ahora ');
});

// ===== ACCENT NORMALIZATION =====
console.log('\n📝 Testing Accent Normalization:');

test('Normalize Spanish accents', () => {
    const result = normalizeAccents('Menú principal con información');
    assertEqual(result, 'Menu principal con informacion');
});

test('Normalize ñ character', () => {
    const result = normalizeAccents('Año español');
    assertEqual(result, 'Ano espanol');
});

// ===== NUMBER WORD CONVERSION =====
console.log('\n📝 Testing Number Word Conversion:');

test('Convert Spanish number words', () => {
    const result = convertNumberWords('uno dos tres');
    assertEqual(result, '1 2 3');
});

test('Convert English number words', () => {
    const result = convertNumberWords('one two three');
    assertEqual(result, '1 2 3');
});

test('Convert mixed number words', () => {
    const result = convertNumberWords('Opción uno o two');
    assertEqual(result, 'Opción 1 o 2');
});

// ===== PUNCTUATION STRIPPING =====
console.log('\n📝 Testing Punctuation Stripping:');

test('Remove punctuation', () => {
    const result = stripPunctuation('¿Cancelar? ¡Sí, ahora!');
    assertEqual(result, 'Cancelar Sí ahora');
});

test('Remove special characters', () => {
    const result = stripPunctuation('Test... with-dashes_and/slashes');
    assertEqual(result, 'Test with dashes and slashes');
});

// ===== FULL NORMALIZATION =====
console.log('\n📝 Testing Full Normalization:');

test('Full normalization pipeline', () => {
    const result = normalizeMessage('¿¡🎉 Cancelar! 👋 ¿ahora?');
    assertEqual(result.normalized, 'cancelar ahora');
});

test('Normalize with accents and emojis', () => {
    const result = normalizeMessage('🏠 Menú principal 📊');
    assertEqual(result.normalized, 'menu principal');
});

test('Normalize number words', () => {
    const result = normalizeMessage('Opción uno por favor');
    assertEqual(result.normalized, 'opcion 1 por favor');
});

// ===== INTENT DETECTION =====
console.log('\n📝 Testing Intent Detection:');

test('Detect cancel intent (Spanish)', () => {
    const result = normalizeMessage('cancelar');
    assertContains(result.intents, 'cancel');
});

test('Detect cancel intent with emojis', () => {
    const result = normalizeMessage('🚫 cancelar 🚫');
    assertContains(result.intents, 'cancel');
});

test('Detect back intent (Spanish)', () => {
    const result = normalizeMessage('volver atrás');
    assertContains(result.intents, 'back');
});

test('Detect help intent', () => {
    const result = normalizeMessage('ayuda');
    assertContains(result.intents, 'help');
});

test('Detect menu intent', () => {
    const result = normalizeMessage('🏠 menú');
    assertContains(result.intents, 'menu');
});

test('Detect reset intent', () => {
    const result = normalizeMessage('reiniciar');
    assertContains(result.intents, 'reset');
});

// ===== hasIntent HELPER =====
console.log('\n📝 Testing hasIntent Helper:');

test('hasIntent detects cancel', () => {
    assertEqual(hasIntent('cancelar', 'cancel'), true);
});

test('hasIntent detects cancel with punctuation', () => {
    assertEqual(hasIntent('¡Cancelar!', 'cancel'), true);
});

test('hasIntent detects back with accent', () => {
    assertEqual(hasIntent('atrás', 'back'), true);
});

test('hasIntent returns false for non-matching', () => {
    assertEqual(hasIntent('hola mundo', 'cancel'), false);
});

// ===== MENU OPTION DETECTION =====
console.log('\n📝 Testing Menu Option Detection:');

test('Detect menu option 1', () => {
    assertEqual(isMenuOption('1'), '1');
});

test('Detect menu option 0', () => {
    assertEqual(isMenuOption('0'), '0');
});

test('Detect menu option with spaces', () => {
    assertEqual(isMenuOption('  3  '), '3');
});

test('Detect menu option with emojis', () => {
    assertEqual(isMenuOption('🎉 2 🎉'), '2');
});

test('Reject non-menu input', () => {
    assertEqual(isMenuOption('hola'), false);
});

test('Reject multiple digits', () => {
    assertEqual(isMenuOption('12'), false);
});

// ===== FUZZY MATCHING =====
console.log('\n📝 Testing Fuzzy Matching:');

test('Fuzzy match exact', () => {
    const result = fuzzyMatch('cancelar', ['cancelar', 'menu', 'ayuda']);
    assertEqual(result, 'cancelar');
});

test('Fuzzy match with typo', () => {
    const result = fuzzyMatch('canclar', ['cancelar', 'menu', 'ayuda'], 2);
    assertEqual(result, 'cancelar');
});

test('Fuzzy match with accent', () => {
    const result = fuzzyMatch('menú', ['menu', 'cancelar', 'ayuda'], 2);
    assertEqual(result, 'menu');
});

test('Fuzzy match returns null for no match', () => {
    const result = fuzzyMatch('xyz', ['cancelar', 'menu', 'ayuda'], 2);
    assertEqual(result, null);
});

// ===== REAL-WORLD SCENARIOS =====
console.log('\n📝 Testing Real-World Scenarios:');

test('User types with emojis and accents', () => {
    const result = normalizeMessage('🤖 ¡Cancelar operación! 🚫');
    assertEqual(result.normalized, 'cancelar operacion');
    assertContains(result.intents, 'cancel');
});

test('User types menu number with text', () => {
    const result = normalizeMessage('Opción uno');
    assertEqual(result.normalized, 'opcion 1');
});

test('User types help with exclamations', () => {
    const result = normalizeMessage('¡¡¡Ayuda!!!');
    assertEqual(result.normalized, 'ayuda');
    assertContains(result.intents, 'help');
});

test('User types back with variations', () => {
    const testCases = ['volver', 'atrás', 'regresa', 'back'];
    for (const input of testCases) {
        const result = hasIntent(input, 'back');
        assertEqual(result, true, `Failed for: ${input}`);
    }
});

test('User types cancel with variations', () => {
    const testCases = ['cancelar', 'salir', 'exit', 'stop', 'terminar'];
    for (const input of testCases) {
        const result = hasIntent(input, 'cancel');
        assertEqual(result, true, `Failed for: ${input}`);
    }
});

// ===== EDGE CASES =====
console.log('\n📝 Testing Edge Cases:');

test('Empty string normalization', () => {
    const result = normalizeMessage('');
    assertEqual(result.normalized, '');
    assertEqual(result.isEmpty, true);
});

test('Only emojis', () => {
    const result = normalizeMessage('🎉🎊🎈');
    assertEqual(result.normalized, '');
    assertEqual(result.isEmpty, true);
});

test('Only punctuation', () => {
    const result = normalizeMessage('!!! ??? ...');
    assertEqual(result.normalized, '');
    assertEqual(result.isEmpty, true);
});

test('Mixed uppercase and lowercase', () => {
    const result = normalizeMessage('CaNcElAr');
    assertEqual(result.normalized, 'cancelar');
    assertContains(result.intents, 'cancel');
});

// ===== STATISTICS =====
console.log('\n📝 Testing Statistics:');

test('Get normalization stats', () => {
    const stats = getStats('¡¡🎉 Menú!! 🏠');
    assertEqual(stats.originalLength > stats.normalizedLength, true);
    assertEqual(stats.emojisRemoved, 2);
    assertEqual(stats.punctuationRemoved > 0, true);
});

// ===== RESULTS =====
console.log('\n' + '='.repeat(50));
console.log('📊 TEST RESULTS:');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
    console.log('\n⚠️  Some tests failed!');
    process.exit(1);
} else {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
}
