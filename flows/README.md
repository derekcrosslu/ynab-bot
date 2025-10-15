# Flow-Based Conversational Architecture

This directory contains the flow-based conversational system for the WhatsApp YNAB Bot. This architecture replaces the previous menu-based system with intelligent, context-aware conversational flows.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Core Components](#core-components)
- [Available Flows](#available-flows)
- [Creating New Flows](#creating-new-flows)
- [Testing Flows](#testing-flows)

---

## Overview

The flow-based system provides:

- **Natural Language Understanding**: Users can interact naturally ("agregar gasto", "spent $50 at Starbucks")
- **Conversational Context**: Flows maintain state across multiple messages
- **Smart Intent Routing**: 4-layer routing system ensures accurate intent detection
- **Reusable Components**: Child flows for common operations (account/category selection)
- **Session Management**: Automatic timeout and cleanup after 30 minutes of inactivity
- **Backward Compatibility**: Menu system remains as fallback

## Architecture

### Message Flow

```
Incoming WhatsApp Message
         ↓
Global Slash Commands (/reset, /cancel, /help, /debug)
         ↓ (if not handled)
Flow Router - 4 Layers:
    1. Active Flow Check → Delegate to existing flow if user in conversation
    2. Rule-Based Matching → Fast regex/keyword pattern matching
    3. Parameter Extraction → Smart parsing of amounts, dates, etc.
    4. AI Fallback → Claude intent detection when rules don't match
         ↓ (if not handled)
Menu System (fallback for unmatched messages)
```

### Session Lifecycle

1. **Start**: User sends message matching a flow pattern
2. **Active**: Flow processes messages via `onMessage()`
3. **Child Flows**: Flow can invoke reusable child flows (e.g., SelectAccountFlow)
4. **Complete**: Flow reaches 'complete' or 'cancelled' state
5. **Cleanup**: Session automatically cleared on completion or after 30min timeout

---

## Core Components

### 1. BaseFlow (`BaseFlow.js`)

The foundation class that all flows inherit from.

**Key Methods:**
```javascript
static matches(messageText)        // Returns true if message should trigger this flow
static extractParams(message)      // Extract parameters (amount, payee, etc.) from message
async onStart(message)              // Called when flow is first started
async onMessage(message)            // Called for each subsequent user message
async onChildFlowComplete(result)   // Called when a child flow completes
invokeChildFlow(childFlow, message) // Start a reusable child flow
returnToParent(result)              // Return control and data to parent flow
isComplete()                        // Returns true if flow is done
cancel()                            // Cancel the flow
```

**State Structure:**
```javascript
{
  step: 'start' | 'selecting' | 'confirming' | 'complete' | 'cancelled',
  data: { /* flow-specific data */ }
}
```

### 2. Flow State Manager (`state.js`)

Manages active flow sessions for all users.

**Key Functions:**
```javascript
getUserSession(userId)              // Get user's active flow session (with timeout check)
startFlowForUser(userId, flowInstance) // Start a new flow for user
handleFlowMessage(userId, message)  // Route message to user's active flow
clearUserSession(userId)            // Clear user's flow session
updateUserActivity(userId)          // Update last activity timestamp
```

**Session Structure:**
```javascript
{
  flowInstance: BaseFlow,           // The active flow instance
  startTime: timestamp,              // When flow started
  lastActivity: timestamp            // Last message received (for timeout)
}
```

**Timeout**: Sessions automatically expire after 30 minutes of inactivity.

### 3. Flow Router (`router.js`)

4-layer intent routing system.

**Layer 1: Active Flow Check**
```javascript
// If user has active flow, delegate message to it
const session = flowState.getUserSession(userId);
if (session) {
    return await flowState.handleFlowMessage(userId, message);
}
```

**Layer 2: Rule-Based Matching**
```javascript
// Check each flow's matches() method
for (const FlowClass of flowRegistry) {
    if (FlowClass.matches(messageText)) {
        // Start flow
    }
}
```

**Layer 3: Parameter Extraction**
```javascript
// Try to extract meaningful parameters
const params = FlowClass.extractParams(messageText);
if (Object.keys(params).length > 0) {
    // Start flow with pre-filled data
}
```

**Layer 4: AI Fallback**
```javascript
// Use Claude to detect intent when rules don't match
const intent = await detectIntentWithAI(messageText);
// Start appropriate flow based on detected intent
```

### 4. Flow Registry (`index.js`)

Central registry of all available flows.

**Registered Flows:**
- AddExpenseFlow
- ViewTransactionsFlow
- ViewBalanceFlow
- ProcessPDFFlow
- CategorizeTransactionsFlow

**Child Flows (not in registry):**
- SelectCategoryFlow
- SelectAccountFlow

---

## Available Flows

### 1. AddExpenseFlow

**Purpose**: Conversational flow for recording manual transactions (expenses/income).

**Trigger Patterns**:
- "agregar gasto", "add expense"
- "gasté $50", "spent $50"
- "pagué", "compré", "bought"

**Flow Steps**:
1. **Budget Selection**: Which budget? (BCP SOLES or BCP DOLARES)
2. **Account Selection**: Invokes SelectAccountFlow child flow
3. **Amount**: How much? (negative for expenses, positive for income)
4. **Payee**: Where/Who? (e.g., "Starbucks", "Salary")
5. **Category**: Optional - Invokes SelectCategoryFlow child flow
6. **Memo**: Optional description
7. **Confirmation**: Show summary and confirm

**Example Interaction**:
```
User: "gasté 50"
Bot:  🏦 Selecciona un Presupuesto
      1. BCP SOLES
      2. BCP DOLARES

User: "1"
Bot:  🏦 Selecciona una Cuenta
      1. Cuenta Corriente (1,250.00)
      2. Tarjeta de Crédito (-480.00)

User: "corriente"
Bot:  💰 ¿Cuánto gastaste/ingresaste?
      (Negativo para gastos, positivo para ingresos)

User: "-50"
Bot:  🏪 ¿Dónde fue la transacción?
      Escribe el nombre del lugar o persona.

User: "starbucks"
Bot:  📁 Selecciona una Categoría
      1. Groceries
      2. Eating Out
      3. Entertainment
      ...

User: "eating out"
Bot:  ✅ Transacción creada exitosamente
```

**State Data**:
```javascript
{
  budgetName: 'BCP SOLES',
  budgetId: 'xxx',
  accounts: [...],
  selectedAccount: {...},
  amount: -50,
  payee: 'Starbucks',
  category: {...},
  memo: ''
}
```

**File**: `AddExpenseFlow.js` (372 lines)

---

### 2. ViewTransactionsFlow

**Purpose**: Display recent transactions with filtering options.

**Trigger Patterns**:
- "ver transacciones", "show transactions"
- "mostrar últimas 10"
- "transacciones de BCP SOLES"

**Flow Steps**:
1. **Budget Selection**: If not specified in initial message
2. **Account Filter**: Optional - show all or specific account
3. **Display**: Show last 10 transactions sorted by date (descending)
4. **Pagination**: User can request "más" for next 10

**Parameter Extraction**:
```javascript
// Extracts from initial message:
- budgetName: "BCP SOLES", "BCP DOLARES"
- accountFilter: "5861", "corriente"
- limit: "10", "20"
- days: "últimos 30 días"
```

**Example Output**:
```
📊 Últimas 10 Transacciones
Cuenta: Cuenta Corriente
Presupuesto: BCP SOLES

1. 2025-10-14
   Starbucks | -$15.50
   📁 Eating Out ✅

2. 2025-10-13
   Uber | -$8.00
   📁 Transportation ✅

...

💡 Total: 45 transacciones en últimos 90 días
```

**Direct Implementation**: Does NOT use Claude tools - directly calls ynabService.getTransactions() and formats output.

**File**: `ViewTransactionsFlow.js` (273 lines)

---

### 3. ViewBalanceFlow

**Purpose**: Display account balances for a budget.

**Trigger Patterns**:
- "ver balances", "show balances"
- "saldo de BCP SOLES"
- "balance"

**Flow Steps**:
1. **Budget Selection**: If not specified
2. **Display**: Show all accounts with balances grouped by type

**Example Output**:
```
💰 Balances - BCP SOLES

💳 Checking:
• Cuenta Corriente: S/ 1,250.00

💳 Credit Card:
• Tarjeta de Crédito: S/ -480.00

📊 Total Budget: S/ 770.00
```

**Direct Implementation**: Calls ynabService.getAccounts() directly.

**File**: `ViewBalanceFlow.js` (198 lines)

---

### 4. ProcessPDFFlow

**Purpose**: Extract transactions from PDF bank statements and import to YNAB.

**Trigger Patterns**:
- Automatically triggered when user uploads a PDF document
- No text-based triggers (document upload detection)

**Flow Steps**:
1. **PDF Text Extraction**: Extract text from uploaded PDF
2. **Budget Selection**: Ask user which budget (BCP SOLES or BCP DOLARES)
3. **Transaction Extraction**: Use Claude AI to parse transactions from PDF text
4. **Preview**: Show extracted transactions with suggested categories
5. **Account Selection**: Ask which account to import to
6. **Confirmation**: User confirms import
7. **Bulk Import**: Create all transactions via create_multiple_transactions

**Critical Implementation**:
```javascript
// DIRECT ASYNC EXTRACTION - Does NOT rely on Claude tool execution
async _extractTransactions() {
    // Get categories for intelligent categorization
    const categories = await ynabService.getCategories(budgetId);

    // Call Claude DIRECTLY
    const response = await anthropicClient.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{
            role: 'user',
            content: extractionPrompt
        }]
    });

    // Parse JSON response
    const transactions = JSON.parse(responseText);

    // AUTO-CACHE for later confirmation
    this.state.data.extractedTransactions = transactions;
}
```

**PDF Parsing Rules**:
- CARGOS/DEBE column → Negative amounts (expenses)
- ABONOS/HABER column → Positive amounts (income)
- Date format: DDMMM (03ABR) → YYYY-MM-DD (2025-04-03)

**Example Flow**:
```
User: [uploads PDF]
Bot:  📄 PDF recibido. ¿Qué presupuesto?
      1. BCP SOLES
      2. BCP DOLARES

User: "1"
Bot:  [Extracting transactions...]

      ✅ Encontré 25 transacciones

      1. 2025-04-03 | Starbucks | -S/ 15.50 | Eating Out
      2. 2025-04-05 | Uber | -S/ 8.00 | Transportation
      ...

      ¿En qué cuenta deseas importarlas?

User: "corriente"
Bot:  ✅ 25 transacciones importadas exitosamente
```

**File**: `ProcessPDFFlow.js` (316 lines)

---

### 5. CategorizeTransactionsFlow

**Purpose**: AI-powered categorization of pending/uncategorized transactions.

**Trigger Patterns**:
- "categorizar pendientes", "categorize transactions"
- "categorizar sin categoría"

**Flow Steps**:
1. **Budget Selection**: If not specified
2. **Fetch Pending**: Get unapproved or uncategorized transactions
3. **AI Categorization**: Use Claude to analyze payees and suggest categories
4. **Review Suggestions**: Show user the suggested categorizations
5. **Confirmation**: User can accept all, reject, or modify
6. **Batch Update**: Apply categorizations to all transactions

**AI Suggestion Logic**:
```javascript
// Claude analyzes payee names and suggests categories:
- "Starbucks" → "Eating Out"
- "Uber", "Taxi" → "Transportation"
- "Plaza Vea", "Wong" → "Groceries"
- "Netflix", "Spotify" → "Entertainment"
- "Luz del Sur" → "Electric"
```

**Example Flow**:
```
User: "categorizar pendientes"
Bot:  🏷️ Categorizando Pendientes - BCP SOLES

      Encontré 5 transacciones sin categorizar:

      1. Starbucks (-S/ 15.50)
         Sugerencia: Eating Out ✓

      2. Uber (-S/ 8.00)
         Sugerencia: Transportation ✓

      ...

      ¿Aplicar estas categorizaciones? (sí/no)

User: "sí"
Bot:  ✅ 5 transacciones categorizadas exitosamente
```

**File**: `CategorizeTransactionsFlow.js` (289 lines)

---

## Child Flows (Reusable Components)

### SelectCategoryFlow

**Purpose**: Reusable category selection component.

**Usage**: Can be invoked by any parent flow that needs category selection.

**Features**:
- Shows 15 categories at a time
- Pagination support ("más" to see more)
- Number selection (1, 2, 3...)
- Name matching (partial, case-insensitive)
- "ninguna" to skip category selection

**Invocation**:
```javascript
// In parent flow:
const categoryFlow = new SelectCategoryFlow(this.userId, {
    budgetId: this.state.data.budgetId,
    categories: categories
});

return await this.invokeChildFlow(categoryFlow, message);
```

**Return**:
```javascript
async onChildFlowComplete(result) {
    const selectedCategory = result.selectedCategory; // or null if skipped
    // Continue parent flow logic
}
```

**File**: `SelectCategoryFlow.js` (201 lines)

---

### SelectAccountFlow

**Purpose**: Reusable account selection component.

**Usage**: Can be invoked by any parent flow that needs account selection.

**Features**:
- Shows all accounts with balances
- Number selection (1, 2, 3...)
- Name matching (partial, case-insensitive)
- Optional balance display

**Invocation**:
```javascript
// In parent flow:
const accountFlow = new SelectAccountFlow(this.userId, {
    budgetName: 'BCP SOLES',
    budgetId: budgetId,
    accounts: accounts,
    showBalance: true
});

return await this.invokeChildFlow(accountFlow, message);
```

**Return**:
```javascript
async onChildFlowComplete(result) {
    const selectedAccount = result.selectedAccount;
    // Continue parent flow logic
}
```

**File**: `SelectAccountFlow.js` (190 lines)

---

## Creating New Flows

### Step 1: Create Flow Class

```javascript
const BaseFlow = require('./BaseFlow');
const ynabService = require('../services/ynab-service');

class MyNewFlow extends BaseFlow {
    constructor(userId, options = {}) {
        super(userId);
        this.intent = 'my_new_feature';
        this.state = {
            step: 'start',
            data: {
                // Initialize your data
            }
        };
    }

    /**
     * Define trigger patterns
     */
    static matches(messageText) {
        const normalized = messageText.toLowerCase().trim();
        return /\b(my|trigger|patterns)\b/i.test(normalized);
    }

    /**
     * Optional: Extract parameters from initial message
     */
    static extractParams(message) {
        const params = {};
        // Extract data from message
        return params;
    }

    /**
     * Start the flow
     */
    async onStart(message) {
        console.log(`🚀 Starting MyNewFlow for ${this.userId}`);

        // Your initialization logic
        this.state.step = 'collecting_data';
        return 'Welcome! What would you like to do?';
    }

    /**
     * Handle user messages
     */
    async onMessage(message) {
        // Check for common commands (cancel, help)
        const commonResponse = this.handleCommonCommands(message);
        if (commonResponse) return commonResponse;

        // Handle based on current step
        switch (this.state.step) {
            case 'collecting_data':
                return this._handleDataCollection(message);

            case 'confirming':
                return this._handleConfirmation(message);

            default:
                return 'Something went wrong. Please try again.';
        }
    }

    /**
     * Example step handler
     */
    async _handleDataCollection(message) {
        // Save data
        this.state.data.userInput = message;

        // Move to next step
        this.state.step = 'confirming';
        return `You entered: ${message}\n\nIs this correct? (yes/no)`;
    }

    /**
     * Example confirmation handler
     */
    async _handleConfirmation(message) {
        const normalized = message.toLowerCase().trim();

        if (normalized === 'yes' || normalized === 'sí') {
            // Complete the flow
            this.state.step = 'complete';
            return '✅ Done! Your request has been processed.';
        } else {
            // Go back
            this.state.step = 'collecting_data';
            return 'OK, let\'s try again. What would you like to enter?';
        }
    }

    /**
     * Get help for this flow
     */
    getHelp() {
        return `💡 *Help - My New Feature*

You can:
- Do this
- Do that

Type "cancel" to exit.`;
    }
}

module.exports = MyNewFlow;
```

### Step 2: Register the Flow

Edit `flows/index.js`:

```javascript
// Import your flow
const MyNewFlow = require('./MyNewFlow');

// Add to registry
const flowRegistry = [
    AddExpenseFlow,
    ViewTransactionsFlow,
    ViewBalanceFlow,
    ProcessPDFFlow,
    CategorizeTransactionsFlow,
    MyNewFlow  // ← Add here
];

// Export
module.exports.MyNewFlow = MyNewFlow;
```

### Step 3: Add to Router (if needed)

Edit `flows/router.js` if your flow needs special routing logic:

```javascript
// In ruleBasedMatching() function
const flowClasses = [
    AddExpenseFlow,
    ViewTransactionsFlow,
    ViewBalanceFlow,
    CategorizeTransactionsFlow,
    MyNewFlow  // ← Add here if it has text-based triggers
];
```

---

## Testing Flows

### Manual Testing Checklist

For each flow, test:

1. **Trigger Detection**
   - [ ] Flow triggers with expected keywords
   - [ ] Flow doesn't trigger on unrelated messages
   - [ ] Parameter extraction works correctly

2. **Happy Path**
   - [ ] Flow completes successfully with valid inputs
   - [ ] All steps execute in order
   - [ ] Final action (create transaction, display data) works
   - [ ] Confirmation message is clear

3. **Error Handling**
   - [ ] Invalid inputs are rejected with helpful messages
   - [ ] API errors are caught and reported
   - [ ] Flow doesn't crash on unexpected inputs

4. **Edge Cases**
   - [ ] Empty inputs handled gracefully
   - [ ] Very long inputs don't break formatting
   - [ ] Special characters in inputs (accents, symbols)
   - [ ] Numbers vs. text selection both work

5. **Navigation**
   - [ ] "cancelar" exits flow correctly
   - [ ] "ayuda" shows flow-specific help
   - [ ] Going "back" works where applicable
   - [ ] Session timeout after 30 minutes

6. **Child Flows** (if applicable)
   - [ ] Child flow invocation works
   - [ ] Data returns to parent correctly
   - [ ] Parent flow resumes after child completes

7. **Multi-User**
   - [ ] Different users can run same flow simultaneously
   - [ ] User sessions don't interfere with each other
   - [ ] State isolation is maintained

### Example Test Script

```javascript
// Test AddExpenseFlow
1. Send: "gasté 50"
   Expect: Budget selection menu

2. Send: "1" (BCP SOLES)
   Expect: Account selection menu

3. Send: "corriente"
   Expect: Amount prompt

4. Send: "-50"
   Expect: Payee prompt

5. Send: "starbucks"
   Expect: Category selection

6. Send: "eating out"
   Expect: Memo prompt (optional)

7. Send: "coffee break"
   Expect: Confirmation summary

8. Send: "sí"
   Expect: "✅ Transacción creada"
```

### Integration Testing

Test flow interactions:

```javascript
// Test flow → flow transition
1. Complete AddExpenseFlow
2. Immediately start ViewTransactionsFlow
   Expect: New transaction appears in list

// Test session timeout
1. Start AddExpenseFlow
2. Wait 31 minutes
3. Send any message
   Expect: Session expired message, flow reset

// Test concurrent users
User A starts AddExpenseFlow (step 3/7)
User B starts ViewBalanceFlow
User A continues AddExpenseFlow
   Expect: Both flows continue independently
```

---

## Common Patterns

### Pattern 1: Multi-Step Data Collection

```javascript
async onMessage(message) {
    switch (this.state.step) {
        case 'get_name':
            this.state.data.name = message;
            this.state.step = 'get_email';
            return 'What is your email?';

        case 'get_email':
            this.state.data.email = message;
            this.state.step = 'confirm';
            return `Name: ${this.state.data.name}\nEmail: ${message}\n\nCorrect?`;

        case 'confirm':
            if (this._isAffirmative(message)) {
                await this._saveData();
                this.state.step = 'complete';
                return '✅ Saved!';
            }
            // Handle rejection...
    }
}
```

### Pattern 2: Invoking Child Flows

```javascript
async onMessage(message) {
    if (this.state.step === 'need_category') {
        // Invoke child flow
        const categoryFlow = new SelectCategoryFlow(this.userId, {
            budgetId: this.state.data.budgetId,
            categories: this.state.data.categories
        });

        this.state.step = 'selecting_category';
        return await this.invokeChildFlow(categoryFlow, message);
    }
}

async onChildFlowComplete(result) {
    if (this.state.step === 'selecting_category') {
        this.state.data.category = result.selectedCategory;
        this.state.step = 'next_step';
        return 'Great! Moving on...';
    }
}
```

### Pattern 3: Direct API Calls (No Claude Tools)

```javascript
async _fetchAndDisplay() {
    try {
        // Direct service call
        const data = await ynabService.getSomeData(budgetId);

        // Format output
        let message = '📊 *Results*\n\n';
        data.forEach(item => {
            message += `• ${item.name}: ${item.value}\n`;
        });

        return message;
    } catch (error) {
        console.error('Error:', error);
        return `❌ Error: ${error.message}`;
    }
}
```

### Pattern 4: Confirmation Workflow

```javascript
_showConfirmation() {
    const { amount, payee, category } = this.state.data;

    this.state.step = 'confirming';

    return `📋 *Confirma los datos:*

💰 Monto: ${amount}
🏪 Payee: ${payee}
📁 Categoría: ${category}

¿Crear transacción? (sí/no)`;
}

async _handleConfirmation(message) {
    const normalized = message.toLowerCase().trim();

    if (this._isAffirmative(normalized)) {
        await ynabService.createTransaction(...);
        this.state.step = 'complete';
        return '✅ Transaction created!';
    } else {
        this.state.step = 'cancelled';
        return '❌ Cancelled.';
    }
}

_isAffirmative(text) {
    return ['yes', 'sí', 'si', 'ok', 'confirm', 'confirmar'].includes(text);
}
```

---

## Troubleshooting

### Flow Not Triggering

**Problem**: User message not matching flow pattern.

**Solutions**:
1. Check `matches()` regex pattern is correct
2. Test regex at: https://regex101.com/
3. Add console.log in `matches()` to debug
4. Verify flow is in registry (`flows/index.js`)

### Flow State Lost

**Problem**: Flow resets unexpectedly.

**Solutions**:
1. Check session timeout (30 minutes)
2. Verify no calls to `clearUserSession()`
3. Check for `isComplete()` returning true prematurely
4. Review error handling - ensure flow doesn't complete on error

### Child Flow Not Returning

**Problem**: Parent flow doesn't resume after child completes.

**Solutions**:
1. Verify child flow calls `this.returnToParent(result)`
2. Check parent implements `onChildFlowComplete(result)`
3. Ensure child flow sets `step = 'complete'`
4. Debug with console.log in both flows

### Multiple Users Interfering

**Problem**: User A's actions affect User B.

**Solutions**:
1. Ensure flow uses `this.userId` for all operations
2. Verify state is instance-based (not global)
3. Check caches use userId as key
4. Review service calls include user context

---

## Best Practices

1. **Always use child flows for reusable components** (account/category selection)
2. **Validate user input** before moving to next step
3. **Provide clear error messages** with guidance on what to do next
4. **Show progress indicators** (Step 1/5, etc.) for long flows
5. **Confirm before destructive actions** (deleting, bulk operations)
6. **Keep responses concise** for WhatsApp (max 2-3 paragraphs)
7. **Use emojis sparingly** for visual clarity (✅ ❌ 💰 📊)
8. **Log important events** for debugging (console.log)
9. **Handle edge cases gracefully** (empty input, special characters)
10. **Test with real data** before deploying

---

## Performance Considerations

- **Session Timeout**: 30 minutes keeps memory usage low
- **Message Queue**: Prevents race conditions for same user
- **Direct API Calls**: ProcessPDFFlow and ViewTransactionsFlow don't use Claude tools (faster, more reliable)
- **Lazy Loading**: Child flows only loaded when needed
- **Cache Management**: Caches expire automatically after 30 minutes

---

## Migration Notes

### From Menu System to Flows

The flow system now handles most interactions, with the menu system as fallback:

**Before (Menu)**:
```
User selects menu option 2.1 → executeClaudeTransactions → Claude formats output
```

**After (Flow)**:
```
User says "ver transacciones" → ViewTransactionsFlow → Direct YNAB API call → Formatted output
```

**Benefits**:
- Natural language understanding
- Context preservation across messages
- Faster (direct API calls)
- More reliable (no Claude tool execution dependency)

**Backward Compatibility**:
- Menu system still works for numeric selections
- Old commands still function
- Gradual migration path

---

## Support

For questions or issues:
1. Check this README
2. Review flow source code for examples
3. Test with `/debug` command to see flow state
4. Check console logs for detailed execution trace

---

**Last Updated**: October 2025
**Architecture Version**: 2.0 (Flow-Based)
