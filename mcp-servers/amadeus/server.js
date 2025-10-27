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
            return {
                success: false,
                error: 'Amadeus not initialized. Call initialize() first.'
            };
        }

        try {
            const {
                origin,
                destination,
                departureDate,
                returnDate,
                adults = 1,
                travelClass = 'ECONOMY',
                maxResults = 5,
                currencyCode = 'USD'  // Default to USD
            } = params;

            console.log(`🔍 Searching flights: ${origin} → ${destination} on ${departureDate}`);

            // Build search parameters
            const searchParams = {
                originLocationCode: origin,
                destinationLocationCode: destination,
                departureDate: departureDate,
                adults: adults,
                travelClass: travelClass,
                currencyCode: currencyCode,
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
            console.error('❌ Flight search failed:', error);

            // Extract error message with fallback
            const errorMessage = error.message || error.toString() || 'Unknown error occurred';
            const errorDescription = error.description || error.response?.data?.errors?.[0]?.detail || '';

            // Log full error for debugging
            if (error.response?.data) {
                console.error('Amadeus API error response:', JSON.stringify(error.response.data, null, 2));
            }

            return {
                success: false,
                error: errorMessage,
                description: errorDescription
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
     * Get airline name from IATA code
     */
    getAirlineName(code) {
        const airlines = {
            // Major US Airlines
            'AA': 'American Airlines',
            'DL': 'Delta Air Lines',
            'UA': 'United Airlines',
            'WN': 'Southwest Airlines',
            'B6': 'JetBlue Airways',
            'AS': 'Alaska Airlines',
            'NK': 'Spirit Airlines',
            'F9': 'Frontier Airlines',

            // Latin American Airlines
            'CM': 'Copa Airlines',
            'AV': 'Avianca',
            'LA': 'LATAM Airlines',
            'AM': 'Aeroméxico',
            'AR': 'Aerolíneas Argentinas',
            'G3': 'GOL Linhas Aéreas',
            'JJ': 'LATAM Brasil',
            'VB': 'VivaAerobus',
            'Y4': 'Volaris',
            '4M': 'LATAM Argentina',
            'XL': 'LATAM Ecuador',
            '4C': 'LATAM Colombia',
            'PZ': 'LATAM Paraguay',

            // European Airlines
            'BA': 'British Airways',
            'LH': 'Lufthansa',
            'AF': 'Air France',
            'KL': 'KLM',
            'IB': 'Iberia',
            'AZ': 'ITA Airways',
            'LX': 'SWISS',
            'OS': 'Austrian Airlines',
            'SN': 'Brussels Airlines',
            'TP': 'TAP Air Portugal',
            'UX': 'Air Europa',
            'VY': 'Vueling',

            // Asian Airlines
            'NH': 'ANA',
            'JL': 'Japan Airlines',
            'SQ': 'Singapore Airlines',
            'CX': 'Cathay Pacific',
            'TG': 'Thai Airways',
            'MH': 'Malaysia Airlines',
            'PR': 'Philippine Airlines',
            'KE': 'Korean Air',
            'OZ': 'Asiana Airlines',

            // Middle Eastern Airlines
            'EK': 'Emirates',
            'QR': 'Qatar Airways',
            'EY': 'Etihad Airways',
            'TK': 'Turkish Airlines',

            // Canadian Airlines
            'AC': 'Air Canada',
            'WS': 'WestJet',

            // Australian Airlines
            'QF': 'Qantas',
            'VA': 'Virgin Australia',

            // Low-Cost Carriers
            'FR': 'Ryanair',
            'U2': 'easyJet',
            'W6': 'Wizz Air',
            'VW': 'Aeromar',

            // Other Notable Airlines
            'EI': 'Aer Lingus',
            'AY': 'Finnair',
            'SK': 'SAS',
            'LO': 'LOT Polish Airlines'
        };

        // Return full name if found, otherwise return code with generic label
        return airlines[code] || `${code} Airlines`;
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
            const airlineName = this.getAirlineName(offer.outbound.airline);
            message += `**${offer.index}. ${airlineName}** (${offer.outbound.airline}${offer.outbound.flightNumber}) - ${offer.price.currency} ${offer.price.total}\n`;
            message += `   Depart: ${offer.outbound.departure.airport} at ${new Date(offer.outbound.departure.time).toLocaleString()}\n`;
            message += `   Arrive: ${offer.outbound.arrival.airport} at ${new Date(offer.outbound.arrival.time).toLocaleString()}\n`;
            message += `   Duration: ${offer.outbound.duration}, Stops: ${offer.outbound.stops}\n`;

            if (offer.inbound) {
                const returnAirlineName = this.getAirlineName(offer.inbound.airline);
                message += `   Return: ${returnAirlineName} (${offer.inbound.airline}${offer.inbound.flightNumber})\n`;
                message += `   Depart: ${offer.inbound.departure.airport} at ${new Date(offer.inbound.departure.time).toLocaleString()}\n`;
                message += `   Arrive: ${offer.inbound.arrival.airport} at ${new Date(offer.inbound.arrival.time).toLocaleString()}\n`;
            }
            message += `\n`;
        });

        return message;
    }

    /**
     * Search for hotels
     * @param {Object} params
     * @param {string} params.cityCode - IATA city code (e.g., NYC, PAR, TYO)
     * @param {string} params.checkInDate - Check-in date (YYYY-MM-DD)
     * @param {string} params.checkOutDate - Check-out date (YYYY-MM-DD)
     * @param {number} params.adults - Number of adult guests (default: 1)
     * @param {number} params.rooms - Number of rooms (default: 1)
     * @param {string} params.currency - Currency code (default: USD)
     * @param {number} params.maxResults - Max number of results (default: 5)
     */
    async searchHotels(params) {
        if (!this.initialized) {
            return {
                success: false,
                error: 'Amadeus not initialized. Call initialize() first.'
            };
        }

        try {
            const {
                cityCode,
                checkInDate,
                checkOutDate,
                adults = 1,
                rooms = 1,
                currency = 'USD',
                maxResults = 5
            } = params;

            console.log(`🔍 Searching hotels in ${cityCode} (${checkInDate} to ${checkOutDate})`);

            // Step 1: Search for hotels by city
            const hotelListResponse = await this.amadeus.referenceData.locations.hotels.byCity.get({
                cityCode: cityCode
            });

            if (!hotelListResponse.data || hotelListResponse.data.length === 0) {
                return {
                    success: false,
                    error: `No hotels found in ${cityCode}`
                };
            }

            // Get hotel IDs (limit to maxResults * 2 to have options after filtering)
            const hotelIds = hotelListResponse.data
                .slice(0, maxResults * 2)
                .map(hotel => hotel.hotelId)
                .join(',');

            // Step 2: Get hotel offers (pricing and availability)
            const offersResponse = await this.amadeus.shopping.hotelOffersSearch.get({
                hotelIds: hotelIds,
                checkInDate: checkInDate,
                checkOutDate: checkOutDate,
                adults: adults,
                roomQuantity: rooms,
                currency: currency
            });

            if (!offersResponse.data || offersResponse.data.length === 0) {
                return {
                    success: false,
                    error: `No available hotels found for ${checkInDate} to ${checkOutDate}`
                };
            }

            // Parse and format results
            const offers = offersResponse.data.slice(0, maxResults).map((hotelOffer, index) => {
                const hotel = hotelOffer.hotel;
                const offer = hotelOffer.offers[0]; // Get cheapest offer

                // Calculate total nights
                const checkIn = new Date(checkInDate);
                const checkOut = new Date(checkOutDate);
                const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

                return {
                    id: hotel.hotelId,
                    index: index + 1,
                    name: hotel.name,
                    location: {
                        address: hotel.address || {},
                        cityCode: cityCode,
                        latitude: hotel.latitude,
                        longitude: hotel.longitude
                    },
                    rating: hotel.rating || 'Not rated',
                    checkIn: checkInDate,
                    checkOut: checkOutDate,
                    nights: nights,
                    guests: adults,
                    rooms: rooms,
                    price: {
                        total: offer.price.total,
                        currency: offer.price.currency,
                        perNight: (parseFloat(offer.price.total) / nights).toFixed(2)
                    },
                    room: {
                        type: offer.room.type,
                        description: offer.room.typeEstimated?.category || 'Standard room',
                        beds: offer.room.typeEstimated?.beds || 1,
                        bedType: offer.room.typeEstimated?.bedType || 'Unknown'
                    },
                    available: offer.available,
                    offerId: offer.id
                };
            });

            console.log(`✅ Found ${offers.length} hotel options`);

            return {
                success: true,
                query: {
                    cityCode,
                    checkInDate,
                    checkOutDate,
                    adults,
                    rooms,
                    nights: offers[0]?.nights || 0
                },
                offers: offers
            };

        } catch (error) {
            console.error('❌ Hotel search failed:', error);

            // Extract error message with fallback
            const errorMessage = error.message || error.toString() || 'Unknown error occurred';
            const errorDescription = error.description || error.response?.data?.errors?.[0]?.detail || '';

            // Log full error for debugging
            if (error.response?.data) {
                console.error('Amadeus API error response:', JSON.stringify(error.response.data, null, 2));
            }

            return {
                success: false,
                error: errorMessage,
                description: errorDescription
            };
        }
    }

    /**
     * Get specific hotel offer details
     */
    async getHotelOffer(offerId) {
        if (!this.initialized) {
            return { error: 'Amadeus not initialized' };
        }

        try {
            const response = await this.amadeus.shopping.hotelOffer(offerId).get();

            return {
                success: true,
                offer: response.data
            };
        } catch (error) {
            console.error('❌ Failed to get hotel offer:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Format hotel offers for display
     */
    formatHotelOffersForDisplay(searchResult) {
        if (!searchResult.success) {
            return `❌ Search failed: ${searchResult.error}`;
        }

        const { query, offers } = searchResult;

        let message = `🏨 **Hotels in ${query.cityCode}**\n\n`;
        message += `📅 Check-in: ${query.checkInDate}\n`;
        message += `📅 Check-out: ${query.checkOutDate}\n`;
        message += `🛏️ ${query.nights} night(s), ${query.rooms} room(s), ${query.adults} guest(s)\n\n`;

        if (offers.length === 0) {
            return message + '❌ No hotels found';
        }

        message += `**${offers.length} Options:**\n\n`;

        offers.forEach(offer => {
            message += `**${offer.index}. ${offer.name}** ${offer.rating !== 'Not rated' ? `⭐ ${offer.rating}` : ''}\n`;
            message += `   📍 ${offer.location.address.lines?.[0] || offer.location.cityCode}\n`;
            message += `   💰 ${offer.price.currency} ${offer.price.total} total (${offer.price.currency} ${offer.price.perNight}/night)\n`;
            message += `   🛏️ ${offer.room.description}\n`;
            message += `   ${offer.available ? '✅ Available' : '❌ Not available'}\n`;
            message += `\n`;
        });

        return message;
    }
}

// Export singleton instance
module.exports = new AmadeusMCPServer();
