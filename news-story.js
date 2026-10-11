import { get, ref } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
import { database } from './firebase-client.js';
import { isPubliclySafePost } from './news-content.js?v=20261011-authorship1';

const siteUrl = 'http://jundalnabi.duckdns.org/';
const content = document.getElementById('publishedStory');
const status = document.getElementById('storyStatus');
const image = document.getElementById('storyImage');
const source = document.getElementById('storySource');
const publisherId = `${siteUrl}#organization`;

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

const showUnavailable = (message) => {
  status.textContent = message;
  status.classList.add('is-error');
  content.hidden = true;
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
    const snapshot = await get(ref(database, `newsPosts/${postId}`));
    const storedPost = snapshot.val();

    if (
      !storedPost ||
      storedPost.published !== true ||
      !Number.isFinite(storedPost.createdAt) ||
      !isPubliclySafePost(storedPost)
    ) {
      showUnavailable('This story was not found or is no longer available.');
    } else {
      const post = storedPost;
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
      setStorySeo(post, postId, imageUrl);
      if (imageUrl) {
        image.src = imageUrl;
        image.alt = post.title;
        image.hidden = false;
      }

      content.hidden = false;
      status.textContent = '';
    }
  } catch (error) {
    console.error('News story could not be loaded.', error);
    showUnavailable('This story could not be loaded. Please try again later.');
  }
}
