#!/bin/bash
#
# WhatsApp YNAB Bot - Ubuntu Server Setup Script
#
# This script sets up everything needed to run the WhatsApp bot on Ubuntu server:
# - Node.js 20.x
# - Google Chrome (for WhatsApp Web)
# - PM2 (process manager)
# - Claude Code CLI
# - Bot dependencies
# - Beads CLI (for multi-agent memory)
#
# Usage:
#   chmod +x setup-ubuntu-server.sh
#   ./setup-ubuntu-server.sh
#

set -e  # Exit on error

echo "=========================================="
echo "🚀 WhatsApp YNAB Bot - Server Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo "ℹ️  $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run as root (use: sudo ./setup-ubuntu-server.sh)"
    exit 1
fi

print_success "Running as root"
echo ""

# ========================================
# 1. System Update
# ========================================
print_info "Step 1/8: Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
print_success "System packages updated"
echo ""

# ========================================
# 2. Install Node.js 20.x
# ========================================
print_info "Step 2/8: Installing Node.js 20.x..."

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    print_warning "Node.js already installed: $NODE_VERSION"
    read -p "Do you want to upgrade to Node.js 20.x? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    fi
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

NODE_VERSION=$(node -v)
NPM_VERSION=$(npm -v)
print_success "Node.js installed: $NODE_VERSION"
print_success "npm installed: $NPM_VERSION"
echo ""

# ========================================
# 3. Install Google Chrome (for WhatsApp Web)
# ========================================
print_info "Step 3/8: Installing Google Chrome..."

if command -v google-chrome &> /dev/null; then
    CHROME_VERSION=$(google-chrome --version)
    print_warning "Chrome already installed: $CHROME_VERSION"
else
    # Install dependencies
    apt-get install -y wget gnupg ca-certificates

    # Download and install Chrome
    wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    dpkg -i google-chrome-stable_current_amd64.deb || apt-get install -f -y
    rm google-chrome-stable_current_amd64.deb

    CHROME_VERSION=$(google-chrome --version)
    print_success "Chrome installed: $CHROME_VERSION"
fi
echo ""

# ========================================
# 4. Install Additional Dependencies
# ========================================
print_info "Step 4/8: Installing additional dependencies..."
apt-get install -y \
    git \
    tmux \
    build-essential \
    libgbm-dev \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2

print_success "Dependencies installed"
echo ""

# ========================================
# 5. Install Global Node Packages
# ========================================
print_info "Step 5/8: Installing global npm packages..."

# PM2 (process manager)
if command -v pm2 &> /dev/null; then
    print_warning "PM2 already installed"
else
    npm install -g pm2
    print_success "PM2 installed"
fi

# Claude Code CLI
if command -v claude-code &> /dev/null; then
    print_warning "Claude Code already installed"
else
    npm install -g @anthropic-ai/claude-code
    print_success "Claude Code installed"
fi

# Beads CLI (for multi-agent memory)
if command -v bd &> /dev/null; then
    print_warning "Beads CLI already installed"
else
    npm install -g @beads-ai/beads
    print_success "Beads CLI installed"
fi

echo ""

# ========================================
# 6. Setup Bot Directory
# ========================================
print_info "Step 6/8: Setting up bot directory..."

# Ask where to install
read -p "Enter installation directory [/opt/whatsapp-ynab-bot]: " INSTALL_DIR
INSTALL_DIR=${INSTALL_DIR:-/opt/whatsapp-ynab-bot}

if [ -d "$INSTALL_DIR" ]; then
    print_warning "Directory $INSTALL_DIR already exists"
    read -p "Do you want to overwrite it? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$INSTALL_DIR"
    else
        print_error "Installation cancelled"
        exit 1
    fi
fi

# Clone repository
print_info "Cloning repository..."
git clone https://github.com/derekcrosslu/ynab-bot.git "$INSTALL_DIR"
cd "$INSTALL_DIR"
print_success "Repository cloned to $INSTALL_DIR"
echo ""

# ========================================
# 7. Install Bot Dependencies
# ========================================
print_info "Step 7/8: Installing bot dependencies..."
npm install --production
print_success "Bot dependencies installed"
echo ""

# ========================================
# 8. Configuration
# ========================================
print_info "Step 8/8: Configuration..."

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    print_info "Creating .env file..."

    echo "# WhatsApp YNAB Bot Configuration" > .env
    echo "" >> .env

    read -p "Enter your Anthropic API key: " ANTHROPIC_KEY
    echo "ANTHROPIC_API_KEY=$ANTHROPIC_KEY" >> .env
    echo "" >> .env

    read -p "Enter your YNAB API token: " YNAB_TOKEN
    echo "YNAB_API_TOKEN=$YNAB_TOKEN" >> .env
    echo "" >> .env

    echo "# Dual-Mode System" >> .env
    echo "DEFAULT_MODE=legacy" >> .env
    echo "BETA_USERS=" >> .env

    print_success ".env file created"
else
    print_warning ".env file already exists, skipping"
fi
echo ""

# Initialize Beads
print_info "Initializing Beads memory system..."
bd init --prefix=YNAB 2>/dev/null || print_warning "Beads already initialized"
echo ""

# ========================================
# Setup Complete
# ========================================
echo "=========================================="
print_success "Setup Complete!"
echo "=========================================="
echo ""

print_info "Bot installed at: $INSTALL_DIR"
print_info "Node.js: $NODE_VERSION"
print_info "Chrome: $CHROME_VERSION"
print_info "PM2: $(pm2 -v)"
echo ""

echo "📋 Next Steps:"
echo ""
echo "1. Start the bot:"
echo "   cd $INSTALL_DIR"
echo "   pm2 start bot.js --name whatsapp-ynab-bot"
echo ""
echo "2. View logs:"
echo "   pm2 logs whatsapp-ynab-bot"
echo ""
echo "3. On first run, scan the QR code with WhatsApp"
echo ""
echo "4. Enable auto-start on reboot:"
echo "   pm2 startup"
echo "   pm2 save"
echo ""
echo "5. Useful PM2 commands:"
echo "   pm2 status              - View running processes"
echo "   pm2 restart whatsapp-ynab-bot - Restart bot"
echo "   pm2 stop whatsapp-ynab-bot    - Stop bot"
echo "   pm2 delete whatsapp-ynab-bot  - Remove from PM2"
echo ""
echo "6. Use Claude Code for development:"
echo "   claude-code"
echo ""
echo "7. Switch to multi-agent mode (in WhatsApp):"
echo "   /budgetnew"
echo ""

print_warning "IMPORTANT: First run will show QR code - scan it with WhatsApp!"
echo ""

# Optional: Start the bot now
read -p "Do you want to start the bot now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Starting bot with PM2..."
    cd "$INSTALL_DIR"
    pm2 start bot.js --name whatsapp-ynab-bot
    sleep 2
    pm2 logs whatsapp-ynab-bot --lines 50
else
    print_info "You can start the bot later with: pm2 start $INSTALL_DIR/bot.js --name whatsapp-ynab-bot"
fi

echo ""
print_success "All done! 🎉"
