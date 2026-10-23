# IITM Course Assistant – RAG Chatbot

An AI-powered Retrieval-Augmented Generation (RAG) chatbot designed to provide instant, precise answers regarding course prerequisites, grading criteria, credit structures, and academic logistics for students enrolled in the **IIT Madras BS in Data Science & Applications** programme.

By anchoring AI responses to official program documentation, this engine eliminates hallucinations and simplifies academic structural navigation.

## 🚀 Live Demo
🌐 **Web Dashboard:** [iitm-chatbot-teal.vercel.app](https://vercel.app)

---

## 🛠️ Architecture & System Design

The system runs on a two-tier decoupled architecture:
1. **Data Ingestion Pipeline (`ingest_pdfs.py`):** Parses raw academic policy PDFs, processes text chunks semantically, maps localized search vectors, and builds a retrieval knowledge base.
2. **Deterministic Context Engine (`query_chatbot.py`):** Intercepts user queries, fetches relevant document nodes from the knowledge base, injects the factual text constraints into the context matrix, and calls the LLM API for an exact answer.
3. **Web Interface (`/app`):** Built using Next.js and Tailwind CSS to facilitate lightning-fast serverless rendering on edge runtimes (Vercel).

---

## 💻 Tech Stack

- **Backend / Data Pipeline:** Python 3.10+
- **Frontend Dashboard:** Next.js (App Router), TypeScript, Tailwind CSS
- **AI Infrastructure:** LLM APIs, Local Vector Space Search, Text Processing Ecosystem
- **Deployment Platform:** Vercel

---

## 📂 Project Structure

```text
├── app/                  # Next.js frontend pages and application logic
├── ingest_pdfs.py        # Python script for document parsing and vector vector space generation
├── query_chatbot.py      # Python routine executing semantic retrieval and query routing
├── next.config.mjs       # Next.js framework optimization configurations
├── tailwind.config.js    # Tailwind styling guidelines
├── tsconfig.json         # TypeScript strict compiler options
├── package.json          # Node dependency configurations
└── .gitignore            # Secret keys and workspace exclusion profiles
```

---

## ⚙️ Installation & Setup Guide

### 1. Clone the Project
```bash
git clone https://github.com
cd iitm-chatbot
```

### 2. Configure the Backend (Python Data Pipeline)
Make sure you have Python 3.10+ installed. Install the necessary data-science and extraction dependencies (e.g., pandas, numpy, httpx, beautifulsoup4, or required LLM SDK wrapper packages).

```bash
# Execute the document ingestion pipeline to seed the knowledge base
python ingest_pdfs.py

# Test local retrieval and inference query routing
python query_chatbot.py
```

### 3. Configure the Web Client (Next.js Application)
Install required Node modules and start the local development server:

```bash
# Install package dependencies
npm install

# Run the local frontend dashboard server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser to view the application dashboard.

---

## 🧠 Core Features & Implementations

- **Hallucination Mitigation Matrix:** Configured context injection windows that strictly bound token generation blocks to referenced document text, driving accuracy up for complex grading rules.
- **Academic Hierarchy Processing:** Handles highly multi-variant prerequisite trees across foundational, diploma, and degree levels.
- **Optimized Serverless Rendering:** The Next.js dashboard uses tailored responsive UI components optimized for instantaneous edge-side client presentation.

---

## 📄 License
This repository is licensed under the standard software terms specified in the project distribution setup.
