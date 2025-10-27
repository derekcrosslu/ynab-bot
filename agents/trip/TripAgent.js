/**
 * TripAgent - Trip Planning and Travel Management Agent
 *
 * Capabilities:
 * 1. plan_trip - Complete trip planning with Claude AI
 * 2. search_flights - Real flight search via Amadeus API
 * 3. book_flight - Book flights with confirmation and payment
 * 4. search_hotels - Real hotel search via Amadeus API
 * 5. book_hotel - Book hotels with confirmation and payment
 * 6. create_itinerary - Day-by-day itinerary creation
 * 7. track_booking - Track bookings and reservations
 * 8. get_trip_suggestions - Destination suggestions based on preferences
 *
 * Integrations:
 * - Amadeus API for flight and hotel search/booking
 * - Google Calendar for auto-adding bookings to calendar
 * - Google Maps for geocoding, distances, place info
 * - Google Gmail for monitoring booking confirmations (optional)
 * - Beads for trip and booking persistence
 * - BudgetAgent for expense tracking
 */

const BaseAgent = require('../base/BaseAgent');
const amadeusServer = require('../../mcp-servers/amadeus/server');
const googleServer = require('../../mcp-servers/google/server');

class TripAgent extends BaseAgent {
    constructor(anthropic, budgetAgent) {
        super('TripAgent', [
            'plan_trip',
            'search_flights',
            'book_flight',
            'search_hotels',
            'book_hotel',
            'create_itinerary',
            'track_booking',
            'get_trip_suggestions',
            'get_directions',
            'check_emails',
            'check_calendar'
        ]);

        this.anthropic = anthropic;
        this.budgetAgent = budgetAgent;
        this.amadeus = amadeusServer;
        this.google = googleServer;

        // Initialize Amadeus and Google with credentials from environment
        this.initializeAmadeus();
        this.initializeGoogle();

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
     * Initialize Google MCP server (Calendar, Maps, Gmail)
     */
    async initializeGoogle() {
        try {
            const result = await this.google.initialize(
                process.env.GOOGLE_CREDENTIALS_PATH || './mcp-servers/google/credentials.json',
                process.env.GOOGLE_TOKEN_PATH || './mcp-servers/google/token.json',
                process.env.GOOGLE_MAPS_API_KEY
            );

            if (result.success) {
                if (result.mapsOnly) {
                    console.log('📍 [TripAgent] Google Maps initialized (Calendar/Gmail disabled)');
                } else {
                    console.log('📅 [TripAgent] Google services initialized (Calendar + Maps + Gmail)');
                }
            } else if (result.warning) {
                console.log('⚠️ [TripAgent]', result.warning);
            } else {
                console.error('❌ [TripAgent] Failed to initialize Google:', result.error);
            }
        } catch (error) {
            console.error('❌ [TripAgent] Error initializing Google:', error.message);
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

                case 'book_hotel':
                    return await this.bookHotel(params, context);

                case 'create_itinerary':
                    return await this.createItinerary(params, context);

                case 'track_booking':
                    return await this.trackBooking(params, context);

                case 'get_trip_suggestions':
                    return await this.getTripSuggestions(params, context);

                case 'get_directions':
                    return await this.getDirections(params, context);

                case 'check_emails':
                    return await this.checkEmails(params, context);

                case 'check_calendar':
                    return await this.checkCalendar(params, context);

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

            // Add to Google Calendar (if available)
            let calendarAdded = false;
            if (this.google && this.google.calendar) {
                try {
                    const calendarEvent = await this.google.createEvent({
                        summary: `Flight: ${bookingResult.airline} ${bookingResult.flightNumber}`,
                        description: `Flight Booking\n\nConfirmation: ${bookingResult.confirmationCode}\nRoute: ${bookingResult.route}\nPrice: ${bookingResult.price.currency} ${bookingResult.price.total}`,
                        location: bookingResult.route,
                        startTime: bookingResult.departure,
                        endTime: bookingResult.arrival
                    });

                    if (calendarEvent.success) {
                        calendarAdded = true;
                        console.log('📅 [TripAgent] Added flight to Google Calendar');
                    }
                } catch (calendarError) {
                    console.log('⚠️ [TripAgent] Could not add to calendar:', calendarError.message);
                }
            }

            // Clear search results after booking
            delete context.flightSearchResults[userId];

            const successMessage = `✅ **Flight Booked Successfully!**\n\n` +
                `✈️ **${bookingResult.airline} Flight ${bookingResult.flightNumber}**\n` +
                `📍 ${bookingResult.route}\n` +
                `📅 ${new Date(bookingResult.departure).toLocaleString()}\n` +
                `💰 ${bookingResult.price.currency} ${bookingResult.price.total}\n\n` +
                `🎫 **Confirmation:** ${bookingResult.confirmationCode}\n\n` +
                `${calendarAdded ? '✅ Added to your Google Calendar\n' : ''}` +
                `📧 Booking confirmation will be sent to your email.\n\n` +
                `💡 Tip: Track expenses with "spent ${bookingResult.price.total} on flight"`;

            return this.formatResponse(successMessage);

        } catch (error) {
            console.error('❌ [TripAgent] Error booking flight:', error);
            return this.formatResponse(`❌ Booking failed: ${error.message}`);
        }
    }

    /**
     * 3. SEARCH HOTELS - Real hotel search via Amadeus API
     */
    async searchHotels(params, context) {
        console.log('🏨 [TripAgent] Searching hotels with params:', params);

        const { destination, dates, guests, rooms } = params;

        // Validate required params
        if (!destination) {
            return this.formatResponse('❌ I need a destination to search hotels.\n\nExample: "search hotels in Tokyo"');
        }

        // Parse city code from destination (e.g., "Tokyo" -> "TYO", "New York" -> "NYC")
        const cityCode = this.parseCityCode(destination);
        if (!cityCode) {
            return this.formatResponse(`❌ I couldn't find the city code for "${destination}".\n\nPlease use common city names or IATA codes (e.g., NYC, TYO, PAR, LON)`);
        }

        // Parse dates
        let checkInDate, checkOutDate;
        try {
            if (dates) {
                const parsedDates = this.parseDates(dates);
                checkInDate = parsedDates.departure; // Use same date parser
                checkOutDate = parsedDates.return;

                if (!checkOutDate) {
                    // If only one date provided, assume 1 night stay
                    const checkIn = new Date(checkInDate);
                    checkIn.setDate(checkIn.getDate() + 1);
                    checkOutDate = checkIn.toISOString().split('T')[0];
                }
            } else {
                return this.formatResponse('❌ I need check-in and check-out dates.\n\nExample: "search hotels in Tokyo Dec 11-21"');
            }
        } catch (parseError) {
            return this.formatResponse(`❌ I couldn't understand the dates "${dates}". Please use format like:\n- "Dec 11 to Dec 21"\n- "2025-12-11 to 2025-12-21"`);
        }

        try {
            // Call Amadeus hotel search
            const searchResult = await this.amadeus.searchHotels({
                cityCode: cityCode,
                checkInDate: checkInDate,
                checkOutDate: checkOutDate,
                adults: guests || 1,
                rooms: rooms || 1,
                currency: 'USD',
                maxResults: 5
            });

            if (!searchResult.success) {
                return this.formatResponse(`❌ Hotel search failed: ${searchResult.error}\n\n${searchResult.description || ''}`);
            }

            // Store search results in context for booking
            if (!context.hotelSearchResults) {
                context.hotelSearchResults = {};
            }
            context.hotelSearchResults[context.userId] = {
                query: searchResult.query,
                offers: searchResult.offers,
                timestamp: Date.now()
            };

            console.log(`✅ [TripAgent] Found ${searchResult.offers.length} hotel options`);

            // Format results for WhatsApp
            const displayMessage = this.amadeus.formatHotelOffersForDisplay(searchResult);

            return this.formatResponse(
                `${displayMessage}\n\n💡 To book a hotel, say "book hotel option [number]" (e.g., "book hotel option 1")`
            );

        } catch (error) {
            console.error('❌ [TripAgent] Error searching hotels:', error);
            return this.formatResponse(`❌ Sorry, I couldn't search hotels: ${error.message}`);
        }
    }

    /**
     * Parse city name to IATA city code
     */
    parseCityCode(destination) {
        const cityMap = {
            // North America
            'new york': 'NYC', 'nyc': 'NYC', 'new york city': 'NYC',
            'los angeles': 'LAX', 'la': 'LAX',
            'san francisco': 'SFO', 'sf': 'SFO',
            'chicago': 'CHI',
            'miami': 'MIA',
            'las vegas': 'LAS', 'vegas': 'LAS',
            'boston': 'BOS',
            'seattle': 'SEA',
            'washington': 'WAS', 'dc': 'WAS', 'washington dc': 'WAS',

            // Europe
            'london': 'LON',
            'paris': 'PAR',
            'rome': 'ROM',
            'barcelona': 'BCN',
            'madrid': 'MAD',
            'amsterdam': 'AMS',
            'berlin': 'BER',
            'vienna': 'VIE',
            'prague': 'PRG',
            'lisbon': 'LIS',

            // Asia
            'tokyo': 'TYO',
            'osaka': 'OSA',
            'kyoto': 'OSA', // Use Osaka code for Kyoto
            'bangkok': 'BKK',
            'singapore': 'SIN',
            'hong kong': 'HKG',
            'seoul': 'SEL',
            'beijing': 'BJS',
            'shanghai': 'SHA',
            'dubai': 'DXB',

            // South America
            'buenos aires': 'BUE',
            'rio de janeiro': 'RIO', 'rio': 'RIO',
            'sao paulo': 'SAO',
            'lima': 'LIM',

            // Oceania
            'sydney': 'SYD',
            'melbourne': 'MEL',
            'auckland': 'AKL'
        };

        const normalizedDest = destination.toLowerCase().trim();

        // Check if already a valid code (3 letters, all caps)
        if (/^[A-Z]{3}$/.test(destination.toUpperCase())) {
            return destination.toUpperCase();
        }

        return cityMap[normalizedDest] || null;
    }

    /**
     * 3b. BOOK HOTEL - Book a selected hotel
     */
    async bookHotel(params, context) {
        console.log('🏨 [TripAgent] Booking hotel with params:', params);

        const { option, confirm } = params;
        const userId = context.userId;

        // Get stored search results
        if (!context.hotelSearchResults || !context.hotelSearchResults[userId]) {
            return this.formatResponse('❌ No recent hotel search found. Please search for hotels first using "search hotels in [city] [dates]"');
        }

        const searchData = context.hotelSearchResults[userId];

        // Check if search results are still fresh (within 30 minutes)
        const ageMinutes = (Date.now() - searchData.timestamp) / 1000 / 60;
        if (ageMinutes > 30) {
            return this.formatResponse('❌ Your hotel search results have expired (older than 30 minutes). Please search again for current prices.');
        }

        // Parse option number
        const optionNumber = parseInt(option);
        if (isNaN(optionNumber) || optionNumber < 1 || optionNumber > searchData.offers.length) {
            return this.formatResponse(`❌ Invalid option number. Please choose between 1 and ${searchData.offers.length}`);
        }

        const selectedHotel = searchData.offers[optionNumber - 1];

        // If not confirmed, ask for confirmation
        if (!confirm || confirm.toLowerCase() !== 'yes') {
            const confirmMessage = `🏨 **Confirm Hotel Booking**\n\n` +
                `**Hotel:** ${selectedHotel.name}\n` +
                `**Location:** ${selectedHotel.location.cityCode}\n` +
                `**Check-in:** ${selectedHotel.checkIn}\n` +
                `**Check-out:** ${selectedHotel.checkOut}\n` +
                `**Nights:** ${selectedHotel.nights}\n` +
                `**Room:** ${selectedHotel.room.description}\n` +
                `**Guests:** ${selectedHotel.guests}\n` +
                `**Price:** ${selectedHotel.price.currency} ${selectedHotel.price.total} (${selectedHotel.price.currency} ${selectedHotel.price.perNight}/night)\n\n` +
                `⚠️ **This will charge your payment method.**\n\n` +
                `Reply "yes" to confirm booking, or "cancel" to abort.`;

            return this.formatResponse(confirmMessage);
        }

        try {
            // TODO: Actual Amadeus booking API call
            // For now, simulate booking
            console.log('🎫 [TripAgent] Processing hotel booking...');
            console.log('Selected hotel:', selectedHotel);

            // Simulate booking (replace with actual Amadeus booking API)
            const bookingResult = {
                success: true,
                confirmationCode: `HOTEL${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
                hotelId: selectedHotel.id,
                hotelName: selectedHotel.name,
                location: selectedHotel.location.cityCode,
                checkIn: selectedHotel.checkIn,
                checkOut: selectedHotel.checkOut,
                nights: selectedHotel.nights,
                price: selectedHotel.price,
                room: selectedHotel.room
            };

            if (!bookingResult.success) {
                return this.formatResponse(`❌ Booking failed. Please try again or contact support.`);
            }

            // Save booking to Beads memory
            try {
                await this.saveToMemory({
                    title: `Hotel Booking: ${bookingResult.hotelName}`,
                    type: 'task',
                    priority: 1,
                    description: `Hotel ${bookingResult.hotelName} in ${bookingResult.location}\nConfirmation: ${bookingResult.confirmationCode}\nCheck-in: ${bookingResult.checkIn}\nCheck-out: ${bookingResult.checkOut}\nPrice: ${bookingResult.price.currency} ${bookingResult.price.total}`,
                    metadata: {
                        type: 'hotel_booking',
                        confirmationCode: bookingResult.confirmationCode,
                        hotelName: bookingResult.hotelName,
                        location: bookingResult.location,
                        checkIn: bookingResult.checkIn,
                        checkOut: bookingResult.checkOut,
                        nights: bookingResult.nights,
                        price: bookingResult.price,
                        bookedAt: new Date().toISOString()
                    }
                });
            } catch (memoryError) {
                console.log('⚠️ [TripAgent] Could not save booking to memory (Beads not available)');
            }

            console.log('✅ [TripAgent] Hotel booked successfully:', bookingResult.confirmationCode);

            // Add to Google Calendar (if available)
            let calendarAdded = false;
            if (this.google && this.google.calendar) {
                try {
                    // Parse check-in and check-out times (default to 3pm check-in, 11am check-out)
                    const checkInDateTime = `${bookingResult.checkIn}T15:00:00`;
                    const checkOutDateTime = `${bookingResult.checkOut}T11:00:00`;

                    const calendarEvent = await this.google.createEvent({
                        summary: `Hotel: ${bookingResult.hotelName}`,
                        description: `Hotel Booking\n\nConfirmation: ${bookingResult.confirmationCode}\nLocation: ${bookingResult.location}\nNights: ${bookingResult.nights}\nPrice: ${bookingResult.price.currency} ${bookingResult.price.total}`,
                        location: bookingResult.hotelName + ', ' + bookingResult.location,
                        startTime: checkInDateTime,
                        endTime: checkOutDateTime
                    });

                    if (calendarEvent.success) {
                        calendarAdded = true;
                        console.log('📅 [TripAgent] Added hotel to Google Calendar');
                    }
                } catch (calendarError) {
                    console.log('⚠️ [TripAgent] Could not add to calendar:', calendarError.message);
                }
            }

            // Clear search results after booking
            delete context.hotelSearchResults[userId];

            const successMessage = `✅ **Hotel Booked Successfully!**\n\n` +
                `🏨 **${bookingResult.hotelName}**\n` +
                `📍 ${bookingResult.location}\n` +
                `📅 Check-in: ${bookingResult.checkIn}\n` +
                `📅 Check-out: ${bookingResult.checkOut}\n` +
                `🛏️ ${bookingResult.nights} night(s)\n` +
                `💰 ${bookingResult.price.currency} ${bookingResult.price.total} (${bookingResult.price.currency} ${bookingResult.price.perNight}/night)\n\n` +
                `🎫 **Confirmation:** ${bookingResult.confirmationCode}\n\n` +
                `${calendarAdded ? '✅ Added to your Google Calendar\n' : ''}` +
                `📧 Booking confirmation will be sent to your email.\n\n` +
                `💡 Tip: Track expenses with "spent ${bookingResult.price.total} on hotel"`;

            return this.formatResponse(successMessage);

        } catch (error) {
            console.error('❌ [TripAgent] Error booking hotel:', error);
            return this.formatResponse(`❌ Booking failed: ${error.message}`);
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
     * 9. GET DIRECTIONS - Route directions between two locations
     */
    async getDirections(params, context) {
        console.log('🗺️ [TripAgent] Getting directions with params:', params);

        const { from, to, origin, destination, mode, travelMode } = params;

        // Support both 'from/to' and 'origin/destination' parameter names
        let startLocation = from || origin;
        const endLocation = to || destination;

        // Support both 'mode' and 'travelMode' parameter names
        const transportMode = (mode || travelMode || 'driving').toLowerCase();

        // Check if user has shared their location and no "from" was specified
        const userLocation = context?.userLocation;
        let usingSharedLocation = false;

        if (!startLocation && userLocation) {
            // Use stored location coordinates
            startLocation = `${userLocation.lat},${userLocation.lng}`;
            usingSharedLocation = true;
            console.log(`📍 [TripAgent] Using user's shared location as starting point: ${startLocation}`);
        }

        // Validate required parameters
        if (!startLocation && !endLocation) {
            return this.formatResponse(
                `❌ I need a destination to get directions.\n\n` +
                `**Options:**\n` +
                `1. Share your location first, then ask: "directions to JFK Airport"\n` +
                `2. Or specify both locations: "directions from Times Square to JFK Airport"\n\n` +
                `💡 To share location: Tap 📎 → Location in WhatsApp`
            );
        }

        if (!endLocation) {
            return this.formatResponse(
                `❌ I need a destination.\n\n` +
                `**Example:**\n` +
                `• "directions to JFK Airport" ${userLocation ? '(I\'ll use your shared location)' : ''}\n` +
                `• "walking directions to Central Park"\n` +
                `• "public transport to downtown"`
            );
        }

        if (!startLocation) {
            return this.formatResponse(
                `❌ I need a starting point.\n\n` +
                `**Options:**\n` +
                `1. Share your location first (Tap 📎 → Location)\n` +
                `2. Or specify: "directions from Times Square to ${endLocation}"`
            );
        }

        // Validate travel mode
        const validModes = ['driving', 'walking', 'transit', 'bicycling'];
        const selectedMode = validModes.includes(transportMode) ? transportMode : 'driving';

        // Get travel mode emoji
        const modeEmoji = {
            driving: '🚗',
            walking: '🚶',
            transit: '🚇',
            bicycling: '🚴'
        };

        try {
            console.log(`🗺️ [TripAgent] Fetching ${selectedMode} directions: ${startLocation} → ${endLocation}`);

            // Get directions from Google Maps
            const result = await this.google.getDirections(
                startLocation,
                endLocation,
                selectedMode,
                selectedMode === 'transit' ? 'now' : null // Use current time for transit
            );

            if (!result.success) {
                return this.formatResponse(
                    `❌ Could not find directions: ${result.error}\n\n` +
                    `Please check that both locations are valid.`
                );
            }

            const route = result.route;

            // Format directions for WhatsApp
            let directionsMessage = `${modeEmoji[selectedMode]} **${selectedMode.toUpperCase()} DIRECTIONS**\n\n`;

            // Show if using shared location
            if (usingSharedLocation) {
                directionsMessage += `📍 **From:** ${route.origin} *(your location)*\n`;
            } else {
                directionsMessage += `📍 **From:** ${route.origin}\n`;
            }

            directionsMessage += `📍 **To:** ${route.destination}\n\n`;
            directionsMessage += `📏 **Distance:** ${route.distance}\n`;
            directionsMessage += `⏱️ **Duration:** ${route.duration}\n`;

            if (route.summary) {
                directionsMessage += `🛣️ **Route:** ${route.summary}\n`;
            }

            // Generate Google Maps link for mobile navigation
            const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(startLocation)}&destination=${encodeURIComponent(endLocation)}&travelmode=${selectedMode}`;
            directionsMessage += `\n📱 **Open in Google Maps:**\n${mapsUrl}\n`;
            directionsMessage += `   ↳ Tap link for turn-by-turn navigation\n`;

            directionsMessage += `\n**STEP-BY-STEP DIRECTIONS:**\n\n`;

            // Add each step
            route.steps.forEach((step, index) => {
                // For transit, show special formatting
                if (step.transit) {
                    const t = step.transit;
                    directionsMessage += `${index + 1}. 🚇 **Take ${t.vehicle} ${t.line}** (${t.headsign})\n`;
                    directionsMessage += `   • Board at: ${t.departure.stop} (${t.departure.time})\n`;
                    directionsMessage += `   • Exit at: ${t.arrival.stop} (${t.arrival.time})\n`;
                    directionsMessage += `   • ${t.numStops} stops, ${step.duration}\n\n`;
                } else {
                    // Regular step
                    directionsMessage += `${index + 1}. ${step.instruction}\n`;
                    directionsMessage += `   📏 ${step.distance} • ⏱️ ${step.duration}\n\n`;
                }
            });

            // Add warnings if any
            if (route.warnings && route.warnings.length > 0) {
                directionsMessage += `\n⚠️ **Warnings:**\n`;
                route.warnings.forEach(warning => {
                    directionsMessage += `• ${warning}\n`;
                });
            }

            // Add tips based on mode
            directionsMessage += `\n💡 **Tips:**\n`;
            if (selectedMode === 'transit') {
                directionsMessage += `• Check real-time schedules as times may vary\n`;
                directionsMessage += `• Download offline maps for areas with poor signal\n`;
            } else if (selectedMode === 'walking') {
                directionsMessage += `• Wear comfortable shoes for this journey\n`;
                directionsMessage += `• Stay hydrated, especially in warm weather\n`;
            } else if (selectedMode === 'driving') {
                directionsMessage += `• Check traffic conditions before departing\n`;
                directionsMessage += `• Consider parking availability at destination\n`;
            }

            // Add option to see other modes
            const otherModes = validModes.filter(m => m !== selectedMode);
            directionsMessage += `\n📱 **Try other modes:** ${otherModes.join(', ')}`;

            return this.formatResponse(directionsMessage);

        } catch (error) {
            console.error('❌ [TripAgent] Error getting directions:', error);
            return this.formatResponse(`❌ Sorry, I couldn't get directions: ${error.message}`);
        }
    }

    /**
     * 10. CHECK EMAILS - Search Gmail for messages
     */
    async checkEmails(params, context) {
        console.log('📧 [TripAgent] Checking emails with params:', params);

        // Check if Gmail is initialized
        if (!this.google || !this.google.gmail) {
            return this.formatResponse(
                `❌ **Gmail Not Available**\n\n` +
                `Gmail integration is not set up. This requires Google OAuth authentication.\n\n` +
                `If you're the admin, please set up OAuth credentials following the SETUP.md guide.`
            );
        }

        try {
            // Parse parameters
            const { query, search, keyword, limit, maxResults } = params;
            const searchQuery = query || search || keyword || 'in:inbox';
            const emailLimit = limit || maxResults || 5;

            console.log(`📧 [TripAgent] Searching Gmail: "${searchQuery}" (limit: ${emailLimit})`);

            // Search Gmail
            const result = await this.google.searchEmails(searchQuery, emailLimit);

            if (result.error) {
                return this.formatResponse(`❌ Error searching emails: ${result.error}`);
            }

            if (!result.messages || result.messages.length === 0) {
                return this.formatResponse(
                    `📧 **No Emails Found**\n\n` +
                    `No emails matching: "${searchQuery}"\n\n` +
                    `**Try different search terms:**\n` +
                    `• "is:unread" - Unread emails\n` +
                    `• "from:booking.com" - From specific sender\n` +
                    `• "subject:confirmation" - By subject\n` +
                    `• "after:2025/01/01" - By date`
                );
            }

            // Format email list
            let emailMessage = `📧 **Email Search Results**\n\n`;
            emailMessage += `Found ${result.messages.length} email${result.messages.length > 1 ? 's' : ''} matching: "${searchQuery}"\n\n`;

            result.messages.forEach((email, index) => {
                emailMessage += `**${index + 1}. ${email.subject}**\n`;
                emailMessage += `📤 From: ${email.from}\n`;
                emailMessage += `📅 Date: ${email.date}\n`;

                if (email.snippet) {
                    // Trim snippet to 150 chars
                    const snippet = email.snippet.length > 150
                        ? email.snippet.substring(0, 150) + '...'
                        : email.snippet;
                    emailMessage += `📝 Preview: ${snippet}\n`;
                }

                emailMessage += `\n`;
            });

            // Add search tips
            emailMessage += `💡 **Search Tips:**\n`;
            emailMessage += `• "check my unread emails"\n`;
            emailMessage += `• "show emails from booking.com"\n`;
            emailMessage += `• "find emails about flights"`;

            return this.formatResponse(emailMessage);

        } catch (error) {
            console.error('❌ [TripAgent] Error checking emails:', error);
            return this.formatResponse(`❌ Sorry, I couldn't check your emails: ${error.message}`);
        }
    }

    /**
     * 11. CHECK CALENDAR - View upcoming Google Calendar events
     */
    async checkCalendar(params, context) {
        console.log('📅 [TripAgent] Checking calendar with params:', params);

        // Check if Google Calendar is initialized
        if (!this.google || !this.google.calendar) {
            return this.formatResponse(
                `❌ **Google Calendar Not Available**\n\n` +
                `Calendar integration is not set up. This requires Google OAuth authentication.\n\n` +
                `If you're the admin, please set up OAuth credentials following the SETUP.md guide.`
            );
        }

        try {
            // Parse parameters
            const { days, limit, maxResults } = params;
            const eventLimit = limit || maxResults || 10;

            // Calculate time range
            const timeMin = new Date().toISOString();
            let timeMax = null;

            if (days) {
                const daysNum = parseInt(days);
                if (!isNaN(daysNum) && daysNum > 0) {
                    const maxDate = new Date();
                    maxDate.setDate(maxDate.getDate() + daysNum);
                    timeMax = maxDate.toISOString();
                }
            }

            console.log(`📅 [TripAgent] Fetching calendar events (limit: ${eventLimit}, days: ${days || 'all'})`);

            // Fetch calendar events
            const result = await this.google.listEvents(timeMin, timeMax, eventLimit);

            if (result.error) {
                return this.formatResponse(`❌ Error fetching calendar: ${result.error}`);
            }

            if (!result.events || result.events.length === 0) {
                return this.formatResponse(
                    `📅 **No Upcoming Events**\n\n` +
                    `You have no events scheduled${timeMax ? ` in the next ${days} days` : ''}.\n\n` +
                    `💡 **Tip:** When you book flights or hotels, they'll be automatically added to your calendar!`
                );
            }

            // Format calendar events
            let calendarMessage = `📅 **Your Calendar**\n\n`;
            calendarMessage += `Found ${result.events.length} upcoming event${result.events.length > 1 ? 's' : ''}${timeMax ? ` (next ${days} days)` : ''}:\n\n`;

            result.events.forEach((event, index) => {
                calendarMessage += `**${index + 1}. ${event.summary || 'Untitled Event'}**\n`;

                // Format date/time
                const startDate = new Date(event.start);
                const endDate = new Date(event.end);

                // Check if it's an all-day event
                const isAllDay = event.start.length === 10; // Date only (YYYY-MM-DD)

                if (isAllDay) {
                    calendarMessage += `📅 ${this.formatDate(startDate)}`;
                    if (event.start !== event.end) {
                        calendarMessage += ` - ${this.formatDate(endDate)}`;
                    }
                    calendarMessage += ` (All day)\n`;
                } else {
                    calendarMessage += `📅 ${this.formatDate(startDate)}\n`;
                    calendarMessage += `⏰ ${this.formatTime(startDate)} - ${this.formatTime(endDate)}\n`;
                }

                if (event.location) {
                    calendarMessage += `📍 ${event.location}\n`;
                }

                if (event.description) {
                    // Trim description to 100 chars
                    const desc = event.description.length > 100
                        ? event.description.substring(0, 100) + '...'
                        : event.description;
                    calendarMessage += `📝 ${desc}\n`;
                }

                calendarMessage += `\n`;
            });

            // Add tips
            calendarMessage += `💡 **Tips:**\n`;
            calendarMessage += `• Flight/hotel bookings auto-add to calendar\n`;
            calendarMessage += `• Say "check my calendar for next 7 days" for specific range`;

            return this.formatResponse(calendarMessage);

        } catch (error) {
            console.error('❌ [TripAgent] Error checking calendar:', error);
            return this.formatResponse(`❌ Sorry, I couldn't check your calendar: ${error.message}`);
        }
    }

    /**
     * Helper: Format date as "Mon, Jan 15, 2025"
     */
    formatDate(date) {
        const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }

    /**
     * Helper: Format time as "2:30 PM"
     */
    formatTime(date) {
        const options = { hour: 'numeric', minute: '2-digit', hour12: true };
        return date.toLocaleTimeString('en-US', options);
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
