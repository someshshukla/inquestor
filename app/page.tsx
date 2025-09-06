"use client";
import React, { useState, useEffect } from 'react';
import { Bot, Link as LinkIcon, Loader2, AlertTriangle, FileDown, KeyRound, ChevronRight } from 'lucide-react';

// Define interfaces for our data structures to satisfy TypeScript
interface TypewriterProps {
  text: string;
  speed?: number;
}

interface Source {
  title: string;
  uri: string;
}

interface ResearchResult {
  topic: string;
  summary: string;
  sources: Source[];
}

// Define specific types for jsPDF options to avoid using 'any'
interface JsPDFTextOptions {
  align?: 'left' | 'center' | 'right' | 'justify';
  maxWidth?: number;
}

interface JsPDFGetTextDimensionsOptions {
  maxWidth?: number;
}

// Define a minimal type definition for the jsPDF object loaded from the CDN
interface CustomJsPDF {
  text(text: string | string[], x: number, y: number, options?: JsPDFTextOptions): this;
  splitTextToSize(text: string, width: number): string[];
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
  setTextColor(r: number, g: number, b: number): this;
  setFontSize(size: number): this;
  setFont(fontName: string, fontStyle: string): this;
  getTextDimensions(text: string, options?: JsPDFGetTextDimensionsOptions): { h: number };
  addPage(): this;
  save(filename: string): this;
  textWithLink(text: string, x: number, y: number, options: { url: string }): this;
}

// Extend the global Window interface to include the jspdf library
declare global {
    interface Window {
        jspdf?: {
            jsPDF: new (orientation?: 'p' | 'l', unit?: 'mm' | 'in' | 'pt', format?: 'a4' | string) => CustomJsPDF;
        };
    }
}


function Typewriter({ text, speed = 20 }: TypewriterProps) {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    setDisplayedText('');
    if (text) {
      let i = 0;
      const intervalId = setInterval(() => {
        if (i < text.length) {
          setDisplayedText(prev => prev + text.charAt(i));
          i++;
        } else {
          clearInterval(intervalId);
        }
      }, speed);

      return () => clearInterval(intervalId);
    }
  }, [text, speed]);

  return (
    <p className="text-gray-300 text-lg leading-relaxed whitespace-pre-wrap">
      {displayedText}
      {displayedText.length < (text?.length || 0) && <span className="inline-block w-2.5 h-6 bg-cyan-400 animate-pulse ml-1 translate-y-1" aria-hidden="true"></span>}
    </p>
  );
}

export default function App() {
  const [query, setQuery] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Inquestor AI";
    
    const jspdfScript = document.createElement('script');
    jspdfScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    jspdfScript.async = true;
    document.body.appendChild(jspdfScript);

    return () => {
        if (document.body.contains(jspdfScript)) {
            document.body.removeChild(jspdfScript);
        }
    }
  }, []);

  const startResearch = async () => {
    if (!apiKey) {
      setError("Please provide an API key.");
      return;
    }
    if (!query) {
      setError("Please enter a topic to research.");
      return;
    }
    
    setLoading(true);
    setError(null);
    setResult(null);

    const systemPrompt = `
      You are a world-class research assistant AI named Inquestor.
      Your goal is to provide a concise, accurate, and well-sourced summary of a given topic using real-time web search.
      1. You MUST perform a web search to gather up-to-date information.
      2. Synthesize the information into a clear summary.
      3. The user's query is: "${query}"
      4. Respond with ONLY a single JSON object with the keys "topic" and "summary".
    `;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ parts: [{ text: systemPrompt }] }],
      tools: [{ "google_search": {} }],
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API call failed! Status: ${response.status}`);
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];

        if (!candidate) {
            throw new Error("No response from the model.");
        }
      
        const rawText = candidate.content?.parts?.[0]?.text || '';
        let parsedContent;
      
        try {
            const jsonString = rawText.replace(/```json\n?/, "").replace(/```$/, "");
            parsedContent = JSON.parse(jsonString);
        } catch (parseError) {
            console.error("Parse Error:", parseError);
            throw new Error("The model returned a weird format. Try again.");
        }

        const groundingMetadata = candidate.groundingMetadata;
        type Attribution = { web?: { title?: string; uri?: string } };
        const sources: Source[] = groundingMetadata?.groundingAttributions
            ?.map((attr: Attribution) => ({
                title: attr.web?.title || '',
                uri: attr.web?.uri || '',
            }))
            .filter((source: Source) => source.uri && source.title) || [];

        setResult({ ...parsedContent, sources });

    } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message || "An unknown error happened.");
        } else {
          setError("An unknown error happened.");
        }
    } finally {
        setLoading(false);
    }
  };

  function downloadPdf() {
    try {
        const jspdfModule = window.jspdf;
        if (!result || typeof jspdfModule === 'undefined') {
            setError("Can't download PDF yet. The PDF library might still be loading.");
            return;
        }

        const { jsPDF } = jspdfModule;
        const pdf: CustomJsPDF = new jsPDF('p', 'mm', 'a4');

        const pageWidth = pdf.internal.pageSize.getWidth();
        const margin = 20;
        let yPosition = margin;

        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(20);
        pdf.setFont('helvetica', 'bold');
        pdf.text(result.topic, pageWidth / 2, yPosition, { align: 'center', maxWidth: pageWidth - margin * 2 });
        yPosition += (pdf.splitTextToSize(result.topic, pageWidth - margin * 2).length * 10) + 10;
        
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'normal');
        const summaryLines = pdf.splitTextToSize(result.summary, pageWidth - margin * 2);
        pdf.text(summaryLines, margin, yPosition);
        yPosition += (summaryLines.length * 7) + 10;

        if (result.sources && result.sources.length > 0) {
            if (yPosition + 10 > pdf.internal.pageSize.getHeight() - margin) { pdf.addPage(); yPosition = margin; }
            pdf.setFontSize(14);
            pdf.setFont('helvetica', 'bold');
            pdf.text("Sources", margin, yPosition);
            yPosition += 8;

            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');
            result.sources.forEach(source => {
                if (yPosition + 12 > pdf.internal.pageSize.getHeight() - margin) { pdf.addPage(); yPosition = margin; }
                
                pdf.setTextColor(0, 0, 0);
                pdf.text(source.title, margin, yPosition, { maxWidth: pageWidth - margin * 2 });
                yPosition += pdf.getTextDimensions(source.title, { maxWidth: pageWidth - margin * 2 }).h + 2;
                
                pdf.setTextColor(0, 0, 255);
                pdf.textWithLink(source.uri, margin, yPosition, { url: source.uri });
                yPosition += 10;
            });
        }
        
        pdf.save(`${result.topic.replace(/\s/g, '_')}.pdf`);
    } catch (err: unknown) {
        if (err instanceof Error) {
            setError(`Something went wrong making the PDF: ${err.message}`);
        } else {
            setError("Something went wrong making the PDF.");
        }
    }
  }

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-900 text-white font-sans p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-700 via-gray-900 to-black">
      <div className="w-full max-w-3xl mx-auto my-auto animate-slide-up-fade">
        <header className="text-center mb-10">
          <div className="inline-flex items-center gap-4">
            <Bot className="w-12 h-12 text-cyan-300" />
            <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-300 via-purple-400 to-pink-400 text-transparent bg-clip-text">
              Inquestor AI
            </h1>
          </div>
          <p className="text-gray-400 mt-3 text-lg">
            Your intelligent research assistant. Get sourced answers and downloadable PDF reports.
          </p>
        </header>
        
        <div className="space-y-4 bg-black/20 p-6 rounded-2xl border border-gray-700/50 shadow-2xl shadow-black/20 focus-within:border-cyan-400/50 transition-all duration-300">
            <div className="relative">
                <label htmlFor="apiKey" className="block text-sm font-medium text-gray-400 mb-2">Gemini API Key</label>
                <div className="relative">
                    <KeyRound className="absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-500" />
                    <input
                        id="apiKey"
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Enter your API key here"
                        className="w-full p-3 pl-12 text-lg bg-gray-800 border-2 border-gray-700 rounded-lg focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all placeholder-gray-500"
                    />
                </div>
            </div>

            <div className="relative">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        startResearch();
                    }
                }}
                placeholder="e.g., The history and future of neural networks..."
                className="w-full h-32 p-4 text-lg bg-gray-800 border-2 border-gray-700 rounded-lg focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all resize-none placeholder-gray-500"
                disabled={loading}
              />
            </div>
        </div>

        <div className="flex justify-center mt-6 mb-8">
          <button
            onClick={startResearch}
            disabled={loading || !query.trim() || !apiKey.trim()}
            className="flex items-center justify-center gap-3 px-10 py-4 text-xl font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg hover:from-cyan-400 hover:to-blue-500 disabled:bg-gradient-to-br disabled:from-gray-700 disabled:to-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg shadow-cyan-500/10 hover:shadow-cyan-400/20"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin w-6 h-6" />
                <span>Researching...</span>
              </>
            ) : (
                <>
                <span>Run Research</span>
                <ChevronRight className="w-6 h-6"/>
                </>
            )}
          </button>
        </div>

        <div className="min-h-[300px]">
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 p-4 rounded-lg flex items-center gap-3 animate-fade-in">
              <AlertTriangle className="w-8 h-8 flex-shrink-0"/>
              <div>
                <p className="font-bold">An Error Occurred</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {result && (
            <div className="bg-gray-800/30 border border-gray-700/50 p-6 sm:p-8 rounded-2xl shadow-2xl shadow-black/30 backdrop-blur-sm animate-fade-in">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
                  <h2 className="text-3xl font-bold text-cyan-300 flex-1">{result.topic}</h2>
                  <button
                      onClick={downloadPdf}
                      className="flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-semibold text-cyan-200 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors border border-gray-600"
                  >
                      <FileDown className="w-4 h-4"/>
                      Download PDF
                  </button>
              </div>
              <Typewriter text={result.summary} />
              
              {result.sources && result.sources.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-xl font-semibold text-gray-200 mb-4 border-b-2 border-gray-700 pb-2">Sources</h3>
                  <div className="space-y-4">
                    {result.sources.map((source, index) => (
                      <div key={index} className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 hover:border-cyan-400/50 transition-colors duration-300">
                        <a
                          href={source.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-gray-100 hover:text-cyan-400 transition-colors"
                        >
                          {source.title}
                        </a>
                        <div className="flex items-center gap-2 mt-1">
                          <LinkIcon className="w-3.5 h-3.5 flex-shrink-0 text-gray-500" />
                          <p className="text-xs text-gray-500 break-all truncate">{source.uri}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-up-fade {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.6s ease-out forwards;
        }
        .animate-slide-up-fade {
          animation: slide-up-fade 0.6s ease-out forwards;
        }
      ` }} />
    </div>
  );
}

