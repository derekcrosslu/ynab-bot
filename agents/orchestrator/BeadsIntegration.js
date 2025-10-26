/**
 * Beads Integration - Persistent memory using Beads CLI
 *
 * Provides task/issue tracking across bot restarts
 * Uses git-backed Beads database for persistent memory
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class BeadsIntegration {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot || process.cwd();
        this.initialized = false;
    }

    /**
     * Initialize Beads in the workspace
     * @param {string} prefix - Prefix for issue IDs (e.g., 'YNAB')
     */
    async initialize(prefix = 'YNAB') {
        try {
            // Check if already initialized
            const { stdout } = await execPromise('bd where-am-i', {
                cwd: this.workspaceRoot
            });

            if (stdout.includes('.beads')) {
                console.log('✅ Beads already initialized');
                this.initialized = true;
                return true;
            }
        } catch (error) {
            // Not initialized, init now
            console.log('📦 Initializing Beads...');
            try {
                await execPromise(`bd init --prefix=${prefix}`, {
                    cwd: this.workspaceRoot
                });
                console.log(`✅ Beads initialized with prefix ${prefix}`);
                this.initialized = true;
                return true;
            } catch (initError) {
                console.error('❌ Failed to initialize Beads:', initError.message);
                return false;
            }
        }

        this.initialized = true;
        return true;
    }

    /**
     * Create a new issue/task
     * @param {Object} data - Issue data
     * @param {string} data.title - Issue title
     * @param {string} data.type - Issue type (task, bug, feature, epic, chore)
     * @param {number} data.priority - Priority (1-5, default 2)
     * @param {string} data.description - Description
     * @param {string} data.assignee - Assignee name
     * @param {Array<string>} data.deps - Dependencies (other issue IDs)
     * @returns {Promise<Object>} Created issue
     */
    async createIssue(data) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            let cmd = `bd create "${data.title}" --type=${data.type || 'task'}`;

            if (data.priority) {
                cmd += ` --priority=${data.priority}`;
            }

            if (data.assignee) {
                cmd += ` --assignee="${data.assignee}"`;
            }

            if (data.description) {
                cmd += ` --description="${data.description}"`;
            }

            if (data.deps && data.deps.length > 0) {
                cmd += ` --deps=${data.deps.join(',')}`;
            }

            const { stdout } = await execPromise(cmd, {
                cwd: this.workspaceRoot
            });

            // Parse output to get issue ID
            const match = stdout.match(/Created:\s+(\S+)/);
            const issueId = match ? match[1] : null;

            console.log(`✅ Created issue: ${issueId} - ${data.title}`);

            return {
                id: issueId,
                title: data.title,
                type: data.type || 'task',
                status: 'open'
            };
        } catch (error) {
            console.error('❌ Failed to create issue:', error.message);
            throw error;
        }
    }

    /**
     * Update an existing issue
     * @param {string} issueId - Issue ID
     * @param {Object} updates - Updates to apply
     * @param {string} updates.status - Status (open, in_progress, blocked, closed)
     * @param {number} updates.priority - Priority (1-5)
     * @param {string} updates.assignee - Assignee
     * @param {string} updates.notes - Additional notes
     * @returns {Promise<void>}
     */
    async updateIssue(issueId, updates) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            let cmd = `bd update ${issueId}`;

            if (updates.status) {
                cmd += ` --status=${updates.status}`;
            }

            if (updates.priority) {
                cmd += ` --priority=${updates.priority}`;
            }

            if (updates.assignee) {
                cmd += ` --assignee="${updates.assignee}"`;
            }

            if (updates.notes) {
                cmd += ` --notes="${updates.notes}"`;
            }

            await execPromise(cmd, {
                cwd: this.workspaceRoot
            });

            console.log(`✅ Updated issue: ${issueId}`);
        } catch (error) {
            console.error(`❌ Failed to update issue ${issueId}:`, error.message);
            throw error;
        }
    }

    /**
     * Get a specific issue
     * @param {string} issueId - Issue ID
     * @returns {Promise<Object>} Issue details
     */
    async getIssue(issueId) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const { stdout } = await execPromise(`bd show ${issueId}`, {
                cwd: this.workspaceRoot
            });

            // Parse output (simple text parsing for now)
            const issue = {
                id: issueId,
                raw: stdout
            };

            return issue;
        } catch (error) {
            console.error(`❌ Failed to get issue ${issueId}:`, error.message);
            throw error;
        }
    }

    /**
     * List issues with filters
     * @param {Object} filters - Filter options
     * @param {string} filters.status - Filter by status
     * @param {string} filters.assignee - Filter by assignee
     * @param {string} filters.type - Filter by type
     * @param {number} filters.priority - Filter by priority
     * @param {number} filters.limit - Limit results
     * @returns {Promise<Array>} List of issues
     */
    async listIssues(filters = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            let cmd = 'bd list';

            if (filters.status) {
                cmd += ` --status=${filters.status}`;
            }

            if (filters.assignee) {
                cmd += ` --assignee="${filters.assignee}"`;
            }

            if (filters.type) {
                cmd += ` --type=${filters.type}`;
            }

            if (filters.priority) {
                cmd += ` --priority=${filters.priority}`;
            }

            if (filters.limit) {
                cmd += ` --limit=${filters.limit}`;
            }

            const { stdout } = await execPromise(cmd, {
                cwd: this.workspaceRoot
            });

            // Simple parsing - in production would parse the table output
            // For now, just return the raw output
            return [{
                raw: stdout
            }];
        } catch (error) {
            console.error('❌ Failed to list issues:', error.message);
            return [];
        }
    }

    /**
     * Get ready tasks (no blockers)
     * @param {number} limit - Limit results
     * @returns {Promise<Array>} Ready tasks
     */
    async getReadyTasks(limit = 10) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const { stdout } = await execPromise(`bd ready --limit=${limit}`, {
                cwd: this.workspaceRoot
            });

            return [{
                raw: stdout
            }];
        } catch (error) {
            console.error('❌ Failed to get ready tasks:', error.message);
            return [];
        }
    }

    /**
     * Get blocked tasks
     * @returns {Promise<Array>} Blocked tasks
     */
    async getBlockedTasks() {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const { stdout } = await execPromise('bd blocked', {
                cwd: this.workspaceRoot
            });

            return [{
                raw: stdout
            }];
        } catch (error) {
            console.error('❌ Failed to get blocked tasks:', error.message);
            return [];
        }
    }

    /**
     * Close an issue
     * @param {string} issueId - Issue ID
     * @param {string} reason - Closure reason
     * @returns {Promise<void>}
     */
    async closeIssue(issueId, reason = 'Completed') {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            await execPromise(`bd close ${issueId} --reason="${reason}"`, {
                cwd: this.workspaceRoot
            });

            console.log(`✅ Closed issue: ${issueId}`);
        } catch (error) {
            console.error(`❌ Failed to close issue ${issueId}:`, error.message);
            throw error;
        }
    }

    /**
     * Add dependency between issues
     * @param {string} fromId - Issue that depends on another
     * @param {string} toId - Issue that is depended upon
     * @param {string} type - Dependency type (blocks, related, parent-child)
     * @returns {Promise<void>}
     */
    async addDependency(fromId, toId, type = 'blocks') {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            await execPromise(`bd dep ${fromId} ${toId} --type=${type}`, {
                cwd: this.workspaceRoot
            });

            console.log(`✅ Added dependency: ${fromId} ${type} ${toId}`);
        } catch (error) {
            console.error('❌ Failed to add dependency:', error.message);
            throw error;
        }
    }

    /**
     * Get statistics
     * @returns {Promise<Object>} Statistics
     */
    async getStats() {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const { stdout } = await execPromise('bd stats', {
                cwd: this.workspaceRoot
            });

            return {
                raw: stdout
            };
        } catch (error) {
            console.error('❌ Failed to get stats:', error.message);
            return null;
        }
    }
}

module.exports = BeadsIntegration;
