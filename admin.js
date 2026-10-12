import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { get, push, ref, remove, serverTimestamp, set, update } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
import { auth, database } from './firebase-client.js';
import { canAdminApprovePost, isPubliclySafePost, storyUrl } from './news-content.js?v=20261012-static-stories1';

const loginForm = document.getElementById('loginForm');
const newsForm = document.getElementById('newsForm');
const loginPanel = document.getElementById('adminLogin');
const workspace = document.getElementById('adminWorkspace');
const status = document.getElementById('adminStatus');
const signOutButton = document.getElementById('signOutButton');
const categoryOptions = document.getElementById('categoryOptions');
const postsList = document.getElementById('adminPostsList');
const postsStatus = document.getElementById('postsStatus');
const refreshPostsButton = document.getElementById('refreshPostsButton');
const authorizedAdminUid = 'JkKsS2tV4cgAkn9VencX2n59zfb2';

const showStatus = (message, isError = false) => {
  status.textContent = message;
  status.classList.toggle('is-error', isError);
};

const loadPostedStories = async () => {
  postsStatus.classList.remove('is-error');
  postsStatus.textContent = 'Loading posted stories…';
  postsList.replaceChildren();

  try {
    const snapshot = await get(ref(database, 'newsPosts'));
    const categories = new Map();
    const posts = [];

    snapshot.forEach((child) => {
      const post = child.val();
      if (!post || typeof post !== 'object') return;

      posts.push({ id: child.key, post });

      const category = post.category;
      if (typeof category === 'string' && category.trim()) {
        const normalizedCategory = category.trim();
        categories.set(normalizedCategory.toLocaleLowerCase(), normalizedCategory);
      }
    });

    categories.forEach((category) => {
      if (Array.from(categoryOptions.options).some(
        (option) => option.value.toLocaleLowerCase() === category.toLocaleLowerCase()
      )) {
        return;
      }

      const option = document.createElement('option');
      option.value = category;
      categoryOptions.append(option);
    });

    posts.sort((first, second) => (Number(second.post.createdAt) || 0) - (Number(first.post.createdAt) || 0));
    posts.forEach(({ id, post }) => {
      const item = document.createElement('article');
      item.className = 'admin-post-item';

      const details = document.createElement('div');
      details.className = 'admin-post-details';

      const title = document.createElement('h3');
      title.textContent = typeof post.title === 'string' && post.title.trim() ? post.title : 'Untitled story';

      const meta = document.createElement('p');
      meta.className = 'admin-post-meta';
      const category = typeof post.category === 'string' ? post.category : 'Uncategorized';
      const timestamp = Number(post.createdAt);
      const date = Number.isFinite(timestamp) && timestamp > 0
        ? new Date(timestamp).toLocaleString()
        : 'Date unavailable';
      meta.textContent = `${category} · ${date}`;

      const preview = document.createElement('p');
      preview.className = 'admin-post-preview';
      preview.textContent = typeof post.summary === 'string' ? post.summary : '';

      const visibility = document.createElement('p');
      visibility.className = 'admin-post-meta';
      const isPublic = isPubliclySafePost(post);
      visibility.textContent = isPublic
        ? post.reviewedBy
          ? 'Approved by Admin and visible on public news pages'
          : 'Visible on public news pages'
        : 'Hidden from public news pages pending safety review';

      const actions = document.createElement('div');
      actions.className = 'admin-post-actions';
      const viewLink = document.createElement('a');
      viewLink.className = 'btn btn-secondary';
      viewLink.href = storyUrl(id, true);
      viewLink.textContent = 'Preview';

      if (!isPublic && canAdminApprovePost(post)) {
        const approveButton = document.createElement('button');
        approveButton.className = 'btn btn-primary';
        approveButton.type = 'button';
        approveButton.dataset.approvePostId = id;
        approveButton.dataset.postTitle = title.textContent;
        approveButton.textContent = 'Approve';
        actions.append(approveButton);
      } else if (!isPublic) {
        const reviewNote = document.createElement('span');
        reviewNote.className = 'admin-post-meta';
        reviewNote.textContent = 'Remove actual private data or replace the blocked image before publishing.';
        actions.append(reviewNote);
      }

      const deleteButton = document.createElement('button');
      deleteButton.className = 'btn btn-danger';
      deleteButton.type = 'button';
      deleteButton.dataset.postId = id;
      deleteButton.textContent = 'Delete';
      deleteButton.setAttribute('aria-label', `Delete ${title.textContent}`);

      details.append(title, meta, visibility, preview);
      actions.append(viewLink, deleteButton);
      item.append(details, actions);
      postsList.append(item);
    });

    const withheldCount = posts.filter(({ post }) => !isPubliclySafePost(post)).length;
    postsStatus.textContent = posts.length
      ? `${posts.length} ${posts.length === 1 ? 'story' : 'stories'} in the database.${withheldCount ? ` ${withheldCount} hidden from public news pages pending safety review.` : ''}`
      : 'No stories have been posted yet.';
  } catch (error) {
    console.error('Posted stories could not be loaded.', error);
    postsStatus.textContent = error.code === 'PERMISSION_DENIED'
      ? 'Firebase denied access to the posts. Check the Realtime Database read rules.'
      : 'Could not load posted stories. Check your connection and try again.';
    postsStatus.classList.add('is-error');
  }
};

onAuthStateChanged(auth, async (user) => {
  if (user && user.uid !== authorizedAdminUid) {
    loginPanel.hidden = false;
    workspace.hidden = true;
    postsList.replaceChildren();
    postsStatus.textContent = 'Sign in to manage posted stories.';
    showStatus('This Firebase account is not authorized to manage site news. Signing out…', true);
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Unauthorized admin account could not be signed out.', error);
      showStatus('This Firebase account is not authorized to manage site news. Sign out and use the authorized account.', true);
    }
    return;
  }

  loginPanel.hidden = Boolean(user);
  workspace.hidden = !user;

  if (user) {
    document.getElementById('adminEmailLabel').textContent = user.email || 'Authorized account';
    document.getElementById('adminUid').textContent = user.uid;
    showStatus('Signed in. Create and publish a story below.');
    postsStatus.classList.remove('is-error');
    loadPostedStories();
  } else {
    postsList.replaceChildren();
    postsStatus.textContent = 'Sign in to manage posted stories.';
    showStatus('Sign in with an admin account. Public account registration is disabled.');
  }
});

refreshPostsButton.addEventListener('click', loadPostedStories);

postsList.addEventListener('click', async (event) => {
  const approveButton = event.target.closest('button[data-approve-post-id]');
  if (approveButton) {
    const postId = approveButton.dataset.approvePostId;
    const title = approveButton.dataset.postTitle || 'this story';
    const user = auth.currentUser;
    if (!postId || !user || !window.confirm(`Approve "${title}" for public display?`)) return;

    approveButton.disabled = true;
    showStatus('Approving story…');
    try {
      await update(ref(database, `newsPosts/${postId}`), { reviewedBy: user.uid });
      await loadPostedStories();
      showStatus('Story approved and is now visible on the public news pages.');
    } catch (error) {
      console.error('News story could not be approved.', error);
      showStatus(
        error.code === 'PERMISSION_DENIED'
          ? 'Firebase denied approval. Publish the updated database.rules.json rules, then try again.'
          : 'Could not approve the story. Check your connection and try again.',
        true
      );
      approveButton.disabled = false;
    }
    return;
  }

  const deleteButton = event.target.closest('button[data-post-id]');
  if (!deleteButton) return;

  const postId = deleteButton.dataset.postId;
  const title = deleteButton.getAttribute('aria-label')?.replace(/^Delete /, '') || 'this story';
  if (!postId || !window.confirm(`Delete "${title}"? This cannot be undone.`)) return;

  deleteButton.disabled = true;
  showStatus('Deleting story…');
  try {
    await remove(ref(database, `newsPosts/${postId}`));
    await loadPostedStories();
    showStatus('Story deleted.');
  } catch (error) {
    console.error('News story could not be deleted.', error);
    showStatus(
      error.code === 'PERMISSION_DENIED'
        ? 'Firebase denied deletion. Confirm this account UID is allowed by the deployed Realtime Database rules.'
        : 'Could not delete the story. Check your connection and try again.',
      true
    );
    deleteButton.disabled = false;
  }
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  showStatus('Signing in…');

  try {
    const email = loginForm.elements.email.value.trim();
    const password = loginForm.elements.password.value;
    await signInWithEmailAndPassword(auth, email, password);
    loginForm.reset();
  } catch (error) {
    console.error('Admin sign-in failed.', error);
    showStatus('Sign-in failed. Check the account details and Firebase Authentication settings.', true);
  } finally {
    submitButton.disabled = false;
  }
});

signOutButton.addEventListener('click', async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Admin sign-out failed.', error);
    showStatus('Could not sign out. Please try again.', true);
  }
});

newsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const user = auth.currentUser;
  if (!user) {
    showStatus('Your session has expired. Sign in again to publish.', true);
    return;
  }

  const submitButton = newsForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  showStatus('Publishing story…');

  try {
    const imageUrl = newsForm.elements.imageUrl.value.trim();
    if (imageUrl && new URL(imageUrl).protocol !== 'https:') {
      throw new Error('Image URL must use HTTPS.');
    }
    const sourceUrl = newsForm.elements.sourceUrl.value.trim();
    if (sourceUrl && new URL(sourceUrl).protocol !== 'https:') {
      throw new Error('Source URL must use HTTPS.');
    }
    const sourceAuthority = Number(newsForm.elements.sourceAuthority.value);
    if (!Number.isFinite(sourceAuthority) || sourceAuthority < 0.5 || sourceAuthority > 2) {
      throw new Error('Source authority score must be between 0.5 and 2.0.');
    }

    const post = {
      title: newsForm.elements.title.value.trim(),
      authorName: 'Admin',
      authorType: 'Person',
      sourceUrl,
      category: newsForm.elements.category.value.trim(),
      sourceAuthority,
      summary: newsForm.elements.summary.value.trim(),
      content: newsForm.elements.content.value.trim(),
      imageUrl,
      createdAt: serverTimestamp(),
      authorUid: user.uid,
      published: true
    };
    const postRef = push(ref(database, 'newsPosts'));
    await set(postRef, post);

    newsForm.reset();
    await loadPostedStories();
    showStatus(isPubliclySafePost(post)
      ? 'Story published. It is now available on the Latest Investigations page.'
      : 'Story saved, but it is hidden from public news pages pending safety review. Check it in the posted stories list.');
  } catch (error) {
    console.error('News story could not be published.', error);
    if (
      error.message === 'Image URL must use HTTPS.' ||
      error.message === 'Source URL must use HTTPS.' ||
      error.message === 'Source authority score must be between 0.5 and 2.0.'
    ) {
      showStatus(error.message, true);
    } else if (error.code === 'PERMISSION_DENIED') {
      showStatus(
        'Firebase denied this post. Confirm you are signed in to the jundalnabi-9b088 project and that its Realtime Database rules allow this account UID to write to newsPosts.',
        true
      );
    } else if (error.code === 'NETWORK_ERROR' || error.code === 'unavailable') {
      showStatus('Could not reach Firebase Realtime Database. Check your connection and database URL, then try again.', true);
    } else {
      const code = error.code ? ` (${error.code})` : '';
      showStatus(`Could not publish the story${code}. Check the browser console for details and try again.`, true);
    }
  } finally {
    submitButton.disabled = false;
  }
});
