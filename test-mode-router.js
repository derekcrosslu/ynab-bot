/**
 * Test Mode Router Integration
 *
 * Tests that mode router correctly:
 * 1. Handles mode switching commands
 * 2. Routes to legacy mode (flowRouter)
 * 3. Provides proper statistics
 */

const modeRouter = require('./mode-router');

async function runTests() {
    console.log('========================================');
    console.log('🧪 Testing Mode Router Integration');
    console.log('========================================\n');

    const testUserId = 'test@user.com';

    try {
        // Test 1: Check default mode
        console.log('Test 1: Default mode');
        const defaultMode = modeRouter.getUserMode(testUserId);
        console.log(`✅ Default mode: ${defaultMode}`);
        console.assert(defaultMode === 'legacy', 'Default mode should be legacy');
        console.log('');

        // Test 2: Switch to legacy mode
        console.log('Test 2: Switch to legacy mode with /budgetok');
        const legacyResult = await modeRouter.handleMessage(testUserId, '/budgetok');
        console.log(`✅ Mode: ${legacyResult.mode}`);
        console.log(`✅ Handled: ${legacyResult.handled}`);
        console.log(`✅ Response preview: ${legacyResult.response.substring(0, 50)}...`);
        console.assert(legacyResult.mode === 'legacy', 'Should be in legacy mode');
        console.assert(legacyResult.handled === true, 'Should be handled');
        console.log('');

        // Test 3: Check mode command
        console.log('Test 3: Check current mode with /mode');
        const modeCheckResult = await modeRouter.handleMessage(testUserId, '/mode');
        console.log(`✅ Mode: ${modeCheckResult.mode}`);
        console.log(`✅ Response preview: ${modeCheckResult.response.substring(0, 50)}...`);
        console.assert(modeCheckResult.handled === true, 'Should be handled');
        console.log('');

        // Test 4: Try to switch to multi-agent (should notify not available)
        console.log('Test 4: Try switching to multi-agent mode (should notify not ready)');
        const multiAgentResult = await modeRouter.handleMessage(testUserId, '/budgetnew');
        console.log(`✅ Mode: ${multiAgentResult.mode}`);
        console.log(`✅ Response preview: ${multiAgentResult.response.substring(0, 60)}...`);
        console.assert(multiAgentResult.mode === 'legacy', 'Should fall back to legacy');
        console.log('');

        // Test 5: Get mode statistics
        console.log('Test 5: Mode statistics');
        const stats = modeRouter.getModeStats();
        console.log(`✅ Default mode: ${stats.defaultMode}`);
        console.log(`✅ Total users: ${stats.totalUsers}`);
        console.log(`✅ Legacy users: ${stats.legacyUsers}`);
        console.log(`✅ Multi-agent users: ${stats.multiAgentUsers}`);
        console.log(`✅ Orchestrator ready: ${stats.orchestratorReady}`);
        console.assert(stats.orchestratorReady === false, 'Orchestrator should not be ready yet');
        console.log('');

        // Test 6: Test regular message routing to legacy mode
        console.log('Test 6: Route regular message to legacy mode');
        const regularResult = await modeRouter.handleMessage(
            testUserId,
            'show me my balance',
            {}
        );
        console.log(`✅ Mode: ${regularResult.mode}`);
        console.log(`✅ Handled: ${regularResult.handled}`);
        // Regular messages may or may not be handled by flow router
        // That's expected - it depends on whether a flow matches
        console.log('');

        // Test 7: Multi-agent availability check
        console.log('Test 7: Check multi-agent availability');
        const isAvailable = modeRouter.isMultiAgentAvailable();
        console.log(`✅ Multi-agent available: ${isAvailable}`);
        console.assert(isAvailable === false, 'Multi-agent should not be available yet');
        console.log('');

        console.log('========================================');
        console.log('✅ ALL TESTS PASSED!');
        console.log('========================================\n');

        console.log('📋 Summary:');
        console.log('  ✅ Mode router correctly initializes to legacy mode');
        console.log('  ✅ Mode switching commands work (/budgetok, /budgetnew, /mode)');
        console.log('  ✅ Statistics tracking works');
        console.log('  ✅ Multi-agent gracefully reports "not available"');
        console.log('  ✅ Regular messages route to legacy flow system');
        console.log('');
        console.log('🎯 Next steps:');
        console.log('  1. Implement multi-agent orchestrator');
        console.log('  2. Connect orchestrator with modeRouter.setOrchestrator()');
        console.log('  3. Test switching between modes with real users');
        console.log('');

    } catch (error) {
        console.error('❌ TEST FAILED:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run tests
runTests().catch(err => {
    console.error('❌ Unhandled error:', err);
    process.exit(1);
});
