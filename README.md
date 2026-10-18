# Jundal Nabi

## Build crawler-readable news pages

The site is served as static HTML. Before publishing, run the news build script from
PowerShell to fetch public, approved stories from Firebase and pre-render the homepage
metrics, news listings, individual `/news/<slug>.html` articles, and `sitemap.xml`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-news.ps1
```

Deploy the generated `index.html`, `news.html`, `news\` directory, and `sitemap.xml`
together. Re-run the build after publishing or removing stories so the static pages and
sitemap reflect the current public feed. The existing JavaScript feed remains enabled
for live updates after page load.
