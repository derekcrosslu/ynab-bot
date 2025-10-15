# Bug Tracking & Testing Checklist

**Last Updated:** 2025-10-15
**Purpose:** Track all bugs, test all flows systematically, prevent regression

---

## 🚨 CRITICAL BUGS (P0)

### Bug #1: PDF Extraction Relies on Claude Tool Call (NOT FIXED)
**Status:** 🔴 CRITICAL - NOT FIXED
**Reporter:** User (repeated multiple times)
**Date:** 2025-10-15

**Issue:**
- `extract_transactions_from_pdf_text` relies on Claude to call `cache_extracted_transactions`
- Claude says "Ahora voy a cachear..." but never executes the tool
- Result: Transactions extracted but never cached, debug shows "No hay transacciones extraídas"

**Root Cause:**
- Trusting Claude to execute tools is unreliable
- Should be a DIRECT async Claude call that auto-caches

**Expected Behavior:**
```javascript
case 'extract_transactions_from_pdf_text':
    // 1. Get PDF text from cache
    // 2. Call Claude DIRECTLY (no tool loop) to extract transactions
    // 3. AUTO-CACHE the extracted transactions
    // 4. Return formatted list to user
```

**Fix Required:**
- Make `extract_transactions_from_pdf_text` a direct async function
- Call Claude with PDF text as input
- Parse Claude's response to extract transaction array
- Automatically cache with `stateManager.imageTransactionsCache.set()`
- Return formatted message to user

**Test:**
1. Upload PDF
2. Check debug - should show cached transactions immediately
3. Confirm transactions can be created

---

### Bug #2: Transaction Display Not Showing Transactions
**Status:** 🔴 CRITICAL - NEEDS INVESTIGATION
**Reporter:** User
**Date:** 2025-10-15

**Issue:**
- User navigates to account (CHASE Credit Card 5861)
- Bot says: "31 transactions in last 6 months, all categorized ✅"
- BUT: No transactions are SHOWN to the user
- User tries conversational mode but it doesn't work at account level

**Root Cause:**
Unknown - needs investigation. Likely:
1. Claude calls `get_ynab_transactions` but doesn't format/display them
2. OR `executeClaudeTransactions` prompt is too vague

**Expected Behavior:**
When user selects account for transactions:
```
📊 Últimas 10 Transacciones - CHASE 5861

1. 2025-04-15 | Starbucks | -$5.50 | Eating Out
2. 2025-04-14 | Uber | -$12.00 | Transportation
3. 2025-04-13 | Amazon | -$45.99 | Shopping
...
```

**Fix Required:**
- Investigate why Claude isn't showing transactions
- Make `executeClaudeTransactions` more explicit
- OR bypass Claude entirely and format transactions directly

**Test:**
1. Navigate: Main → Ver Balances → USA BANKS → CHASE Credit Card 5861
2. THEN: Main → Ver Transacciones → USA BANKS → CHASE Credit Card 5861
3. Verify transactions are displayed

---

## ⚠️ HIGH PRIORITY BUGS (P1)

### Bug #3: Conversational Mode Not Working at Account Level
**Status:** 🟡 HIGH - NEEDS INVESTIGATION
**Reporter:** User
**Date:** 2025-10-15

**Issue:**
- User is at account level (after selecting CHASE 5861)
- State shows: "Estado: En conversación"
- User tries to talk to bot ("dame las 10 ultimas") but gets "Opción inválida"

**Root Cause:**
- State manager shows `state: 'conversation'`
- But menu handling still expects menu options
- Disconnect between state and actual behavior

**Expected Behavior:**
- If `state === 'conversation'`, user should be able to type natural language
- Bot should process it with Claude, not menu system

**Fix Required:**
- Check message handling logic in bot.js
- Ensure `state === 'conversation'` actually routes to `askClaude()`
- NOT to menu selection handler

**Test:**
1. Navigate to any account
2. Try typing natural language request
3. Verify it's processed by Claude, not rejected

---

## 📋 FLOW TESTING CHECKLIST

### Flow 1: View Balances
- [ ] **P0** Main → Ver Balances → USA BANKS → CHASE Checking 5540
- [ ] **P0** Main → Ver Balances → USA BANKS → All 12 accounts render correctly
- [ ] **P1** Main → Ver Balances → BCP SOLES → Account selection
- [ ] **P1** Main → Ver Balances → BCP DOLARES → Account selection

### Flow 2: View Transactions
- [ ] **P0** Main → Ver Transacciones → USA BANKS → CHASE Credit Card 5861
- [ ] **P0** Verify transactions are DISPLAYED (not just counted)
- [ ] **P1** Test all 12 USA BANKS accounts
- [ ] **P1** Test BCP accounts

### Flow 3: Create Transaction (Conversational)
- [ ] **P1** Main → Registrar Transacción → BCP SOLES
- [ ] **P1** Conversational flow: amount, payee, category
- [ ] **P1** Transaction created successfully
- [ ] **P2** Main → Registrar Transacción → BCP DOLARES

### Flow 4: Categorize Pending Transactions
- [ ] **P1** Main → Categorizar Pendientes → USA BANKS
- [ ] **P1** Claude suggests categories
- [ ] **P1** User confirms → transactions categorized
- [ ] **P2** Test with BCP accounts

### Flow 5: PDF Extraction
- [ ] **P0** Main → Registrar desde PDF/Imagen → Upload PDF
- [ ] **P0** Transactions extracted AND cached automatically
- [ ] **P0** Debug shows cached transactions
- [ ] **P0** User selects account → transactions created
- [ ] **P1** Test with image upload

### Flow 6: Intent Detection & Navigation
- [ ] **P1** Test "cancelar" from conversation mode → returns to main menu
- [ ] **P1** Test "back" / "0" → returns to previous menu
- [ ] **P1** Test /reset → clears all state
- [ ] **P1** Test /debug → shows comprehensive info
- [ ] **P1** Test /help → shows help message

### Flow 7: Session Timeout
- [ ] **P2** Wait 30+ minutes → session expires
- [ ] **P2** Bot notifies user and resets to main menu

---

## 🔧 MODULARIZATION BUGS

### Modularization #1: Services Work Correctly
- [x] **P0** ynabService.getBudgets() works
- [x] **P0** ynabService.getAccounts() works
- [x] **P0** ynabService.getTransactions() works
- [x] **P0** pdfService.extractText() works
- [x] **P0** stateManager manages state correctly

### Modularization #2: Future Extraction Needed
- [ ] **P1** Extract `claude-service.js` (direct Claude calls)
- [ ] **P1** Extract `menu-flow.js` (menu navigation logic)
- [ ] **P1** Extract `conversation-flow.js` (conversational mode)
- [ ] **P1** Extract `document-flow.js` (PDF/image processing)

---

## 🎯 EXPECTED BEHAVIORS

### Expected: Menu Mode
- User types menu number (1-9, a-c, 0)
- Bot navigates to selected menu
- Invalid input → shows available options

### Expected: Conversation Mode
- User types natural language
- Bot processes with Claude
- Claude uses tools as needed
- User can type "cancelar" to exit

### Expected: PDF Upload
1. User uploads PDF
2. Bot extracts text automatically
3. Bot calls Claude DIRECTLY to extract transactions
4. Transactions AUTO-CACHED
5. Bot shows formatted list
6. User selects account
7. Transactions created in YNAB

### Expected: Account Transaction View
1. User navigates to account
2. Bot shows last 10 transactions formatted
3. Each transaction: date | payee | amount | category
4. User can then talk to bot about them

---

## 📝 TESTING PROTOCOL

### Before Each Commit:
1. [ ] Run through all P0 flows
2. [ ] Verify no regression on previously working features
3. [ ] Test on actual WhatsApp (not just logs)
4. [ ] Update BUGS.md with status

### After Major Changes:
1. [ ] Run through all P0 + P1 flows
2. [ ] Update ARCHITECTURE.md if structure changed
3. [ ] Update MODULARIZATION_GUIDE.md if services changed

---

## 🏆 DEFINITION OF DONE

A feature is DONE when:
- ✅ Code written and tested
- ✅ Works in real WhatsApp client
- ✅ No console errors
- ✅ Debug info shows correct state
- ✅ User can complete the flow end-to-end
- ✅ BUGS.md updated with test results

---

**Next Actions:**
1. Fix Bug #1 (PDF extraction) - CRITICAL
2. Fix Bug #2 (transaction display) - CRITICAL
3. Fix Bug #3 (conversation mode) - HIGH
4. Test all P0 flows
5. Update this document with results

🤖 Generated with [Claude Code](https://claude.com/claude-code)
