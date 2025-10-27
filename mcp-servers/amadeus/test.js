/**
 * Test Amadeus MCP Server
 *
 * Tests flight search functionality with real API credentials
 */

require('dotenv').config({ path: '/Users/donaldcross/ALGOS/Experimentos/Sanboxes/LOCAL_PAD/whatsapp-claude-ynab/.env' });
const amadeusServer = require('./server');

async function testFlightSearch() {
    console.log('🧪 Testing Amadeus MCP Server\n');

    // Step 1: Initialize
    console.log('Step 1: Initializing Amadeus client...');
    const initResult = await amadeusServer.initialize(
        process.env.AMADEUS_API_KEY,
        process.env.AMADEUS_API_SECRET
    );

    if (!initResult.success) {
        console.error('❌ Initialization failed:', initResult.error);
        process.exit(1);
    }

    console.log('✅ Amadeus client initialized\n');

    // Step 2: Test one-way flight search
    console.log('Step 2: Searching one-way flights (LAX → NRT, Dec 11)...\n');

    const oneWayResult = await amadeusServer.searchOneWayFlights(
        'LAX',    // Los Angeles
        'NRT',    // Tokyo Narita
        '2025-12-11',
        1,        // 1 adult
        5         // 5 results
    );

    if (!oneWayResult.success) {
        console.error('❌ One-way search failed:', oneWayResult.error);
        console.error('Description:', oneWayResult.description);
    } else {
        console.log('✅ One-way search successful!\n');
        console.log(amadeusServer.formatFlightOffersForDisplay(oneWayResult));
    }

    console.log('\n' + '='.repeat(80) + '\n');

    // Step 3: Test round-trip flight search
    console.log('Step 3: Searching round-trip flights (LAX ⇄ NRT, Dec 11-21)...\n');

    const roundTripResult = await amadeusServer.searchRoundTripFlights(
        'LAX',
        'NRT',
        '2025-12-11',
        '2025-12-21',
        1,
        5
    );

    if (!roundTripResult.success) {
        console.error('❌ Round-trip search failed:', roundTripResult.error);
        console.error('Description:', roundTripResult.description);
    } else {
        console.log('✅ Round-trip search successful!\n');
        console.log(amadeusServer.formatFlightOffersForDisplay(roundTripResult));
    }

    console.log('\n🎉 All tests completed!');
}

// Run tests
testFlightSearch().catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
});
