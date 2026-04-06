const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3001;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('CORS origin is not allowed.'));
    },
  }),
);

app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    message: 'Weather backend is running.',
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/recommend-clothing', async (req, res) => {
  try {
    const { region, weatherText, temperature } = req.body ?? {};

    if (!region || !weatherText || temperature === undefined || temperature === null) {
      return res.status(400).json({
        error: 'region, weatherText, and temperature are required.',
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: 'GEMINI_API_KEY is not configured on the server.',
      });
    }

    const prompt = [
      `Location: ${region}`,
      `Weather: ${weatherText}`,
      `Temperature: ${temperature}C`,
      'Give a short clothing recommendation in Korean.',
      'Keep it friendly and limit the answer to 2 sentences.',
    ].join('\n');

    const apiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);

      return res.status(502).json({
        error: 'Failed to get a response from Gemini.',
      });
    }

    const data = await response.json();
    const recommendation = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!recommendation) {
      return res.status(502).json({
        error: 'Gemini returned an empty response.',
      });
    }

    return res.json({ recommendation });
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({
      error: 'Failed to create a clothing recommendation.',
    });
  }
});

app.listen(port, () => {
  console.log(`Weather backend listening on port ${port}`);
});
