/**
 * Media URLs are presigned, so every API response carries a new query string for the same image.
 * expo-image caches by URI by default, which would re-download each image on every feed load.
 * Key the cache on the object path instead (the part before `?`), which never changes.
 */
export function mediaSource(url: string): { uri: string; cacheKey: string } {
  return { uri: url, cacheKey: url.split('?')[0] ?? url };
}
