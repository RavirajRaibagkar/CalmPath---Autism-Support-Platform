# CalmPath - Emotion-Aware Learning Platform

CalmPath is a sensory-safe learning companion designed to support neurodivergent children. It monitors real-time emotions and focus levels using AI to help parents understand and support their child's learning journey better.

## 🚀 Features
- **Emotion Tracking**: Uses Gemini 1.5 Flash to detect emotions and "looking away" distractions via webcam.
- **Focus Timer**: Automatically tracks active learning time and handles breaks.
- **Parental Insights**: AI-generated summaries of progress.
- **Calm Space**: Interactive breathing exercises and memory games for emotional regulation.

## 🛠️ Setup
1. **Supabase Setup**:
   - Create a project at [supabase.com](https://supabase.com).
   - Run the SQL in `database/schema.sql`.
   - Add your `URL` and `Anon Key` to the Secrets panel in AI Studio.
2. **Gemini API**:
   - Ensure your `GEMINI_API_KEY` is set in AI Studio Secrets.
3. **Run**:
   - The app runs automatically! Open the preview to start.

## 📂 File Structure
- `src/components/`: UI components (Auth, Dashboards, CalmSpace).
- `src/lib/`: API clients (Supabase, Gemini).
- `server.ts`: Express backend for emotion detection.
- `database/schema.sql`: Database definition.
