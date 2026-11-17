import { view } from '@forge/bridge';
import { mountCodeEvidence } from './frontend.js';
import { mountFrontline } from './frontline-frontend.js';
import frontlineHtml from '../static/app/frontline.html';
import { mountReviewQueue } from './review-frontend.js';
import reviewHtml from '../static/app/review.html';

// Preserve the host-injected bridge: switch views inside this document, never
// navigate the Custom UI iframe to another HTML document.
const codeRoot = document.createElement('div');
const original = document.querySelector('main');
original.replaceWith(codeRoot);
codeRoot.append(original);
const teamRoot = document.createElement('div');
const template = new DOMParser().parseFromString(frontlineHtml, 'text/html');
template.querySelectorAll('script').forEach(script => script.remove());
teamRoot.append(...template.body.childNodes);
const reviewRoot = document.createElement('div');
const reviewTemplate = new DOMParser().parseFromString(reviewHtml, 'text/html');
reviewTemplate.querySelectorAll('script').forEach(script => script.remove());
reviewRoot.append(...reviewTemplate.body.childNodes);
const pages = {
  code: { root: codeRoot, mount: mountCodeEvidence, style: './style.css', title: 'OmniGuard — Code evidence' },
  team: { root: teamRoot, mount: mountFrontline, style: './frontline.css', title: 'OmniGuard — Team defence' },
  review: { root: reviewRoot, mount: mountReviewQueue, style: './review.css', title: 'OmniGuard — Shared review' },
};
let active = 'code';
let history;
function showError(page, error) {
  const notice = page.root.querySelector('#notice');
  notice.textContent = error.message || 'This workflow could not load.';
  notice.classList.add('error');
}
function render(location, focus = true) {
  const key = location.pathname === '/shared-review' ? 'review' : location.pathname === '/team-defence' ? 'team' : 'code';
  const page = pages[key];
  if (key !== active) pages[active].root.replaceWith(page.root);
  active = key;
  document.querySelector('#workflow-style').href = page.style;
  document.title = page.title;
  // Keep inactive views detached: their asynchronous work remains scoped to
  // their own root, with no duplicate IDs or controls in the active document.
  const ready = page.ready
    ? page.ready.then(refresh => refresh())
    : (page.ready = page.mount(page.root));
  ready.then(() => {
    if (focus && active === key) {
      const heading = page.root.querySelector('h1');
      heading.tabIndex = -1;
      heading.focus();
    }
  }).catch(error => showError(page, error));
}
for (const page of Object.values(pages)) {
  for (const link of page.root.querySelectorAll('a[href="./index.html"],a[href="./frontline.html"],a[href="./review.html"]')) {
    const path = link.getAttribute('href') === './review.html' ? '/shared-review' : link.getAttribute('href') === './frontline.html' ? '/team-defence' : '/';
    link.href = path === '/' ? '#code-evidence' : '#team-defence';
    link.addEventListener('click', event => {
      event.preventDefault();
      if (history) history.push(path);
    });
  }
}
try {
  history = await view.createHistory();
  history.listen(location => render(location));
  render(history.location, false);
} catch (error) { showError(pages[active], error); }
