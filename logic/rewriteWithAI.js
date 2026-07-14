require("dotenv").config();
const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.API_KEY,
  baseURL: process.env.API_BASE_URL || "https://openrouter.ai/api/v1",
});

async function rewriteWithAI(question, interpretations, verdict, categories) {
 const systemPrompt = `
You are a witty tarot interpreter.

Your job is to turn structured tarot meanings into a short, natural tarot reading.

Rules:
- Base the answer ONLY on the provided tarot data.
- Do NOT invent new tarot meanings.
- Tone should be mystical, playful, and slightly insightful.
- Be concise and clear.
- Each card explanation should be 1–2 sentences.
- The combined reading should answer the user's question directly.
- Keep the reading short and natural.

Formatting rules:
Card 1 — [Card Name] ([orientation])
Short interpretation connected to the role.

Card 2 — [Card Name] ([orientation])
Short interpretation connected to the role.

Card 3 — [Card Name] ([orientation])
Short interpretation connected to the role.

Combined Reading:
A short paragraph explaining the overall message and answering the question.

Verdict:
Repeat the verdict exactly as provided.
`;
  const userPrompt = `
User question:
${question}

Categories:
${categories.join(", ")}

Verdict:
${verdict}

Card data:
1. ${interpretations[0].name} (${interpretations[0].orientation})
Role: ${interpretations[0].role}
Meaning: ${interpretations[0].meaning}
Advice: ${interpretations[0].advice}

2. ${interpretations[1].name} (${interpretations[1].orientation})
Role: ${interpretations[1].role}
Meaning: ${interpretations[1].meaning}
Advice: ${interpretations[1].advice}

3. ${interpretations[2].name} (${interpretations[2].orientation})
Role: ${interpretations[2].role}
Meaning: ${interpretations[2].meaning}
Advice: ${interpretations[2].advice}
`;

  try {
    console.log("[rewriteWithAI] Preparing AI request...");

    const response = await Promise.race([
      client.chat.completions.create({
        model: process.env.MODEL_NAME || "openai/gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 500,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("OpenRouter request timed out after 20 seconds")), 20000)
      ),
    ]);

    console.log("[rewriteWithAI] AI response received");

    if (response && response.choices && response.choices[0]) {
      return response.choices[0].message.content;
    }

    console.error("[rewriteWithAI] AI provider returned no content");
    console.error(response);
  } catch (error) {
    console.error("[rewriteWithAI] Error during AI request:");
    console.error(error);
  }

  console.log("[rewriteWithAI] Falling back to local reading...");

  const lines = [];

  for (let i = 0; i < interpretations.length; i++) {
    const it = interpretations[i];
    lines.push(`Card ${i + 1}:`);
    lines.push(`${it.name} (${it.orientation})`);
    lines.push(`Role: ${it.role}`);
    lines.push(`Meaning: ${it.meaning}`);
    if (it.advice) {
      lines.push(`Advice: ${it.advice}`);
    }
    lines.push("");
  }

  lines.push("Combined Reading:");
  lines.push(`Verdict: ${verdict}`);

  return lines.join("\n");
}

module.exports = rewriteWithAI;
