/**
 * SMRITI VOICE ASSISTANCE SERVICE
 * Accessible multilingual speech synthesis (TTS) with natural elderly pacing,
 * plus Web Speech Recognition (STT) for interactive conversational reminiscence.
 */

const LANG_VOICE_MAP = {
  as: 'as-IN', // Assamese (often falls back to Bengali or Indian English voices gracefully)
  bn: 'bn-IN', // Bengali
  hi: 'hi-IN', // Hindi
  en: 'en-IN'  // Indian English
};

class VoiceService {
  constructor() {
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.voices = [];
    this.isSupported = Boolean(this.synth);
    this.isSpeaking = false;
    this.isListening = false;

    // Speech Recognition setup
    const SpeechRec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    this.isRecognitionSupported = Boolean(SpeechRec);
    this.recognition = SpeechRec ? new SpeechRec() : null;

    if (this.synth) {
      this.loadVoices();
      if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  get isSpeechRecognitionSupported() {
    return this.isRecognitionSupported;
  }

  loadVoices() {
    if (!this.synth) return;
    this.voices = this.synth.getVoices();
  }

  /**
   * Find the highest quality natural voice for a given language
   */
  getBestVoice(langCode = 'en') {
    if (!this.voices || this.voices.length === 0) return null;
    const targetLocale = LANG_VOICE_MAP[langCode] || 'en-IN';
    const langPrefix = targetLocale.split('-')[0];

    // Priority 1: Exact language match with "Google" or "Natural" in name
    const premiumMatch = this.voices.find(v => (v.lang === targetLocale || v.lang.startsWith(langPrefix)) && /google|natural|online|premium|neural/i.test(v.name));
    if (premiumMatch) return premiumMatch;

    // Priority 2: Exact locale match
    const exactMatch = this.voices.find(v => v.lang === targetLocale);
    if (exactMatch) return exactMatch;

    // Priority 3: Prefix match (e.g. 'hi' for 'hi-IN')
    const prefixMatch = this.voices.find(v => v.lang.startsWith(langPrefix));
    if (prefixMatch) return prefixMatch;

    // Priority 4: For Assamese (as), if no native Assamese voice exists, Bengali (bn-IN) or Indian English provides natural phonetic harmony
    if (langCode === 'as') {
      const bnMatch = this.voices.find(v => v.lang.startsWith('bn'));
      if (bnMatch) return bnMatch;
    }

    // Default to Indian English / English voice
    return this.voices.find(v => v.lang.startsWith('en')) || this.voices[0] || null;
  }

  /**
   * Speaks text aloud in the requested language with calm, natural elderly pacing
   * @param {string} text 
   * @param {string} langCode - 'as' | 'bn' | 'hi' | 'en'
   * @param {Object} options - rate, pitch, onEnd
   */
  speak(text, langCode = 'as', options = {}) {
    if (!this.isSupported || !text) {
      if (options.onEnd) options.onEnd();
      return;
    }

    try {
      this.stop(); // Cancel any ongoing speech

      const utterance = new SpeechSynthesisUtterance(text);
      const targetLocale = LANG_VOICE_MAP[langCode] || 'en-IN';
      utterance.lang = targetLocale;

      // Elderly-friendly cadence: slower rate, calm pitch
      utterance.rate = options.rate || 0.85;
      utterance.pitch = options.pitch || 1.0;
      utterance.volume = options.volume || 1.0;

      const bestVoice = this.getBestVoice(langCode);
      if (bestVoice) {
        utterance.voice = bestVoice;
      }

      utterance.onstart = () => {
        this.isSpeaking = true;
        if (options.onStart) options.onStart();
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        if (options.onEnd) options.onEnd();
      };

      utterance.onerror = (e) => {
        this.isSpeaking = false;
        if (options.onEnd) options.onEnd();
      };

      this.synth.speak(utterance);
    } catch (e) {
      console.warn('[VoiceService] Speak failed:', e);
      if (options.onEnd) options.onEnd();
    }
  }

  /**
   * Starts speech recognition to listen to the senior talking
   * @param {Object} config - { langCode, onTranscript, onInterim, onError, onEnd }
   */
  startListening(config = {}) {
    if (!this.isRecognitionSupported) {
      if (config.onError) config.onError(new Error('Speech recognition is not supported in this browser.'));
      return;
    }

    try {
      this.stopListening();
      this.stop(); // Stop speaking while listening

      const targetLocale = LANG_VOICE_MAP[config.langCode || 'as'] || 'en-IN';
      this.recognition.lang = targetLocale;
      this.recognition.continuous = false; // Capture discrete sentence turns
      this.recognition.interimResults = true;

      this.recognition.onstart = () => {
        this.isListening = true;
        if (config.onStart) config.onStart();
      };

      this.recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (interimTranscript && config.onInterim) {
          config.onInterim(interimTranscript);
        }

        if (finalTranscript && config.onTranscript) {
          config.onTranscript(finalTranscript.trim());
        }
      };

      this.recognition.onerror = (event) => {
        this.isListening = false;
        if (config.onError) config.onError(event);
      };

      this.recognition.onend = () => {
        this.isListening = false;
        if (config.onEnd) config.onEnd();
      };

      this.recognition.start();
    } catch (err) {
      this.isListening = false;
      if (config.onError) config.onError(err);
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.isListening = false;
    }
  }

  stop() {
    if (this.synth && this.synth.speaking) {
      this.synth.cancel();
      this.isSpeaking = false;
    }
  }
}

export const voiceService = new VoiceService();
if (typeof window !== 'undefined') {
  window.VoiceService = voiceService;
}
