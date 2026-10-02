import type { MetadataRoute } from 'next'

const BASE_URL = 'https://et-alicite.vercel.app'

// Static app routes. Auth-walled pages resolve client-side after login;
// dynamic detail routes ([chapterId], [folderId], …) are intentionally
// omitted since they require group membership to render anything useful.
const ROUTES = [
  '/',
  '/home',
  '/research',
  '/sources',
  '/tasks',
  '/team',
  '/activity',
  '/about',
  '/login',
]

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return ROUTES.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: now,
    changeFrequency: route === '/' ? 'weekly' : 'daily',
    priority: route === '/' ? 1 : 0.7,
  }))
}
