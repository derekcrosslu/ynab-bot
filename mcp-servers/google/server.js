/**
 * Google MCP Server - Gmail, Calendar, and Maps Integration
 *
 * Provides MCP tools for:
 * - Gmail: Read emails, search for booking confirmations
 * - Calendar: Create events, list events
 * - Maps: Geocode addresses, get place details, calculate distances
 *
 * Google APIs Docs:
 * - Gmail: https://developers.google.com/gmail/api
 * - Calendar: https://developers.google.com/calendar/api
 * - Maps: https://developers.google.com/maps/documentation
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class GoogleMCPServer {
    constructor() {
        this.gmail = null;
        this.calendar = null;
        this.maps = null;
        this.auth = null;
        this.initialized = false;
    }

    /**
     * Initialize Google APIs with OAuth credentials
     * @param {string} credentialsPath - Path to OAuth credentials JSON
     * @param {string} tokenPath - Path to store OAuth token
     * @param {string} mapsApiKey - Google Maps API key
     */
    async initialize(credentialsPath, tokenPath, mapsApiKey) {
        try {
            // Load OAuth credentials
            if (!fs.existsSync(credentialsPath)) {
                console.log('⚠️ Google OAuth credentials not found. Gmail/Calendar features disabled.');
                console.log(`   Create credentials at: ${credentialsPath}`);

                // Initialize Maps only if API key provided
                if (mapsApiKey) {
                    this.mapsApiKey = mapsApiKey;
                    console.log('✅ Google Maps initialized (API key provided)');
                }

                return {
                    success: true,
                    warning: 'Gmail/Calendar disabled (no credentials)',
                    mapsOnly: !!mapsApiKey
                };
            }

            const credentials = JSON.parse(fs.readFileSync(credentialsPath));
            const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

            // Create OAuth2 client
            const oAuth2Client = new google.auth.OAuth2(
                client_id,
                client_secret,
                redirect_uris[0]
            );

            // Load or generate token
            if (fs.existsSync(tokenPath)) {
                const token = JSON.parse(fs.readFileSync(tokenPath));
                oAuth2Client.setCredentials(token);
                this.auth = oAuth2Client;
            } else {
                console.log('⚠️ No OAuth token found. Run authentication flow first.');
                console.log('   Token will be saved to:', tokenPath);
                return {
                    success: false,
                    error: 'Authentication required',
                    authUrl: this.getAuthUrl(oAuth2Client)
                };
            }

            // Initialize Gmail API
            this.gmail = google.gmail({ version: 'v1', auth: this.auth });

            // Initialize Calendar API
            this.calendar = google.calendar({ version: 'v3', auth: this.auth });

            // Initialize Maps (uses API key, not OAuth)
            if (mapsApiKey) {
                this.mapsApiKey = mapsApiKey;
            }

            this.initialized = true;
            console.log('✅ Google MCP Server initialized (Gmail + Calendar + Maps)');

            return { success: true };

        } catch (error) {
            console.error('❌ Failed to initialize Google MCP:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get OAuth authorization URL
     */
    getAuthUrl(oAuth2Client) {
        const SCOPES = [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/calendar'
        ];

        return oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        });
    }

    // ==================== GMAIL METHODS ====================

    /**
     * Search Gmail for messages
     */
    async searchEmails(query, maxResults = 10) {
        if (!this.gmail) {
            return { error: 'Gmail not initialized' };
        }

        try {
            const response = await this.gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: maxResults
            });

            if (!response.data.messages) {
                return { success: true, messages: [] };
            }

            // Get full message details
            const messages = await Promise.all(
                response.data.messages.slice(0, 5).map(async (msg) => {
                    const fullMsg = await this.gmail.users.messages.get({
                        userId: 'me',
                        id: msg.id,
                        format: 'full'
                    });

                    const headers = fullMsg.data.payload.headers;
                    const subject = headers.find(h => h.name === 'Subject')?.value || '';
                    const from = headers.find(h => h.name === 'From')?.value || '';
                    const date = headers.find(h => h.name === 'Date')?.value || '';

                    return {
                        id: msg.id,
                        subject,
                        from,
                        date,
                        snippet: fullMsg.data.snippet
                    };
                })
            );

            return { success: true, messages };

        } catch (error) {
            console.error('❌ Gmail search failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ==================== CALENDAR METHODS ====================

    /**
     * Create a calendar event
     */
    async createEvent(event) {
        if (!this.calendar) {
            return { error: 'Calendar not initialized' };
        }

        try {
            const { summary, description, location, startTime, endTime, timezone } = event;

            const calendarEvent = {
                summary: summary,
                description: description,
                location: location,
                start: {
                    dateTime: startTime,
                    timeZone: timezone || 'America/Los_Angeles'
                },
                end: {
                    dateTime: endTime,
                    timeZone: timezone || 'America/Los_Angeles'
                },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'popup', minutes: 24 * 60 }, // 1 day before
                        { method: 'popup', minutes: 60 }       // 1 hour before
                    ]
                }
            };

            const response = await this.calendar.events.insert({
                calendarId: 'primary',
                resource: calendarEvent
            });

            console.log('✅ Calendar event created:', response.data.id);

            return {
                success: true,
                eventId: response.data.id,
                htmlLink: response.data.htmlLink
            };

        } catch (error) {
            console.error('❌ Calendar event creation failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * List calendar events
     */
    async listEvents(timeMin, timeMax, maxResults = 10) {
        if (!this.calendar) {
            return { error: 'Calendar not initialized' };
        }

        try {
            const response = await this.calendar.events.list({
                calendarId: 'primary',
                timeMin: timeMin || new Date().toISOString(),
                timeMax: timeMax,
                maxResults: maxResults,
                singleEvents: true,
                orderBy: 'startTime'
            });

            const events = response.data.items.map(event => ({
                id: event.id,
                summary: event.summary,
                location: event.location,
                start: event.start.dateTime || event.start.date,
                end: event.end.dateTime || event.end.date,
                description: event.description
            }));

            return { success: true, events };

        } catch (error) {
            console.error('❌ Calendar list failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ==================== GOOGLE MAPS METHODS ====================

    /**
     * Geocode an address to coordinates
     */
    async geocode(address) {
        if (!this.mapsApiKey) {
            return { error: 'Maps API key not configured' };
        }

        try {
            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${this.mapsApiKey}`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.status !== 'OK') {
                return { success: false, error: data.status };
            }

            const result = data.results[0];
            return {
                success: true,
                formatted_address: result.formatted_address,
                location: result.geometry.location,
                place_id: result.place_id
            };

        } catch (error) {
            console.error('❌ Geocoding failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get place details
     */
    async getPlaceDetails(placeId) {
        if (!this.mapsApiKey) {
            return { error: 'Maps API key not configured' };
        }

        try {
            const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${this.mapsApiKey}`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.status !== 'OK') {
                return { success: false, error: data.status };
            }

            return {
                success: true,
                place: data.result
            };

        } catch (error) {
            console.error('❌ Place details failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Calculate distance between two locations
     */
    async calculateDistance(origin, destination) {
        if (!this.mapsApiKey) {
            return { error: 'Maps API key not configured' };
        }

        try {
            const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${this.mapsApiKey}`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.status !== 'OK') {
                return { success: false, error: data.status };
            }

            const element = data.rows[0].elements[0];

            if (element.status !== 'OK') {
                return { success: false, error: element.status };
            }

            return {
                success: true,
                distance: element.distance,
                duration: element.duration
            };

        } catch (error) {
            console.error('❌ Distance calculation failed:', error.message);
            return { success: false, error: error.message };
        }
    }
}

// Export singleton instance
module.exports = new GoogleMCPServer();
