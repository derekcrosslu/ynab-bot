/**
 * Amadeus MCP Server - Flight Search & Booking
 *
 * Provides MCP tools for:
 * - Searching flights
 * - Booking flights (future)
 * - Getting flight details
 *
 * Amadeus API Docs: https://developers.amadeus.com/self-service/category/flights
 */

const Amadeus = require('amadeus');

class AmadeusMCPServer {
    constructor() {
        this.amadeus = null;
        this.initialized = false;
    }

    /**
     * Initialize Amadeus client
     */
    async initialize(apiKey, apiSecret) {
        try {
            this.amadeus = new Amadeus({
                clientId: apiKey,
                clientSecret: apiSecret
            });
            this.initialized = true;
            console.log('✅ Amadeus MCP Server initialized');
            return { success: true };
        } catch (error) {
            console.error('❌ Failed to initialize Amadeus:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Search for flights
     * @param {Object} params
     * @param {string} params.origin - Origin airport code (e.g., LAX)
     * @param {string} params.destination - Destination airport code (e.g., NRT)
     * @param {string} params.departureDate - Departure date (YYYY-MM-DD)
     * @param {string} params.returnDate - Return date (optional, for round-trip)
     * @param {number} params.adults - Number of adult passengers (default: 1)
     * @param {string} params.travelClass - ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST
     * @param {number} params.maxResults - Max number of results (default: 5)
     */
    async searchFlights(params) {
        if (!this.initialized) {
            return { error: 'Amadeus not initialized. Call initialize() first.' };
        }

        try {
            const {
                origin,
                destination,
                departureDate,
                returnDate,
                adults = 1,
                travelClass = 'ECONOMY',
                maxResults = 5
            } = params;

            console.log(`🔍 Searching flights: ${origin} → ${destination} on ${departureDate}`);

            // Build search parameters
            const searchParams = {
                originLocationCode: origin,
                destinationLocationCode: destination,
                departureDate: departureDate,
                adults: adults,
                travelClass: travelClass,
                max: maxResults
            };

            // Add return date if round-trip
            if (returnDate) {
                searchParams.returnDate = returnDate;
            }

            // Call Amadeus API
            const response = await this.amadeus.shopping.flightOffersSearch.get(searchParams);

            // Parse and format results
            const offers = response.data.map((offer, index) => {
                const outbound = offer.itineraries[0]; // First itinerary (outbound)
                const inbound = offer.itineraries[1]; // Second itinerary (return, if exists)

                const firstSegment = outbound.segments[0];
                const lastSegment = outbound.segments[outbound.segments.length - 1];

                return {
                    id: offer.id,
                    index: index + 1,
                    price: {
                        total: offer.price.total,
                        currency: offer.price.currency
                    },
                    outbound: {
                        departure: {
                            airport: firstSegment.departure.iataCode,
                            time: firstSegment.departure.at
                        },
                        arrival: {
                            airport: lastSegment.arrival.iataCode,
                            time: lastSegment.arrival.at
                        },
                        duration: outbound.duration,
                        stops: outbound.segments.length - 1,
                        airline: firstSegment.carrierCode,
                        flightNumber: firstSegment.number
                    },
                    inbound: inbound ? {
                        departure: {
                            airport: inbound.segments[0].departure.iataCode,
                            time: inbound.segments[0].departure.at
                        },
                        arrival: {
                            airport: inbound.segments[inbound.segments.length - 1].arrival.iataCode,
                            time: inbound.segments[inbound.segments.length - 1].arrival.at
                        },
                        duration: inbound.duration,
                        stops: inbound.segments.length - 1,
                        airline: inbound.segments[0].carrierCode,
                        flightNumber: inbound.segments[0].number
                    } : null,
                    numberOfBookableSeats: offer.numberOfBookableSeats,
                    validatingAirlineCodes: offer.validatingAirlineCodes
                };
            });

            console.log(`✅ Found ${offers.length} flight options`);

            return {
                success: true,
                query: {
                    origin,
                    destination,
                    departureDate,
                    returnDate: returnDate || null,
                    passengers: adults,
                    class: travelClass
                },
                offers: offers
            };

        } catch (error) {
            console.error('❌ Flight search failed:', error.message);
            return {
                success: false,
                error: error.message,
                description: error.description || 'Unknown error'
            };
        }
    }

    /**
     * Get flight offer details by ID
     */
    async getFlightOffer(offerId) {
        if (!this.initialized) {
            return { error: 'Amadeus not initialized' };
        }

        try {
            const response = await this.amadeus.shopping.flightOffers.get({
                flightOffersIds: offerId
            });

            return {
                success: true,
                offer: response.data
            };
        } catch (error) {
            console.error('❌ Failed to get flight offer:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Search one-way flights
     */
    async searchOneWayFlights(origin, destination, date, adults = 1, maxResults = 5) {
        return await this.searchFlights({
            origin,
            destination,
            departureDate: date,
            adults,
            maxResults
        });
    }

    /**
     * Search round-trip flights
     */
    async searchRoundTripFlights(origin, destination, departureDate, returnDate, adults = 1, maxResults = 5) {
        return await this.searchFlights({
            origin,
            destination,
            departureDate,
            returnDate,
            adults,
            maxResults
        });
    }

    /**
     * Format flight offers for display
     */
    formatFlightOffersForDisplay(searchResult) {
        if (!searchResult.success) {
            return `❌ Search failed: ${searchResult.error}`;
        }

        const { query, offers } = searchResult;

        let message = `✈️ **Flights: ${query.origin} → ${query.destination}**\n\n`;
        message += `📅 Departure: ${query.departureDate}\n`;
        if (query.returnDate) {
            message += `📅 Return: ${query.returnDate}\n`;
        }
        message += `👥 Passengers: ${query.passengers}\n`;
        message += `💺 Class: ${query.class}\n\n`;

        if (offers.length === 0) {
            return message + '❌ No flights found';
        }

        message += `**${offers.length} Options:**\n\n`;

        offers.forEach(offer => {
            message += `**${offer.index}. ${offer.outbound.airline} ${offer.outbound.flightNumber}** - ${offer.price.currency} ${offer.price.total}\n`;
            message += `   Depart: ${offer.outbound.departure.airport} at ${new Date(offer.outbound.departure.time).toLocaleString()}\n`;
            message += `   Arrive: ${offer.outbound.arrival.airport} at ${new Date(offer.outbound.arrival.time).toLocaleString()}\n`;
            message += `   Duration: ${offer.outbound.duration}, Stops: ${offer.outbound.stops}\n`;

            if (offer.inbound) {
                message += `   Return: ${offer.inbound.departure.airport} at ${new Date(offer.inbound.departure.time).toLocaleString()}\n`;
                message += `   Arrive: ${offer.inbound.arrival.airport} at ${new Date(offer.inbound.arrival.time).toLocaleString()}\n`;
            }
            message += `\n`;
        });

        return message;
    }
}

// Export singleton instance
module.exports = new AmadeusMCPServer();
