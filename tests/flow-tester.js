/**
 * Flow Testing Framework
 *
 * Allows testing conversation flows without needing WhatsApp connection.
 * Mocks the WhatsApp client and provides assertions for flow testing.
 */

class MockWhatsAppMessage {
    constructor(from, body, hasMedia = false) {
        this.from = from;
        this.body = body;
        this.hasMedia = hasMedia;
        this.type = hasMedia ? 'image' : 'chat';
        this._replies = [];
    }

    async reply(text) {
        this._replies.push(text);
        return { id: 'mock-' + Date.now() };
    }

    async downloadMedia() {
        if (!this.hasMedia) {
            throw new Error('No media to download');
        }
        return {
            mimetype: 'image/jpeg',
            data: 'fake-base64-data'
        };
    }

    getReplies() {
        return this._replies;
    }

    getLastReply() {
        return this._replies[this._replies.length - 1];
    }
}

class FlowTester {
    constructor() {
        this.userId = 'test-user@c.us';
        this.messageHandler = null;
        this.conversationLog = [];
    }

    /**
     * Set the message handler function to test
     * @param {Function} handler - Async function that handles messages
     */
    setMessageHandler(handler) {
        this.messageHandler = handler;
    }

    /**
     * Send a message and get response
     * @param {string} body - Message text
     * @param {boolean} hasMedia - Whether message has media
     * @returns {Object} Response data
     */
    async sendMessage(body, hasMedia = false) {
        if (!this.messageHandler) {
            throw new Error('Message handler not set. Use setMessageHandler() first.');
        }

        const msg = new MockWhatsAppMessage(this.userId, body, hasMedia);

        // Call handler
        await this.messageHandler(msg);

        // Get responses
        const replies = msg.getReplies();
        const lastReply = msg.getLastReply();

        // Log conversation
        this.conversationLog.push({
            type: 'user',
            message: body,
            timestamp: new Date().toISOString()
        });

        if (lastReply) {
            this.conversationLog.push({
                type: 'bot',
                message: lastReply,
                timestamp: new Date().toISOString()
            });
        }

        return {
            replies,
            lastReply,
            replyCount: replies.length
        };
    }

    /**
     * Simulate a complete flow by sending multiple messages
     * @param {Array<string>} messages - Array of messages to send
     * @returns {Array<Object>} Array of responses
     */
    async simulateFlow(messages) {
        const responses = [];

        for (const message of messages) {
            const response = await this.sendMessage(message);
            responses.push(response);

            // Small delay to simulate real user behavior
            await this._sleep(100);
        }

        return responses;
    }

    /**
     * Assert that last reply contains text
     * @param {string} text - Text to search for
     * @param {string} context - Context for error message
     */
    assertContains(text, context = '') {
        const lastReply = this.conversationLog[this.conversationLog.length - 1]?.message;

        if (!lastReply) {
            throw new Error(`${context}: No reply received`);
        }

        if (!lastReply.includes(text)) {
            throw new Error(
                `${context}: Expected reply to contain "${text}"\n` +
                `Actual reply: ${lastReply.substring(0, 200)}...`
            );
        }
    }

    /**
     * Assert that last reply does NOT contain text
     * @param {string} text - Text to search for
     * @param {string} context - Context for error message
     */
    assertNotContains(text, context = '') {
        const lastReply = this.conversationLog[this.conversationLog.length - 1]?.message;

        if (!lastReply) {
            throw new Error(`${context}: No reply received`);
        }

        if (lastReply.includes(text)) {
            throw new Error(
                `${context}: Expected reply to NOT contain "${text}"\n` +
                `Actual reply: ${lastReply.substring(0, 200)}...`
            );
        }
    }

    /**
     * Assert that a reply was received
     * @param {string} context - Context for error message
     */
    assertReplyReceived(context = '') {
        const lastReply = this.conversationLog[this.conversationLog.length - 1]?.message;

        if (!lastReply) {
            throw new Error(`${context}: No reply received`);
        }
    }

    /**
     * Get conversation log
     * @returns {Array<Object>} Conversation log
     */
    getConversationLog() {
        return this.conversationLog;
    }

    /**
     * Print conversation log (for debugging)
     */
    printConversation() {
        console.log('\n=== CONVERSATION LOG ===\n');
        this.conversationLog.forEach((entry, i) => {
            const prefix = entry.type === 'user' ? '👤 USER:' : '🤖 BOT:';
            console.log(`${i + 1}. ${prefix}`);
            console.log(entry.message.substring(0, 200));
            console.log('');
        });
        console.log('=== END LOG ===\n');
    }

    /**
     * Reset tester state
     */
    reset() {
        this.conversationLog = [];
    }

    /**
     * Sleep helper
     * @param {number} ms - Milliseconds to sleep
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Test runner - runs multiple test cases
 */
class TestRunner {
    constructor() {
        this.tests = [];
        this.results = {
            passed: 0,
            failed: 0,
            errors: []
        };
    }

    /**
     * Add a test case
     * @param {string} name - Test name
     * @param {Function} testFn - Async test function
     */
    addTest(name, testFn) {
        this.tests.push({ name, testFn });
    }

    /**
     * Run all tests
     * @returns {Object} Test results
     */
    async run() {
        console.log(`\n🧪 Running ${this.tests.length} tests...\n`);

        for (const test of this.tests) {
            try {
                await test.testFn();
                console.log(`✅ ${test.name}`);
                this.results.passed++;
            } catch (error) {
                console.log(`❌ ${test.name}`);
                console.log(`   Error: ${error.message}\n`);
                this.results.failed++;
                this.results.errors.push({
                    test: test.name,
                    error: error.message,
                    stack: error.stack
                });
            }
        }

        console.log('\n=== TEST RESULTS ===');
        console.log(`✅ Passed: ${this.results.passed}`);
        console.log(`❌ Failed: ${this.results.failed}`);
        console.log(`Total: ${this.tests.length}`);

        if (this.results.failed > 0) {
            console.log('\n=== FAILURES ===');
            this.results.errors.forEach(err => {
                console.log(`\n${err.test}:`);
                console.log(err.error);
            });
        }

        return this.results;
    }
}

module.exports = {
    FlowTester,
    TestRunner,
    MockWhatsAppMessage
};
