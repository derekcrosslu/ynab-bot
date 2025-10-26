# Ubuntu Server Setup Instructions

## 🔒 Security Note

✅ **Good!** You're using SSH certificate authentication instead of passwords. This is best practice.

---

## 📋 Quick Setup (3 Steps)

### Step 1: Upload Setup Script to Server

**From your local machine:**

```bash
# Copy the setup script to your server
scp setup-ubuntu-server.sh root@144.202.27.10:/root/

# SSH to your server
ssh root@144.202.27.10
```

### Step 2: Run the Setup Script

**On your server:**

```bash
# Make the script executable
chmod +x /root/setup-ubuntu-server.sh

# Run the setup (will ask for API keys)
./setup-ubuntu-server.sh
```

The script will:
- ✅ Update system packages
- ✅ Install Node.js 20.x
- ✅ Install Google Chrome (for WhatsApp Web)
- ✅ Install PM2, Claude Code, Beads CLI
- ✅ Clone the bot repository
- ✅ Install bot dependencies
- ✅ Create .env configuration
- ✅ Initialize Beads memory system

**You'll be prompted for:**
1. **Anthropic API Key** - Your Claude API key
2. **YNAB API Token** - Your YNAB personal access token
3. **Installation directory** - Default: `/opt/whatsapp-ynab-bot`
4. **Start bot now?** - Yes/No

### Step 3: Scan QR Code

**First run only:**

```bash
# The bot will display a QR code in your terminal
# Scan it with WhatsApp on your phone

pm2 logs whatsapp-ynab-bot
```

---

## 🎯 What Gets Installed

| Component | Purpose | Version |
|-----------|---------|---------|
| Node.js | JavaScript runtime | 20.x |
| npm | Package manager | Latest |
| Google Chrome | WhatsApp Web automation | Stable |
| PM2 | Process manager | Latest |
| Claude Code | AI coding assistant | Latest |
| Beads CLI | Multi-agent memory | Latest |
| tmux | Terminal multiplexer | Latest |

---

## 📂 Directory Structure

After setup:

```
/opt/whatsapp-ynab-bot/          # Bot installation
├── .env                          # Your API keys (created by script)
├── .wwebjs_auth/                 # WhatsApp session (auto-created)
├── .beads/                       # Beads memory database (auto-created)
├── bot.js                        # Main bot file
├── agents/                       # Multi-agent system
│   ├── base/
│   ├── orchestrator/
│   └── budget/
├── flows/                        # Legacy flow system
└── package.json
```

---

## 🚀 Managing the Bot

### PM2 Commands

```bash
# View status
pm2 status

# View logs (live)
pm2 logs whatsapp-ynab-bot

# View logs (last 100 lines)
pm2 logs whatsapp-ynab-bot --lines 100

# Restart bot
pm2 restart whatsapp-ynab-bot

# Stop bot
pm2 stop whatsapp-ynab-bot

# Start bot (if stopped)
pm2 start whatsapp-ynab-bot

# Remove from PM2
pm2 delete whatsapp-ynab-bot

# View detailed info
pm2 show whatsapp-ynab-bot
```

### Enable Auto-Start on Reboot

```bash
# Run once after setup
pm2 startup
pm2 save

# Now the bot will auto-start if server reboots
```

---

## 🧪 Testing the Bot

### Test in WhatsApp

Once the QR code is scanned:

```
1. Send: /help
   → Should show help menu

2. Send: /mode
   → Should show: "Current Mode: Legacy Mode"

3. Send: /budgetnew
   → Should switch to multi-agent mode

4. Send: show me my balance
   → Should show your YNAB balances
```

### Check Logs for Errors

```bash
pm2 logs whatsapp-ynab-bot --err
```

---

## 🔧 Troubleshooting

### Bot Won't Start

**Check logs:**
```bash
pm2 logs whatsapp-ynab-bot
```

**Common issues:**

1. **Missing API keys**
   ```bash
   cd /opt/whatsapp-ynab-bot
   nano .env
   # Add your keys
   pm2 restart whatsapp-ynab-bot
   ```

2. **Port already in use**
   ```bash
   pm2 delete whatsapp-ynab-bot
   pm2 start bot.js --name whatsapp-ynab-bot
   ```

3. **Chrome not found**
   ```bash
   google-chrome --version
   # If not installed, run: sudo apt-get install google-chrome-stable
   ```

### WhatsApp Session Expired

```bash
# Remove old session
cd /opt/whatsapp-ynab-bot
rm -rf .wwebjs_auth/

# Restart bot (will show QR code again)
pm2 restart whatsapp-ynab-bot
pm2 logs whatsapp-ynab-bot
```

### Update the Bot

```bash
cd /opt/whatsapp-ynab-bot
git pull origin main
npm install
pm2 restart whatsapp-ynab-bot
```

---

## 🛠️ Development Workflow

### Using tmux for Multiple Sessions

```bash
# Create tmux session
tmux new -s dev

# Window 1: Bot logs
pm2 logs whatsapp-ynab-bot

# Create new window: Ctrl+B then C
# Window 2: Claude Code
claude-code

# Switch between windows:
# Ctrl+B then N (next)
# Ctrl+B then P (previous)

# Detach from tmux: Ctrl+B then D
# Reattach: tmux attach -s dev
```

### Using Claude Code on Server

```bash
# SSH to server
ssh root@144.202.27.10

# Start Claude Code
claude-code

# Now you can ask me to:
# - Debug the bot
# - Add new features
# - Review logs
# - Fix errors
```

---

## 📊 Monitoring

### View Resource Usage

```bash
# Check memory/CPU
pm2 monit

# Check disk space
df -h

# Check memory
free -h

# Check running processes
htop
```

### View Statistics

```bash
# PM2 stats
pm2 info whatsapp-ynab-bot

# Beads stats
cd /opt/whatsapp-ynab-bot
bd stats
```

---

## 🔐 Security Best Practices

Your setup is already secure with SSH certificates! Additional recommendations:

### 1. Firewall Configuration

```bash
# Install UFW
apt-get install ufw

# Allow SSH
ufw allow 22/tcp

# Enable firewall
ufw enable

# Check status
ufw status
```

### 2. Protect .env File

```bash
cd /opt/whatsapp-ynab-bot
chmod 600 .env
chown root:root .env
```

### 3. Regular Updates

```bash
# System updates
apt-get update && apt-get upgrade -y

# Node.js packages
cd /opt/whatsapp-ynab-bot
npm update
pm2 restart whatsapp-ynab-bot
```

---

## 📱 WhatsApp Bot Commands

Once running, users can send to the bot:

### System Commands
- `/help` - Show help
- `/reset` - Reset conversation
- `/debug` - System diagnostics
- `/menu` - Main menu

### Mode Switching
- `/budgetok` - Legacy mode (proven flows)
- `/budgetnew` - Multi-agent mode (new features)
- `/mode` - Check current mode

### Budget Operations
- `show me my balance`
- `show transactions for [account]`
- `add $50 expense at Starbucks`
- `categorize pending transactions`
- `analyze my spending`

---

## 🌐 Accessing from Multiple Locations

Since you're using SSH certificates, you can access from anywhere:

```bash
# From any machine with your SSH key
ssh root@144.202.27.10

# Use tmux to keep sessions running
tmux attach -s dev  # or create new: tmux new -s dev
```

---

## 📝 Environment Variables Reference

Your `.env` file (created by setup script):

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...      # Claude API key
YNAB_API_TOKEN=...                # YNAB personal access token

# Dual-Mode System
DEFAULT_MODE=legacy               # Start mode: 'legacy' or 'multi-agent'
BETA_USERS=                       # Comma-separated WhatsApp IDs for beta
```

---

## 🔄 Backup & Restore

### Backup WhatsApp Session

```bash
# Backup
tar -czf whatsapp-backup.tar.gz /opt/whatsapp-ynab-bot/.wwebjs_auth/

# Restore (if needed)
tar -xzf whatsapp-backup.tar.gz -C /
pm2 restart whatsapp-ynab-bot
```

### Backup Beads Database

```bash
# Backup
tar -czf beads-backup.tar.gz /opt/whatsapp-ynab-bot/.beads/

# Restore
tar -xzf beads-backup.tar.gz -C /
```

---

## 🎉 You're All Set!

Your server will now run:
- ✅ WhatsApp bot (24/7)
- ✅ Multi-agent system (budget + future trip/email/calendar)
- ✅ Automatic restarts (via PM2)
- ✅ Persistent memory (via Beads)
- ✅ Claude Code (for development)

**Need help?** Just SSH to your server and run `claude-code` to ask me questions!

---

*Last Updated: 2025-10-26*
*Bot Version: 2.0 (Dual-Mode + Multi-Agent)*
