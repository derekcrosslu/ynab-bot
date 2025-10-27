/**
 * Test Google MCP Server
 *
 * Tests Gmail, Calendar, and Maps integration
 */

require('dotenv').config({ path: '/Users/donaldcross/ALGOS/Experimentos/Sanboxes/LOCAL_PAD/whatsapp-claude-ynab/.env' });
const googleServer = require('./server');

async function testGoogleIntegration() {
    console.log('🧪 Testing Google MCP Server\n');

    // Step 1: Initialize
    console.log('Step 1: Initializing Google APIs...');
    const initResult = await googleServer.initialize(
        './credentials.json',
        './token.json',
        process.env.GOOGLE_MAPS_API_KEY
    );

    if (!initResult.success) {
        console.log('⚠️ Initialization result:', initResult);
        console.log('\n📝 To complete setup:');
        console.log('1. Follow SETUP.md to create Google Cloud credentials');
        console.log('2. Run: node auth.js');
        console.log('3. Run this test again');
        return;
    }

    console.log('✅ Google APIs initialized\n');

    // Step 2: Test Gmail (if available)
    if (googleServer.gmail) {
        console.log('Step 2: Testing Gmail API...\n');

        const emailSearch = await googleServer.searchEmails('is:unread', 5);

        if (emailSearch.success) {
            console.log(`✅ Gmail search successful! Found ${emailSearch.messages.length} unread emails`);
            if (emailSearch.messages.length > 0) {
                console.log('   Latest:', emailSearch.messages[0].subject);
            }
        } else {
            console.error('❌ Gmail search failed:', emailSearch.error);
        }
        console.log('');
    }

    // Step 3: Test Calendar (if available)
    if (googleServer.calendar) {
        console.log('Step 3: Testing Calendar API...\n');

        const now = new Date();
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const eventsList = await googleServer.listEvents(
            now.toISOString(),
            nextWeek.toISOString(),
            5
        );

        if (eventsList.success) {
            console.log(`✅ Calendar list successful! Found ${eventsList.events.length} events`);
            if (eventsList.events.length > 0) {
                console.log('   Next event:', eventsList.events[0].summary);
            }
        } else {
            console.error('❌ Calendar list failed:', eventsList.error);
        }
        console.log('');
    }

    // Step 4: Test Maps (if available)
    if (googleServer.mapsApiKey) {
        console.log('Step 4: Testing Google Maps API...\n');

        const geocodeResult = await googleServer.geocode('1600 Amphitheatre Parkway, Mountain View, CA');

        if (geocodeResult.success) {
            console.log('✅ Geocoding successful!');
            console.log('   Address:', geocodeResult.formatted_address);
            console.log('   Coordinates:', geocodeResult.location);
        } else {
            console.error('❌ Geocoding failed:', geocodeResult.error);
        }
        console.log('');

        // Test distance calculation
        const distanceResult = await googleServer.calculateDistance(
            'San Francisco, CA',
            'Los Angeles, CA'
        );

        if (distanceResult.success) {
            console.log('✅ Distance calculation successful!');
            console.log('   Distance:', distanceResult.distance.text);
            console.log('   Duration:', distanceResult.duration.text);
        } else {
            console.error('❌ Distance calculation failed:', distanceResult.error);
        }
        console.log('');
    }

    console.log('🎉 All tests completed!');
}

// Run tests
testGoogleIntegration().catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
});
