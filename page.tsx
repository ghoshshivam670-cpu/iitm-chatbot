"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send,
  Bot,
  User,
  Sparkles,
  BookOpen,
  FileText,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GraduationCap,
} from "lucide-react";

interface SourceCitation {
  source: string;
  page: number;
  similarity: number | null;
  preview: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceCitation[];
  timestamp: string;
}

const STARTER_QUESTIONS = [
  "What is the eligibility criteria to write the End Term exam?",
  "How is the final course grade calculated in Data Science?",
  "What are the rules and criteria for getting a Bonafide Certificate?",
  "What happens if I miss Quiz 1 or Quiz 2? Is there a makeup quiz?",
  "Are Large Language Models (LLMs) allowed for weekly assignments?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [expandedSources, setExpandedSources] = useState<{ [key: string]: boolean }>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Adjust textarea height dynamically
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        160
      )}px`;
    }
  }, [input]);

  const toggleSources = (id: string) => {
    setExpandedSources((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSend = async (customMessage?: string) => {
    const textToSend = customMessage || input;
    if (!textToSend.trim() || isLoading) return;

    const userMessageId = Date.now().toString();
    const assistantMessageId = (Date.now() + 1).toString();

    const newMessages: Message[] = [
      ...messages,
      {
        id: userMessageId,
        role: "user",
        content: textToSend.trim(),
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ];

    setMessages(newMessages);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: textToSend.trim() }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error! Status: ${response.status}`);
      }

      // Extract sources header
      let sources: SourceCitation[] = [];
      const sourcesHeader = response.headers.get("X-Sources");
      if (sourcesHeader) {
        try {
          sources = JSON.parse(decodeURIComponent(sourcesHeader));
        } catch (e) {
          console.error("Error parsing sources header:", e);
        }
      }

      // Initialize assistant message
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        sources: sources.length > 0 ? sources : undefined,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Response body is not readable.");

      const decoder = new TextDecoder();
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulatedText += chunk;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: accumulatedText }
              : msg
          )
        );
      }
    } catch (error: any) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: `**Error:** ${error.message || "Something went wrong while processing your request. Please try again."}`,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    if (confirm("Clear current conversation?")) {
      setMessages([]);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800">
      {/* Top Navbar */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm px-4 lg:px-8 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 via-rose-700 to-indigo-900 flex items-center justify-center text-white shadow-md">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-slate-900 tracking-tight text-lg">
                  IITM BS Student Assistant
                </h1>
                <span className="bg-emerald-100 text-emerald-800 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-emerald-300">
                  RAG Active
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Powered by Gemini &amp; Supabase pgvector &bull; IIT Madras Official Documents
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-slate-200"
                title="Clear conversation"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New Chat</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-y-auto px-4 lg:px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 ? (
            /* Welcome Empty State */
            <div className="py-10 text-center space-y-6">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 shadow-inner">
                <Sparkles className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-slate-900">
                  Welcome to the IIT Madras BS Advisor
                </h2>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  Ask any question about grading policies, exam eligibility, passing rules, course structures, and official student documents.
                </p>
              </div>

              {/* Indexed Documents Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs text-slate-600">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <span>3 official PDFs indexed (Student Handbook, Grading Policy, Document Criteria)</span>
              </div>

              {/* Suggested Questions */}
              <div className="text-left pt-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 text-center">
                  Frequently Asked Questions
                </p>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {STARTER_QUESTIONS.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(q)}
                      className="text-left text-xs bg-white hover:bg-indigo-50/60 hover:border-indigo-300 p-3.5 rounded-xl border border-slate-200 shadow-sm transition-all duration-150 flex items-start gap-2.5 group"
                    >
                      <FileText className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 shrink-0 mt-0.5" />
                      <span className="text-slate-700 group-hover:text-indigo-950 font-medium">
                        {q}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Messages list */
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3.5 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`flex flex-col max-w-[85%] sm:max-w-[78%] ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`rounded-2xl px-4 py-3 shadow-sm ${
                      msg.role === "user"
                        ? "bg-slate-900 text-white rounded-br-xs"
                        : "bg-white text-slate-800 border border-slate-200 rounded-bl-xs"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div className="prose prose-sm max-w-none prose-slate prose-headings:text-slate-900 prose-headings:font-bold prose-p:leading-relaxed prose-a:text-indigo-600 prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-indigo-700 prose-pre:bg-slate-900 prose-pre:text-slate-100">
                        {msg.content ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        ) : (
                          <div className="flex items-center gap-2 text-slate-500 py-1 text-xs">
                            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                            <span>Consulting IIT Madras documents...</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Sources Drawer for Assistant Messages */}
                  {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 w-full">
                      <button
                        onClick={() => toggleSources(msg.id)}
                        className="inline-flex items-center gap-1.5 text-xs text-indigo-700 font-medium hover:text-indigo-900 bg-indigo-50/80 hover:bg-indigo-100/80 px-2.5 py-1 rounded-lg border border-indigo-200 transition-colors"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>
                          {msg.sources.length} Verified Source
                          {msg.sources.length > 1 ? "s" : ""}
                        </span>
                        {expandedSources[msg.id] ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {expandedSources[msg.id] && (
                        <div className="mt-2 space-y-2 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
                          <p className="font-semibold text-slate-700 mb-1">
                            Retrieved Document Citations:
                          </p>
                          {msg.sources.map((src, i) => (
                            <div
                              key={i}
                              className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-1 shadow-2xs"
                            >
                              <div className="flex items-center justify-between text-indigo-900 font-semibold">
                                <span className="truncate max-w-[280px] sm:max-w-md">
                                  📄 {src.source}
                                </span>
                                <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[11px] font-mono shrink-0">
                                  Page {src.page}
                                </span>
                              </div>
                              <p className="text-slate-600 text-[11px] line-clamp-2 italic">
                                &ldquo;{src.preview}...&rdquo;
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Message Footer: Timestamp & Copy */}
                  <div className="flex items-center gap-2 mt-1 px-1 text-[11px] text-slate-400">
                    <span>{msg.timestamp}</span>
                    {msg.role === "assistant" && msg.content && (
                      <button
                        onClick={() => copyToClipboard(msg.content, msg.id)}
                        className="hover:text-slate-600 transition-colors flex items-center gap-1"
                        title="Copy text"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-600">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="sticky bottom-0 bg-white border-t border-slate-200 px-4 lg:px-8 py-3">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-end gap-2 bg-slate-100 border border-slate-300 focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-100 rounded-2xl p-2 transition-all"
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about IIT Madras BS Programme (e.g. grading, exams, documents)..."
              disabled={isLoading}
              className="flex-1 bg-transparent border-0 focus:outline-none resize-none text-sm text-slate-900 placeholder:text-slate-400 px-2 py-1 max-h-40"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm transition-all"
              title="Send message"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 px-1">
            <span>Press Enter to send, Shift+Enter for new line</span>
            <span>Grounding: 357 chunks from official IITM BS PDFs</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
