# REST Evidence Extractor — Frontend

A professional React dashboard for the REST Evidence Extractor tool. Connects to a FastAPI backend to extract structured evidence from research papers and perform REST quality appraisal.

## Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+
- The FastAPI backend running at `http://localhost:7777` (or your custom URL)

## Setup

### 1. Install dependencies

```bash
cd frontend
npm install
```

### 2. Configure environment (optional)

Copy the example env file and adjust if your backend runs on a different port/host:

```bash
cp .env.example .env
```

Edit `.env`:
```
VITE_API_BASE_URL=http://localhost:7777
```

If you skip this step, the app defaults to `http://localhost:7777`.

### 3. Start the development server

```bash
npm run dev
```

The app will be available at **http://localhost:5173**.

## Building for production

```bash
npm run build
```

The production build is output to `dist/`. Serve it with any static file server:

```bash
npm run preview   # Vite preview server
# or
npx serve dist
```

## Usage

1. **Upload** — Drag and drop PDF files (or click to browse). Click "Upload Files" to send them to the backend, which converts them to markdown via LlamaParse.
2. **Extract & Appraise** — Once files are uploaded, click "Extract & Appraise" to run the full AI pipeline. This may take several minutes depending on the number and size of papers.
3. **View Results** — After processing, results appear in three tabs:
   - **Evidence** — Structured evidence extracted from each paper
   - **Appraisal** — REST quality appraisal with per-criterion ratings
   - **Downloads** — Download results as Excel, Word, or JSON
4. **Reset** — Use the Reset button in the sidebar to clear all results and start fresh.

## Configuring the API URL at runtime

The sidebar includes an editable API URL field. Click the URL to edit it and press Enter or "Save" to apply. This is useful if the backend URL changes without needing to restart the frontend.

## Project structure

```
frontend/
├── package.json           — Dependencies and scripts
├── index.html             — HTML entry point
├── vite.config.js         — Vite configuration (dev proxy)
├── tailwind.config.js     — Tailwind CSS configuration
├── postcss.config.js      — PostCSS configuration
├── .env.example           — Environment variable template
└── src/
    ├── main.jsx           — React entry point
    ├── App.jsx            — Root component, state management
    ├── index.css          — Tailwind directives + custom styles
    ├── services/
    │   └── api.js         — All API calls and data utilities
    └── components/
        ├── Sidebar.jsx        — Left navigation sidebar
        ├── StepIndicator.jsx  — Upload → Process → Results progress
        ├── UploadZone.jsx     — Drag-and-drop file upload
        ├── MetricsBar.jsx     — Token/cost/time summary cards
        ├── EvidenceTab.jsx    — Evidence extraction results
        ├── AppraisalTab.jsx   — Quality appraisal results
        └── DownloadTab.jsx    — File download buttons
```

## Tech stack

- **Vite** — Build tool and dev server
- **React 18** — UI framework
- **Tailwind CSS v3** — Utility-first styling
- **lucide-react** — Icon library
- **axios** — HTTP client

## CORS

The backend must allow requests from `http://localhost:5173`. The development Vite proxy (`/api` → `http://localhost:7777`) is configured but API calls use the full base URL directly, so ensure the FastAPI backend has CORS middleware enabled for the frontend origin.
