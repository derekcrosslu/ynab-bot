# MCP Servers Setup Guide

This guide shows how to set up all MCP servers for the WhatsApp travel assistant.

## Overview

We need **3 MCP servers**:
1. **Amadeus** - Flight search & booking (custom)
2. **Gmail** - Email monitoring (existing MCP server)
3. **Google Calendar** - Event sync (existing MCP server)

---

## 1. Amadeus MCP Server (Custom)

### Step 1: Get API Credentials

1. Go to https://developers.amadeus.com/register
2. Create account (free)
3. Create new app
4. Copy API Key + API Secret

### Step 2: Add to .env

```bash
# Amadeus API
AMADEUS_API_KEY=your_amadeus_api_key_here
AMADEUS_API_SECRET=your_amadeus_api_secret_here
```

### Step 3: Install Dependencies

```bash
cd mcp-servers/amadeus
npm install
```

### Step 4: Test

```bash
node test.js
```

---

## 2. Gmail MCP Server

### Option A: Use Existing MCP Server (Recommended)

There are community Gmail MCP servers available. Install via:

```bash
npm install -g @modelcontextprotocol/server-gmail
```

### Option B: Manual Setup

1. Go to https://console.cloud.google.com/
2. Create new project
3. Enable Gmail API
4. Create OAuth credentials
5. Download credentials JSON
6. Save to `mcp-servers/gmail/credentials.json`

Add to `.env`:
```bash
GMAIL_CREDENTIALS_PATH=./mcp-servers/gmail/credentials.json
```

---

## 3. Google Calendar MCP Server

### Option A: Use Existing MCP Server (Recommended)

```bash
npm install -g @modelcontextprotocol/server-google-calendar
```

### Option B: Manual Setup

1. Same Google Cloud project as Gmail
2. Enable Google Calendar API
3. Use same OAuth credentials

Add to `.env`:
```bash
GOOGLE_CALENDAR_CREDENTIALS_PATH=./mcp-servers/calendar/credentials.json
```

---

## MCP Configuration

### For bot.js integration:

The bot will initialize these MCP servers when it starts:

```javascript
// In bot.js or a new mcp-manager.js

const amadeusServer = require('./mcp-servers/amadeus/server');
const { GmailMCPServer } = require('@modelcontextprotocol/server-gmail');
const { CalendarMCPServer } = require('@modelcontextprotocol/server-google-calendar');

// Initialize
await amadeusServer.initialize(
    process.env.AMADEUS_API_KEY,
    process.env.AMADEUS_API_SECRET
);

// Gmail and Calendar will auto-init with credentials
```

---

## Testing Each MCP Server

### Test Amadeus:
```bash
cd mcp-servers/amadeus
node test.js
```

### Test Gmail:
```bash
# After installing
mcp-server-gmail --test
```

### Test Calendar:
```bash
# After installing
mcp-server-google-calendar --test
```

---

## Integration with TripAgent

Once all 3 MCP servers are running, TripAgent can use them:

```javascript
// In TripAgent.js

async searchFlights(params) {
    // Call Amadeus MCP server
    const result = await amadeusServer.searchFlights(params);
    return result;
}

async monitorEmail() {
    // Call Gmail MCP server
    const emails = await gmailServer.searchEmails({
        query: 'subject:flight confirmation'
    });
    return emails;
}

async addToCalendar(event) {
    // Call Calendar MCP server
    const result = await calendarServer.createEvent(event);
    return result;
}
```

---

## Troubleshooting

### Amadeus API Errors

**Error: "Invalid credentials"**
- Check `.env` has correct API key/secret
- Verify no extra spaces in credentials

**Error: "Quota exceeded"**
- Free tier: 2,000 calls/month
- Wait until quota resets or upgrade

### Gmail/Calendar OAuth

**Error: "Redirect URI mismatch"**
- Add `http://localhost:3000/oauth/callback` to Google Cloud Console authorized redirects

**Error: "Access denied"**
- Re-run OAuth flow
- Delete `token.json` and try again

---

## Next Steps

After all MCP servers are configured:

1. Update TripAgent with new capabilities
2. Test flight search via WhatsApp
3. Test Gmail monitoring for bookings
4. Test Calendar event creation

