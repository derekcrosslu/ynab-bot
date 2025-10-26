/**
 * TripAgent - Trip Planning and Travel Management Agent
 *
 * Capabilities:
 * 1. plan_trip - Complete trip planning with Claude AI
 * 2. search_flights - Flight recommendations and search
 * 3. search_hotels - Hotel recommendations and search
 * 4. create_itinerary - Day-by-day itinerary creation
 * 5. track_booking - Track bookings and reservations
 * 6. get_trip_suggestions - Destination suggestions based on preferences
 */

const BaseAgent = require('../base/BaseAgent');

class TripAgent extends BaseAgent {
    constructor(anthropic, budgetAgent) {
        super('TripAgent', [
            'plan_trip',
            'search_flights',
            'search_hotels',
            'create_itinerary',
            'track_booking',
            'get_trip_suggestions'
        ]);

        this.anthropic = anthropic;
        this.budgetAgent = budgetAgent;

        console.log('🌍 [TripAgent] Initialized with capabilities:', this.capabilities);
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

            // Save trip plan to memory
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

            console.log('✅ [TripAgent] Trip plan created successfully');

            return this.formatResponse(`🌍 **Trip Plan: ${destination}**\n\n${tripPlan}\n\n💡 *I've saved this trip plan to your travel memory. Use "track booking [details]" to save reservations.*`);

        } catch (error) {
            console.error('❌ [TripAgent] Error planning trip:', error);
            return this.formatResponse(`❌ Sorry, I couldn't create the trip plan: ${error.message}`);
        }
    }

    /**
     * 2. SEARCH FLIGHTS - Flight recommendations
     */
    async searchFlights(params, context) {
        console.log('✈️ [TripAgent] Searching flights with params:', params);

        const { from, to, dates, passengers, class: flightClass } = params;

        const prompt = `You are a flight search expert. Provide flight recommendations for:

**Flight Search:**
- From: ${from || 'Not specified'}
- To: ${to || 'Not specified'}
- Dates: ${dates || 'Flexible'}
- Passengers: ${passengers || '1'}
- Class: ${flightClass || 'Economy'}

Please provide:
1. **Best booking strategy**: When to book for best prices
2. **Estimated price range**: For this route and dates
3. **Recommended airlines**: Top 3-5 airlines that fly this route
4. **Flight duration**: Typical flight time (direct vs connecting)
5. **Best booking sites**: Where to search (Google Flights, Kayak, Skyscanner, etc.)
6. **Money-saving tips**:
   - Flexible date options
   - Nearby airports
   - Best days to fly
7. **What to look for**: Baggage policies, layover times, airline reliability

Keep it practical and actionable.`;

        try {
            const flightInfo = await this.askClaude(prompt);

            console.log('✅ [TripAgent] Flight recommendations generated');

            return this.formatResponse(`✈️ **Flight Search: ${from} → ${to}**\n\n${flightInfo}\n\n💡 *When you book, use "track booking [details]" to save your confirmation.*`);

        } catch (error) {
            console.error('❌ [TripAgent] Error searching flights:', error);
            return this.formatResponse(`❌ Sorry, I couldn't generate flight recommendations: ${error.message}`);
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

            // Save itinerary to memory
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
            // Save booking to Beads memory
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
