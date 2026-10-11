const storyStatus = document.getElementById('storyStatus');

const showLoadError = (message) => {
  if (!storyStatus || document.documentElement.dataset.storyResolved === 'true') return;
  if (storyStatus.querySelector('button')) return;
  storyStatus.textContent = message;
  storyStatus.classList.add('is-error');
  const retryButton = document.createElement('button');
  retryButton.className = 'btn btn-secondary';
  retryButton.type = 'button';
  retryButton.textContent = 'Reload story';
  retryButton.addEventListener('click', () => window.location.reload());
  storyStatus.append(' ', retryButton);
};

window.addEventListener('error', (event) => {
  const target = event.target;
  if (
    target instanceof HTMLScriptElement &&
    target.type === 'module' &&
    target.src.includes('news-story.js')
  ) {
    showLoadError('The story reader could not load. Check your connection and reload this page.');
  }
}, true);

window.setTimeout(() => {
  showLoadError('The story is taking too long to load. Check your connection, then reload this page.');
}, 25000);
