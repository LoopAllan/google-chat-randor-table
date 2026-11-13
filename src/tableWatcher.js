'use strict';

/**
 * Feeds DOM changes to the enhancer. Google Chat is a single-page app, so the
 * content script runs once and has to follow messages as they are added,
 * edited and removed. Scans are batched through `schedule` so a burst of
 * mutations (opening a conversation, scrolling history) costs one pass.
 */
(function (root) {
  function createTableWatcher({ root: watchRoot, enhancer, MutationObserverImpl, schedule }) {
    const pending = new Set();
    let flushScheduled = false;
    let observer = null;

    function flush() {
      flushScheduled = false;
      const nodes = [...pending];
      pending.clear();
      nodes.filter((node) => node.isConnected).forEach((node) => enhancer.scan(node));
    }

    function queueScan(node) {
      pending.add(node);
      if (!flushScheduled) {
        flushScheduled = true;
        schedule(flush);
      }
    }

    function handleMutation(mutation) {
      mutation.removedNodes.forEach((node) => enhancer.releaseWithin(node));

      if (enhancer.isOwnNode(mutation.target) || enhancer.refreshAround(mutation.target)) {
        return;
      }
      if (mutation.type === 'characterData') {
        queueScan(mutation.target);
        return;
      }
      mutation.addedNodes.forEach((node) => {
        if (!enhancer.isOwnNode(node)) {
          queueScan(node);
        }
      });
    }

    function start() {
      enhancer.scan(watchRoot);
      observer = new MutationObserverImpl((mutations) => mutations.forEach(handleMutation));
      observer.observe(watchRoot, { childList: true, subtree: true, characterData: true });
    }

    function stop() {
      if (observer !== null) {
        observer.disconnect();
        observer = null;
      }
      pending.clear();
    }

    return { start, stop };
  }

  const api = { createTableWatcher };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
