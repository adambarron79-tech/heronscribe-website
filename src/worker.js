// Static site only: all requests are served from public/ via the ASSETS binding.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
