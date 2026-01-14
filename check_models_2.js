
import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey });

async function listModels() {
    const modelsToTest = [
        'gemini-1.5-pro',
        'gemini-1.0-pro',
        'gemini-1.5-flash-latest'
    ];

    for (const model of modelsToTest) {
        try {
            process.stdout.write(`Testing ${model}... `);
            await ai.models.generateContent({
                model: model,
                contents: { parts: [{ text: "Hello" }] }
            });
            console.log("✅ WORKS!");
        } catch (e) {
            console.log(`❌ FAILED (${e.message})`);
        }
    }
}
listModels();
