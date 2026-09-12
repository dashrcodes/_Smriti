/**
 * SMRITI PREVIEW & AGGREGATION SERVICE
 * Aggregates personalized profile, family dataset, media vault, routines, and reminders
 * to power both the Caretaker "Preview Elderly Experience" and Senior Space.
 */

import { profileService } from './profile-service.js';
import { familyService } from './family-service.js';
import { mediaService } from './media-service.js';
import { routineService } from './routine-service.js';
import { reminderService } from './reminder-service.js';
import { userService } from './user-service.js';
import { logger } from '../utils/logger.js';

export const previewService = {
  /**
   * Aggregates the full personalized senior space experience
   */
  async getElderlyExperience(elderlyUserId, callerId) {
    if (!elderlyUserId) throw new Error('elderlyUserId is required');

    // 1. Fetch user entity and profile
    const user = await userService.getUserById(elderlyUserId);

    // 2. Fetch personalized sub-datasets in parallel
    const [profile, family, memories, routines, reminders] = await Promise.all([
      profileService.getProfile(elderlyUserId),
      familyService.getFamilyForElderly(elderlyUserId),
      mediaService.getMemoriesForElderly(elderlyUserId, callerId || elderlyUserId),
      routineService.getRoutineForElderly(elderlyUserId),
      reminderService.getRemindersForElderly(elderlyUserId)
    ]);

    // 3. Resolve authentic real name (avoiding generic placeholders)
    let realName = '';
    if (profile?.displayName && profile.displayName !== 'Elderly User' && profile.displayName !== 'Smriti User') {
      realName = profile.displayName.trim();
    } else if (user?.name && user.name !== 'Smriti User' && user.name !== 'Elderly User') {
      realName = user.name.trim();
    } else if (user?.email) {
      const emailPrefix = user.email.split('@')[0];
      realName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
    } else {
      realName = 'Senior';
    }

    // 4. Resolve Gender & Title (male -> [Name] Baba, female -> [Name] Maa, else explicit title or neutral)
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

    // 5. Categorize media
    const photos = memories.filter(m => m.type === 'photo');
    const videos = memories.filter(m => m.type === 'video');
    const audios = memories.filter(m => m.type === 'audio');

    // 6. Build personalized dynamic time-of-day greeting (Good morning, Good afternoon, Good evening)
    const hour = new Date().getHours();
    let timeGreeting = 'Good morning';
    if (hour >= 12 && hour < 17) timeGreeting = 'Good afternoon';
    else if (hour >= 17 || hour < 5) timeGreeting = 'Good evening';

    return {
      elderlyUserId,
      displayName: styledName,
      greeting: `${timeGreeting}, ${styledName} ❤️`,
      profile,
      family,
      memories: {
        total: memories.length,
        photos,
        videos,
        audios
      },
      routines,
      reminders,
      accessibility: profile.accessibility || {
        largeText: true,
        highContrast: false,
        voiceGuidance: true,
        simplifiedLayout: true
      },
      cognitivePreferences: profile.cognitivePreferences || {
        categories: ['family_recognition', 'photo_recall', 'daily_routine_recall'],
        difficultyLevel: 'mild'
      }
    };
  }
};
