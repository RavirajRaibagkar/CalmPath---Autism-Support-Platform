import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function askGemini(prompt: string, context: string = "") {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", // Using 3 flash preview as per environment guidelines
      contents: context ? `${context}\n\nUser Question: ${prompt}` : prompt,
      config: {
        systemInstruction: "You are CalmPath AI Assistant. For children: be patient, supportive, and use simple language. For parents: provide professional, data-driven insights about their child's learning patterns, focus, and emotional states. You can analyze potential autism-related behaviors based on provided data, but clarify that you are an AI assistant and not a medical professional.",
      },
    });
    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "I'm sorry, I'm having trouble thinking right now. Maybe we can try again in a moment?";
  }
}

export async function generateReportSummary(childData: any, period: string) {
  try {
    const prompt = `Generate a highly professional and empathetic ${period} progress report for a parent.
    
    Data Context:
    - Student: ${childData.profile.name}
    - Total Focus Time: ${Math.round(childData.stats.totalFocusTime / 60)} minutes
    - Distraction Count: ${childData.stats.distraction_count}
    - Tab Switches (indicative of focus shifts): ${childData.stats.tabSwitches}
    - Recent Emotions: ${childData.emotions.slice(0, 50).map((e: any) => e.emotion).join(', ')}
    
    Detailed Sessions: ${JSON.stringify(childData.sessions.slice(0, 10))}

    Please provide:
    1. **Executive Summary**: A warm overview of how ${childData.profile.name} performed.
    2. **Behavioral Patterns**: Analyze focus vs. distraction. Look for correlations (e.g., sessions with high focus vs. specific times or tasks).
    3. **Emotional Well-being**: Summarize the predominant moods and any distress signals (Looking Away, Sad, Angry).
    4. **Actionable Recommendations**: 3 specific, supportive tips for the parent to try (e.g., 'Try shorter sessions with sensory breaks' or 'Introduce visual schedules').
    
    Format in beautiful Clean Markdown with headers and bullet points. Avoid medical diagnoses, but focus on behavioral support.`;
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are a lead behavioral psychologist and educational consultant. Your tone is professional, deeply empathetic, and data-informed. You specialize in neurodiversity and child development.",
      },
    });
    return response.text;
  } catch (error) {
    console.error("Report Generation Error:", error);
    return "Failed to generate report summaries. Please try again later.";
  }
}

let lastEmotionAnalysisTime = 0;
let quotaExhaustedUntil = 0;
const MIN_EMOTION_INTERVAL = 30000; // 30 seconds
const QUOTA_COOLDOWN = 60000; // 1 minute cooldown if quota hit

export async function analyzeEmotion(frameBase64: string) {
  const now = Date.now();
  
  if (now < quotaExhaustedUntil) {
    return { emotion: null, confidence: 0 };
  }

  if (now - lastEmotionAnalysisTime < MIN_EMOTION_INTERVAL) {
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
            text: "Analyze this person's facial expression. Return ONLY a single word from this list: happy, sad, angry, surprised, fearful, disgusted, neutral, or 'looking_away' if no face is visible or they aren't looking at the camera."
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
    // If we hit a rate limit, enter cooldown
    if (error?.message?.includes('429') || error?.message?.includes('quota')) {
      console.warn("AI Quota reached. Entering 60s cooldown...");
      quotaExhaustedUntil = Date.now() + QUOTA_COOLDOWN;
    }
    console.warn("Emotion Analysis skipped:", error?.message);
    return { emotion: null, confidence: 0 };
  }
}

export async function getParentInsights(childData: any) {
  try {
    const prompt = `Based on the following data for a child's learning session, provide a brief summary and 3 actionable insights/tips for the parent: \n${JSON.stringify(childData)}`;
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are a professional educational consultant specializing in neurodiversity. Provide clear, empathetic, and data-driven insights for parents. Avoid overly technical jargon.",
      },
    });
    return response.text;
  } catch (error) {
    console.error("Gemini API Error (Insights):", error);
    return "I couldn't generate insights at this time. Please check the charts below for a summary of the child's progress.";
  }
}
