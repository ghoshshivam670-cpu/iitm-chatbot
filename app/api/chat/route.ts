import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

async function generateStreamWithRetry(
  ai: GoogleGenAI,
  prompt: string,
  maxRetries = 3
) {
  let delay = 1500;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await ai.models.generateContentStream({
        model: "gemini-3.8-flash",
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      });
    } catch (err: any) {
      const isTransient =
        err?.status === 503 ||
        err?.status === 429 ||
        err?.message?.includes("503") ||
        err?.message?.includes("429") ||
        err?.message?.includes("high demand") ||
        err?.message?.includes("quota");

      if (isTransient && attempt < maxRetries - 1) {
        console.warn(
          `[Warning] Gemini stream attempt ${attempt + 1} failed (${err.message}). Retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed to generate content stream after max retries.");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, messages } = body;

    // 1. Determine user query
    let userQuery = "";
    if (typeof message === "string" && message.trim()) {
      userQuery = message.trim();
    } else if (Array.isArray(messages) && messages.length > 0) {
      const last = messages[messages.length - 1];
      userQuery = typeof last.content === "string" ? last.content.trim() : "";
    }

    if (!userQuery) {
      return NextResponse.json(
        { error: "A valid user query is required." },
        { status: 400 }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Missing credentials. Ensure SUPABASE_URL, SUPABASE_KEY, and GEMINI_API_KEY are configured.",
        },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 2. Generate embedding for user query
    const embResponse = await ai.models.embedContent({
      model: "gemini-embedding-001",
      contents: userQuery,
      config: { outputDimensionality: 768 },
    });

    const queryEmbedding = embResponse.embeddings?.[0]?.values;
    if (!queryEmbedding || queryEmbedding.length !== 768) {
      throw new Error("Failed to generate 768-dimensional embedding from query.");
    }

    // 3. Search Supabase pgvector 'documents' table via match_documents RPC
    const { data: matchedDocs, error: rpcError } = await supabase.rpc(
      "match_documents",
      {
        query_embedding: queryEmbedding,
        match_count: 5,
      }
    );

    if (rpcError) {
      console.error("Supabase vector search error:", rpcError);
      throw new Error(`Vector similarity search failed: ${rpcError.message}`);
    }

    const contextDocuments = matchedDocs || [];

    // Extract sources for UI citation tags
    const sources = contextDocuments.map((doc: any) => ({
      source: doc.metadata?.source || "IITM Document",
      page: doc.metadata?.page || 1,
      similarity: doc.similarity ? Number(doc.similarity.toFixed(4)) : null,
      preview: (doc.content || "").slice(0, 150),
    }));

    // 4. Construct prompt grounded in retrieved context
    const contextText = contextDocuments
      .map(
        (doc: any, i: number) =>
          `[Source ${i + 1}: ${doc.metadata?.source || "Unknown"}, Page: ${doc.metadata?.page || "N/A"}]\n${doc.content}`
      )
      .join("\n\n---\n\n");

    const fullPrompt = `You are the official IIT Madras (IITM) BS Degree Programme Student Advisor AI.
You help students with clear, accurate, and encouraging guidance on:
- Grading patterns, formulas (GAA, Quiz 1, Quiz 2, End Term, OPPE, ROE, SCT).
- Exam eligibility, passing criteria, assignment deadlines, and grade calculation.
- Student handbook rules, course registration, foundation/diploma/degree levels.
- Official student documents (bonafide certificates, transcripts, recommendation letters, criteria).

Rules for your response:
1. Ground your answers strictly in the provided Context below.
2. If the context does not contain sufficient details to answer, politely state what is known and advise contacting the official support email at support@study.iitm.ac.in.
3. Be clear, organized, and use Markdown (bullet points, bold text, formulas).
4. Explicitly reference the document name and page number when citing policies so students can verify them.

Context from official IIT Madras BS documents:
--------------------------------------------------
${contextText || "No matching documents found."}
--------------------------------------------------

Student Question:
${userQuery}

Please provide a helpful, comprehensive, and well-structured answer with citations to the document and page numbers.`;

    // 5. Stream response using Gemini 3.8 Flash with transient error handling
    const stream = await generateStreamWithRetry(ai, fullPrompt);

    // 6. Pipe through Web ReadableStream
    const encoder = new TextEncoder();
    const customReadable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.text) {
              controller.enqueue(encoder.encode(chunk.text));
            }
          }
          controller.close();
        } catch (streamErr) {
          controller.error(streamErr);
        }
      },
    });

    return new Response(customReadable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        "X-Sources": encodeURIComponent(JSON.stringify(sources)),
      },
    });
  } catch (error: any) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
