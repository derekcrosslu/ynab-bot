# Next Steps - Multi-Agent Implementation Roadmap

## 🎯 Current Status

✅ **Phase 1 Complete**: Dual-mode foundation implemented and tested

📍 **We are here**: Ready to implement the multi-agent orchestrator and agents

---

## 📋 Phase 2: Multi-Agent System Implementation

### Step 1: Directory Structure (1-2 hours)

Create the agent directory structure:

```bash
mkdir -p whatsapp-claude-ynab/agents/{base,orchestrator,budget,trip,email,calendar}
```

**Files to create**:
```
agents/
├── base/
│   ├── BaseAgent.js           # Abstract base class for all agents
│   └── AgentTools.js          # Shared tools and utilities
├── orchestrator/
│   ├── Orchestrator.js        # Main orchestrator
│   ├── DecisionMatrix.js      # Autonomy decision logic
│   └── BeadsIntegration.js    # Beads memory integration
├── budget/
│   ├── BudgetAgent.js         # Enhanced budget agent
│   └── BudgetAlerts.js        # Proactive budget monitoring
├── trip/
│   ├── TripAgent.js           # Trip planning agent
│   └── TripWorkflows.js       # Trip planning workflows
├── email/
│   ├── EmailAgent.js          # Email monitoring agent
│   └── ReceiptParser.js       # Extract data from receipts
└── calendar/
    ├── CalendarAgent.js       # Calendar integration agent
    └── EventManagement.js     # Event CRUD operations
```

---

### Step 2: Base Agent Class (2-3 hours)

**`agents/base/BaseAgent.js`**

Core functionality all agents inherit:

```javascript
class BaseAgent {
    constructor(name, capabilities) {
        this.name = name;
        this.capabilities = capabilities;
        this.memory = null; // Beads integration
        this.mcp = null;    // MCP tools
    }

    // Abstract methods agents must implement
    async handleRequest(request, context) {
        throw new Error('Agent must implement handleRequest');
    }

    // Common utilities
    async log(message, level = 'info') { /* ... */ }
    async saveToMemory(data) { /* Beads integration */ }
    async queryMemory(query) { /* Beads integration */ }
    async useTool(toolName, params) { /* MCP integration */ }
}

module.exports = BaseAgent;
```

**Key features**:
- Abstract base class pattern
- Beads memory integration hooks
- MCP tool execution framework
- Logging and error handling
- Common utilities

---

### Step 3: Orchestrator (3-4 hours)

**`agents/orchestrator/Orchestrator.js`**

Central coordinator that:
1. Parses user requests
2. Routes to appropriate agent(s)
3. Manages multi-step workflows
4. Enforces decision autonomy rules
5. Handles WhatsApp notifications for approvals

```javascript
class Orchestrator {
    constructor(anthropic, ynabService) {
        this.anthropic = anthropic;
        this.ynabService = ynabService;
        this.agents = {
            budget: new BudgetAgent(anthropic, ynabService),
            trip: new TripAgent(anthropic),
            email: new EmailAgent(anthropic),
            calendar: new CalendarAgent(anthropic)
        };
        this.beads = null; // Beads CLI integration
    }

    async handleUserRequest(userId, request) {
        // 1. Parse intent
        const intent = await this.parseIntent(request.message);

        // 2. Route to agent(s)
        const agent = this.selectAgent(intent);

        // 3. Execute with context
        const result = await agent.handleRequest(request, {
            userId,
            memory: this.beads,
            approvalRequired: this.checkApprovalNeeded(intent)
        });

        // 4. Return response
        return result;
    }

    async parseIntent(message) {
        // Use Claude to understand user intent
        // Categories: budget_query, transaction_create, trip_plan, etc.
    }

    selectAgent(intent) {
        // Route to appropriate agent based on intent
    }

    checkApprovalNeeded(intent, amount = 0) {
        // Decision matrix: autonomous if <$150, require approval if >$150
    }
}

module.exports = Orchestrator;
```

**Integration with Mode Router**:

In `bot.js` after Orchestrator is initialized:

```javascript
// After line 30 (where mode router is imported)
const Orchestrator = require('./agents/orchestrator/Orchestrator');
const orchestrator = new Orchestrator(anthropic, ynabService);

// Connect to mode router
modeRouter.setOrchestrator(orchestrator);

console.log('✅ Multi-agent orchestrator connected');
```

---

### Step 4: Budget Agent (Enhanced) (2-3 hours)

**`agents/budget/BudgetAgent.js`**

Enhanced version of existing budget functionality:

```javascript
const BaseAgent = require('../base/BaseAgent');

class BudgetAgent extends BaseAgent {
    constructor(anthropic, ynabService) {
        super('BudgetAgent', [
            'view_balances',
            'create_transaction',
            'categorize_transactions',
            'proactive_alerts'  // NEW
        ]);
        this.anthropic = anthropic;
        this.ynabService = ynabService;
    }

    async handleRequest(request, context) {
        const { intent, params } = request;

        switch (intent) {
            case 'view_balances':
                return await this.viewBalances(params);
            case 'create_transaction':
                return await this.createTransaction(params, context);
            case 'proactive_alert':
                return await this.sendAlert(params, context);
            default:
                throw new Error(`Unknown intent: ${intent}`);
        }
    }

    async proactiveCheck(userId) {
        // NEW: Check for budget issues proactively
        // - Overspending in categories
        // - Unusual transactions
        // - Upcoming bills
        // Return alerts to send via WhatsApp
    }
}

module.exports = BudgetAgent;
```

---

### Step 5: Trip Planning Agent (NEW) (4-5 hours)

**`agents/trip/TripAgent.js`**

Implements full trip planning workflow:

```javascript
const BaseAgent = require('../base/BaseAgent');

class TripAgent extends BaseAgent {
    constructor(anthropic) {
        super('TripAgent', [
            'plan_trip',
            'search_flights',
            'search_hotels',
            'create_itinerary',
            'track_bookings'
        ]);
        this.anthropic = anthropic;
    }

    async handleRequest(request, context) {
        const { intent, params } = request;

        switch (intent) {
            case 'plan_trip':
                return await this.planTrip(params, context);
            case 'search_flights':
                return await this.searchFlights(params);
            // ... other intents
        }
    }

    async planTrip(params, context) {
        // Multi-step workflow:
        // 1. Budget check (coordinate with BudgetAgent)
        // 2. Search flights/hotels
        // 3. Create itinerary
        // 4. Track in Beads
        // 5. Calendar integration
        // 6. Email monitoring for confirmations

        // Create Beads epic
        const tripEpic = await context.memory.createIssue({
            title: `Trip to ${params.destination}`,
            type: 'epic',
            // ... subtasks for flights, hotels, itinerary
        });

        return {
            message: `Started planning your trip to ${params.destination}...`,
            tasks: [tripEpic.id]
        };
    }
}

module.exports = TripAgent;
```

---

### Step 6: Email Agent (NEW) (3-4 hours)

**`agents/email/EmailAgent.js`**

Monitors Gmail for receipts and confirmations:

```javascript
const BaseAgent = require('../base/BaseAgent');

class EmailAgent extends BaseAgent {
    constructor(anthropic) {
        super('EmailAgent', [
            'monitor_receipts',
            'extract_receipt_data',
            'track_confirmations'
        ]);
        this.anthropic = anthropic;
        this.gmailMCP = null; // Gmail MCP server
    }

    async handleRequest(request, context) {
        const { intent, params } = request;

        switch (intent) {
            case 'monitor_receipts':
                return await this.monitorReceipts(params, context);
            case 'extract_receipt_data':
                return await this.extractReceipt(params);
            // ... other intents
        }
    }

    async monitorReceipts(params, context) {
        // Use Gmail MCP server to:
        // 1. Search for new emails with receipts
        // 2. Extract transaction data
        // 3. Suggest adding to YNAB
        // 4. Send WhatsApp notification for approval
    }

    async startProactiveMonitoring(userId) {
        // Poll Gmail every N minutes
        // Auto-extract receipts
        // Notify user via WhatsApp
    }
}

module.exports = EmailAgent;
```

---

### Step 7: Calendar Agent (NEW) (2-3 hours)

**`agents/calendar/CalendarAgent.js`**

Manages Google Calendar integration:

```javascript
const BaseAgent = require('../base/BaseAgent');

class CalendarAgent extends BaseAgent {
    constructor(anthropic) {
        super('CalendarAgent', [
            'create_event',
            'check_availability',
            'list_events',
            'update_event'
        ]);
        this.anthropic = anthropic;
        this.calendarMCP = null; // Google Calendar MCP server
    }

    async handleRequest(request, context) {
        const { intent, params } = request;

        switch (intent) {
            case 'check_availability':
                return await this.checkAvailability(params);
            case 'create_event':
                return await this.createEvent(params, context);
            // ... other intents
        }
    }

    async createEvent(params, context) {
        // Use Google Calendar MCP to:
        // 1. Create event
        // 2. Track in Beads
        // 3. Return confirmation
    }
}

module.exports = CalendarAgent;
```

---

### Step 8: Beads Integration (2-3 hours)

**`agents/orchestrator/BeadsIntegration.js`**

Persistent memory using Beads CLI:

```javascript
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class BeadsIntegration {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }

    async createIssue(data) {
        // bd create "title" --type=task --priority=2
        const cmd = `bd create "${data.title}" --type=${data.type} --priority=${data.priority || 2}`;
        const result = await execPromise(cmd, { cwd: this.workspaceRoot });
        return JSON.parse(result.stdout);
    }

    async updateIssue(issueId, updates) {
        // bd update ISSUE-123 --status=in_progress
        const cmd = `bd update ${issueId} --status=${updates.status}`;
        await execPromise(cmd, { cwd: this.workspaceRoot });
    }

    async listReady() {
        // bd ready --limit=10
        const cmd = `bd ready --limit=10`;
        const result = await execPromise(cmd, { cwd: this.workspaceRoot });
        return JSON.parse(result.stdout);
    }

    async getIssue(issueId) {
        // bd show ISSUE-123
        const cmd = `bd show ${issueId}`;
        const result = await execPromise(cmd, { cwd: this.workspaceRoot });
        return JSON.parse(result.stdout);
    }
}

module.exports = BeadsIntegration;
```

---

### Step 9: MCP Server Configuration (1-2 hours)

**Install MCP servers**:

```bash
# Gmail MCP server
npm install @modelcontextprotocol/server-gmail

# Google Calendar MCP server
npm install @modelcontextprotocol/server-google-calendar
```

**Configure in `agents/orchestrator/Orchestrator.js`**:

```javascript
const { MCPClient } = require('@modelcontextprotocol/sdk');

// In constructor:
this.mcpGmail = new MCPClient('gmail', {
    credentials: process.env.GMAIL_CREDENTIALS
});

this.mcpCalendar = new MCPClient('google-calendar', {
    credentials: process.env.GOOGLE_CALENDAR_CREDENTIALS
});
```

---

### Step 10: Testing & Validation (2-3 hours)

**Create test files**:

1. `test-orchestrator.js` - Test orchestrator routing
2. `test-budget-agent.js` - Test budget agent
3. `test-trip-agent.js` - Test trip planning workflows
4. `test-beads-integration.js` - Test Beads memory

**Integration test**:

```javascript
// Test full flow: User asks to plan trip → Trip agent → Budget check → Calendar block
```

---

### Step 11: Beta Deployment (1 hour)

1. **Add beta user**:
   ```bash
   # .env
   BETA_USERS=your-number@s.whatsapp.net
   ```

2. **Test with real WhatsApp**:
   - Start bot: `node bot.js`
   - Switch mode: `/budgetnew`
   - Test: "plan a trip to NYC Dec 11-21"

3. **Monitor and iterate**

---

## 📊 Estimated Timeline

| Task | Estimated Time | Priority |
|------|---------------|----------|
| 1. Directory structure | 1-2 hours | High |
| 2. Base agent class | 2-3 hours | High |
| 3. Orchestrator | 3-4 hours | High |
| 4. Budget agent | 2-3 hours | Medium |
| 5. Trip agent | 4-5 hours | High |
| 6. Email agent | 3-4 hours | Medium |
| 7. Calendar agent | 2-3 hours | Medium |
| 8. Beads integration | 2-3 hours | High |
| 9. MCP configuration | 1-2 hours | High |
| 10. Testing | 2-3 hours | High |
| 11. Beta deployment | 1 hour | High |

**Total: ~24-35 hours** (3-5 days of focused work)

---

## 🎯 Success Criteria

- [ ] Orchestrator routes to correct agents
- [ ] Budget agent enhances existing functionality
- [ ] Trip planning workflow completes end-to-end
- [ ] Email agent extracts receipts correctly
- [ ] Calendar agent creates events
- [ ] Beads persists tasks across restarts
- [ ] Mode switching works seamlessly
- [ ] Beta user provides positive feedback
- [ ] No regressions in legacy mode

---

## 📚 Resources Needed

### Documentation
- [MCP Agent Framework](https://github.com/lastmile-ai/mcp-agent) - Agent patterns
- [Beads CLI Docs](https://github.com/beads-ai/beads) - Task management
- [Gmail MCP](https://github.com/modelcontextprotocol/servers/tree/main/src/gmail) - Email integration
- [Google Calendar MCP](https://github.com/modelcontextprotocol/servers/tree/main/src/google-calendar) - Calendar API

### Credentials Needed
- Gmail API credentials (OAuth 2.0)
- Google Calendar API credentials (OAuth 2.0)
- YNAB API token (already have)
- WhatsApp session (already have)

---

## 💡 Quick Start Guide

**To begin implementation**:

1. **Read the full plan**: Review `MULTI_AGENT_PLAN.md`

2. **Start with Orchestrator**:
   ```bash
   mkdir -p whatsapp-claude-ynab/agents/{base,orchestrator}
   touch whatsapp-claude-ynab/agents/base/BaseAgent.js
   touch whatsapp-claude-ynab/agents/orchestrator/Orchestrator.js
   ```

3. **Create base agent structure**

4. **Implement orchestrator with simple routing**

5. **Test integration**:
   ```javascript
   const orchestrator = new Orchestrator(anthropic, ynabService);
   modeRouter.setOrchestrator(orchestrator);
   ```

6. **Switch to multi-agent mode**: `/budgetnew`

7. **Test**: "show me my balance" (should route to budget agent)

8. **Expand incrementally**: Add trip, email, calendar agents one at a time

---

## 🚨 Important Notes

1. **Legacy Mode Must Always Work**
   - Don't break existing flows
   - Test with `/budgetok` frequently
   - Keep flowRouter unchanged

2. **Start Simple**
   - Get orchestrator working with just budget agent first
   - Add trip/email/calendar after basic routing works
   - Iterate based on feedback

3. **Use Existing Code**
   - Budget agent can reuse existing YNAB service code
   - Flow logic can be adapted for agents
   - Don't reinvent the wheel

4. **Test Frequently**
   - Unit tests for each agent
   - Integration tests for orchestrator
   - Real WhatsApp testing before rolling out

---

*Ready to begin? Start with Step 1: Directory Structure*

*Next file to create: `agents/base/BaseAgent.js`*
