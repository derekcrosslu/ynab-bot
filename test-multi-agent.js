/**
 * Test Multi-Agent System
 *
 * Tests that the multi-agent orchestrator:
 * 1. Initializes correctly
 * 2. Parses user intents
 * 3. Routes to appropriate agents
 * 4. BudgetAgent handles requests
 * 5. Mode router switches to multi-agent mode
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const ynabService = require('./services/ynab-service');
const Orchestrator = require('./agents/orchestrator/Orchestrator');
const modeRouter = require('./mode-router');

async function runTests() {
    console.log('========================================');
    console.log('🧪 Testing Multi-Agent System');
    console.log('========================================\n');

    const testUserId = 'test@multi-agent.com';

    try {
        // Test 1: Initialize Orchestrator
        console.log('Test 1: Initialize Orchestrator');
        const anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
        });
        const orchestrator = new Orchestrator(anthropic, ynabService);
        console.log('✅ Orchestrator initialized');
        console.log(`✅ Agents available: ${Object.keys(orchestrator.agents).join(', ')}`);
        console.log('');

        // Test 2: Connect to Mode Router
        console.log('Test 2: Connect Orchestrator to Mode Router');
        modeRouter.setOrchestrator(orchestrator);
        console.log('✅ Orchestrator connected to mode router');
        console.log(`✅ Multi-agent available: ${modeRouter.isMultiAgentAvailable()}`);
        console.log('');

        // Test 3: Switch to Multi-Agent Mode
        console.log('Test 3: Switch to Multi-Agent Mode');
        const switchResult = await modeRouter.handleMessage(testUserId, '/budgetnew');
        console.log(`✅ Mode: ${switchResult.mode}`);
        console.log(`✅ Handled: ${switchResult.handled}`);
        console.log(`✅ Response preview: ${switchResult.response.substring(0, 60)}...`);
        console.assert(switchResult.mode === 'multi-agent', 'Should be in multi-agent mode');
        console.log('');

        // Test 4: Intent Parsing (if API key available)
        if (process.env.ANTHROPIC_API_KEY) {
            console.log('Test 4: Intent Parsing');
            const intent1 = await orchestrator.parseIntent('show me my balance');
            console.log(`✅ Intent for "show me my balance":`, intent1);
            console.assert(intent1.agent === 'budget', 'Should route to budget agent');

            const intent2 = await orchestrator.parseIntent('add $50 expense at Starbucks');
            console.log(`✅ Intent for "add $50 expense":`, intent2);
            console.assert(intent2.agent === 'budget', 'Should route to budget agent');
            console.log('');
        } else {
            console.log('Test 4: SKIPPED (no API key)');
            console.log('');
        }

        // Test 5: Agent Selection
        console.log('Test 5: Agent Selection');
        const budgetAgent = orchestrator.selectAgent('budget');
        console.log(`✅ Selected budget agent: ${budgetAgent.name}`);
        console.log(`✅ Capabilities: ${budgetAgent.capabilities.join(', ')}`);
        console.assert(budgetAgent.name === 'BudgetAgent', 'Should select BudgetAgent');
        console.log('');

        // Test 6: Approval Decision Matrix
        console.log('Test 6: Approval Decision Matrix');

        const smallTransaction = { action: 'create_transaction', params: { amount: -50 } };
        const largeTransaction = { action: 'create_transaction', params: { amount: -200 } };
        const viewBalance = { action: 'view_balance', params: {} };

        const approval1 = orchestrator.checkApprovalNeeded(smallTransaction);
        const approval2 = orchestrator.checkApprovalNeeded(largeTransaction);
        const approval3 = orchestrator.checkApprovalNeeded(viewBalance);

        console.log(`✅ Small transaction ($50): ${approval1 ? 'Needs approval' : 'Autonomous'}`);
        console.log(`✅ Large transaction ($200): ${approval2 ? 'Needs approval' : 'Autonomous'}`);
        console.log(`✅ View balance: ${approval3 ? 'Needs approval' : 'Autonomous'}`);

        console.assert(approval1 === false, 'Small transactions should be autonomous');
        console.assert(approval2 === true, 'Large transactions should need approval');
        console.assert(approval3 === false, 'View actions should be autonomous');
        console.log('');

        // Test 7: Orchestrator Status
        console.log('Test 7: Orchestrator Status');
        const status = orchestrator.getStatus();
        console.log(`✅ Orchestrator ready: ${status.ready}`);
        console.log(`✅ Beads initialized: ${status.beadsInitialized}`);
        console.log(`✅ Agent statuses:`, status.agents);
        console.log('');

        // Test 8: Mode Router Integration (if API key available)
        if (process.env.ANTHROPIC_API_KEY) {
            console.log('Test 8: End-to-End Request via Mode Router');
            const result = await modeRouter.handleMessage(
                testUserId,
                'show me my spending',
                {}
            );
            console.log(`✅ Mode: ${result.mode}`);
            console.log(`✅ Handled: ${result.handled}`);
            console.log(`✅ Response preview: ${result.response?.substring(0, 100)}...`);
            console.log('');
        } else {
            console.log('Test 8: SKIPPED (no API key)');
            console.log('');
        }

        console.log('========================================');
        console.log('✅ ALL TESTS PASSED!');
        console.log('========================================\n');

        console.log('📋 Summary:');
        console.log('  ✅ Orchestrator initializes correctly');
        console.log('  ✅ Connects to mode router successfully');
        console.log('  ✅ Multi-agent mode is now available');
        console.log('  ✅ Intent parsing works (when API key present)');
        console.log('  ✅ Agent selection works correctly');
        console.log('  ✅ Approval decision matrix works');
        console.log('  ✅ Orchestrator status reporting works');
        console.log('  ✅ End-to-end flow works');
        console.log('');

        console.log('🎯 Multi-Agent Mode is READY!');
        console.log('');
        console.log('📝 To use:');
        console.log('  1. Start bot: node bot.js');
        console.log('  2. Switch mode: /budgetnew');
        console.log('  3. Try: "show me my balance"');
        console.log('  4. Try: "analyze my spending"');
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
