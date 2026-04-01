# Student Power — University PDF Library

A modern, production-ready **Next.js 14+** application for browsing university courses and study materials with **AI-powered PDF analysis using RAG (Retrieval-Augmented Generation)**.

Built with enterprise-grade security, performance optimizations, MongoDB-backed RAG pipeline, and comprehensive testing.

---

## ✨ Features

- 🎓 **University Navigation** — Browse universities → courses → semesters → subjects → PDFs
- 🔍 **Universal Search** — Search on every page with optimized MongoDB queries
- 📱 **Fully Responsive** — Mobile-first design with dark mode support
- 🤖 **RAG-Powered AI** — PDF Q&A using Retrieval-Augmented Generation (Groq AI)
- 📄 **PDF Viewer** — Custom reader with zoom, fullscreen, navigation, and download
- 🔐 **Admin Dashboard** — Secure CRUD operations for content management
- 💾 **MongoDB** — Mongoose ODM with indexes, lean queries, and pagination
- ☁️ **Cloudinary** — PDF file uploads with server-side validation
- 📃 **Pagination** — Admin PDF list with full pagination controls
- 🛡️ **Security** — Input validation, rate limiting, secure headers, PDF magic-number check
- ⚡ **Performance** — Caching, lazy loading, optimized builds
- 🧪 **Testing** — Jest + React Testing Library

---

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript (strict) |
| Database | MongoDB + Mongoose ODM |
| Cloud Storage | Cloudinary |
| Styling | TailwindCSS |
| State | Zustand |
| PDF Rendering | react-pdf (pdf.js) |
| AI Provider | Groq AI (`llama-3.3-70b-versatile`) |
| RAG Retrieval | MongoDB full-text search + keyword scoring |
| Icons | Lucide React |
| Testing | Jest + React Testing Library |

---

## 🧠 AI Architecture — RAG Pipeline

### What is RAG?

**Retrieval-Augmented Generation (RAG)** is the practice of retrieving only the *most relevant* portions of a document before sending them to the AI, instead of sending the entire document. This dramatically reduces token usage and improves answer accuracy.

### Full Pipeline

```
PDF Upload / First Open
        │
        ▼
┌─────────────────────┐
│  1. Text Extraction │  pdf.js extracts raw text from all pages (client-side)
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  2. Text Cleaning   │  Remove headers, footers, page numbers, repeated lines
│  (cleanExtractedText│  Reduces raw text by ~10–20 %
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  3. Chunking        │  Split into 300–500-word word-bounded chunks
│  (splitIntoChunks)  │  30-word overlap between consecutive chunks
│                     │  Typical 30-page PDF → ~20–40 chunks
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  4. Storage         │  POST /api/ai/chunks
│  (MongoDB)          │  PDFChunk collection: { pdfId, chunkText, chunkIndex, wordCount }
│                     │  Full-text index on chunkText for fast retrieval
└────────┬────────────┘
         │  (stored once per PDF)
         │
User asks a question
         │
         ▼
┌─────────────────────┐
│  5. Retrieval       │  GET /api/ai/chunks?pdfId=&question=
│                     │  Strategy 1: MongoDB $text search (primary)
│                     │  Strategy 2: Keyword TF scoring (fallback)
│                     │  Returns top 3–5 relevant chunks only
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  6. Prompt Assembly │  buildOptimizedPrompt()
│                     │  Context block = only selected chunks
│                     │  Strict system prompt: answer from context only
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  7. Groq AI         │  POST https://api.groq.com/openai/v1/chat/completions
│  (llama-3.3-70b)    │  max_tokens capped by action type
│                     │  Returns answer strictly from PDF context
└─────────────────────┘
```

### Key Files

| File | Responsibility |
|---|---|
| `lib/ai/pdf-analyzer.ts` | `cleanExtractedText`, `splitIntoChunks`, `retrieveRelevantChunks`, `buildOptimizedPrompt` |
| `lib/db/models/PDFChunk.ts` | MongoDB schema for storing chunks |
| `app/api/ai/chunks/route.ts` | POST (store chunks), GET (retrieve top-K), DELETE (cleanup) |
| `app/api/ai/chat/route.ts` | Orchestrates RAG retrieval + Groq AI call |
| `components/pdf-viewer/PDFViewer.tsx` | Extracts text, stores chunks, sends queries with top-K chunks |

---

## 📉 Token Optimization Strategy

### Before vs. After

| Metric | Before (old) | After (RAG) | Savings |
|---|---|---|---|
| Input text per request | ~10 000 chars (full PDF) | ~1 800 chars (top-5 chunks) | **~82 %** |
| Input tokens per request | ~2 500 tokens | ~600 tokens | **~76 %** |
| Accuracy | Only first portion read | Most relevant sections | **Higher** |
| Answer quality | May miss later content | Targeted retrieval | **Better** |
| max_tokens (summarize) | 800 | 600 | **25 %** |
| max_tokens (questions) | 1 000 | 800 | **20 %** |
| max_tokens (answer/chat) | 600–800 | 400 | **33–50 %** |

### How Token Reduction Works (Step by Step)

1. **Text Cleaning** (`cleanExtractedText`)
   - Removes page numbers, running headers/footers, null bytes
   - Saves ~10–20 % before chunking even starts

2. **Chunking** (`splitIntoChunks`)
   - 400-word chunks with 30-word overlap
   - A 50-chunk (20 000-word) document is split into manageable units

3. **Retrieval** (`retrieveRelevantChunks`)
   - Only top-5 chunks sent — not all 50
   - For a large PDF, this is a 90 %+ reduction in context tokens

4. **Optimised Prompts** (`buildOptimizedPrompt`)
   - Short, imperative system prompts (~60 tokens total)
   - Strict rules prevent verbose answers ("Be concise and precise")
   - `max_tokens` capped per action type (see table above)

5. **No Raw Text in Transit**
   - After first extraction, client sends only `pdfId` + `question` (~100 chars)
   - Server fetches chunks from MongoDB — no re-transmission of PDF text

---

## 🔑 Groq AI Integration

### Why Groq?

- **Free tier** — generous token limits at no cost
- **Fast inference** — `llama-3.3-70b-versatile` responds in ~1–3 seconds
- **OpenAI-compatible API** — easy to switch models
- **Large context window** — handles even non-chunked fallback gracefully

### Setup Instructions

1. Go to [console.groq.com/keys](https://console.groq.com/keys)
2. Create a free account and generate an API key
3. Add it to your `.env.local`:

```env
GROQ_API_KEY=gsk_your_key_here
```

### Model Used

```
llama-3.3-70b-versatile
```

Alternative models (change `MODEL` constant in `app/api/ai/chat/route.ts`):

| Model | Speed | Quality | Best For |
|---|---|---|---|
| `llama-3.3-70b-versatile` | Medium | High | Default (recommended) |
| `llama3-8b-8192` | Fast | Good | High-traffic / budget |
| `mixtral-8x7b-32768` | Medium | High | Long context questions |

### Environment Variables

```env
# Required for AI features
GROQ_API_KEY=gsk_your_key_here
```

### Testing Your Groq Key

```bash
curl https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"llama-3.3-70b-versatile","messages":[{"role":"user","content":"Hello"}],"max_tokens":10}'
```

---

## 📄 Pagination System

### Admin PDF List (`/admin/pdfs`)

The admin panel uses server-side pagination built on top of MongoDB's `.skip()` / `.limit()` pattern.

**API Endpoint:** `GET /api/pdfs?page=1&limit=10&paginate=true`

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | 1-based page number |
| `limit` | number | 10 | Results per page (max 100) |
| `paginate` | boolean | false | Force paginated response |
| `subjectId` | string | — | Filter by subject |

**Response Shape:**

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 47,
    "page": 2,
    "limit": 10,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": true
  }
}
```

**How It Works:**

```
GET /api/pdfs?page=2&limit=10
         │
         ▼
  count = PDF.countDocuments({})   ← parallel
  data  = PDF.find({})             ← parallel
            .skip(10)              ← (page-1) × limit
            .limit(10)
         │
         ▼
  Returns data + pagination metadata
```

**Legacy Compatibility:**

Without `page` or `paginate=true` parameters, the API returns a flat array (backwards-compatible with public subject pages that list all PDFs).

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- MongoDB Atlas account (or local MongoDB)
- Groq AI API key
- Cloudinary account

### Installation

```bash
git clone <your-repo-url>
cd student-power
npm install
```

### Environment Setup

Create `.env.local`:

```env
# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/student-power

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Groq AI (RAG pipeline)
GROQ_API_KEY=gsk_your_key_here

# Admin credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password

# Creator info (displayed in footer)
NEXT_PUBLIC_CREATOR_NAME=Your Name
NEXT_PUBLIC_CREATOR_EMAIL=your@email.com
NEXT_PUBLIC_CREATOR_PHONE=+1234567890
```

### Run Development Server

```bash
npm run dev
# Open http://localhost:3000
```

---

## 🌐 Deployment Guide (Vercel)

### Step-by-Step Deployment

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial deployment"
   git push origin main
   ```

2. **Import to Vercel**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Connect your GitHub repository
   - Vercel auto-detects Next.js configuration

3. **Set Environment Variables**
   In the Vercel dashboard → Settings → Environment Variables, add:

   | Variable | Value | Environment |
   |---|---|---|
   | `MONGODB_URI` | `mongodb+srv://...` | Production, Preview, Development |
   | `CLOUDINARY_CLOUD_NAME` | `your_cloud_name` | All |
   | `CLOUDINARY_API_KEY` | `your_api_key` | All |
   | `CLOUDINARY_API_SECRET` | `your_secret` | All |
   | `GROQ_API_KEY` | `gsk_...` | All |
   | `ADMIN_USERNAME` | `admin` | All |
   | `ADMIN_PASSWORD` | `secure_password` | All |
   | `NEXT_PUBLIC_CREATOR_NAME` | `Your Name` | All |

4. **Deploy**
   - Click "Deploy" — Vercel will run `npm run build` automatically
   - Deployment completes in ~2–3 minutes

5. **Verify**
   - Visit your deployment URL
   - Test AI features at `/universities`
   - Test admin at `/admin/login`

### Build Verification (Local)

```bash
# Test production build locally before deploying
npm run build
npm run start
# Visit http://localhost:3000
```

### Free Tier Limitations

| Service | Free Tier Limit | Notes |
|---|---|---|
| Vercel | 100 GB bandwidth/month | Sufficient for most use cases |
| Vercel Functions | 100 GB-hours/month | API routes count here |
| Vercel Body Size | 4.5 MB per request | PDFs larger than this need direct Cloudinary upload |
| MongoDB Atlas | 512 MB storage | ~500K chunk documents |
| Cloudinary | 25 GB storage, 25 GB bandwidth | Good for hundreds of PDFs |
| Groq AI | ~14 400 RPD (requests/day) free | More than sufficient |

### Vercel Configuration (`vercel.json`)

The included `vercel.json` sets function timeout to 60 seconds for PDF upload routes.

---

## 🗺️ Project Flow Overview

```
User visits /universities
        │
        ▼
Browse: University → Course → Semester → Subject → PDF List
        │
        ▼
Click a PDF card → PDFViewer opens
        │
        ├─► PDF renders in viewer (react-pdf)
        │
        └─► Background: text extracted → chunked → stored in MongoDB
                        (happens once per PDF, non-blocking)

User clicks "Chat AI" button
        │
        ▼
AI Panel opens → user clicks "Generate Summary" or types a question
        │
        ▼
Client: retrieve top-5 relevant in-memory chunks
        │
        ▼
POST /api/ai/chat  { action, pdfId, chunks: top5 }
        │
        ▼
Server: buildOptimizedPrompt(chunks, question)
        │
        ▼
Groq API: llama-3.3-70b-versatile responds in ~1–3s
        │
        ▼
Answer displayed in AI Panel (Markdown rendered)
```

---

## 🗂️ Project Structure

```
student-power/
├── app/
│   ├── admin/                    # Admin dashboard pages
│   │   ├── pdfs/page.tsx        # PDF list with pagination
│   │   ├── courses/page.tsx
│   │   ├── semesters/page.tsx
│   │   ├── subjects/page.tsx
│   │   └── universities/page.tsx
│   ├── api/
│   │   ├── ai/
│   │   │   ├── chat/route.ts    # ★ RAG-enabled AI chat endpoint
│   │   │   └── chunks/route.ts  # ★ NEW: Chunk storage & retrieval
│   │   ├── pdfs/
│   │   │   ├── route.ts         # PDF CRUD + pagination
│   │   │   ├── [id]/route.ts
│   │   │   └── upload/route.ts
│   │   ├── universities/
│   │   ├── courses/
│   │   ├── semesters/
│   │   └── subjects/
│   └── universities/            # Public browsing pages
├── components/
│   ├── pdf-viewer/
│   │   └── PDFViewer.tsx        # ★ RAG-enabled PDF viewer
│   └── ui/
├── lib/
│   ├── ai/
│   │   └── pdf-analyzer.ts      # ★ RAG core: clean, chunk, retrieve, prompt
│   ├── db/
│   │   ├── models/
│   │   │   ├── PDF.ts
│   │   │   ├── PDFChunk.ts      # ★ NEW: Chunk storage model
│   │   │   ├── University.ts
│   │   │   ├── Course.ts
│   │   │   ├── Semester.ts
│   │   │   └── Subject.ts
│   │   └── mongodb.ts
│   └── middleware/
│       └── rateLimit.ts
└── __tests__/
```

---

## 🔧 Admin Access

**URL:** `/admin/login`

**Demo Credentials:**
- Username: `admin`
- Password: `admin123`

> Change these in your `.env.local` (`ADMIN_USERNAME`, `ADMIN_PASSWORD`) before deploying to production.

---

## 🧪 Testing

```bash
# Run all tests
npm run test:ci

# Watch mode
npm test

# Coverage report
npm run test:coverage

# Type check
npx tsc --noEmit

# Lint
npm run lint

# Build check (tests production build)
npm run build
```

---

## 🔄 Recent Updates

### v1.3.0 — RAG Pipeline (2026-04-01)

**Core Changes:**
- ✅ **RAG Architecture**: Full Retrieval-Augmented Generation pipeline
- ✅ **PDFChunk Model**: New MongoDB collection for storing text chunks
- ✅ **Chunking Engine**: `cleanExtractedText` + `splitIntoChunks` (300–500 words/chunk)
- ✅ **Retrieval Layer**: MongoDB `$text` search + keyword scoring fallback
- ✅ **`/api/ai/chunks`**: New route for storing (POST), retrieving (GET), and deleting (DELETE) chunks
- ✅ **Optimized Prompts**: Strict RAG prompts — answers from context only
- ✅ **Token Reduction**: ~75 % fewer input tokens per AI request
- ✅ **PDFViewer Upgrade**: RAG status indicator, chunk count, pdfId threading

**Token Optimization:**
- Removed full-text truncation (`substring(0, 10_000)`)
- max_tokens reduced: summarize 800→600, questions 1000→800, answer 800→400
- Only 3–5 relevant chunks sent per request (not full document)

### v1.2.0 — Groq AI Integration

- Replaced Perplexity AI with Groq AI (`llama-3.3-70b-versatile`)
- 5–10× faster inference on free tier
- OpenAI-compatible API format

### v1.1.0 — Enhanced Edition

- Security: rate limiting, input validation, file magic-number check
- Performance: lean DB queries, caching headers
- Admin: pagination for PDF list
- Testing: Jest + React Testing Library

---

## ⚠️ Known Limitations

1. **Client-Side Text Extraction**: PDF text extraction runs in the browser via pdf.js. Very large PDFs (>50 pages) may take a few seconds to index.
2. **MongoDB Text Index**: The `$text` search index is created automatically on first connection. On a cold MongoDB Atlas cluster, first queries may take slightly longer.
3. **Vercel Body Size**: Files >4.5 MB cannot be uploaded directly via API routes on Vercel free tier. Use direct Cloudinary upload for larger files.
4. **Groq Rate Limits**: Free tier allows ~14 400 requests/day. For high-traffic deployments, consider Groq's paid plans.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit: `git commit -m 'feat: add my feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

MIT License — open source and free to use.

---

**Built with ❤️ for students worldwide**
