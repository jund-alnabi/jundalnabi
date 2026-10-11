import { firebaseConfig } from './firebase-config.js';
import { isPubliclySafePost } from './news-content.js?v=20261011-admin-approve3';
import { recordStoryRead } from './news-recommendations.js?v=20261012-recommendations1';

const siteUrl = 'https://jundalnabi.duckdns.org/';
const content = document.getElementById('publishedStory');
const status = document.getElementById('storyStatus');
const image = document.getElementById('storyImage');
const source = document.getElementById('storySource');
const publisherId = `${siteUrl}#organization`;
const isPreview = new URLSearchParams(window.location.search).get('preview') === '1';

const loadStory = async (id) => {
  try {
    const databaseUrl = new URL(
      `newsPosts/${encodeURIComponent(id)}.json`,
      `${firebaseConfig.databaseURL.replace(/\/+$/, '')}/`,
    );
    const controller = new AbortController();
    const restTimeoutId = window.setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(databaseUrl, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Firebase REST endpoint returned HTTP ${response.status}.`);
      }
      const post = await response.json();
      if (post && typeof post === 'object' && typeof post.error === 'string') {
        throw new Error(`Firebase REST endpoint returned an error: ${post.error}`);
      }
      return post;
    } finally {
      window.clearTimeout(restTimeoutId);
    }
  } catch (restError) {
    console.error('Firebase REST story read failed; trying the Firebase SDK.', restError);
    let sdkTimeoutId;
    try {
      const [{ database }, { get, ref }] = await Promise.all([
        import('./firebase-client.js'),
        import('https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js'),
      ]);
      const timeout = new Promise((resolve, reject) => {
        sdkTimeoutId = window.setTimeout(
          () => reject(new Error('Firebase SDK read timed out.')),
          10000,
        );
      });
      const snapshot = await Promise.race([
        get(ref(database, `newsPosts/${id}`)),
        timeout,
      ]);
      return snapshot.val();
    } catch (sdkError) {
      console.error('Firebase SDK story fallback failed.', sdkError);
      throw new Error('The story could not be retrieved from Firebase by either client.');
    } finally {
      window.clearTimeout(sdkTimeoutId);
    }
  }
};

const getCurrentUser = async () => {
  const [{ auth }, { onAuthStateChanged }] = await Promise.all([
    import('./firebase-client.js'),
    import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
  ]);

  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    }, reject);
  });
};

const setMetaContent = (selector, contentValue) => {
  const meta = document.querySelector(selector);
  if (meta) meta.content = contentValue;
};

const setStorySeo = (post, postId, imageUrl) => {
  const title = `${post.title} | Jundal Nabi`;
  const storyUrl = `${siteUrl}news-story.html?id=${encodeURIComponent(postId)}`;
  const description = String(post.summary || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const shareImage = imageUrl || `${siteUrl}assets/og-image.svg`;

  document.title = title;
  document.querySelector('link[rel="canonical"]').href = storyUrl;
  setMetaContent('meta[name="description"]', description);
  setMetaContent('meta[property="og:title"]', title);
  setMetaContent('meta[property="og:description"]', description);
  setMetaContent('meta[property="og:url"]', storyUrl);
  setMetaContent('meta[property="og:image"]', shareImage);
  setMetaContent('meta[name="twitter:title"]', title);
  setMetaContent('meta[name="twitter:description"]', description);
  setMetaContent('meta[name="twitter:image"]', shareImage);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    '@id': `${storyUrl}#article`,
    headline: post.title,
    description,
    articleBody: post.content,
    articleSection: post.category,
    inLanguage: 'en',
    isAccessibleForFree: true,
    datePublished: new Date(post.createdAt).toISOString(),
    dateModified: new Date(
      Number.isFinite(post.updatedAt) ? post.updatedAt : post.createdAt,
    ).toISOString(),
    mainEntityOfPage: { '@type': 'WebPage', '@id': storyUrl },
    author: { '@type': 'Organization', name: 'Admin' },
    publisher: {
      '@type': 'Organization',
      '@id': publisherId,
      name: 'JundAlNabi News',
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}assets/favicon.svg`
      }
    },
    copyrightHolder: { '@id': publisherId }
  };
  if (imageUrl) schema.image = imageUrl;
  const sourceUrl = safeImageUrl(post.sourceUrl);
  if (sourceUrl) schema.citation = sourceUrl;
  document.getElementById('storySchema').textContent = JSON.stringify(schema).replace(/</g, '\\u003c');
};

const safeImageUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return '';

  try {
    const url = new URL(value, document.baseURI);
    const isRelative = !/^[a-z][a-z\d+.-]*:/i.test(value);
    const isLocalRelative = isRelative &&
      url.origin === window.location.origin &&
      ['file:', 'http:', 'https:'].includes(url.protocol);
    return url.protocol === 'https:' || isLocalRelative ? url.href : '';
  } catch {
    return '';
  }
};

const showUnavailable = (message, canRetry = false) => {
  status.textContent = message;
  status.classList.add('is-error');
  content.hidden = true;
  document.documentElement.dataset.storyResolved = 'true';
  if (canRetry) {
    const retryButton = document.createElement('button');
    retryButton.className = 'btn btn-secondary';
    retryButton.type = 'button';
    retryButton.textContent = 'Retry';
    retryButton.addEventListener('click', () => window.location.reload());
    status.append(' ', retryButton);
  }
};

const queryPostId = new URLSearchParams(window.location.search).get('id');
const hashPostId = window.location.hash.slice(1);
let postId = queryPostId;
let invalidStoryHash = false;
if (!postId && hashPostId) {
  try {
    postId = decodeURIComponent(hashPostId);
  } catch {
    invalidStoryHash = true;
  }
}

if (!postId) {
  showUnavailable(invalidStoryHash
    ? 'This story link is invalid.'
    : 'This story link is missing an ID.');
} else {
  try {
    const user = isPreview ? await getCurrentUser() : null;
    if (isPreview && !user) {
      showUnavailable('Sign in to the admin account that published this story to preview it.');
    } else {
      const storedPost = await loadStory(postId);

      if (
        !storedPost ||
        storedPost.published !== true ||
        !Number.isFinite(storedPost.createdAt) ||
        storedPost.createdAt <= 0 ||
        typeof storedPost.title !== 'string' ||
        typeof storedPost.category !== 'string' ||
        typeof storedPost.summary !== 'string' ||
        typeof storedPost.content !== 'string' ||
        (!isPubliclySafePost(storedPost) && (!isPreview || storedPost.authorUid !== user.uid))
      ) {
        showUnavailable('This story was not found or is no longer available.');
      } else {
        const post = storedPost;
        const isPublic = isPubliclySafePost(post);
        if (isPublic) {
          try {
            recordStoryRead(post.category, postId);
          } catch (error) {
            console.error('Local news reading history could not be saved.', error);
          }
        }
        document.getElementById('storyCategory').textContent = post.category;
        document.getElementById('storyTitle').textContent = post.title;
        document.getElementById('storyDate').dateTime = new Date(post.createdAt).toISOString();
        document.getElementById('storyDate').textContent = new Date(post.createdAt).toLocaleDateString();
        document.getElementById('storySummary').textContent = post.summary;
        document.getElementById('storyBody').textContent = post.content;

        const imageUrl = safeImageUrl(post.imageUrl);
        const sourceUrl = safeImageUrl(post.sourceUrl);
        if (sourceUrl) {
          const sourceLink = document.createElement('a');
          sourceLink.href = sourceUrl;
          sourceLink.rel = 'noopener noreferrer';
          sourceLink.target = '_blank';
          sourceLink.textContent = 'View original source';
          source.replaceChildren(document.createTextNode('Source: '), sourceLink);
          source.hidden = false;
        }
        if (isPublic) setStorySeo(post, postId, imageUrl);
        if (imageUrl) {
          image.src = imageUrl;
          image.alt = post.title;
          image.hidden = false;
        }

        content.hidden = false;
        document.documentElement.dataset.storyResolved = 'true';
        status.textContent = isPreview && !isPublic
          ? 'Admin preview only — this story is hidden from public news pages pending safety review.'
          : '';
      }
    }
  } catch (error) {
    console.error('News story could not be loaded.', error);
    showUnavailable('This story could not be loaded. Check your connection and try again.', true);
  }
}
