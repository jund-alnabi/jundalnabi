const unsafeImageMarkers = ['qM60kpxw', 'HTw8Lj0XoAAKXKF'];

export const isPubliclySafePost = (post) => {
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

export const storyUrl = (id) => `generated-news/${encodeURIComponent(id)}.html`;
