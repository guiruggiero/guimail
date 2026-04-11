[![CodeQL](https://github.com/guiruggiero/guimail/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/guiruggiero/guimail/actions/workflows/github-code-scanning/codeql)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=guiruggiero_guimail&metric=bugs)](https://sonarcloud.io/summary/new_code?id=guiruggiero_guimail)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=guiruggiero_guimail&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=guiruggiero_guimail)
[![Dependencies](https://github.com/guiruggiero/guimail/actions/workflows/dependabot/dependabot-updates/badge.svg)](https://github.com/guiruggiero/guimail/actions/workflows/dependabot/dependabot-updates)

# 📧 Guimail

An intelligent multi-purpose email processing AI agent. Forward any email to Guimail and it will automatically:

- 📅 **Extract calendar events** - Automatically add meetings, appointments, or any event (in-person or virtual) directly to Google Calendar
- 📝 **Summarize content** - Receive concise summaries of long emails, newsletters, and threads
- 💸 **Track expenses** - Add credit card statement balances to a budget spreadsheet
- ➗ **Share expenses** - Add expenses to Splitwise

### ✨ Features

- **Event extraction** with smart timezone detection, handling of relative dates ("tomorrow", "next Friday"), and flight information
- **Google Calendar integration** with per-calendar routing
- **FlightAware AeroAPI integration** for IATA->ICAO code mapping and flight tracking links
- **Email summarization** for quick insights from lengthy content
- **Budget tracking** with Google Sheets
- **Expense splitting** with Splitwise
- **Helpful responses** with proper **email threading**
- **Multi-tool AI agent** using Gemini Flash model through the Gemini API with extensible architecture for easy addition of new features
- **Sender authentication** with allowlist and **email size validation**
- **Automatic retry logic** with exponential backoff
- **Error tracking** and logging

### 🏗️ Architecture

There are two main components:

#### Cloudflare Email Worker (`worker/`)
- Receives incoming emails via Cloudflare Email Routing
- Enforces sender allowlist and size limits
- Forwards processed emails to Firebase Cloud Function
- Handles email replies back to the original sender

#### Firebase Cloud Function (`functions/`)
- Processes email content using Gemini API with tool calling
- Automatically chooses tool for calendar event, summarization, budget tracking, or expense creation
- Extracts structured data with validation and confidence scoring
- Creates Google Calendar events directly via API with per-calendar routing
- Updates Google Sheets via API
- Creates Splitwise expense via API
- Composes and sends reply emails with proper threading

### 📦 Dependencies
- `@google/genai` - Gemini API SDK
- `@langfuse/client` - prompt management
- `@sentry/cloudflare` and `@sentry/node` - error tracking and monitoring
- `axios` and `axios-retry` - API communication with retry logic
- `cloudflare:email` - email worker runtime
- `eslint` and `stylistic` - code linting
- `firebase-functions` - serverless backend
- `googleapis` - integration with Google Sheets and Calendar APIs
- `nodemailer` - email composition
- `postal-mime` - email parsing and content extraction
- `wrangler` and `firebase-tools` - deployment and management

---

#### 📄 License
This project is licensed under the [MIT License](LICENSE). Attribution is required.

#### ⚠️ Disclaimer
This software is provided "as is" without any warranties. Use at your own risk. The author is not responsible for any consequences of using this software.
