/**
 * Google OAuth Authentication Script
 *
 * Run this script to authenticate with Google and generate token.json
 *
 * Usage: node auth.js
 */

const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');

// OAuth scopes
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/calendar'
];

// Paths
const CREDENTIALS_PATH = './credentials.json';
const TOKEN_PATH = './token.json';

async function authenticate() {
    // Load credentials
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.error('❌ credentials.json not found!');
        console.log('\n📝 Follow these steps:');
        console.log('1. Go to https://console.cloud.google.com/');
        console.log('2. Create OAuth credentials (Desktop app)');
        console.log('3. Download and save as: mcp-servers/google/credentials.json');
        console.log('4. Run this script again');
        process.exit(1);
    }

    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

    // Create OAuth2 client with OOB redirect for command-line auth
    const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        'urn:ietf:wg:oauth:2.0:oob'  // Use out-of-band for better CLI support
    );

    // Check if we already have a token
    if (fs.existsSync(TOKEN_PATH)) {
        console.log('✅ Token already exists at:', TOKEN_PATH);
        console.log('🔄 Delete token.json if you want to re-authenticate');
        return;
    }

    // Generate auth URL
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });

    console.log('\n🔐 Authorize this app by visiting this URL:\n');
    console.log(authUrl);
    console.log('\n');

    // Get authorization code from user
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question('Enter the authorization code from that page here: ', async (code) => {
        rl.close();

        try {
            // Exchange code for token
            const { tokens } = await oAuth2Client.getToken(code);
            oAuth2Client.setCredentials(tokens);

            // Save token
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
            console.log('\n✅ Token saved to:', TOKEN_PATH);
            console.log('✅ Authentication complete!');
            console.log('\n🧪 Run "node test.js" to verify everything works');

        } catch (error) {
            console.error('❌ Error retrieving access token:', error.message);
            process.exit(1);
        }
    });
}

// Run authentication
authenticate().catch(console.error);
