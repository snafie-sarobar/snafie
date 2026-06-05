const express = require('express');
const router = express.Router();

module.exports = function({ pool, authenticateToken }) {

  const AI_PERSONALITIES = {
    default: {
      name: 'Assistant',
      systemPrompt: 'You are a helpful AI assistant. Be concise, accurate, and friendly.',
      temperature: 0.7
    },
    creative: {
      name: 'Creative Writer',
      systemPrompt: 'You are a creative writing assistant. Help with stories, poems, and creative content. Be imaginative and engaging.',
      temperature: 0.9
    },
    code: {
      name: 'Code Expert',
      systemPrompt: 'You are an expert programmer. Help with code, debugging, architecture, and best practices. Provide clean, efficient solutions.',
      temperature: 0.3
    },
    translator: {
      name: 'Translator',
      systemPrompt: 'You are a language translation assistant. Translate text between languages accurately. Maintain tone and context.',
      temperature: 0.3
    },
    tutor: {
      name: 'Tutor',
      systemPrompt: 'You are an educational tutor. Explain concepts clearly with examples. Be patient and encouraging.',
      temperature: 0.5
    },
    therapist: {
      name: 'Counselor',
      systemPrompt: 'You are a supportive counselor. Listen actively, provide emotional support, and offer thoughtful guidance. Be empathetic and non-judgmental.',
      temperature: 0.6
    },
    funny: {
      name: 'Comedian',
      systemPrompt: 'You are a witty comedian. Make people laugh with jokes, puns, and humor. Keep it light and fun.',
      temperature: 1.0
    }
  };

  router.get('/personalities', authenticateToken, async (req, res) => {
    const personalities = Object.entries(AI_PERSONALITIES).map(([key, val]) => ({
      id: key,
      name: val.name,
      temperature: val.temperature
    }));
    res.json(personalities);
  });

  router.post('/chat', authenticateToken, async (req, res) => {
    const { message, conversationId, personality, mode } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const selectedPersonality = AI_PERSONALITIES[personality] || AI_PERSONALITIES.default;
    const aiMode = mode || 'chat';

    try {
      let convId = conversationId;

      if (!convId) {
        const newConv = await pool.query(
          'INSERT INTO ai_conversations (user_id, title, personality, mode) VALUES ($1, $2, $3, $4) RETURNING id',
          [req.user.id, message.substring(0, 100), personality || 'default', aiMode]
        );
        convId = newConv.rows[0].id;
      }

      await pool.query(
        'INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, $2, $3)',
        [convId, 'user', message]
      );

      const history = await pool.query(
        'SELECT role, content FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
        [convId]
      );

      const messages = [
        { role: 'system', content: selectedPersonality.systemPrompt },
        ...history.rows.map(m => ({ role: m.role, content: m.content }))
      ];

      let responseText;

      if (process.env.OPENAI_API_KEY) {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const completion = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4',
          messages,
          temperature: selectedPersonality.temperature,
          max_tokens: 4096,
          user: req.user.id.toString()
        });

        responseText = completion.choices[0].message.content;
      } else {
        responseText = generateMockResponse(message, selectedPersonality.name, aiMode);
      }

      await pool.query(
        'INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, $2, $3)',
        [convId, 'assistant', responseText]
      );

      await pool.query(
        'UPDATE ai_conversations SET updated_at = NOW() WHERE id = $1',
        [convId]
      );

      const updatedHistory = await pool.query(
        'SELECT id, role, content, created_at FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
        [convId]
      );

      res.json({
        response: responseText,
        conversationId: convId,
        history: updatedHistory.rows,
        personality: selectedPersonality.name
      });
    } catch (error) {
      console.error('AI chat error:', error);
      res.status(500).json({
        error: 'AI service error',
        message: process.env.OPENAI_API_KEY ? 'Failed to get AI response' : 'OpenAI API key not configured. Set OPENAI_API_KEY in .env'
      });
    }
  });

  router.get('/conversations', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT ac.*,
          (SELECT content FROM ai_messages WHERE conversation_id = ac.id AND role = 'user' ORDER BY created_at DESC LIMIT 1) as last_message,
          (SELECT COUNT(*) FROM ai_messages WHERE conversation_id = ac.id) as message_count
         FROM ai_conversations ac
         WHERE ac.user_id = $1
         ORDER BY ac.updated_at DESC`,
        [req.user.id]
      );

      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  router.get('/conversations/:id', authenticateToken, async (req, res) => {
    try {
      const conv = await pool.query(
        'SELECT * FROM ai_conversations WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );

      if (conv.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const messages = await pool.query(
        'SELECT * FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
        [req.params.id]
      );

      res.json({ ...conv.rows[0], messages: messages.rows });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch conversation' });
    }
  });

  router.put('/conversations/:id', authenticateToken, async (req, res) => {
    const { title, personality, mode } = req.body;

    try {
      const updates = [];
      const values = [];
      let idx = 1;

      if (title) { updates.push(`title = $${idx++}`); values.push(title); }
      if (personality) { updates.push(`personality = $${idx++}`); values.push(personality); }
      if (mode) { updates.push(`mode = $${idx++}`); values.push(mode); }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push('updated_at = NOW()');
      values.push(req.params.id, req.user.id);

      const result = await pool.query(
        `UPDATE ai_conversations SET ${updates.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update conversation' });
    }
  });

  router.delete('/conversations/:id', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        'DELETE FROM ai_conversations WHERE id = $1 AND user_id = $2 RETURNING *',
        [req.params.id, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      res.json({ success: true, message: 'Conversation deleted' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete conversation' });
    }
  });

  router.post('/image', authenticateToken, async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Image prompt is required' });
    }

    if (process.env.OPENAI_API_KEY) {
      try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const response = await openai.images.generate({
          model: 'dall-e-3',
          prompt,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
          user: req.user.id.toString()
        });

        return res.json({
          success: true,
          imageUrl: response.data[0].url,
          revisedPrompt: response.data[0].revised_prompt
        });
      } catch (error) {
        console.error('Image generation error:', error);
        return res.status(500).json({ error: 'Image generation failed' });
      }
    }

    res.json({
      success: true,
      imageUrl: `https://picsum.photos/seed/${Date.now()}/1024/1024`,
      revisedPrompt: prompt,
      note: 'Placeholder image. Set OPENAI_API_KEY for DALL-E generation.'
    });
  });

  router.post('/translate', authenticateToken, async (req, res) => {
    const { text, targetLanguage } = req.body;

    if (!text || !targetLanguage) {
      return res.status(400).json({ error: 'Text and target language required' });
    }

    if (process.env.OPENAI_API_KEY) {
      try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const completion = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4',
          messages: [
            { role: 'system', content: `You are a translator. Translate the following text to ${targetLanguage}. Return ONLY the translated text, nothing else.` },
            { role: 'user', content: text }
          ],
          temperature: 0.3,
          max_tokens: 4096
        });

        return res.json({
          success: true,
          translatedText: completion.choices[0].message.content,
          sourceText: text,
          targetLanguage
        });
      } catch (error) {
        return res.status(500).json({ error: 'Translation failed' });
      }
    }

    res.json({
      success: true,
      translatedText: `[Translated to ${targetLanguage}]: ${text}`,
      sourceText: text,
      targetLanguage,
      note: 'Set OPENAI_API_KEY for real translation'
    });
  });

  router.post('/code', authenticateToken, async (req, res) => {
    const { prompt, language } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Code prompt is required' });
    }

    const systemPrompt = language
      ? `You are an expert ${language} developer. Write clean, well-structured ${language} code. Include error handling and best practices. Return code with brief explanation.`
      : 'You are an expert programmer. Write clean, well-structured code with error handling and best practices. Return code with brief explanation.';

    if (process.env.OPENAI_API_KEY) {
      try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const completion = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 8192
        });

        return res.json({
          success: true,
          code: completion.choices[0].message.content,
          language: language || 'unknown'
        });
      } catch (error) {
        return res.status(500).json({ error: 'Code generation failed' });
      }
    }

    res.json({
      success: true,
      code: `// Code generation requires OPENAI_API_KEY\n// Prompt: ${prompt}\n// Language: ${language || 'auto'}\n\nfunction solution() {\n  // TODO: Implement solution\n  console.log("Set OPENAI_API_KEY in .env");\n}`,
      language: language || 'javascript',
      note: 'Set OPENAI_API_KEY for real code generation'
    });
  });

  function generateMockResponse(message, personalityName, mode) {
    const responses = [
      `Hello! I'm your ${personalityName} assistant. You said: "${message}". How can I help you further?`,
      `Thanks for your message! As your ${personalityName}, I'd be happy to help with that. Here are some thoughts...`,
      `Great question! Let me think about this as your ${personalityName} assistant.`,
      `I understand you're asking about "${message.substring(0, 50)}". Here's what I can tell you...`,
      `That's interesting! From my perspective as ${personalityName}, I would suggest...`
    ];

    if (mode === 'code') {
      return `\`\`\`javascript\n// Here's a solution for: ${message}\nfunction example() {\n  return "Implementation needed - add OPENAI_API_KEY for full code generation";\n}\n\`\`\``;
    }

    if (mode === 'translate') {
      return `[Translation] Original: "${message}"\nTranslated: Configure OPENAI_API_KEY for real translations.`;
    }

    return responses[Math.floor(Math.random() * responses.length)] + `\n\n*(This is a simulated response. Add OPENAI_API_KEY to your .env file for real AI responses.)*`;
  }

  return router;
};
