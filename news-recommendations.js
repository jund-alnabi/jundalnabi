const preferenceKey = 'jundal-news-topic-preferences-v2';
const halfLifeMs = 7 * 24 * 60 * 60 * 1000;
const maximumCandidates = 500;
const maximumAuthority = 2;
const maximumCategoryReads = 100;

const readPreferences = () => {
  const stored = window.localStorage.getItem(preferenceKey);
  if (!stored) return { categoryReads: Object.create(null), storyReads: Object.create(null) };

  const preferences = JSON.parse(stored);
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    throw new Error('Stored news preferences have an invalid format.');
  }
  const normalizeCounts = (counts) => {
    if (!counts || typeof counts !== 'object' || Array.isArray(counts)) {
      throw new Error('Stored news preferences have an invalid format.');
    }
    const normalized = Object.create(null);
    Object.entries(counts).forEach(([key, count]) => {
      if (!Number.isInteger(count) || count < 0) {
        throw new Error('Stored news preference has an invalid read count.');
      }
      normalized[key] = count;
    });
    return normalized;
  };

  return {
    categoryReads: normalizeCounts(preferences.categoryReads),
    storyReads: normalizeCounts(preferences.storyReads),
  };
};

export const recordStoryRead = (category, storyId) => {
  if (typeof category !== 'string' || !category.trim() || typeof storyId !== 'string' || !storyId) return;

  const normalizedCategory = category.trim().toLocaleLowerCase();
  const preferences = readPreferences();
  preferences.categoryReads[normalizedCategory] = Math.min(
    (preferences.categoryReads[normalizedCategory] || 0) + 1,
    maximumCategoryReads,
  );
  preferences.storyReads[storyId] = Math.min(
    (preferences.storyReads[storyId] || 0) + 1,
    maximumCategoryReads,
  );
  window.localStorage.setItem(preferenceKey, JSON.stringify(preferences));
};

export const clearStoryReads = () => {
  window.localStorage.removeItem(preferenceKey);
};

const tokenize = (post) => new Set(
  `${post.title || ''} ${post.summary || ''}`
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]{3,}/gu) || [],
);

const isNearDuplicate = (firstTokens, secondTokens) => {
  if (!firstTokens.size || !secondTokens.size) return false;

  let intersection = 0;
  firstTokens.forEach((token) => {
    if (secondTokens.has(token)) intersection += 1;
  });

  return intersection / (firstTokens.size + secondTokens.size - intersection) >= 0.8;
};

const getScore = (id, post, categoryReads, storyReads, totalReads, now) => {
  const category = typeof post.category === 'string' ? post.category.trim().toLocaleLowerCase() : '';
  const reads = categoryReads[category] || 0;
  const relevance = totalReads
    ? 1 + Math.log1p(reads) / Math.log1p(totalReads)
    : 1;
  const ageMs = Math.max(0, now - post.createdAt);
  const recency = Math.pow(0.5, ageMs / halfLifeMs);
  const sourceAuthority = Number.isFinite(post.sourceAuthority)
    ? Math.max(0.5, Math.min(maximumAuthority, post.sourceAuthority))
    : 1;
  const predictedEngagement = 1 + Math.min(0.5, Math.log1p(storyReads[id] || 0) * 0.15);

  return relevance * recency * sourceAuthority * predictedEngagement;
};

export const rankStories = (stories, now = Date.now()) => {
  const preferences = readPreferences();
  const categoryReads = preferences.categoryReads;
  const storyReads = preferences.storyReads;
  const totalReads = Object.values(categoryReads).reduce((total, count) => total + count, 0);

  const candidates = stories
    .slice(0, maximumCandidates)
    .map(([id, post], index) => ({
      story: [id, post],
      index,
      score: getScore(id, post, categoryReads, storyReads, totalReads, now),
      category: typeof post.category === 'string' ? post.category.trim().toLocaleLowerCase() : '',
      tokens: tokenize(post),
    }))
    .sort((first, second) => second.score - first.score || first.index - second.index);
  const ranked = [];
  const rankedTokens = [];
  let previousCategory = '';
  let categoryRun = 0;

  while (candidates.length) {
    let candidateIndex = candidates.findIndex(({ tokens }) =>
      !rankedTokens.some((selectedTokens) => isNearDuplicate(selectedTokens, tokens)),
    );
    if (candidateIndex < 0) break;

    if (categoryRun >= 2) {
      const diverseCandidateIndex = candidates.findIndex(({ category, tokens }) =>
        category !== previousCategory &&
        !rankedTokens.some((selectedTokens) => isNearDuplicate(selectedTokens, tokens)),
      );
      if (diverseCandidateIndex >= 0) candidateIndex = diverseCandidateIndex;
    }

    const [candidate] = candidates.splice(candidateIndex, 1);
    ranked.push(candidate.story);
    rankedTokens.push(candidate.tokens);
    if (candidate.category === previousCategory) {
      categoryRun += 1;
    } else {
      previousCategory = candidate.category;
      categoryRun = 1;
    }
  }

  return ranked;
};
