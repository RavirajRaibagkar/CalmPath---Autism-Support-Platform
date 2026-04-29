import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

let quotaExhaustedUntil = 0;
const QUOTA_COOLDOWN = 60000; // 1 minute cooldown

function checkQuota() {
  if (Date.now() < quotaExhaustedUntil) {
    throw new Error('AI Quota currently exhausted. Please wait a moment.');
  }
}

function handleQuotaError(error: any) {
  if (error?.message?.includes('429') || error?.message?.includes('quota')) {
    console.warn("AI Quota reached. Entering 1-minute cooldown...");
    quotaExhaustedUntil = Date.now() + QUOTA_COOLDOWN;
  }
}

export async function askGemini(prompt: string, context: string = "") {
  try {
    checkQuota();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: context ? `${context}\n\nUser Question: ${prompt}` : prompt,
      config: {
        systemInstruction: "You are CalmPath AI Assistant. For children: be patient, supportive, and use simple language. For parents: provide professional, data-driven insights. You clarify that you are an AI assistant and not a medical professional.",
      },
    });
    return response.text;
  } catch (error: any) {
    handleQuotaError(error);
    console.error("Gemini API Error:", error);
    return "I'm sorry, I'm having trouble thinking right now. Maybe we can try again in a moment?";
  }
}

export async function generateReportSummary(childData: any, period: string) {
  try {
    checkQuota();
    const prompt = `Generate a highly professional and empathetic ${period} progress report for a parent.
    
    Data Context:
    - Student: ${childData.profile.name}
    - Total Focus Time: ${Math.round(childData.stats.totalFocusTime / 60)} minutes
    - Distraction Count: ${childData.stats.distraction_count}
    - Tab Switches: ${childData.stats.tabSwitches}
    - Recent Emotions: ${childData.emotions.slice(0, 50).map((e: any) => e.emotion).join(', ')}
    
    Format in Clean Markdown. Summarize executive summary, behavioral patterns, emotional well-being, and actionable recommendations.`;
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are a lead behavioral psychologist. Tone is professional and empathetic.",
      },
    });
    return response.text;
  } catch (error: any) {
    handleQuotaError(error);
    console.error("Report Generation Error:", error);
    return "Failed to generate report summaries. Please try again later.";
  }
}

let lastEmotionAnalysisTime = 0;
const MIN_EMOTION_INTERVAL = 30000; // 30 seconds

export async function analyzeEmotion(frameBase64: string) {
  const now = Date.now();
  
  if (now < quotaExhaustedUntil || now - lastEmotionAnalysisTime < MIN_EMOTION_INTERVAL) {
    return { emotion: null, confidence: 0 };
  }

  try {
    lastEmotionAnalysisTime = now;
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              data: frameBase64.split(',')[1] || frameBase64,
              mimeType: "image/jpeg"
            }
          },
          {
            text: "Analyze this person's facial expression. Return ONLY a single word from this list: happy, sad, angry, surprised, fearful, disgusted, neutral, or 'looking_away'."
          }
        ]
      }
    });

    const emotion = response.text?.toLowerCase().trim() || "neutral";
    return {
      emotion: emotion.includes('looking_away') ? 'looking_away' : emotion,
      confidence: 0.95
    };
  } catch (error: any) {
    handleQuotaError(error);
    console.warn("Emotion Analysis skipped:", error?.message);
    return { emotion: null, confidence: 0 };
  }
}

export async function getParentInsights(childData: any) {
  try {
    checkQuota();
    const prompt = `Based on the following data for a child's learning session, provide a brief summary and 3 actionable insights/tips for the parent: \n${JSON.stringify(childData)}`;
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are a professional educational consultant.",
      },
    });
    return response.text;
  } catch (error: any) {
    handleQuotaError(error);
    console.error("Gemini API Error (Insights):", error);
    return "I couldn't generate insights at this time.";
  }
}
