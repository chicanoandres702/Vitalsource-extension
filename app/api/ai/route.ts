import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const { text, prompt } = await req.json();
    
    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400, headers: corsHeaders });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `You are an AI assistant helping to process scraped web pages.
      
User Request: ${prompt || "Summarize the following text. Extract the key entities, main topics, and provide a concise overview."}

Text to process:
${text.substring(0, 100000)}`,
    });

    return NextResponse.json({ result: response.text }, { headers: corsHeaders });
  } catch (error) {
    console.error("AI Error:", error);
    return NextResponse.json({ error: "Failed to generate AI response" }, { status: 500, headers: corsHeaders });
  }
}
