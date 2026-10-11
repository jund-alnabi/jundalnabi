import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const databaseUrl = 'https://jundalnabi-9b088-default-rtdb.firebaseio.com/newsPosts.json';
const siteUrl = 'http://jundalnabi.duckdns.org/';
const root = fileURLToPath(new URL('../', import.meta.url));
const generatedDirectory = path.join(root, 'generated-news');
const unsafeImageMarkers = ['qM60kpxw', 'HTw8Lj0XoAAKXKF'];

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const escapeJsonLd = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const isPubliclySafePost = (post) => {
  const text = [post.title, post.summary, post.content]
    .filter((value) => typeof value === 'string')
    .join('\n');
  const imageUrl = typeof post.imageUrl === 'string' ? post.imageUrl : '';

  if (unsafeImageMarkers.some((marker) => imageUrl.includes(marker))) return false;
  if (/\b(selling|for sale|buyers?|price\s*:|samples?\s+available|social engineering|spear phishing|sim swapping)\b/i.test(text)) {
    return false;
  }

  return !(
    /\b(passwords?|credentials?|email addresses?)\b/i.test(text) &&
    /\b(download|downloadable|sample|dataset|data set|records?|https?:\/\/|links?)\b/i.test(text)
  );
};

const publicUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
};

const assertMarker = (template, name) => {
  const start = `<!-- GENERATED_${name}_START -->`;
  const end = `<!-- GENERATED_${name}_END -->`;
  if (!template.includes(start) || !template.includes(end)) {
    throw new Error(`Missing generated-content markers for ${name}.`);
  }
};

const replaceMarkedContent = (template, name, content) => {
  assertMarker(template, name);
  const start = `<!-- GENERATED_${name}_START -->`;
  const end = `<!-- GENERATED_${name}_END -->`;
  const startAt = template.indexOf(start) + start.length;
  const endAt = template.indexOf(end, startAt);
  if (endAt < startAt) throw new Error(`Invalid generated-content marker order for ${name}.`);
  return `${template.slice(0, startAt)}${content}${template.slice(endAt)}`;
};

const storyPageUrl = (id) => new URL(`generated-news/${encodeURIComponent(id)}.html`, siteUrl).href;
const renderCard = ([id, post], index, itemListElements) => {
  const title = escapeHtml(post.title);
  const category = escapeHtml(post.category);
  const summary = escapeHtml(post.summary);
  const date = new Date(post.createdAt);
  const imageUrl = publicUrl(post.imageUrl);
  const pageUrl = storyPageUrl(id);

  itemListElements.push({
    '@type': 'ListItem',
    position: index + 1,
    url: pageUrl,
    name: post.title,
  });

  return `            <article class="news-summary-card">
${imageUrl ? `              <img src="${escapeHtml(imageUrl)}" alt="${title}" loading="lazy" />\n` : ''}              <div class="news-summary-body">
                <span class="tag">${category}</span>
                <h2>${title}</h2>
                <p>${summary}</p>
                <div class="meta-row">
                  <span class="author">By Admin</span>
                  <time datetime="${date.toISOString()}">${escapeHtml(date.toLocaleDateString('en-US'))}</time>
                  <a href="${escapeHtml(pageUrl)}">Read story</a>
                </div>
              </div>
            </article>`;
};

const renderStory = ([id, post]) => {
  const title = escapeHtml(post.title);
  const category = escapeHtml(post.category);
  const summary = escapeHtml(post.summary);
  const content = escapeHtml(post.content);
  const createdAt = new Date(post.createdAt);
  const modifiedAt = new Date(Number.isFinite(post.updatedAt) ? post.updatedAt : post.createdAt);
  const pageUrl = storyPageUrl(id);
  const imageUrl = publicUrl(post.imageUrl);
  const sourceUrl = publicUrl(post.sourceUrl);
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    '@id': `${pageUrl}#article`,
    headline: post.title,
    description: post.summary,
    articleBody: post.content,
    articleSection: post.category,
    inLanguage: 'en',
    isAccessibleForFree: true,
    datePublished: createdAt.toISOString(),
    dateModified: modifiedAt.toISOString(),
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
    author: { '@type': 'Organization', name: 'Admin' },
    publisher: {
      '@type': 'Organization',
      '@id': `${siteUrl}#organization`,
      name: 'JundAlNabi News',
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: new URL('assets/favicon.svg', siteUrl).href,
      },
    },
  };
  if (imageUrl) schema.image = imageUrl;
  if (sourceUrl) schema.citation = sourceUrl;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0f172a" />
    <meta name="robots" content="index, follow" />
    <meta name="description" content="${escapeHtml(post.summary)}" />
    <title>${title} | Jundal Nabi</title>
    <link rel="canonical" href="${escapeHtml(pageUrl)}" />
    <link rel="stylesheet" href="../style.css?v=20261011-static-news1" />
    <link rel="icon" type="image/svg+xml" href="../assets/favicon.svg" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${title} | Jundal Nabi" />
    <meta property="og:description" content="${escapeHtml(post.summary)}" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
    <meta property="og:site_name" content="Jundal Nabi" />
${imageUrl ? `    <meta property="og:image" content="${escapeHtml(imageUrl)}" />\n` : ''}    <meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}" />
    <meta name="twitter:title" content="${title} | Jundal Nabi" />
    <meta name="twitter:description" content="${escapeHtml(post.summary)}" />
${imageUrl ? `    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />\n` : ''}    <script type="application/ld+json">${escapeJsonLd(schema)}</script>
  </head>
  <body>
    <header class="site-header">
      <nav class="container nav" aria-label="Main navigation">
        <a class="brand" href="../index.html">Jundal Nabi</a>
        <button class="nav-toggle" type="button" aria-label="Open navigation menu" aria-expanded="false" aria-controls="siteNavLinks">
          <span></span><span></span><span></span>
        </button>
        <div class="nav-links" id="siteNavLinks">
          <a href="../index.html">Home</a>
          <a href="../news.html">News</a>
        </div>
      </nav>
    </header>
    <main class="news-shell">
      <div class="container">
        <div class="news-back"><a href="../news.html">← Back to latest investigations</a></div>
        <article class="article-content published-story">
          <p class="eyebrow">${category}</p>
          <h1>${title}</h1>
          <div class="news-meta">
            <span class="author">By Admin</span>
            <time datetime="${createdAt.toISOString()}">${escapeHtml(createdAt.toLocaleDateString('en-US'))}</time>
            <span>Public investigation</span>
          </div>
${imageUrl ? `          <img class="story-cover" src="${escapeHtml(imageUrl)}" alt="${title}" />\n` : ''}          <p class="published-summary">${summary}</p>
          <div class="published-body">${content}</div>
${sourceUrl ? `          <p class="story-source">Source: <a href="${escapeHtml(sourceUrl)}" rel="noopener noreferrer">${escapeHtml(sourceUrl)}</a></p>\n` : ''}          <p class="editorial-policy-link">Read our <a href="../editorial-standards.html">editorial standards</a>.</p>
        </article>
      </div>
    </main>
    <footer class="site-footer">
      <div class="container footer-inner">
        <p>© ${new Date().getFullYear()} Jundal Nabi. All rights reserved.</p>
        <a href="../editorial-standards.html">Editorial standards</a>
      </div>
    </footer>
  </body>
</html>
`;
};

const response = await fetch(databaseUrl);
if (!response.ok) throw new Error(`Firebase returned HTTP ${response.status} while loading news posts.`);

const rawPosts = await response.json();
if (rawPosts !== null && (typeof rawPosts !== 'object' || Array.isArray(rawPosts))) {
  throw new Error('Firebase newsPosts response was not an object.');
}
if (typeof rawPosts?.error === 'string') throw new Error(`Firebase could not provide news posts: ${rawPosts.error}`);

const now = Date.now();
const posts = Object.entries(rawPosts || {})
  .filter(([id, post]) =>
    /^[A-Za-z0-9_-]+$/.test(id) &&
    post &&
    post.published === true &&
    Number.isFinite(post.createdAt) &&
    post.createdAt > 0 &&
    post.createdAt <= now &&
    typeof post.title === 'string' && post.title.trim() &&
    typeof post.category === 'string' && post.category.trim() &&
    typeof post.summary === 'string' && post.summary.trim() &&
    typeof post.content === 'string' && post.content.trim() &&
    isPubliclySafePost(post),
  )
  .sort((first, second) => second[1].createdAt - first[1].createdAt)
  .slice(0, 1000);

const withholdCount = Object.values(rawPosts || {}).filter((post) =>
  post && post.published === true && !isPubliclySafePost(post),
).length;

const indexPath = path.join(root, 'index.html');
let indexHtml = await readFile(indexPath, 'utf8');
const homeItems = posts.slice(0, 3);
const homeSchemaItems = [];
indexHtml = replaceMarkedContent(indexHtml, 'HOME_CARDS', homeItems
  .map((item, index) => renderCard(item, index, homeSchemaItems)).join('\n'));
indexHtml = replaceMarkedContent(indexHtml, 'HOME_STATUS', homeItems.length
  ? `Showing the ${homeItems.length} latest ${homeItems.length === 1 ? 'story' : 'stories'}${withholdCount ? ` (${withholdCount} post${withholdCount === 1 ? '' : 's'} withheld pending safety review)` : ''}`
  : 'No published stories are available.');
indexHtml = replaceMarkedContent(indexHtml, 'PUBLISHED_COUNT', posts.length.toLocaleString('en-US'));
indexHtml = replaceMarkedContent(indexHtml, 'TOPIC_COUNT', new Set(posts.map(([, post]) => post.category.trim().toLowerCase())).size.toLocaleString('en-US'));
indexHtml = replaceMarkedContent(indexHtml, 'LATEST_DATE', posts.length
  ? new Date(posts[0][1].createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  : 'None yet');
await writeFile(indexPath, indexHtml, 'utf8');

const newsPath = path.join(root, 'news.html');
let newsHtml = await readFile(newsPath, 'utf8');
const listItems = [];
newsHtml = replaceMarkedContent(newsHtml, 'NEWS_CARDS', posts
  .map((item, index) => renderCard(item, index, listItems)).join('\n'));
newsHtml = replaceMarkedContent(newsHtml, 'NEWS_STATUS', posts.length
  ? `Showing ${posts.length} ${posts.length === 1 ? 'published story' : 'published stories'}${withholdCount ? ` (${withholdCount} post${withholdCount === 1 ? '' : 's'} withheld pending safety review)` : ''}`
  : 'No published stories are available.');
const listSchema = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: listItems,
};
newsHtml = newsHtml.replace(
  /(<script type="application\/ld\+json" id="newsListSchema">)[\s\S]*?(<\/script>)/,
  `$1\n      ${escapeJsonLd(listSchema)}\n    $2`,
);
await writeFile(newsPath, newsHtml, 'utf8');

await mkdir(generatedDirectory, { recursive: true });
const currentGeneratedPages = new Set(posts.map(([id]) => `${id}.html`));
for (const filename of await readdir(generatedDirectory)) {
  if (/^[A-Za-z0-9_-]+\.html$/.test(filename) && !currentGeneratedPages.has(filename)) {
    await rm(path.join(generatedDirectory, filename));
  }
}

const cutoff = now - 48 * 60 * 60 * 1000;
const newsSitemapItems = [];
for (const item of posts.filter(([, post]) => post.createdAt >= cutoff)) {
  const [id, post] = item;
  const url = storyPageUrl(id);
  await writeFile(path.join(generatedDirectory, `${id}.html`), renderStory(item), 'utf8');
  newsSitemapItems.push(`  <url>
    <loc>${escapeHtml(url)}</loc>
    <news:news>
      <news:publication>
        <news:name>Jundal Nabi</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${new Date(post.createdAt).toISOString()}</news:publication_date>
      <news:title>${escapeHtml(post.title.trim())}</news:title>
    </news:news>
  </url>`);
}

const newsSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
>
${newsSitemapItems.join('\n')}
</urlset>
`;
await writeFile(path.join(root, 'news-sitemap.xml'), newsSitemap, 'utf8');
console.log(`Generated static news pages for ${posts.length} safe published post(s); withheld ${withholdCount}.`);
