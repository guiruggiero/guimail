[![CodeQL](https://github.com/guiruggiero/guimail/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/guiruggiero/guimail/actions/workflows/github-code-scanning/codeql)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=guiruggiero_guimail&metric=bugs)](https://sonarcloud.io/summary/new_code?id=guiruggiero_guimail)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=guiruggiero_guimail&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=guiruggiero_guimail)
[![Dependencies](https://github.com/guiruggiero/guimail/actions/workflows/dependabot/dependabot-updates/badge.svg)](https://github.com/guiruggiero/guimail/actions/workflows/dependabot/dependabot-updates)

# 📧 GuiMail

An intelligent multi-purpose email processing AI agent. Forward any email to GuiMail and it will automatically:

- 📅 **Extract calendar events** - Get iCal invitations for meetings, appointments, or any event (in-person or virtual) and add to your calendar with one tap/click
- 📝 **Summarize content** - Receive concise summaries of long emails, newsletters, and threads
- 💰 **Track expenses** - Automatically add credit card statement balances to a budget spreadsheet and split shared expenses with Splitwise

Simply forward an email, and GuiMail intelligently chooses the right action based on the content. No manual configuration needed.

### ✨ Features

- **Calendar event extraction** with smart timezone detection, handling of relative dates ("tomorrow", "next Friday"), and confidence scoring
- **iCal invitation** generation with proper **email threading**
- **Email summarization** for quick insights from lengthy content
- **Budget tracking** with Google Sheets
- **Expense splitting** with Splitwise
- **Multi-tool AI agent** using Gemini Pro model through the Gemini API with **extensible architecture** for easy addition of new features
- Allowlist-based **sender authentication** and **email size validation**
- **Automatic retry logic** with exponential backoff
- **Error tracking** and logging

### 🏗️ Architecture

The system consists of two main components:

#### Cloudflare Email Worker (`worker/`)
- Receives incoming emails via Cloudflare Email Routing
- Enforces sender allowlist and size limits
- Forwards processed emails to Firebase Cloud Function
- Handles email replies back to the original sender

#### Firebase Cloud Function (`functions/`)
- Processes email content using Gemini API with tool calling
- Automatically chooses tool for calendar event, summarization, or budget tracking
- Extracts structured data with validation and confidence scoring
- Generates iCal invitations using industry-standard formatting
- Updates Google Sheets via API
- Creates Splitwise expense via API
- Composes and sends reply emails with proper threading

### 🛠️ Prerequisites
- Node.js
- Firebase CLI
- Cloudflare account and Wrangler CLI
- Gemini API key
- Sentry DSN key
- Google Sheets service account key
- Splitwise API key

### 📦 Dependencies
- `@google/genai` - Gemini API SDK
- `@sentry/cloudflare` and `@sentry/node` - error tracking and monitoring
- `axios` and `axios-retry` - API communication with retry logic
- `cloudflare:email` - email worker runtime
- `eslint` and `stylistic` - code linting
- `firebase-functions` - serverless backend
- `firebase-tools` and `wrangler` - deployment and management
- `googleapis` - Google Sheets API integration
- `ical-generator` - iCal invitation creation
- `nodemailer` - email composition
- `postal-mime` - email parsing and content extraction

---

#### 📄 License
This project is licensed under the [MIT License](LICENSE). Attribution is required.

#### ⚠️ Disclaimer
This software is provided "as is" without any warranties. Use at your own risk. The author is not responsible for any consequences of using this software.
