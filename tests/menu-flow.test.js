/**
 * Example Test: Menu Navigation Flow
 *
 * Tests that menu navigation works correctly without requiring WhatsApp.
 * Run with: node tests/menu-flow.test.js
 */

const { FlowTester, TestRunner } = require('./flow-tester');

// Mock simplified message handler for testing
async function simplifiedMenuHandler(msg) {
    // This would be replaced with actual bot logic
    // For now, just test the framework

    if (msg.body === '/reset' || msg.body === '/menu') {
        await msg.reply(
            '🏠 Menú Principal\n\n' +
            'Selecciona una opción\n\n' +
            '*1*. Ver balances de cuentas\n' +
            '*2*. Revisar transacciones recientes\n' +
            '*0*. Ayuda / Información'
        );
    } else if (msg.body === '1') {
        await msg.reply(
            '💰 Ver Balances\n\n' +
            '¿De qué presupuesto?\n\n' +
            '*1*. BCP SOLES\n' +
            '*2*. BCP DOLARES\n' +
            '*0*. ← Volver al menú principal'
        );
    } else if (msg.body === '0') {
        await msg.reply('🤖 Ayuda del Bot YNAB\n\nNavega usando los números...');
    } else {
        await msg.reply('❌ Opción inválida. Por favor elige una opción del menú.');
    }
}

// Create test runner
const runner = new TestRunner();

// Test 1: Main menu loads
runner.addTest('Main menu loads on /menu', async () => {
    const tester = new FlowTester();
    tester.setMessageHandler(simplifiedMenuHandler);

    await tester.sendMessage('/menu');

    tester.assertContains('Menú Principal', 'Should show main menu');
    tester.assertContains('*1*. Ver balances', 'Should show option 1');
});

// Test 2: Navigate to submenu
runner.addTest('Navigate to balances submenu', async () => {
    const tester = new FlowTester();
    tester.setMessageHandler(simplifiedMenuHandler);

    await tester.sendMessage('/menu');
    await tester.sendMessage('1');

    tester.assertContains('Ver Balances', 'Should show balances menu');
    tester.assertContains('BCP SOLES', 'Should show budget options');
});

// Test 3: Invalid option handling
runner.addTest('Invalid option shows error', async () => {
    const tester = new FlowTester();
    tester.setMessageHandler(simplifiedMenuHandler);

    await tester.sendMessage('/menu');
    await tester.sendMessage('99');

    tester.assertContains('inválida', 'Should show error message');
});

// Test 4: Help command
runner.addTest('Help command works', async () => {
    const tester = new FlowTester();
    tester.setMessageHandler(simplifiedMenuHandler);

    await tester.sendMessage('/menu');
    await tester.sendMessage('0');

    tester.assertContains('Ayuda', 'Should show help');
});

// Test 5: Complete flow simulation
runner.addTest('Complete flow: menu → balances → back', async () => {
    const tester = new FlowTester();
    tester.setMessageHandler(simplifiedMenuHandler);

    const responses = await tester.simulateFlow([
        '/menu',
        '1',
        '0'  // Back option
    ]);

    // Check we got 3 responses
    if (responses.length !== 3) {
        throw new Error(`Expected 3 responses, got ${responses.length}`);
    }

    // Last response should be main menu or help
    tester.assertReplyReceived('Should get final response');
});

// Run all tests
if (require.main === module) {
    runner.run().then(results => {
        process.exit(results.failed > 0 ? 1 : 0);
    });
}

module.exports = { runner };
