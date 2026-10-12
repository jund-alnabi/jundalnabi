const unsafeImageMarkers = ['qM60kpxw', 'HTw8Lj0XoAAKXKF'];

const containsSensitiveExposure = (post) => {
  const text = [post.title, post.summary, post.content]
    .filter((value) => typeof value === 'string')
    .join('\n');
  const containsEmailAddress = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text);
  const containsDatasetDownloadLink =
    /https?:\/\/[^\s<>"']*(?:download|dataset|data-dump|\.csv\b|\.sql\b|\.zip\b|\.xlsx?\b|\.7z\b)[^\s<>"']*/i.test(text);

  return containsEmailAddress || containsDatasetDownloadLink;
};

export const canAdminApprovePost = (post) => {
  const imageUrl = typeof post.imageUrl === 'string' ? post.imageUrl : '';
  return !unsafeImageMarkers.some((marker) => imageUrl.includes(marker)) &&
    !containsSensitiveExposure(post);
};

const passesAutomaticSafetyReview = (post) => {
  const text = [post.title, post.summary, post.content]
    .filter((value) => typeof value === 'string')
    .join('\n');

  if (!canAdminApprovePost(post)) return false;
  if (/\b(selling|for sale|buyers?|samples?\s+available|social engineering|spear phishing|sim swapping)\b|\bprice\s*:/i.test(text)) {
    return false;
  }

  return true;
};

export const isPubliclySafePost = (post) =>
  passesAutomaticSafetyReview(post) ||
  (typeof post.reviewedBy === 'string' && post.reviewedBy.length > 0 && canAdminApprovePost(post));

export const storySlug = (id, post) => {
  const titleSlug = (typeof post.title === 'string' ? post.title : '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'story';
  const idSuffix = id.replace(/[^a-z0-9]/gi, '').slice(-6).toLocaleLowerCase() || 'latest';
  return `${titleSlug}-${idSuffix}`;
};

export const storyUrl = (id, preview = false, post) =>
  preview || !post
    ? `news-story.html?id=${encodeURIComponent(id)}${preview ? '&preview=1' : ''}`
    : `news/${storySlug(id, post)}.html`;
