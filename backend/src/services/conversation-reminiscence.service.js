/**
 * SMRITI REAL GEMINI AI CONVERSATION & REMINISCENCE COMPANION SERVICE
 * Powers the interactive "Talk & Recall" voice reminiscence companion.
 * Uses official Google @google/genai SDK for real, multi-turn, personalized AI conversations.
 * Integrates real family members, daily routines, photo memories, and cultural anchors.
 * Provides warm, slow-paced, empathetic, non-judgmental conversational flow for elderly seniors.
 */

import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';
import { familyService } from './family-service.js';
import { routineService } from './routine-service.js';
import { profileService } from './profile-service.js';
import { mediaService } from './media-service.js';
import { relationshipService } from './relationship-service.js';
import { userService } from './user-service.js';
import { logger } from '../utils/logger.js';

let genAIClient = null;

function getGeminiClient() {
  const apiKey = config.gemini?.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server');
  }
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({ apiKey });
  }
  return genAIClient;
}

const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL,
  config.gemini?.model,
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-flash-lite-latest'
].filter((m, idx, arr) => m && typeof m === 'string' && arr.indexOf(m) === idx);

/**
 * Resolves respectful title and styled name for the senior.
 * Rules:
 * - Male -> "[Name] Baba"
 * - Female -> "[Name] Maa"
 * - Never "Baba [Name]" or "Maa [Name]"
 * - Never infer gender from name alone. If unknown, use clean neutral name.
 */
function resolveSeniorStyledName(user, profile) {
  let realName = '';
  if (user?.name && user.name !== 'Smriti User' && user.name !== 'Elderly User') {
    realName = user.name.trim();
  } else if (profile?.displayName && profile.displayName !== 'Elderly User' && profile.displayName !== 'Smriti User') {
    realName = profile.displayName.trim();
  } else if (user?.email) {
    const emailPrefix = user.email.split('@')[0];
    realName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
  } else {
    realName = 'Senior';
  }

  const gender = (profile?.gender || user?.gender || '').toLowerCase().trim();
  const explicitTitle = (profile?.title || user?.title || '').trim();
  let styledName = realName;
  if (gender === 'male') {
    styledName = `${realName} Baba`;
  } else if (gender === 'female') {
    styledName = `${realName} Maa`;
  } else if (explicitTitle) {
    styledName = `${realName} ${explicitTitle}`;
  }

  return styledName.trim();
}

/**
 * Builds server-side system instruction for Gemini grounding the conversation in Smriti's verified records.
 */
function buildGeminiSystemInstruction({ seniorName, user, profile, family = [], routines = [], memories = [], language = 'as' }) {
  const gender = (profile?.gender || user?.gender || '').toLowerCase().trim();
  const titleRule = gender === 'male'
    ? `Always address them respectfully as "${seniorName}". Never say "Baba [Name]", always say "[Name] Baba".`
    : gender === 'female'
      ? `Always address them respectfully as "${seniorName}". Never say "Maa [Name]", always say "[Name] Maa".`
      : `Address them warmly and respectfully as "${seniorName}".`;

  const cleanFamily = family.map(f => ({
    name: f.name,
    relationship: f.relationship || 'Family',
    location: f.location || undefined,
    isFavorite: Boolean(f.isFavorite),
    personalContext: f.personalContext || f.shortDescription || undefined
  }));

  const cleanRoutines = routines.map(r => ({
    activityName: r.activityName,
    time: r.timeOfDay || r.time || undefined
  }));

  const cleanMemories = memories.slice(0, 10).map(m => ({
    title: m.title || 'Family Memory',
    description: m.description || undefined,
    type: m.type || 'photo'
  }));

  const languageLabels = {
    as: 'Assamese (অসমীয়া)',
    hi: 'Hindi (हिंदी)',
    bn: 'Bengali (বাংলা)',
    en: 'English'
  };
  const targetLangName = languageLabels[language] || 'the senior\'s preferred language';

  return `You are Smriti, a warm, patient, and deeply respectful reminiscence companion for elderly seniors.
You are conversing with ${seniorName}.
${titleRule}

VERIFIED BACKGROUND RECORDS FOR ${seniorName}:
- Family Members: ${JSON.stringify(cleanFamily)}
- Daily Routines: ${JSON.stringify(cleanRoutines)}
- Stored Memory Photos: ${JSON.stringify(cleanMemories)}

CORE CONVERSATIONAL BEHAVIORS:
1. Warmth & Pace: Speak like a caring, patient human companion, NOT a generic AI chatbot. Never say "How can I help you today?", "As an AI...", or give clinical advice.
2. Simplicity: Use short, simple, comforting sentences (2 to 3 sentences maximum). Avoid big words, long paragraphs, complex grammar, or bulleted lists.
3. Reminiscence: Ask at most ONE meaningful, open-ended follow-up question per turn to gently encourage the senior to share their memories.
4. Active Continuity: Maintain conversational continuity. Always connect your response to what the senior just said and remember context from previous turns (e.g. references like "there", "with him", "that place", "the food").
5. Strict Grounding: NEVER invent family members, trips, or memories that are not in the verified records. If the senior mentions an event or person not in the records (such as a trip to Puri or an old friend), acknowledge it warmly and ask them to share more about it. Never claim you remember an unrecorded event.
6. Language: Respond naturally and fluently in ${targetLangName}. If the senior speaks in another language or mixes languages, match their language warmly while keeping sentences clear and easy for an elderly ear.
7. Output Format: You MUST output a JSON object matching this schema:
   {
     "replyText": string (the warm response to be spoken aloud to the senior),
     "suggestedReplies": array of 2 to 3 short phrases (in the same language) that the senior can easily tap or say next
   }`;
}

/**
 * Formats conversation history into bounded multi-turn contents for @google/genai
 */
function formatConversationContents(conversationHistory, currentMessage) {
  const boundedHistory = (Array.isArray(conversationHistory) ? conversationHistory : []).slice(-10);
  const contents = [];

  for (const turn of boundedHistory) {
    if (!turn?.content || typeof turn.content !== 'string') continue;
    const role = (turn.role === 'user') ? 'user' : 'model';
    const text = turn.content.trim();
    if (!text) continue;

    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += `\n${text}`;
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }

  const cleanCurrent = (currentMessage || '').trim();
  if (cleanCurrent) {
    const lastContent = contents[contents.length - 1];
    if (!lastContent || lastContent.role !== 'user' || lastContent.parts[0].text !== cleanCurrent) {
      if (lastContent && lastContent.role === 'user') {
        lastContent.parts[0].text = cleanCurrent;
      } else {
        contents.push({ role: 'user', parts: [{ text: cleanCurrent }] });
      }
    }
  }

  if (contents.length === 0 && cleanCurrent) {
    contents.push({ role: 'user', parts: [{ text: cleanCurrent }] });
  }

  return contents;
}

/**
 * Calls Gemini with model failover and structured JSON schema
 */
async function callGeminiConversation({ systemInstruction, contents }) {
  const ai = getGeminiClient();
  let lastError = null;

  for (const model of CANDIDATE_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            temperature: 0.7,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                replyText: { type: 'STRING' },
                suggestedReplies: {
                  type: 'ARRAY',
                  items: { type: 'STRING' }
                }
              },
              required: ['replyText', 'suggestedReplies']
            }
          }
        });

        if (!response?.text) {
          throw new Error('Empty response received from Gemini');
        }

        const parsed = JSON.parse(response.text);
        if (!parsed?.replyText || typeof parsed.replyText !== 'string') {
          throw new Error('Malformed Gemini response: missing replyText');
        }

        return {
          modelUsed: model,
          replyText: parsed.replyText.trim(),
          suggestedReplies: Array.isArray(parsed.suggestedReplies) ? parsed.suggestedReplies.slice(0, 3) : []
        };
      } catch (err) {
        lastError = err;
        const status = err.status || (err.message && err.message.includes('429') ? 429 : err.message && err.message.includes('503') ? 503 : null);
        logger.warn(`Gemini model ${model} attempt ${attempt + 1} failed (${status || err.message || 'unknown error'})`);

        if ((status === 429 || status === 503) && attempt === 0) {
          await new Promise(r => setTimeout(r, 1200));
        } else {
          break; // proceed to next candidate model
        }
      }
    }
  }

  throw new Error(`Gemini conversation generation failed: ${lastError?.status || lastError?.message || 'All models unavailable'}`);
}

export const conversationReminiscenceService = {
  /**
   * Generates a personalized opening reminiscence prompt for an elderly user using Gemini
   */
  async getOpeningPrompt(elderlyUserId, callerId, language = 'as') {
    if (callerId !== elderlyUserId) {
      const isAuth = await relationshipService.hasActiveRelationship(callerId, elderlyUserId);
      if (!isAuth) throw new Error('Unauthorized: You cannot access conversation for this senior.');
    }

    const [user, profile, family, routines, memories] = await Promise.all([
      userService.getUserById(elderlyUserId).catch(() => null),
      profileService.getProfile(elderlyUserId).catch(() => null),
      familyService.getFamilyForElderly(elderlyUserId).catch(() => []),
      routineService.getRoutineForElderly(elderlyUserId).catch(() => []),
      mediaService.getMemoriesForElderly(elderlyUserId, callerId).catch(() => [])
    ]);

    const seniorName = resolveSeniorStyledName(user, profile);
    const lang = language || profile?.preferredLanguage || 'as';

    // Pick top personalized anchors
    const favFamily = family.find(f => f.isFavorite) || family[0];
    const morningRoutine = routines.find(r => r.order === 1 || /tea|walk|morning/i.test(r.activityName)) || routines[0];

    const systemInstruction = buildGeminiSystemInstruction({
      seniorName,
      user,
      profile,
      family,
      routines,
      memories,
      language: lang
    });

    const openingContents = [
      {
        role: 'user',
        parts: [{
          text: `Please generate a warm, loving opening greeting and one gentle opening reminiscence question for ${seniorName} to start our conversation today. Mention their morning routine (${morningRoutine?.activityName || 'morning tea'}) or their family member (${favFamily?.name || 'family'}) if appropriate. Output JSON with "replyText" (the opening prompt) and "suggestedReplies" (array of 2 to 3 short starter replies).`
        }]
      }
    ];

    try {
      const geminiRes = await callGeminiConversation({
        systemInstruction,
        contents: openingContents
      });

      return {
        success: true,
        promptText: geminiRes.replyText,
        suggestedReplies: geminiRes.suggestedReplies,
        language: lang,
        seniorName,
        favFamily: favFamily ? { name: favFamily.name, relationship: favFamily.relationship, avatar: favFamily.avatar, avatarUrl: favFamily.avatarUrl } : null
      };
    } catch (err) {
      logger.warn('Gemini opening prompt generation failed, returning warm anchored prompt', { message: err?.message });
      // Safe localized fallback greeting if Gemini is temporarily unreachable during page load
      let promptText = '';
      let suggestedReplies = [];
      if (lang === 'as') {
        promptText = `নমস্কাৰ ${seniorName}! আজি আপোনাৰ কেনে লাগিছে? চাহ খাই ভাল লাগিলনে নাইবা কোনো পুৰণি গান মনত পৰিছে নেকি?`;
        suggestedReplies = [`মই চাহ খালোঁ`, `পুৰণি কথা কওঁ`, `মনটো ভাল লাগিছে`];
      } else if (lang === 'hi') {
        promptText = `नमस्ते ${seniorName}! आज आपका मन कैसा है? क्या आपने सुबह की चाय पी? अपनी कोई मीठी याद मुझसे साझा करें।`;
        suggestedReplies = [`सुबह की चाय पी ली`, `पुरानी यादें बताएं`, `अच्छा महसूस हो रहा है`];
      } else if (lang === 'bn') {
        promptText = `নমস্কার ${seniorName}! আজ আপনার দিনটি কেমন যাচ্ছে? কোনো প্রিয় গান বা সুন্দর স্মৃতির কথা মনে পড়ছে কি?`;
        suggestedReplies = [`খুব ভালো লাগছে`, `পুরোনো কথা বলি`];
      } else {
        promptText = `Hello ${seniorName}! It is wonderful to hear your voice today. How are you feeling? Share whatever comes to your mind.`;
        suggestedReplies = [`Feeling peaceful today`, `Tell me a pleasant story`, `Let's chat`];
      }

      return {
        success: true,
        promptText,
        suggestedReplies,
        language: lang,
        seniorName,
        favFamily: favFamily ? { name: favFamily.name, relationship: favFamily.relationship, avatar: favFamily.avatar, avatarUrl: favFamily.avatarUrl } : null
      };
    }
  },

  /**
   * Processes an incoming message from the senior during the Talk & Recall session.
   * Generates response using real Gemini AI.
   * Under no circumstances generates fake responses if Gemini fails.
   */
  async processUserMessage({ elderlyUserId, callerId, userMessage, conversationHistory = [], language = 'as' }) {
    if (!userMessage || typeof userMessage !== 'string') {
      throw new Error('userMessage is required');
    }

    if (callerId !== elderlyUserId) {
      const isAuth = await relationshipService.hasActiveRelationship(callerId, elderlyUserId);
      if (!isAuth) throw new Error('Unauthorized: You cannot access conversation for this senior.');
    }

    const [user, profile, family, routines, memories] = await Promise.all([
      userService.getUserById(elderlyUserId).catch(() => null),
      profileService.getProfile(elderlyUserId).catch(() => null),
      familyService.getFamilyForElderly(elderlyUserId).catch(() => []),
      routineService.getRoutineForElderly(elderlyUserId).catch(() => []),
      mediaService.getMemoriesForElderly(elderlyUserId, callerId).catch(() => [])
    ]);

    const seniorName = resolveSeniorStyledName(user, profile);
    const lang = language || profile?.preferredLanguage || 'as';

    const systemInstruction = buildGeminiSystemInstruction({
      seniorName,
      user,
      profile,
      family,
      routines,
      memories,
      language: lang
    });

    const contents = formatConversationContents(conversationHistory, userMessage);

    // Call real Gemini AI
    const geminiRes = await callGeminiConversation({
      systemInstruction,
      contents
    });

    return {
      success: true,
      replyText: geminiRes.replyText,
      suggestedReplies: geminiRes.suggestedReplies,
      language: lang,
      seniorName,
      modelUsed: geminiRes.modelUsed
    };
  }
};
