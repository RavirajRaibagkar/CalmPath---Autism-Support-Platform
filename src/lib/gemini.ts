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
    const prompt = `Generate a ${period} progress report based on this data: ${JSON.stringify(childData)}. 
    Include:
    1. Focus trends (duration, distractions, tab switching)
    2. Emotional landscape summary
    3. Notable anomalies
    4. 3 educational recommendations.
    Format the output in clear Markdown.`;
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are an expert behavior analyst. Analyze the child's learning data and provide a constructive, supportive report for parents. Focus on patterns and growth.",
      },
    });
    return response.text;
  } catch (error) {
    console.error("Report Generation Error:", error);
    return "Failed to generate report summaries. Please try again later.";
  }
}

export async function analyzeEmotion(frameBase64: string) {
  try {
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
  } catch (error) {
    console.error("Emotion Analysis Error:", error);
    return { emotion: "neutral", confidence: 0.5 };
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
