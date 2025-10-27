/**
 * Sky-Scrapper MCP Server - Flight Search via RapidAPI
 *
 * Provides MCP tools for:
 * - Searching flights with price filtering
 * - All airlines included (no restrictions like Amadeus)
 * - Real-time data from Skyscanner
 *
 * RapidAPI: https://rapidapi.com/apiheya/api/sky-scrapper
 */

const axios = require('axios');

class SkyscrapperMCPServer {
    constructor() {
        this.apiKey = null;
        this.initialized = false;
        this.baseURL = 'https://sky-scrapper.p.rapidapi.com';
    }

    /**
     * Initialize Sky-Scrapper client with RapidAPI key
     */
    async initialize(apiKey) {
        try {
            this.apiKey = apiKey;
            this.initialized = true;
            console.log('✅ Sky-Scrapper MCP Server initialized');
            return { success: true };
        } catch (error) {
            console.error('❌ Failed to initialize Sky-Scrapper:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Search flights
     * @param {Object} params - Search parameters
     * @returns {Object} Flight search results
     */
    async searchFlights(params) {
        if (!this.initialized) {
            return {
                success: false,
                error: 'Sky-Scrapper API not initialized'
            };
        }

        const {
            origin,
            destination,
            departureDate,
            returnDate,
            adults = 1,
            travelClass = 'economy',
            maxPrice = null,
            currency = 'USD',
            maxResults = 10
        } = params;

        try {
            console.log(`🔍 Searching flights: ${origin} → ${destination} on ${departureDate}`);

            // Sky-Scrapper API uses different endpoint format
            // Note: Actual endpoint may vary - check RapidAPI docs
            const endpoint = returnDate
                ? '/api/v2/flights/searchFlightsWebComplete'
                : '/api/v2/flights/searchFlightsWebComplete';

            const requestParams = {
                originSkyId: origin,
                destinationSkyId: destination,
                originEntityId: origin,
                destinationEntityId: destination,
                date: departureDate,
                returnDate: returnDate || undefined,
                cabinClass: travelClass,
                adults: adults.toString(),
                sortBy: 'best',
                currency: currency,
                market: 'en-US',
                countryCode: 'US'
            };

            const response = await axios.get(`${this.baseURL}${endpoint}`, {
                params: requestParams,
                headers: {
                    'X-RapidAPI-Key': this.apiKey,
                    'X-RapidAPI-Host': 'sky-scrapper.p.rapidapi.com'
                },
                timeout: 30000
            });

            if (!response.data || !response.data.data) {
                return {
                    success: false,
                    error: 'No flight data returned from API'
                };
            }

            // Parse response (format varies by API version)
            const flights = this.parseFlightResults(response.data, maxPrice, maxResults);

            if (!flights || flights.length === 0) {
                return {
                    success: false,
                    error: maxPrice
                        ? `No flights found under ${currency} ${maxPrice}`
                        : 'No flights found for this route'
                };
            }

            return {
                success: true,
                offers: flights,
                query: {
                    origin,
                    destination,
                    departureDate,
                    returnDate,
                    adults,
                    travelClass,
                    maxPrice,
                    currency
                }
            };

        } catch (error) {
            console.error('❌ Sky-Scrapper flight search failed:', error.message);

            // Handle specific errors
            if (error.response) {
                const status = error.response.status;
                if (status === 429) {
                    return {
                        success: false,
                        error: 'Rate limit exceeded. Please try again in a moment.',
                        description: 'Sky-Scrapper API rate limit reached'
                    };
                } else if (status === 403) {
                    return {
                        success: false,
                        error: 'API key invalid or not authorized',
                        description: 'Check your RapidAPI subscription for Sky-Scrapper'
                    };
                }
            }

            return {
                success: false,
                error: error.message || 'Unknown error occurred',
                description: error.response?.data?.message || 'Flight search failed'
            };
        }
    }

    /**
     * Parse flight results from Sky-Scrapper response
     * @param {Object} data - API response data
     * @param {number} maxPrice - Maximum price filter
     * @param {number} maxResults - Maximum number of results
     * @returns {Array} Parsed flight offers
     */
    parseFlightResults(data, maxPrice, maxResults) {
        try {
            // Sky-Scrapper API structure (may need adjustment based on actual response)
            const itineraries = data.data?.itineraries || data.itineraries || [];

            let flights = itineraries.map((itinerary, index) => {
                const leg = itinerary.legs?.[0] || itinerary;
                const pricingOptions = itinerary.pricingOptions?.[0] || itinerary.price || {};

                const price = parseFloat(pricingOptions.price?.amount || pricingOptions.amount || 0);
                const currency = pricingOptions.price?.unit || pricingOptions.currency || 'USD';

                // Extract airline info
                const carriers = leg.carriers?.marketing || leg.airlines || [];
                const airlineCode = carriers[0]?.id || carriers[0]?.code || 'XX';
                const airlineName = carriers[0]?.name || 'Unknown Airline';

                // Extract flight details
                const departure = leg.departure || leg.origin?.display_code || '';
                const arrival = leg.arrival || leg.destination?.display_code || '';
                const departureTime = leg.departure_time || leg.departureDateTime || '';
                const arrivalTime = leg.arrival_time || leg.arrivalDateTime || '';
                const duration = leg.duration || leg.durationInMinutes || 0;
                const stops = leg.stopCount || leg.stops || 0;

                return {
                    index: index + 1,
                    price: {
                        total: price.toString(),
                        currency: currency
                    },
                    outbound: {
                        airline: airlineCode,
                        airlineName: airlineName,
                        departure: departure,
                        arrival: arrival,
                        departureTime: departureTime,
                        arrivalTime: arrivalTime,
                        duration: duration,
                        stops: stops
                    },
                    deepLink: itinerary.deepLink || pricingOptions.agent_url || ''
                };
            });

            // Filter by price if specified
            if (maxPrice) {
                flights = flights.filter(flight => parseFloat(flight.price.total) <= maxPrice);
                console.log(`💰 Filtered to ${flights.length} flights under ${maxPrice}`);
            }

            // Limit results
            flights = flights.slice(0, maxResults);

            return flights;

        } catch (error) {
            console.error('❌ Error parsing flight results:', error);
            return [];
        }
    }

    /**
     * Get airline name from code (fallback if not in API response)
     */
    getAirlineName(code) {
        const airlines = {
            'AA': 'American Airlines',
            'DL': 'Delta',
            'UA': 'United',
            'CM': 'Copa Airlines',
            'AV': 'Avianca',
            'LA': 'LATAM',
            'NK': 'Spirit Airlines',
            'F9': 'Frontier',
            'B6': 'JetBlue',
            // Add more as needed
        };
        return airlines[code] || code;
    }

    /**
     * Format flight offers for WhatsApp display
     */
    formatFlightOffersForDisplay(searchResult) {
        const { offers, query } = searchResult;

        if (!offers || offers.length === 0) {
            return 'No flights found.';
        }

        const tripType = query.returnDate ? 'Round-trip' : 'One-way';
        let message = `✈️ **${offers.length} Flight Options** (${tripType})\n\n`;

        if (query.maxPrice) {
            message += `💰 *Filtered: Under ${query.currency} ${query.maxPrice}*\n\n`;
        }

        offers.forEach(offer => {
            const airlineName = offer.outbound.airlineName || this.getAirlineName(offer.outbound.airline);
            const stopsText = offer.outbound.stops === 0 ? 'Nonstop' : `${offer.outbound.stops} stop${offer.outbound.stops > 1 ? 's' : ''}`;

            message += `**${offer.index}. ${airlineName}** - ${query.currency} ${offer.price.total}\n`;
            message += `   ${offer.outbound.departure} → ${offer.outbound.arrival} (${stopsText})\n`;

            if (offer.outbound.departureTime && offer.outbound.arrivalTime) {
                message += `   Depart: ${offer.outbound.departureTime}\n`;
                message += `   Arrive: ${offer.outbound.arrivalTime}\n`;
            }

            if (offer.deepLink) {
                message += `   🔗 Book: ${offer.deepLink}\n`;
            }

            message += `\n`;
        });

        return message;
    }
}

module.exports = SkyscrapperMCPServer;
