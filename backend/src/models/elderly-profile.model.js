/**
 * SMRITI ELDERLY PROFILE MODEL
 * Personalization dataset for elderly dementia patients in NER.
 * Stores personal details, cultural background, language, accessibility toggles, and cognitive preferences.
 */

export function createElderlyProfileModel(data = {}) {
  return {
    elderlyUserId: data.elderlyUserId || '',
    displayName: data.displayName || data.name || '',
    gender: data.gender || '', // 'male' | 'female' | ''
    title: data.title || '',   // 'Baba' | 'Maa' | ''
    preferredLanguage: data.preferredLanguage || 'as', // 'as' | 'bn' | 'hi' | 'en'
    region: data.region || 'NER',
    stateOrDistrict: data.stateOrDistrict || 'Assam',
    culturalPreferences: Array.isArray(data.culturalPreferences) ? data.culturalPreferences : [
      'Bihu Festival',
      'Assamese Folk Music',
      'Brahmaputra Tea Gardens'
    ],
    interests: Array.isArray(data.interests) ? data.interests : [
      'Gardening',
      'Old Melodies',
      'Morning Walks'
    ],
    hobbies: Array.isArray(data.hobbies) ? data.hobbies : [
      'Listening to radio',
      'Watching birds',
      'Family storytelling'
    ],
    favoriteTopics: Array.isArray(data.favoriteTopics) ? data.favoriteTopics : [
      'Childhood in Guwahati',
      'Traditional cooking',
      'Village memories'
    ],
    familiarPlaces: Array.isArray(data.familiarPlaces) ? data.familiarPlaces : [
      'Guwahati Brahmaputra Ghat',
      'Kamakhya Hill',
      'Majuli Island',
      'Shillong Viewpoint'
    ],
    importantDates: Array.isArray(data.importantDates) ? data.importantDates : [],
    personalNotes: data.personalNotes || '',
    accessibility: {
      largeText: data.accessibility?.largeText ?? true,
      highContrast: data.accessibility?.highContrast ?? false,
      voiceGuidance: data.accessibility?.voiceGuidance ?? true,
      slowTiming: data.accessibility?.slowTiming ?? true,
      simplifiedLayout: data.accessibility?.simplifiedLayout ?? true,
      preferredInput: data.accessibility?.preferredInput || 'touch' // 'touch' | 'voice'
    },
    cognitivePreferences: {
      categories: data.cognitivePreferences?.categories || [
        'family_recognition',
        'photo_recall',
        'daily_routine_recall',
        'music_recall',
        'pattern_matching'
      ],
      difficultyLevel: data.cognitivePreferences?.difficultyLevel || 'mild', // 'mild' | 'moderate' | 'advanced'
      sessionLengthMinutes: data.cognitivePreferences?.sessionLengthMinutes || 10,
      questionsPerSession: data.cognitivePreferences?.questionsPerSession || 5,
      emotionalPromptsEnabled: data.cognitivePreferences?.emotionalPromptsEnabled ?? true
    },
    abha: {
      status: data.abha?.status || 'unlinked', // 'unlinked' | 'linked'
      abhaAddress: data.abha?.abhaAddress || '', // e.g. 'sruti.sharma@abdm'
      abhaNumber: data.abha?.abhaNumber || '',   // e.g. '91-1234-5678-9012'
      linkedAt: data.abha?.linkedAt || null,
      verificationMethod: data.abha?.verificationMethod || 'demo_otp'
    },
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString()
  };
}
