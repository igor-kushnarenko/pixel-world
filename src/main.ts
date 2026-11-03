const query = new URLSearchParams(location.search);
if (query.get('mode') === 'lab' || query.get('scene') === 'demo') {
  void import('./demo/main');
} else {
  void import('./experience/main');
}
