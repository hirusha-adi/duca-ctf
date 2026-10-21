function mapStrings(value, transform) {
  if (typeof value === "string") return transform(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, transform));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, transform)]));
  return value;
}

export function mapPortableContent(document, transform) {
  return {
    ...document,
    ...(document.competition ? { competition: { ...document.competition, description: transform(document.competition.description) } } : {}),
    challenges: document.challenges.map((challenge) => ({
      ...challenge,
      description: transform(challenge.description),
      hints: challenge.hints.map((hint) => ({ ...hint, content: transform(hint.content) })),
      writeup: challenge.writeup ? mapStrings(challenge.writeup, transform) : null,
    })),
  };
}

// Match URL values rather than a matching path inside a remote URL. Generated
// Markdown links and quoted HTML attributes use these value boundaries.
export function replaceLocalAssetUrls(content, replace) {
  return content.replace(/(^|[\s"'(<\[])(\/uploads\/writeups\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|gif|webp)\b)/g, (_match, boundary, url) => boundary + replace(url));
}

export function referencedAssetUrls(document) {
  const urls = new Set();
  mapPortableContent(document, (content) => {
    replaceLocalAssetUrls(content, (url) => { urls.add(url); return url; });
    return content;
  });
  return urls;
}
