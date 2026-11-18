---
name: blog-post
description: Create or update a static blog post for this landing (outline, draft, SEO and AI-search tags). The blog index, feed, sitemap and llms.txt update themselves. Use when asked to write, add or refresh an article.
---

# blog-post

1. Read `brief/landing.md` (domain-knowledge skill). Pick or confirm one target keyword, the search intent and the question the post answers.
2. Propose title, slug (lowercase-hyphenated) and a 5-8 heading outline, headings phrased the way people ask; get a quick OK if the user is present, otherwise proceed.
3. First post only: set BLOG_TITLE, BLOG_DESCRIPTION (120-155 chars), AUTHOR_NAME and AUTHOR_URL in `site.config.json`. The blog (page, nav link, RSS) appears on the site by itself once a post exists.
4. Copy `src/blog/_template.html` to `src/blog/<slug>.html` and fill the `@vars` block at the top:
   - POST_TITLE, POST_DESCRIPTION (120-155 chars; also used as the summary in the blog list, feed and llms.txt).
   - DATE (YYYY-MM-DD). Leave DATE_MODIFIED empty on first publish.
   - POST_IMAGE: absolute URL of a 1200x630 post image if you add one; empty uses the site's `og.png`.
   - CTA_HEADING / CTA_TEXT: one line linking the post topic to the offer.
   - No named author → change the JSON-LD `author` to `{ "@id": "{{SITE_URL}}/#organization" }` and the byline and `<meta name="author">` to `{{BRAND}}`.
5. Replace `{{POST_BODY}}` with the article, in the brand voice: first paragraph answers the question directly; then specifics, examples, steps, a short summary. h2/h3 only (the title is the h1). No invented stats; cite sources. Link to 1-3 related posts and add a link from 1-2 older related posts to this one. Images: `alt`, width, height, `loading="lazy"`.
6. Do not touch `blog/index.html`, `blog/feed.xml`, `llms.txt` or the sitemap: the build lists the post in all of them from its `@vars`.
7. Updating an existing post: change the content and set DATE_MODIFIED in its `@vars` (it feeds the JSON-LD, the meta tag and the visible "Updated" date). Only for real changes.
8. Run `node tools/verify.mjs`, look at the post in the preview, and run the `seo` checklist on it.
