# WhatsApp Travel Assistant - Complete Architecture

## System Overview

Personal travel assistant via WhatsApp that can:
- ✈️ **Search & book flights** (Amadeus API)
- 🏨 **Search & book hotels** (Amadeus API)
- 📧 **Monitor booking confirmations** (Gmail)
- 📅 **Sync to Calendar** (Google Calendar)
- 💰 **Track expenses** (YNAB)
- 📝 **Manage itinerary** (Beads)

---

## Architecture Diagram

```
User (WhatsApp)
      ↓
WhatsApp Business API (Webhook)
      ↓
┌─────────────────────────────────────┐
│   Bot.js (Main Application)         │
│   - Receives messages                │
│   - Routes to Mode Router            │
└─────────────────────────────────────┘
      ↓
┌─────────────────────────────────────┐
│   Mode Router                        │
│   - /budgetok → Legacy Mode          │
│   - /budgetnew → Multi-Agent Mode    │
└─────────────────────────────────────┘
      ↓
┌─────────────────────────────────────┐
│   Orchestrator                       │
│   - Parses intent with Claude        │
│   - Routes to agents                 │
│   - Manages workflow                 │
└─────────────────────────────────────┘
      ↓
   ┌──┴──────────────────┐
   │                     │
┌──▼────────┐    ┌──────▼─────┐
│ Budget    │    │   Trip     │
│ Agent     │    │   Agent    │
└───┬───────┘    └──────┬─────┘
    │                   │
    │                   │
    ├───────────────────┼────────────────────┐
    │                   │                    │
┌───▼─────┐  ┌─────────▼────────┐  ┌────────▼──────┐
│  YNAB   │  │   Amadeus API    │  │  Gmail MCP    │
│   API   │  │  - Flight Search │  │  - Monitor    │
│         │  │  - Hotel Search  │  │    booking    │
│         │  │  - Booking       │  │    emails     │
└─────────┘  └──────────────────┘  └───────────────┘
                      │                    │
          ┌───────────┴────────┐          │
          │                    │          │
    ┌─────▼──────┐    ┌───────▼──────┐   │
    │  Calendar  │    │    Beads     │◄──┘
    │    MCP     │    │  (Itinerary  │
    │            │    │   Storage)   │
    └────────────┘    └──────────────┘
```

---

## Components

### 1. **WhatsApp Interface**
- WhatsApp-web.js library
- Handles QR code authentication
- Sends/receives messages
- Supports media (PDFs, images)

### 2. **Mode Router**
- Dual-mode system (legacy vs multi-agent)
- Commands:
  - `/budgetok` - Legacy budget flows
  - `/budgetnew` - Multi-agent mode
  - `/trip`, `/planning`, `/ontrip` - Trip modes
  - `/budget` - Budget mode
  - `/agentmode` - Check current mode

### 3. **Orchestrator**
- Claude-powered intent parsing
- Agent selection logic
- User preference tracking (budget vs trip)
- Trip context tracking (planning vs active-trip)
- Approval decision matrix

### 4. **BudgetAgent**
Capabilities:
- `view_balance` - Show YNAB balances
- `create_transaction` - Add expenses
- `view_transactions` - Show recent transactions
- `categorize_transactions` - Categorize pending
- `analyze_spending` - Spending breakdown
- `general_query` - AI-powered budget questions

### 5. **TripAgent** ⭐ NEW
Capabilities:
- `plan_trip` - AI trip planning
- `search_flights` - Search flights (Amadeus)
- `book_flight` - Book flights (Amadeus)
- `search_hotels` - Search hotels (Amadeus)
- `book_hotel` - Book hotels (Amadeus)
- `create_itinerary` - Day-by-day itinerary
- `track_booking` - Save booking confirmations
- `get_trip_suggestions` - Destination ideas

### 6. **MCP Servers**

#### Amadeus MCP Server (Custom)
- Flight search & booking API
- Hotel search & booking API
- Real-time prices
- Seat selection
- Ticket issuance

#### Gmail MCP Server (Community)
- Monitor inbox for booking emails
- Parse confirmation emails
- Extract booking details with Claude
- Auto-add to itinerary

#### Calendar MCP Server (Community)
- Create flight/hotel events
- Query availability
- Update events
- Reminders

### 7. **Storage (Beads)**
- Persistent trip storage
- Task tracking ("Book rental car")
- Dependency management
- Git-backed memory
- Query interface for agents

---

## User Workflows

### **Workflow 1: Planning a Trip**

```
You: /planning
Bot: "📋 Planning Mode Activated"

You: "plan trip to Tokyo Dec 11-21"
Bot: 🤖 [Calls TripAgent.planTrip()]
     📧 [Generates comprehensive plan with Claude]
     📅 [Creates Calendar event for trip dates]
     📝 [Saves to Beads]

Bot: "🌍 Trip Plan: Tokyo

     **Overview:** Tokyo in December...
     **Budget Estimate:**
     - Flights: $800-1200
     - Hotels: $100-200/night
     - Daily: $80-150
     **Hotels (3 tiers):** ...
     **Must-see:** ...
     **Itinerary:** ..."
```

### **Workflow 2: Booking Flights**

```
You: "search flights LAX to Tokyo Dec 11, return Dec 21"
Bot: 🤖 [Calls TripAgent.searchFlights()]
     ✈️ [Calls Amadeus API]

Bot: "✈️ Flights: LAX → NRT

     **5 Options:**

     **1. JAL 61** - USD 1050
        Depart: LAX Dec 11 at 11:30 AM
        Arrive: NRT Dec 12 at 3:00 PM
        Duration: PT13H30M, Stops: 0

     **2. United 32** - USD 920
        Depart: LAX Dec 11 at 9:00 AM
        Arrive: NRT Dec 12 at 5:30 PM
        Duration: PT16H30M, Stops: 1 (SFO)
     ..."

You: "book option 1"
Bot: "💳 JAL 61 for USD 1,050. Confirm booking? (yes/no)"

You: "yes"
Bot: 🤖 [Calls TripAgent.bookFlight()]
     💳 [Processes payment]
     ✈️ [Calls Amadeus booking API]
     📅 [Adds to Calendar]
     📝 [Saves to Beads]
     💰 [Suggests adding to YNAB]

Bot: "✅ Booked! JAL Flight 61
     Confirmation: JAL123XYZ

     📅 Added to calendar
     💰 Add $1,050 to YNAB? (yes/no)"

You: "yes"
Bot: "✅ Added to YNAB category 'Travel'"
```

### **Workflow 3: Active Trip Expense Tracking**

```
You: /ontrip
Bot: "🧳 Active Trip Mode
     ✈️ Real-time travel assistance"

You: "spent $50 on dinner at Sukiyabashi Jiro"
Bot: 🤖 [Calls TripAgent.trackBooking()]
     📝 [Saves to Beads trip expenses]
     💰 [Suggests YNAB category]

Bot: "📋 Expense tracked: $50
     💰 Add to YNAB as 'Dining Out'? (yes/no)"

You: "yes"
Bot: "✅ Added to YNAB"
```

### **Workflow 4: Email Monitoring (Background)**

```
[Gmail MCP monitors inbox every hour]

New email arrives: "Your Hilton Tokyo Reservation Confirmation"

Gmail MCP: 📧 [Detects booking email]
           🤖 [Parses with Claude]
           📝 [Extracts: Hotel name, check-in, check-out, price]

Bot → You: "📧 New booking detected!

            🏨 Hilton Tokyo Shinjuku
            Check-in: Dec 11, 2025
            Check-out: Dec 21, 2025
            Cost: $1,500 (10 nights)

            ✅ Added to calendar
            💰 Add to YNAB? (yes/no)"
```

---

## Agent Mode System

### **Trip Lifecycle Contexts:**

1. **`/planning`** - General planning
   - Broad trip ideas
   - Destination suggestions
   - Budget estimates

2. **`/trip` or `/tripplanning`** - Pre-trip planning
   - Searching flights/hotels
   - Booking reservations
   - Building itinerary

3. **`/ontrip`** - Active travel
   - Expense tracking
   - Real-time suggestions
   - Itinerary updates

### **Agent Preferences:**

Users can lock to specific agent:
- `/trip` → All messages go to TripAgent
- `/budget` → All messages go to BudgetAgent
- `/agentmode` → Check current agent

This bypasses AI intent parsing for faster, predictable routing.

---

## Data Storage

### **Beads Structure:**

```
.beads/
├── trips/
│   ├── tokyo-dec-2025.json       # Trip metadata
│   ├── flights/
│   │   └── jal-61.json            # Flight booking
│   ├── hotels/
│   │   └── hilton-tokyo.json     # Hotel booking
│   └── expenses/
│       ├── dinner-jiro.json       # Expense entry
│       └── taxi-narita.json
```

### **Calendar Events:**

All bookings auto-sync to Google Calendar:
- Flight departures/arrivals
- Hotel check-in/check-out
- Activities/reservations
- Reminders (24hr before)

---

## Security & Privacy

### **Personal Project - Simplified:**

- ✅ Single user (you)
- ✅ Your credit card stored in `.env` or prompted
- ✅ OAuth for Google (Gmail + Calendar)
- ✅ Amadeus API key in `.env`
- ✅ YNAB token in `.env`
- ❌ No PCI compliance needed (personal use)
- ❌ No multi-user auth

### **Credentials Storage:**

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
YNAB_API_KEY=...

# Amadeus
AMADEUS_API_KEY=...
AMADEUS_API_SECRET=...

# Google OAuth (auto-generated)
GOOGLE_OAUTH_TOKEN=./mcp-servers/gmail/token.json
```

---

## Deployment

### **Server:**
- Ubuntu VPS (144.202.27.10)
- PM2 process manager
- WhatsApp session persistent
- Auto-restart on reboot

### **Local Development:**
- macOS (/Users/donaldcross/...)
- Git-based updates
- Test → Commit → Push → Pull on server → PM2 restart

---

## Next Steps

1. ✅ Created Amadeus MCP Server
2. ⏳ Get Amadeus API credentials
3. ⏳ Install Gmail MCP Server
4. ⏳ Install Calendar MCP Server
5. ⏳ Update TripAgent with booking capabilities
6. ⏳ Test end-to-end flight search + booking
7. ⏳ Deploy to server

**Current Status:** Ready for Amadeus API signup and testing!

