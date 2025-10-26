# Quick Start - Ubuntu Server Deployment

## 🚀 3-Step Setup

### On Your Local Machine

```bash
# 1. Copy setup script to server
scp setup-ubuntu-server.sh root@144.202.27.10:/root/

# 2. SSH to server
ssh root@144.202.27.10
```

### On Your Ubuntu Server

```bash
# 3. Run setup script
chmod +x /root/setup-ubuntu-server.sh
./setup-ubuntu-server.sh
```

**That's it!** The script will:
- Install all dependencies
- Clone the repository
- Configure everything
- Start the bot

---

## 📋 What You'll Be Asked

1. **Anthropic API Key** - Get from: https://console.anthropic.com/
2. **YNAB API Token** - Get from: https://app.ynab.com/settings/developer
3. **Install location** - Press Enter for default (`/opt/whatsapp-ynab-bot`)
4. **Start now?** - Type `y` to start immediately

---

## 📱 First Run - Scan QR Code

```bash
# View logs to see QR code
pm2 logs whatsapp-ynab-bot
```

Open WhatsApp on your phone → Settings → Linked Devices → Link a Device → Scan the QR code

---

## ✅ Verify It's Working

Test these commands in WhatsApp:

```
/help         → Shows help menu
/mode         → Shows current mode
/budgetnew    → Switch to multi-agent mode
show my balance → Shows YNAB balances
```

---

## 🔧 Essential Commands

### Bot Management
```bash
pm2 status                    # Check if running
pm2 logs whatsapp-ynab-bot   # View logs (live)
pm2 restart whatsapp-ynab-bot # Restart bot
```

### Development
```bash
claude-code                   # Start Claude Code for help
tmux new -s dev              # Create dev session
```

---

## 📚 Full Documentation

- **Setup Details**: `SERVER_SETUP_INSTRUCTIONS.md`
- **Multi-Agent Info**: `MULTI_AGENT_IMPLEMENTATION.md`
- **Dual-Mode Guide**: `DUAL_MODE_IMPLEMENTATION_SUMMARY.md`
- **Roadmap**: `NEXT_STEPS_ROADMAP.md`

---

## 🆘 Quick Troubleshooting

**Bot not starting?**
```bash
pm2 logs whatsapp-ynab-bot --err
```

**QR code not showing?**
```bash
pm2 restart whatsapp-ynab-bot
pm2 logs whatsapp-ynab-bot --lines 50
```

**Need to update .env?**
```bash
nano /opt/whatsapp-ynab-bot/.env
pm2 restart whatsapp-ynab-bot
```

---

## 🎯 What's Next?

1. ✅ Bot running 24/7
2. ✅ Multi-agent mode available
3. ✅ Auto-restarts on reboot (`pm2 startup`)
4. 📈 Monitor usage with `/debug` in WhatsApp
5. 🚀 Add trip planning, email, calendar (Phase 3)

**Enjoy your WhatsApp budget assistant!** 🎉
