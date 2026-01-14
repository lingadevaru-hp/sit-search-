
import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("No API KEY found in .env");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: apiKey });

async function listModels() {
    console.log("Checking available models...");
    try {
        // The SDK might not expose listModels directly in the simplified client, 
        // so we'll try a basic generateContent on a known safe model to verify validity first.
        // But better: let's try to fetch models if possible or test candidates.

        const modelsToTest = [
            'gemini-1.5-flash',
            'gemini-1.5-flash-001',
            'gemini-1.5-flash-002',
            'gemini-2.0-flash-exp',
            'gemini-pro'
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

    } catch (error) {
        console.error("Error:", error);
    }
}

listModels();
