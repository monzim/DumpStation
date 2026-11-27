// Runs only when no static asset matches the request.
// /demo/* is a single-page app: unknown paths get its index.html so deep
// links like /demo/databases work. Everything else gets the 404 page.
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const isRoute = !/\.[a-z0-9]+$/i.test(url.pathname)
    if (isRoute && (url.pathname === '/demo' || url.pathname.startsWith('/demo/'))) {
      const res = await env.ASSETS.fetch(new Request(new URL('/demo/', url), request))
      return new Response(res.body, { status: 200, headers: res.headers })
    }
    const page = await env.ASSETS.fetch(new Request(new URL('/404.html', url), request))
    return new Response(page.body, { status: 404, headers: page.headers })
  },
}
