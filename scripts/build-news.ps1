$ErrorActionPreference = 'Stop'

$siteUrl = 'https://jundalnabi.jo3.org/'
$databaseUrl = 'https://jundalnabi-9b088-default-rtdb.firebaseio.com'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$newsDirectory = Join-Path $root 'news'

function ConvertTo-HtmlText([object]$Value) {
  return [System.Net.WebUtility]::HtmlEncode([string]$Value)
}

function Get-SafeHttpsUrl([object]$Value) {
  if ($Value -isnot [string] -or [string]::IsNullOrWhiteSpace($Value)) {
    return ''
  }

  $uri = $null
  if ([Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri) -and $uri.Scheme -eq 'https') {
    return $uri.AbsoluteUri
  }
  return ''
}

function Test-PubliclySafePost([object]$Post) {
  $text = (@($Post.title, $Post.summary, $Post.content) |
    Where-Object { $_ -is [string] }) -join "`n"
  $imageUrl = if ($Post.imageUrl -is [string]) { $Post.imageUrl } else { '' }
  $blockedImage = @('qM60kpxw', 'HTw8Lj0XoAAKXKF') |
    Where-Object { $imageUrl.Contains($_) } |
    Select-Object -First 1
  $containsEmail = $text -match '\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b'
  $containsDownloadLink = $text -match 'https?://[^\s<>"'']*(?:download|dataset|data-dump|\.csv\b|\.sql\b|\.zip\b|\.xlsx?\b|\.7z\b)[^\s<>"'']*'
  if ($blockedImage -or $containsEmail -or $containsDownloadLink) {
    return $false
  }

  $autoReviewBlocked = $text -match '\b(selling|for sale|buyers?|samples?\s+available|social engineering|spear phishing|sim swapping)\b|\bprice\s*:'
  return -not $autoReviewBlocked -or ($Post.reviewedBy -is [string] -and $Post.reviewedBy.Length -gt 0)
}

function Get-StorySlug([string]$Id, [object]$Post) {
  $slug = ([string]$Post.title).Normalize([Text.NormalizationForm]::FormKD)
  $slug = [regex]::Replace($slug, '\p{Mn}', '')
  $slug = [regex]::Replace($slug.ToLowerInvariant(), '[^a-z0-9]+', '-').Trim('-')
  if ([string]::IsNullOrWhiteSpace($slug)) {
    $slug = 'story'
  }
  $suffix = [regex]::Replace($Id, '[^a-zA-Z0-9]', '').ToLowerInvariant()
  if ($suffix.Length -gt 6) {
    $suffix = $suffix.Substring($suffix.Length - 6)
  }
  if ([string]::IsNullOrWhiteSpace($suffix)) {
    $suffix = 'latest'
  }
  return "$slug-$suffix"
}

function Set-GeneratedRegion([string]$Content, [string]$StartMarker, [string]$EndMarker, [string]$Replacement) {
  $start = $Content.IndexOf($StartMarker, [StringComparison]::Ordinal)
  if ($start -lt 0) {
    throw "Could not find generated content marker $StartMarker."
  }
  $contentStart = $start + $StartMarker.Length
  $end = $Content.IndexOf($EndMarker, $contentStart, [StringComparison]::Ordinal)
  if ($end -lt 0) {
    throw "Could not find generated content marker $EndMarker."
  }
  return $Content.Substring(0, $contentStart) + $Replacement + $Content.Substring($end)
}

function Get-StoryParagraphs([string]$Text) {
  $paragraphs = @([regex]::Split($Text.Trim(), '\r?\n\s*\r?\n') | Where-Object { $_.Trim() })
  if ($paragraphs.Count -eq 0 -and -not [string]::IsNullOrWhiteSpace($Text)) {
    $paragraphs = @($Text)
  }
  return ($paragraphs | ForEach-Object {
    '<p>' + (ConvertTo-HtmlText ($_.Trim() -replace '\r?\n', ' ')) + '</p>'
  }) -join "`n"
}

function New-StoryCard([string]$Id, [object]$Post) {
  $title = ConvertTo-HtmlText $Post.title
  $summary = ConvertTo-HtmlText $Post.summary
  $category = ConvertTo-HtmlText $Post.category
  $date = [DateTimeOffset]::FromUnixTimeMilliseconds([long]$Post.createdAt).UtcDateTime
  $imageUrl = Get-SafeHttpsUrl $Post.imageUrl
  $image = if ($imageUrl) {
    '<img src="' + (ConvertTo-HtmlText $imageUrl) + '" alt="' + $title + '" loading="lazy" class="lightbox-image" />'
  } else {
    ''
  }
  $slug = Get-StorySlug $Id $Post
  return @"
<article class="news-summary-card$(if (-not $imageUrl) { ' text-only' })">
  $image
  <div class="news-summary-body">
    <span class="tag">$category</span>
    <h2>$title</h2>
    <p>$summary</p>
    <div class="meta-row">
      <span class="author">By Admin</span>
      <time datetime="$($date.ToString('o'))">$($date.ToString('MMMM d, yyyy'))</time>
      <a href="news/$slug.html">Read story</a>
    </div>
  </div>
</article>
"@
}

function New-StoryPage([string]$Id, [object]$Post) {
  $title = ConvertTo-HtmlText $Post.title
  $description = ConvertTo-HtmlText (($Post.summary -replace '\s+', ' ').Trim())
  $category = ConvertTo-HtmlText $Post.category
  $slug = Get-StorySlug $Id $Post
  $canonical = "${siteUrl}news/$slug.html"
  $date = [DateTimeOffset]::FromUnixTimeMilliseconds([long]$Post.createdAt).UtcDateTime
  $dateIso = $date.ToString('o')
  $imageUrl = Get-SafeHttpsUrl $Post.imageUrl
  $sourceUrl = Get-SafeHttpsUrl $Post.sourceUrl
  $imageMarkup = if ($imageUrl) {
    '<img class="story-cover lightbox-image" src="' + (ConvertTo-HtmlText $imageUrl) + '" alt="' + $title + '" />'
  } else {
    ''
  }
  $sourceMarkup = if ($sourceUrl) {
    '<p class="story-source">Source: <a href="' + (ConvertTo-HtmlText $sourceUrl) + '" target="_blank" rel="noopener noreferrer">View original source</a></p>'
  } else {
    ''
  }
  $jsonLd = @{
    '@context' = 'https://schema.org'
    '@type' = 'NewsArticle'
    '@id' = "$canonical#article"
    headline = [string]$Post.title
    description = [string]$Post.summary
    articleBody = [string]$Post.content
    articleSection = [string]$Post.category
    inLanguage = 'en'
    isAccessibleForFree = $true
    datePublished = $dateIso
    dateModified = $dateIso
    mainEntityOfPage = @{ '@type' = 'WebPage'; '@id' = $canonical }
    author = @{ '@type' = 'Organization'; name = 'Admin' }
    publisher = @{
      '@type' = 'Organization'
      '@id' = "${siteUrl}#organization"
      name = 'JundAlNabi News'
      url = $siteUrl
      logo = @{ '@type' = 'ImageObject'; url = "${siteUrl}assets/favicon.svg" }
    }
  }
  if ($imageUrl) {
    $jsonLd.image = $imageUrl
  }
  if ($sourceUrl) {
    $jsonLd.citation = $sourceUrl
  }
  $json = (ConvertTo-Json -InputObject $jsonLd -Depth 10 -Compress) -replace '<', '\u003c'
  $paragraphs = Get-StoryParagraphs ([string]$Post.content)
  return @"
<!DOCTYPE html>
<html lang="en">
  <head>
    <!-- GENERATED STORY PAGE -->
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0f172a" />
    <meta name="robots" content="index, follow" />
    <meta name="description" content="$description" />
    <title>$title | Jundal Nabi</title>
    <link rel="canonical" href="$canonical" />
    <link rel="stylesheet" href="../style.css?v=20261012-static-stories1" />
    <link rel="icon" type="image/svg+xml" href="../assets/favicon.svg" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="$title | Jundal Nabi" />
    <meta property="og:description" content="$description" />
    <meta property="og:url" content="$canonical" />
    <meta property="og:image" content="$(if ($imageUrl) { ConvertTo-HtmlText $imageUrl } else { "${siteUrl}assets/og-image.svg" })" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="$title | Jundal Nabi" />
    <meta name="twitter:description" content="$description" />
    <meta name="twitter:image" content="$(if ($imageUrl) { ConvertTo-HtmlText $imageUrl } else { "${siteUrl}assets/og-image.svg" })" />
    <script type="application/ld+json">$json</script>
  </head>
  <body>
    <header class="site-header">
      <nav class="container nav" aria-label="Main navigation">
        <a class="brand" href="../index.html">Jundal Nabi</a>
        <div class="nav-links"><a href="../index.html">Home</a><a href="../news.html">News</a></div>
      </nav>
    </header>
    <main class="news-shell">
      <div class="container">
        <div class="news-back"><a href="../news.html">Back to latest investigations</a></div>
        <article class="article-content published-story">
          <p class="eyebrow">$category</p>
          <h1>$title</h1>
          <div class="news-meta">
            <span class="author">By Admin</span>
            <time datetime="$dateIso">$($date.ToString('MMMM d, yyyy'))</time>
            <span>Public investigation</span>
          </div>
          $imageMarkup
          <p class="published-summary">$(ConvertTo-HtmlText $Post.summary)</p>
          <div class="published-body">
            $paragraphs
          </div>
          $sourceMarkup
          <p class="editorial-policy-link">Read our <a href="../editorial-standards.html">editorial standards</a>.</p>
        </article>
      </div>
    </main>
    <footer class="site-footer">
      <div class="container footer-inner">
        <p>&copy; $((Get-Date).Year) Jundal Nabi. All rights reserved.</p>
        <a href="../editorial-standards.html">Editorial standards</a>
      </div>
    </footer>
  </body>
</html>
"@
}

$response = Invoke-RestMethod -Uri "$databaseUrl/newsPosts.json" -TimeoutSec 30
$posts = @()
if ($null -ne $response) {
  foreach ($property in $response.PSObject.Properties) {
    $post = $property.Value
    if (
      $post -and
      $post.published -eq $true -and
      $post.createdAt -is [ValueType] -and
      [long]$post.createdAt -gt 0 -and
      (Test-PubliclySafePost $post)
    ) {
      $posts += [pscustomobject]@{ Id = $property.Name; Post = $post }
    }
  }
}
$posts = @($posts | Sort-Object { [long]$_.Post.createdAt } -Descending)
$topics = @($posts | ForEach-Object { ([string]$_.Post.category).Trim().ToLowerInvariant() } | Where-Object { $_ } | Select-Object -Unique)
$latestDate = if ($posts.Count) {
  [DateTimeOffset]::FromUnixTimeMilliseconds([long]$posts[0].Post.createdAt).LocalDateTime.ToString('MMM d, yyyy')
} else {
  'None yet'
}
$homePosts = @($posts | Select-Object -First 3)
$homeCards = ($homePosts | ForEach-Object { New-StoryCard $_.Id $_.Post }) -join "`n"
$newsCards = ($posts | ForEach-Object { New-StoryCard $_.Id $_.Post }) -join "`n"
$statusText = if ($posts.Count) { "Showing the latest $($posts.Count) public reports." } else { 'No published stories are available.' }
$schemaItems = @()
for ($index = 0; $index -lt $posts.Count; $index++) {
  $entry = $posts[$index]
  $schemaItems += @{
    '@type' = 'ListItem'
    position = $index + 1
    url = "${siteUrl}news/$(Get-StorySlug $entry.Id $entry.Post).html"
    name = [string]$entry.Post.title
  }
}
$newsSchema = @{
  '@context' = 'https://schema.org'
  '@type' = 'ItemList'
  itemListElement = $schemaItems
} | ConvertTo-Json -Depth 10

$indexPath = Join-Path $root 'index.html'
$indexHtml = [IO.File]::ReadAllText($indexPath)
$indexHtml = Set-GeneratedRegion $indexHtml '<!-- GENERATED_STORY_COUNT_START -->' '<!-- GENERATED_STORY_COUNT_END -->' "$($posts.Count)"
$indexHtml = Set-GeneratedRegion $indexHtml '<!-- GENERATED_TOPIC_COUNT_START -->' '<!-- GENERATED_TOPIC_COUNT_END -->' "$($topics.Count)"
$indexHtml = Set-GeneratedRegion $indexHtml '<!-- GENERATED_LATEST_DATE_START -->' '<!-- GENERATED_LATEST_DATE_END -->' (ConvertTo-HtmlText $latestDate)
$indexHtml = Set-GeneratedRegion $indexHtml '<!-- GENERATED_HOME_STATUS_START -->' '<!-- GENERATED_HOME_STATUS_END -->' (ConvertTo-HtmlText $statusText)
$indexHtml = Set-GeneratedRegion $indexHtml '<!-- GENERATED_HOME_NEWS_START -->' '<!-- GENERATED_HOME_NEWS_END -->' $homeCards
[IO.File]::WriteAllText($indexPath, $indexHtml, [Text.UTF8Encoding]::new($false))

$newsPath = Join-Path $root 'news.html'
$newsHtml = [IO.File]::ReadAllText($newsPath)
$newsSchemaElement = '<script type="application/ld+json" id="newsListSchema">' + "`n" + $newsSchema + "`n</script>"
$newsHtml = Set-GeneratedRegion $newsHtml '<!-- GENERATED_NEWS_SCHEMA_START -->' '<!-- GENERATED_NEWS_SCHEMA_END -->' $newsSchemaElement
$newsHtml = Set-GeneratedRegion $newsHtml '<!-- GENERATED_NEWS_STATUS_START -->' '<!-- GENERATED_NEWS_STATUS_END -->' (ConvertTo-HtmlText $statusText)
$newsHtml = Set-GeneratedRegion $newsHtml '<!-- GENERATED_NEWS_LIST_START -->' '<!-- GENERATED_NEWS_LIST_END -->' $newsCards
[IO.File]::WriteAllText($newsPath, $newsHtml, [Text.UTF8Encoding]::new($false))

[IO.Directory]::CreateDirectory($newsDirectory) | Out-Null
$manifestPath = Join-Path $newsDirectory '.generated-stories.txt'
$previousStoryFiles = @()
if (Test-Path -LiteralPath $manifestPath) {
  $previousStoryFiles = Get-Content -LiteralPath $manifestPath
}
foreach ($fileName in $previousStoryFiles) {
  if ($fileName -notmatch '^[a-z0-9]+(?:-[a-z0-9]+)*\.html$') {
    continue
  }
  $oldStoryPath = Join-Path $newsDirectory $fileName
  if (
    (Test-Path -LiteralPath $oldStoryPath -PathType Leaf) -and
    (Select-String -LiteralPath $oldStoryPath -Pattern '<!-- GENERATED STORY PAGE -->' -Quiet)
  ) {
    Remove-Item -LiteralPath $oldStoryPath -Force
  }
}
$generatedStoryFiles = @()
foreach ($entry in $posts) {
  $slug = Get-StorySlug $entry.Id $entry.Post
  $fileName = "$slug.html"
  $storyPath = Join-Path $newsDirectory $fileName
  [IO.File]::WriteAllText($storyPath, (New-StoryPage $entry.Id $entry.Post), [Text.UTF8Encoding]::new($false))
  $generatedStoryFiles += $fileName
}
[IO.File]::WriteAllLines($manifestPath, $generatedStoryFiles, [Text.UTF8Encoding]::new($false))

$storyUrls = ($posts | ForEach-Object {
  $slug = Get-StorySlug $_.Id $_.Post
  "  <url><loc>${siteUrl}news/$slug.html</loc></url>"
}) -join "`n"
$storyUrls = "`n$storyUrls`n  "
$sitemapPath = Join-Path $root 'sitemap.xml'
$sitemap = [IO.File]::ReadAllText($sitemapPath)
$sitemap = $sitemap -replace 'http://jundalnabi\.duckdns\.org/', 'https://jundalnabi.jo3.org/'
$sitemap = Set-GeneratedRegion $sitemap '<!-- GENERATED_STORY_URLS_START -->' '<!-- GENERATED_STORY_URLS_END -->' $storyUrls
[IO.File]::WriteAllText($sitemapPath, $sitemap, [Text.UTF8Encoding]::new($false))

Write-Output "Generated $($posts.Count) public story pages, static news listings, homepage metrics, and sitemap entries."
