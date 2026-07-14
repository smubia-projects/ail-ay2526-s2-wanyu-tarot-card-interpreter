require("dotenv").config();
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const rateLimitMiddleware = require("./rateLimit");

const app = express();
const port = process.env.PORT || 8080;

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);

const client = new OpenAI({
  apiKey: process.env.API_KEY,
  baseURL: process.env.API_BASE_URL || "https://openrouter.ai/api/v1",
});

app.use(express.json());
// NOTE: do NOT serve the frontend from here. Cloud Run is API-only; the static
// site lives on Vercel (see DOCS/ailodge/deployment-playbook.md "Backend must not
// serve the frontend"). Serving public/ here spins billable Cloud Run instances for
// static files and ships a broken config.js-less copy that falls back to localhost.

const majorArcana = [
  "The Fool",
  "The Magician",
  "The High Priestess",
  "The Empress",
  "The Emperor",
  "The Hierophant",
  "The Lovers",
  "The Chariot",
  "Strength",
  "The Hermit",
  "Wheel of Fortune",
  "Justice",
  "The Hanged Man",
  "Death",
  "Temperance",
  "The Devil",
  "The Tower",
  "The Star",
  "The Moon",
  "The Sun",
  "Judgement",
  "The World",
];

function getRandomOrientation() {
  return Math.random() < 0.5 ? "upright" : "reversed";
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/reading", rateLimitMiddleware, async (req, res) => {
  try {
    const { question, selectedCards } = req.body;

    if (!question || !selectedCards || selectedCards.length !== 3) {
      return res.json({
        error: "Please ask a question and select exactly 3 cards.",
      });
    }

    const chosenCards = selectedCards.map((cardNumber, index) => {
      const cardName = majorArcana[cardNumber - 1];
      const role =
        index === 0
          ? "Current energy"
          : index === 1
            ? "Obstacle or hidden factor"
            : "Likely direction or advice";

      return {
        name: cardName,
        role: role,
        orientation: getRandomOrientation(),
      };
    });

    const prompt = `
You are a witty tarot interpreter.

Write a playful tarot reading based ONLY on the cards provided.

Rules:
- Do not use markdown
- Do not use asterisks
- Write clearly in normal paragraphs
- Interpret all 3 cards
- First explain each card briefly
- Then give a short combined interpretation
- End with a short verdict

User question:
${question}

Tarot cards drawn:

Card 1:
${chosenCards[0].name} (${chosenCards[0].orientation})
Role: ${chosenCards[0].role}

Card 2:
${chosenCards[1].name} (${chosenCards[1].orientation})
Role: ${chosenCards[1].role}

Card 3:
${chosenCards[2].name} (${chosenCards[2].orientation})
Role: ${chosenCards[2].role}
`;

    const response = await client.chat.completions.create({
      model: process.env.MODEL_NAME || "openai/gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const cleanAnswer = response.choices[0].message.content
      .replace(/\*\*/g, "")
      .replace(/\*/g, "");

    res.json({
      answer: cleanAnswer,
      cards: chosenCards,
    });
  } catch (error) {
    console.error(error);
    res.json({
      error: "The tarot spirits encountered an error.",
    });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Tarot server running on port ${port}`);
});
