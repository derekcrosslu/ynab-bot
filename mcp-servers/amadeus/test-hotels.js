/**
 * Test Amadeus Hotel Search
 */

require('dotenv').config({ path: '/Users/donaldcross/ALGOS/Experimentos/Sanboxes/LOCAL_PAD/whatsapp-claude-ynab/.env' });
const amadeusServer = require('./server');

async function testHotelSearch() {
    console.log('🧪 Testing Amadeus Hotel Search\n');

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

    // Step 2: Test hotel search in Tokyo
    console.log('Step 2: Searching hotels in Tokyo (Dec 11-21)...\n');

    const searchResult = await amadeusServer.searchHotels({
        cityCode: 'TYO',
        checkInDate: '2025-12-11',
        checkOutDate: '2025-12-21',
        adults: 1,
        rooms: 1,
        currency: 'USD',
        maxResults: 5
    });

    if (!searchResult.success) {
        console.error('❌ Hotel search failed:', searchResult.error);
        console.error('Description:', searchResult.description);
    } else {
        console.log('✅ Hotel search successful!\n');
        console.log(amadeusServer.formatHotelOffersForDisplay(searchResult));
    }

    console.log('\n🎉 Hotel search test completed!');
}

// Run test
testHotelSearch().catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
});
