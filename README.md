[![CodeQL](https://github.com/guiruggiero/guimail/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/guiruggiero/guimail/actions/workflows/github-code-scanning/codeql)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=guiruggiero_guimail&metric=bugs)](https://sonarcloud.io/summary/new_code?id=guiruggiero_guimail)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=guiruggiero_guimail&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=guiruggiero_guimail)
[![Dependencies](https://github.com/guiruggiero/guimail/actions/workflows/dependabot/dependabot-updates/badge.svg)](https://github.com/guiruggiero/guimail/actions/workflows/dependabot/dependabot-updates)

# 📧 GuiMail

An intelligent email processing AI agent that extracts calendar event information from emails and replies with iCal invitations. Forward an email about a meeting, dinner, or any event (in-person or virtual) to GuiMail, and it'll send back a calendar invite you can add with one click/tap.

### ✨ Features

- Gemini Pro model through Gemini API for event parsing with multilingual support and confidence scoring
- Smart timezone detection and handling of relative dates ("tomorrow", "next Friday")
- iCal invitation generation and email threading
- Email size validation and allowlist-based sender authentication
- Automatic retry logic with exponential backoff
- Error handling, tracking, and logging

### 🏗️ Architecture

The system consists of two main components:

#### Cloudflare Email Worker (`worker/`)
- Receives incoming emails
- Enforces sender allowlist and size limits
- Forwards processed emails to Firebase Cloud Function
- Handles email replies back to the original sender

#### Firebase Cloud Function (`functions/`)
- Processes email content using Gemini API
- Extracts structured event data with confidence scoring
- Generates iCal invitations using industry-standard formatting
- Composes and sends reply emails with calendar attachments

### 🛠️ Prerequisites
- Node.js
- Firebase CLI
- Cloudflare account and Wrangler CLI
- Gemini API key
- Sentry DSN key

### 📦 Dependencies
- `@google/genai` - Gemini API integration
- `postal-mime` - email parsing and content extraction
- `ical-generator` - iCal invitation creation
- `nodemailer` - email composition
- `firebase-functions` - serverless backend
- `axios` and `axios-retry` - API communication with retry logic
- `cloudflare:email` - email worker runtime
- `@sentry/cloudflare` and `@sentry/node` - Sentry integration
- `eslint` and `stylistic` - code linting
- `wrangler` and `firebase-tools` - deployment and management

---

#### 📄 License
This project is licensed under the [MIT License](LICENSE). Attribution is required.

#### ⚠️ Disclaimer
This software is provided "as is" without any warranties. Use at your own risk. The author is not responsible for any consequences of using this software.
