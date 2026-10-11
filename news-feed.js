import { onValue, ref } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
import { database } from './firebase-client.js';
import { isPubliclySafePost, storyUrl } from './news-content.js?v=20261011-admin-approve3';
import { clearStoryReads, rankStories } from './news-recommendations.js?v=20261012-recommendations1';

const feed = document.getElementById('liveNewsList');
const status = document.getElementById('liveNewsStatus');
const ticker = document.querySelector('.breaking-track');
const postLimit = Number.parseInt(feed.dataset.limit, 10);
const publishedStoryCount = document.getElementById('publishedStoryCount');
const newsTopicCount = document.getElementById('newsTopicCount');
const latestNewsDate = document.getElementById('latestNewsDate');
const recommendationToggle = document.getElementById('recommendationToggle');
const recommendationReset = document.getElementById('recommendationReset');
let latestSnapshot;
let recommendationsEnabled = false;
const updateNewsStats = (posts) => {
  if (!publishedStoryCount || !newsTopicCount || !latestNewsDate) return;

  const topics = new Set(
    posts
      .map(([, post]) => post.category)
      .filter((category) => typeof category === 'string' && category.trim())
      .map((category) => category.trim().toLocaleLowerCase()),
  );

  publishedStoryCount.textContent = posts.length.toLocaleString();
  newsTopicCount.textContent = topics.size.toLocaleString();
  latestNewsDate.textContent = posts.length
    ? new Date(posts[0][1].createdAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
    : 'None yet';
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

const buildPostCard = ([id, originalPost]) => {
  const post = originalPost;
  const article = document.createElement('article');
  article.className = 'news-summary-card';

  const imageUrl = safeImageUrl(post.imageUrl);
  if (imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = typeof post.title === 'string' ? post.title : '';
    image.loading = 'lazy';
    image.className = 'lightbox-image';
    article.append(image);
  } else {
    article.classList.add('text-only');
  }

  const body = document.createElement('div');
  body.className = 'news-summary-body';

  const category = document.createElement('span');
  category.className = 'tag';
  category.textContent = typeof post.category === 'string' ? post.category : '';

  const title = document.createElement('h2');
  title.textContent = typeof post.title === 'string' ? post.title : '';

  const summary = document.createElement('p');
  summary.textContent = typeof post.summary === 'string' ? post.summary : '';

  const meta = document.createElement('div');
  meta.className = 'meta-row';
  const author = document.createElement('span');
  author.className = 'author';
  author.textContent = 'By Admin';
  const date = document.createElement('time');
  date.dateTime = new Date(post.createdAt).toISOString();
  date.textContent = new Date(post.createdAt).toLocaleDateString();

  const link = document.createElement('a');
  link.href = storyUrl(id);
  link.textContent = 'Read story';

  meta.append(author, date, link);
  body.append(category, title, summary, meta);
  article.append(body);
  return article;
};

const buildReviewNotice = (post) => {
  const article = document.createElement('article');
  article.className = 'news-summary-card text-only';

  const body = document.createElement('div');
  body.className = 'news-summary-body';

  const category = document.createElement('span');
  category.className = 'tag';
  category.textContent = 'Safety review';

  const title = document.createElement('h2');
  title.textContent = 'Latest story pending review';

  const summary = document.createElement('p');
  summary.textContent = 'A newly submitted story is being reviewed before it can appear publicly.';

  const meta = document.createElement('div');
  meta.className = 'meta-row';
  const author = document.createElement('span');
  author.className = 'author';
  author.textContent = 'By Admin';
  const date = document.createElement('time');
  date.dateTime = new Date(post.createdAt).toISOString();
  date.textContent = new Date(post.createdAt).toLocaleDateString();

  meta.append(author, date);
  body.append(category, title, summary, meta);
  article.append(body);
  return article;
};

const updateNewsFeed = (snapshot) => {
  latestSnapshot = snapshot;
  const publishedPosts = [];
  const posts = [];
  let withheldPosts = 0;
  snapshot.forEach((child) => {
    const post = child.val();
    if (
      post &&
      post.published === true &&
      Number.isFinite(post.createdAt)
    ) {
      publishedPosts.push([child.key, post]);
      if (isPubliclySafePost(post)) {
        posts.push([child.key, post]);
      } else {
        withheldPosts += 1;
      }
    }
  });
  publishedPosts.sort((first, second) => second[1].createdAt - first[1].createdAt);
  posts.sort((first, second) => second[1].createdAt - first[1].createdAt);
  updateNewsStats(posts);
  const latestPostIsWithheld = publishedPosts.length > 0 &&
    !isPubliclySafePost(publishedPosts[0][1]);

  const newsListSchema = document.getElementById('newsListSchema');
  if (newsListSchema) {
    const siteUrl = 'http://jundalnabi.duckdns.org/';
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: posts.map(([id, post], index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${siteUrl}${storyUrl(id)}`,
        name: post.title
      }))
    };
    newsListSchema.textContent = JSON.stringify(schema).replace(/</g, '\\u003c');
  }

  let orderedPosts = posts;
  let recommendationError = false;
  if (recommendationsEnabled) {
    try {
      orderedPosts = rankStories(posts);
    } catch (error) {
      console.error('Local news recommendations could not be calculated.', error);
      recommendationError = true;
    }
  }
  const visiblePosts = Number.isInteger(postLimit) && postLimit > 0
    ? orderedPosts.slice(0, Math.max(0, postLimit - Number(latestPostIsWithheld)))
    : orderedPosts;

  const cards = visiblePosts.map(([id, post]) => buildPostCard([id, post]));
  if (latestPostIsWithheld) cards.unshift(buildReviewNotice(publishedPosts[0][1]));
  feed.replaceChildren(...cards);

  if (ticker) {
    const group = document.createElement('div');
    group.className = 'breaking-group';

    visiblePosts.forEach(([id, post]) => {
      const headline = document.createElement('span');
      const link = document.createElement('a');
      link.href = storyUrl(id);
      link.textContent = typeof post.title === 'string' ? post.title : '';
      headline.append(link);
      group.append(headline);
    });

    if (group.childElementCount) {
      const duplicateGroup = group.cloneNode(true);
      duplicateGroup.setAttribute('aria-hidden', 'true');
      ticker.replaceChildren(group, duplicateGroup);
      ticker.style.setProperty(
        '--ticker-duration',
        `${Math.max(18, Math.min(60, group.textContent.length * 0.22))}s`,
      );
    } else {
      ticker.replaceChildren();
    }
    ticker.classList.toggle('has-headlines', group.childElementCount > 0);
  }
  const visibleStatus = visiblePosts.length
    ? recommendationsEnabled && !recommendationError
      ? `Showing ${visiblePosts.length} recommended ${visiblePosts.length === 1 ? 'story' : 'stories'}`
      : `Showing the ${visiblePosts.length} latest ${visiblePosts.length === 1 ? 'story' : 'stories'}`
    : 'No published stories are available.';
  const withheldStatus = latestPostIsWithheld
    ? 'The latest submission is pending Admin safety review.'
    : '';
  const olderWithheldCount = withheldPosts - Number(latestPostIsWithheld);
  const olderWithheldStatus = olderWithheldCount > 0
    ? `${olderWithheldCount} older ${olderWithheldCount === 1 ? 'post is' : 'posts are'} also hidden pending review.`
    : '';
  const recommendationStatus = recommendationsEnabled
    ? recommendationError
      ? 'Local recommendations are unavailable; showing the latest stories instead.'
      : 'Ranked using this browser’s topic reading history. Reading history stays on this device.'
    : '';
  status.textContent = [visibleStatus, withheldStatus, olderWithheldStatus, recommendationStatus]
    .filter(Boolean)
    .join(' ');
  status.classList.toggle('is-error', recommendationError);
};

const showNewsFeedError = (error) => {
  console.error('Latest news could not be loaded from Firebase.', error);
  status.textContent = 'News could not be loaded from Firebase. Please try again later.';
  status.classList.add('is-error');
};

try {
  recommendationToggle?.addEventListener('click', () => {
    recommendationsEnabled = !recommendationsEnabled;
    recommendationToggle.textContent = recommendationsEnabled
      ? 'Show latest first'
      : 'Get recommendations';
    recommendationToggle.setAttribute('aria-pressed', String(recommendationsEnabled));
    if (latestSnapshot) updateNewsFeed(latestSnapshot);
  });
  recommendationReset?.addEventListener('click', () => {
    try {
      clearStoryReads();
      if (latestSnapshot) updateNewsFeed(latestSnapshot);
      status.textContent = 'Local recommendation history cleared.';
    } catch (error) {
      console.error('Local news reading history could not be cleared.', error);
      status.textContent = 'Local recommendation history could not be cleared.';
      status.classList.add('is-error');
    }
  });
  onValue(ref(database, 'newsPosts'), updateNewsFeed, showNewsFeedError, { onlyOnce: false });
} catch (error) {
  showNewsFeedError(error);
}
