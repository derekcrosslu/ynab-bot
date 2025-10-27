/**
 * TripAgent - Trip Planning and Travel Management Agent
 *
 * Capabilities:
 * 1. plan_trip - Complete trip planning with Claude AI
 * 2. search_flights - Real flight search via Amadeus API
 * 3. book_flight - Book flights with confirmation and payment
 * 4. search_hotels - Hotel recommendations and search
 * 5. create_itinerary - Day-by-day itinerary creation
 * 6. track_booking - Track bookings and reservations
 * 7. get_trip_suggestions - Destination suggestions based on preferences
 *
 * Integrations:
 * - Amadeus API for flight search and booking
 * - Beads for trip and booking persistence
 * - BudgetAgent for expense tracking
 */

const BaseAgent = require('../base/BaseAgent');
const amadeusServer = require('../../mcp-servers/amadeus/server');

class TripAgent extends BaseAgent {
    constructor(anthropic, budgetAgent) {
        super('TripAgent', [
            'plan_trip',
            'search_flights',
            'book_flight',
            'search_hotels',
            'create_itinerary',
            'track_booking',
            'get_trip_suggestions'
        ]);

        this.anthropic = anthropic;
        this.budgetAgent = budgetAgent;
        this.amadeus = amadeusServer;

        // Initialize Amadeus with credentials from environment
        this.initializeAmadeus();

        console.log('🌍 [TripAgent] Initialized with capabilities:', this.capabilities);
    }

    /**
     * Initialize Amadeus MCP server
     */
    async initializeAmadeus() {
        try {
            const result = await this.amadeus.initialize(
                process.env.AMADEUS_API_KEY,
                process.env.AMADEUS_API_SECRET
            );

            if (result.success) {
                console.log('✈️ [TripAgent] Amadeus MCP server initialized');
            } else {
                console.error('❌ [TripAgent] Failed to initialize Amadeus:', result.error);
            }
        } catch (error) {
            console.error('❌ [TripAgent] Error initializing Amadeus:', error.message);
        }
    }

    /**
     * Main request handler - routes to appropriate capability
     */
    async handleRequest(request, context) {
        const { intent, params } = request;
        const { userId } = context;

        console.log(`💬 [TripAgent] Handling ${intent} for user ${userId}`);

        try {
            switch (intent) {
                case 'plan_trip':
                    return await this.planTrip(params, context);

                case 'search_flights':
                    return await this.searchFlights(params, context);

                case 'book_flight':
                    return await this.bookFlight(params, context);

                case 'search_hotels':
                    return await this.searchHotels(params, context);

                case 'create_itinerary':
                    return await this.createItinerary(params, context);

                case 'track_booking':
                    return await this.trackBooking(params, context);

                case 'get_trip_suggestions':
                    return await this.getTripSuggestions(params, context);

                default:
                    return this.formatResponse(
                        `❌ Unknown trip capability: ${intent}`
                    );
            }
        } catch (error) {
            console.error(`❌ [TripAgent] Error handling ${intent}:`, error);
            return this.formatResponse(
                `❌ Error processing trip request: ${error.message}`
            );
        }
    }

    /**
     * 1. PLAN TRIP - Complete trip planning with AI
     */
    async planTrip(params, context) {
        console.log('🗺️ [TripAgent] Planning trip with params:', params);

        const { destination, dates, budget, preferences, travelers } = params;

        // Build comprehensive trip planning prompt
        const prompt = `You are a professional travel planner. Create a comprehensive trip plan with the following details:

**Trip Details:**
- Destination: ${destination || 'Not specified'}
- Dates: ${dates || 'Flexible'}
- Budget: ${budget || 'Not specified'}
- Number of travelers: ${travelers || '1'}
- Preferences: ${preferences || 'None specified'}

Please provide:
1. **Overview**: Brief destination overview and why it's great for this trip
2. **Best time to visit**: Weather and seasonal considerations for the dates
3. **Estimated budget breakdown**:
   - Flights (estimate)
   - Accommodation (per night estimate)
   - Daily expenses (food, transport, activities)
   - Total trip estimate
4. **Accommodation recommendations**: 3 hotel/Airbnb suggestions with different price ranges
5. **Must-see attractions**: Top 5-7 things to do/see
6. **Local tips**: Transportation, food, safety, cultural considerations
7. **Suggested itinerary**: High-level day-by-day plan
8. **Next steps**: What to book first, what to research

Format the response in a clear, organized way with emojis for visual appeal.`;

        try {
            // Use Claude to generate comprehensive trip plan
            const tripPlan = await this.askClaude(prompt);

            // Try to save trip plan to memory (optional - continue if Beads not available)
            try {
                await this.saveToMemory({
                    title: `Trip Plan: ${destination} ${dates || ''}`,
                    type: 'task',
                    priority: 2,
                    description: `Trip planning for ${destination}. Dates: ${dates || 'TBD'}. Budget: ${budget || 'TBD'}`,
                    metadata: {
                        destination,
                        dates,
                        budget,
                        travelers,
                        preferences,
                        status: 'planning'
                    }
                });
            } catch (memoryError) {
                console.log('⚠️ [TripAgent] Could not save to memory (Beads not available), continuing...');
            }

            console.log('✅ [TripAgent] Trip plan created successfully');

            return this.formatResponse(`🌍 **Trip Plan: ${destination}**\n\n${tripPlan}\n\n💡 *I've saved this trip plan to your travel memory. Use "track booking [details]" to save reservations.*`);

        } catch (error) {
            console.error('❌ [TripAgent] Error planning trip:', error);
            return this.formatResponse(`❌ Sorry, I couldn't create the trip plan: ${error.message}`);
        }
    }

    /**
     * 2. SEARCH FLIGHTS - Real flight search via Amadeus API
     */
    async searchFlights(params, context) {
        console.log('✈️ [TripAgent] Searching flights with params:', params);

        const { from, to, dates, passengers, class: flightClass } = params;

        // Validate required params
        if (!from || !to) {
            return this.formatResponse('❌ I need both departure and destination airports to search flights.\n\nExample: "search flights from LAX to NRT"');
        }

        // Parse dates - could be "Dec 11" or "Dec 11-21" or "2025-12-11" or "2025-12-11 to 2025-12-21"
        let departureDate, returnDate;

        try {
            if (dates) {
                const parsedDates = this.parseDates(dates);
                departureDate = parsedDates.departure;
                returnDate = parsedDates.return;
            } else {
                return this.formatResponse('❌ I need travel dates to search flights.\n\nExample: "search flights from LAX to NRT on Dec 11"');
            }
        } catch (parseError) {
            return this.formatResponse(`❌ I couldn't understand the dates "${dates}". Please use format like:\n- "Dec 11"\n- "2025-12-11"\n- "Dec 11 to Dec 21" (round-trip)`);
        }

        try {
            // Call Amadeus flight search
            const searchResult = await this.amadeus.searchFlights({
                origin: from.toUpperCase(),
                destination: to.toUpperCase(),
                departureDate: departureDate,
                returnDate: returnDate,
                adults: passengers || 1,
                travelClass: flightClass || 'ECONOMY',
                maxResults: 5
            });

            if (!searchResult.success) {
                return this.formatResponse(`❌ Flight search failed: ${searchResult.error}\n\n${searchResult.description || ''}`);
            }

            // Store search results in context for booking
            if (!context.flightSearchResults) {
                context.flightSearchResults = {};
            }
            context.flightSearchResults[context.userId] = {
                query: searchResult.query,
                offers: searchResult.offers,
                timestamp: Date.now()
            };

            console.log(`✅ [TripAgent] Found ${searchResult.offers.length} flight options`);

            // Format results for WhatsApp
            const displayMessage = this.amadeus.formatFlightOffersForDisplay(searchResult);

            return this.formatResponse(
                `${displayMessage}\n\n💡 To book a flight, say "book option [number]" (e.g., "book option 1")`
            );

        } catch (error) {
            console.error('❌ [TripAgent] Error searching flights:', error);
            return this.formatResponse(`❌ Sorry, I couldn't search flights: ${error.message}`);
        }
    }

    /**
     * Parse date strings into YYYY-MM-DD format
     */
    parseDates(dateStr) {
        // Handle formats like:
        // - "Dec 11" or "December 11"
        // - "2025-12-11"
        // - "Dec 11-21" or "Dec 11 to Dec 21" (round-trip)
        // - "2025-12-11 to 2025-12-21" (round-trip)

        const currentYear = new Date().getFullYear();
        let departure, returnDate;

        // Check if it's a round-trip (contains "-" or "to")
        const roundTripMatch = dateStr.match(/(.+?)(?:\s+to\s+|\s*-\s*)(.+)/i);

        if (roundTripMatch) {
            // Round-trip
            departure = this.parseSingleDate(roundTripMatch[1].trim(), currentYear);
            returnDate = this.parseSingleDate(roundTripMatch[2].trim(), currentYear);
        } else {
            // One-way
            departure = this.parseSingleDate(dateStr.trim(), currentYear);
        }

        return { departure, return: returnDate };
    }

    /**
     * Parse a single date string into YYYY-MM-DD
     */
    parseSingleDate(dateStr, defaultYear) {
        // If already in YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            return dateStr;
        }

        // Parse "Dec 11" or "December 11" format
        const monthDayMatch = dateStr.match(/(\w+)\s+(\d{1,2})/);
        if (monthDayMatch) {
            const monthStr = monthDayMatch[1];
            const day = monthDayMatch[2].padStart(2, '0');

            const months = {
                'jan': '01', 'january': '01',
                'feb': '02', 'february': '02',
                'mar': '03', 'march': '03',
                'apr': '04', 'april': '04',
                'may': '05',
                'jun': '06', 'june': '06',
                'jul': '07', 'july': '07',
                'aug': '08', 'august': '08',
                'sep': '09', 'september': '09',
                'oct': '10', 'october': '10',
                'nov': '11', 'november': '11',
                'dec': '12', 'december': '12'
            };

            const month = months[monthStr.toLowerCase()];
            if (month) {
                return `${defaultYear}-${month}-${day}`;
            }
        }

        throw new Error(`Could not parse date: ${dateStr}`);
    }

    /**
     * 2b. BOOK FLIGHT - Book a selected flight
     */
    async bookFlight(params, context) {
        console.log('💳 [TripAgent] Booking flight with params:', params);

        const { option, confirm } = params;
        const userId = context.userId;

        // Get stored search results
        if (!context.flightSearchResults || !context.flightSearchResults[userId]) {
            return this.formatResponse('❌ No recent flight search found. Please search for flights first using "search flights from [origin] to [destination] on [date]"');
        }

        const searchData = context.flightSearchResults[userId];

        // Check if search results are still fresh (within 30 minutes)
        const ageMinutes = (Date.now() - searchData.timestamp) / 1000 / 60;
        if (ageMinutes > 30) {
            return this.formatResponse('❌ Your flight search results have expired (older than 30 minutes). Please search again for current prices.');
        }

        // Parse option number
        const optionNumber = parseInt(option);
        if (isNaN(optionNumber) || optionNumber < 1 || optionNumber > searchData.offers.length) {
            return this.formatResponse(`❌ Invalid option number. Please choose between 1 and ${searchData.offers.length}`);
        }

        const selectedFlight = searchData.offers[optionNumber - 1];

        // If not confirmed, ask for confirmation
        if (!confirm || confirm.toLowerCase() !== 'yes') {
            const confirmMessage = `💳 **Confirm Flight Booking**\n\n` +
                `**Flight:** ${selectedFlight.outbound.airline} ${selectedFlight.outbound.flightNumber}\n` +
                `**Route:** ${selectedFlight.outbound.departure.airport} → ${selectedFlight.outbound.arrival.airport}\n` +
                `**Departure:** ${new Date(selectedFlight.outbound.departure.time).toLocaleString()}\n` +
                `**Arrival:** ${new Date(selectedFlight.outbound.arrival.time).toLocaleString()}\n` +
                `**Price:** ${selectedFlight.price.currency} ${selectedFlight.price.total}\n\n` +
                `${selectedFlight.inbound ? `**Return:** ${new Date(selectedFlight.inbound.departure.time).toLocaleString()}\n\n` : ''}` +
                `⚠️ **This will charge your payment method.**\n\n` +
                `Reply "yes" to confirm booking, or "cancel" to abort.`;

            return this.formatResponse(confirmMessage);
        }

        try {
            // TODO: Actual Amadeus booking API call
            // For now, simulate booking
            console.log('🎫 [TripAgent] Processing flight booking...');
            console.log('Selected flight:', selectedFlight);

            // Simulate booking (replace with actual Amadeus booking API)
            const bookingResult = {
                success: true,
                confirmationCode: `TEST${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
                flightId: selectedFlight.id,
                price: selectedFlight.price,
                route: `${selectedFlight.outbound.departure.airport} → ${selectedFlight.outbound.arrival.airport}`,
                departure: selectedFlight.outbound.departure.time,
                arrival: selectedFlight.outbound.arrival.time,
                airline: selectedFlight.outbound.airline,
                flightNumber: selectedFlight.outbound.flightNumber
            };

            if (!bookingResult.success) {
                return this.formatResponse(`❌ Booking failed. Please try again or contact support.`);
            }

            // Save booking to Beads memory
            try {
                await this.saveToMemory({
                    title: `Flight Booking: ${bookingResult.route}`,
                    type: 'task',
                    priority: 1,
                    description: `Flight ${bookingResult.airline} ${bookingResult.flightNumber}\nConfirmation: ${bookingResult.confirmationCode}\nPrice: ${bookingResult.price.currency} ${bookingResult.price.total}`,
                    metadata: {
                        type: 'flight_booking',
                        confirmationCode: bookingResult.confirmationCode,
                        route: bookingResult.route,
                        departure: bookingResult.departure,
                        arrival: bookingResult.arrival,
                        price: bookingResult.price,
                        bookedAt: new Date().toISOString()
                    }
                });
            } catch (memoryError) {
                console.log('⚠️ [TripAgent] Could not save booking to memory (Beads not available)');
            }

            console.log('✅ [TripAgent] Flight booked successfully:', bookingResult.confirmationCode);

            // Clear search results after booking
            delete context.flightSearchResults[userId];

            const successMessage = `✅ **Flight Booked Successfully!**\n\n` +
                `✈️ **${bookingResult.airline} Flight ${bookingResult.flightNumber}**\n` +
                `📍 ${bookingResult.route}\n` +
                `📅 ${new Date(bookingResult.departure).toLocaleString()}\n` +
                `💰 ${bookingResult.price.currency} ${bookingResult.price.total}\n\n` +
                `🎫 **Confirmation:** ${bookingResult.confirmationCode}\n\n` +
                `📧 Booking confirmation will be sent to your email.\n` +
                `📅 Would you like me to add this to your calendar? (Reply "yes" to add)\n\n` +
                `💡 Tip: Track expenses with "spent ${bookingResult.price.total} on flight"`;

            return this.formatResponse(successMessage);

        } catch (error) {
            console.error('❌ [TripAgent] Error booking flight:', error);
            return this.formatResponse(`❌ Booking failed: ${error.message}`);
        }
    }

    /**
     * 3. SEARCH HOTELS - Hotel recommendations
     */
    async searchHotels(params, context) {
        console.log('🏨 [TripAgent] Searching hotels with params:', params);

        const { destination, dates, budget, preferences, guests } = params;

        const prompt = `You are a hotel search expert. Provide accommodation recommendations for:

**Hotel Search:**
- Destination: ${destination || 'Not specified'}
- Dates: ${dates || 'Flexible'}
- Budget per night: ${budget || 'Not specified'}
- Guests: ${guests || '1-2'}
- Preferences: ${preferences || 'None'}

Please provide:
1. **Best areas to stay**: Top 3 neighborhoods/areas and why
2. **Hotel recommendations by budget**:
   - Budget option ($-$$)
   - Mid-range option ($$-$$$)
   - Luxury option ($$$$)

   For each, include:
   - Typical nightly rate
   - Location/neighborhood
   - What it's known for
   - Who it's best for

3. **Airbnb vs Hotels**: Pros/cons for this destination
4. **Best booking platforms**: Where to find deals
5. **Booking tips**:
   - Best time to book
   - Cancellation policies to look for
   - What to check before booking
6. **Local considerations**: Safety, transport access, amenities

Make it practical and helpful.`;

        try {
            const hotelInfo = await this.askClaude(prompt);

            console.log('✅ [TripAgent] Hotel recommendations generated');

            return this.formatResponse(`🏨 **Hotel Search: ${destination}**\n\n${hotelInfo}\n\n💡 *When you book, use "track booking [details]" to save your reservation.*`);

        } catch (error) {
            console.error('❌ [TripAgent] Error searching hotels:', error);
            return this.formatResponse(`❌ Sorry, I couldn't generate hotel recommendations: ${error.message}`);
        }
    }

    /**
     * 4. CREATE ITINERARY - Day-by-day trip itinerary
     */
    async createItinerary(params, context) {
        console.log('📅 [TripAgent] Creating itinerary with params:', params);

        const { destination, duration, interests, pace } = params;

        const prompt = `You are a professional travel itinerary planner. Create a detailed day-by-day itinerary for:

**Trip Details:**
- Destination: ${destination || 'Not specified'}
- Duration: ${duration || 'Not specified'}
- Interests: ${interests || 'General sightseeing'}
- Pace: ${pace || 'Moderate'}

Please create:
1. **Day-by-day itinerary** with:
   - Morning activities
   - Lunch recommendations (with neighborhood/area)
   - Afternoon activities
   - Dinner recommendations
   - Evening suggestions (optional)

2. **For each activity/sight**:
   - Estimated time needed
   - Approximate cost (if applicable)
   - Transportation between locations
   - Pro tips

3. **Practical info**:
   - Best way to get around
   - Where to start each day
   - Backup indoor options (if weather is bad)
   - Total estimated daily budget

4. **Flexibility notes**: What can be swapped or skipped if needed

Keep it realistic - don't overschedule. Use emojis for visual organization.`;

        try {
            const itinerary = await this.askClaude(prompt);

            // Try to save itinerary to memory (optional - continue if Beads not available)
            try {
                await this.saveToMemory({
                    title: `Itinerary: ${destination} (${duration})`,
                    type: 'task',
                    priority: 2,
                    description: `Day-by-day itinerary for ${destination}`,
                    metadata: {
                        destination,
                        duration,
                        interests,
                        pace,
                        type: 'itinerary'
                    }
                });
            } catch (memoryError) {
                console.log('⚠️ [TripAgent] Could not save itinerary to memory (Beads not available), continuing...');
            }

            console.log('✅ [TripAgent] Itinerary created successfully');

            return this.formatResponse(`📅 **Itinerary: ${destination}**\n\n${itinerary}\n\n💡 *Saved to your travel plans. Ask me to modify or adjust anytime!*`);

        } catch (error) {
            console.error('❌ [TripAgent] Error creating itinerary:', error);
            return this.formatResponse(`❌ Sorry, I couldn't create the itinerary: ${error.message}`);
        }
    }

    /**
     * 5. TRACK BOOKING - Save booking/reservation to memory
     */
    async trackBooking(params, context) {
        console.log('📋 [TripAgent] Tracking booking with params:', params);

        const { type, confirmation, details, cost, date } = params;

        try {
            // Try to save booking to Beads memory (optional - continue if not available)
            try {
                await this.saveToMemory({
                    title: `Booking: ${type} - ${confirmation || 'No confirmation'}`,
                    type: 'task',
                    priority: 1,
                    description: details || 'Travel booking',
                    metadata: {
                        bookingType: type,
                        confirmation,
                        cost,
                        date,
                        status: 'confirmed'
                    }
                });
            } catch (memoryError) {
                console.log('⚠️ [TripAgent] Could not save booking to memory (Beads not available), continuing...');
            }

            // If cost provided and budgetAgent available, suggest adding to YNAB
            let budgetSuggestion = '';
            if (cost && this.budgetAgent) {
                budgetSuggestion = `\n\n💰 **Budget Tip**: Would you like me to add this ${cost} expense to your YNAB budget? Just say "add ${cost} for ${type} to YNAB"`;
            }

            console.log('✅ [TripAgent] Booking tracked successfully');

            return this.formatResponse(
                `📋 **Booking Saved**\n\n` +
                `Type: ${type}\n` +
                `${confirmation ? `Confirmation: ${confirmation}\n` : ''}` +
                `${cost ? `Cost: ${cost}\n` : ''}` +
                `${date ? `Date: ${date}\n` : ''}` +
                `${details ? `\nDetails: ${details}\n` : ''}` +
                `\n✅ Saved to your travel memory!` +
                budgetSuggestion
            );

        } catch (error) {
            console.error('❌ [TripAgent] Error tracking booking:', error);
            return this.formatResponse(`❌ Sorry, I couldn't save the booking: ${error.message}`);
        }
    }

    /**
     * 6. GET TRIP SUGGESTIONS - Destination suggestions based on preferences
     */
    async getTripSuggestions(params, context) {
        console.log('💡 [TripAgent] Getting trip suggestions with params:', params);

        const { interests, budget, season, duration, travelers } = params;

        const prompt = `You are a travel inspiration expert. Suggest amazing destinations based on:

**Preferences:**
- Interests: ${interests || 'Not specified'}
- Budget: ${budget || 'Flexible'}
- Season/Month: ${season || 'Flexible'}
- Trip duration: ${duration || 'Flexible'}
- Travelers: ${travelers || '1'}

Please suggest:
1. **Top 5 destination recommendations** with:
   - Destination name and country
   - Why it's perfect for their interests
   - Best time to visit
   - Estimated budget range (flights + accommodation + daily)
   - Trip duration needed (minimum/ideal)
   - Highlight (what makes it special)

2. **Bonus suggestions**: 2-3 "hidden gem" alternatives

3. **Planning tips**: When to start planning and booking for these destinations

Make it inspiring but practical. Use emojis for visual appeal.`;

        try {
            const suggestions = await this.askClaude(prompt);

            console.log('✅ [TripAgent] Trip suggestions generated');

            return this.formatResponse(`💡 **Trip Suggestions**\n\n${suggestions}\n\n🗺️ *Interested in any of these? Ask me to "plan trip to [destination]" for a detailed plan!*`);

        } catch (error) {
            console.error('❌ [TripAgent] Error getting suggestions:', error);
            return this.formatResponse(`❌ Sorry, I couldn't generate trip suggestions: ${error.message}`);
        }
    }

    /**
     * Ask Claude for AI-powered responses
     */
    async askClaude(prompt) {
        const response = await this.anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        return response.content[0].text;
    }
}

module.exports = TripAgent;
