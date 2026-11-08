// Town settings and the resident list.
window.TOWN = {
  name: 'Cloud City',
  handle: '@cloudcity',
  elevation: '3,950 ft',
  demo: false,
  preview: false,                  // true shows notes that votes and invites are not connected
  selfClaim: true,                  // true lets visitors with a friend's invite link build a house from the site
  plots: 10000,                      // how many streets' worth of plots are laid out, free ones included
  levels: [['House', 0], ['Chalet', 3], ['Lodge', 10]],  // [name, friends needed]
  buildOptions: ['Ski lift', 'Diner', 'Movie theater', 'Bakery'],
  mall: { name: 'Cloud Mall', steps: [100, 200, 300, 400, 500] },  // likes needed for each of the five build stages
  opened: [],                       // winners that have been built, e.g. ['Bakery']: replaces the scaffolding and leaves the ballot
  apiUrl: new URLSearchParams(location.search).get('api') || (typeof localStorage !== 'undefined' && localStorage.getItem('DC_API_URL')) || '',
  residents: []
};
(() => {
  let list = [{ n: 'the_mayor', lvl: 3 }];
  try {
    const cached = localStorage.getItem('DC_LOCAL_RESIDENTS');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
    }
  } catch {}
  window.TOWN.residents = list;
})();
