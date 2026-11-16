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

    /**
     * Rendering rewrites nodes inside the message (split, wrap, insert), which would
     * come back as mutations and re-check the message once per record. Only our own
     * synchronous writes are queued at this point, so they are dropped.
     */
    function dropOwnRecords() {
      observer?.takeRecords();
    }

    function flush() {
      flushScheduled = false;
      const nodes = [...pending];
      pending.clear();
      nodes.filter((node) => node.isConnected).forEach((node) => enhancer.scan(node));
      dropOwnRecords();
    }

    function queueScan(node) {
      pending.add(node);
      if (!flushScheduled) {
        flushScheduled = true;
        schedule(flush);
      }
    }

    /** checked: messages already re-checked in this batch; one check covers all their records. */
    function handleMutation(mutation, checked) {
      if (mutation.type === 'attributes') {
        // Only the attributes that turn an area into a typing area are observed.
        enhancer.releaseInTypingAreas(mutation.target);
        return;
      }
      mutation.removedNodes.forEach((node) => enhancer.releaseWithin(node));

      if (enhancer.isOwnNode(mutation.target)) {
        return;
      }
      const container = enhancer.containerOf(mutation.target);
      if (container !== null) {
        if (!checked.has(container)) {
          checked.add(container);
          enhancer.refreshAround(container);
        }
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
      observer = new MutationObserverImpl((mutations) => {
        const checked = new Set();
        mutations.forEach((mutation) => handleMutation(mutation, checked));
        // A re-render above wrote into the message; those records are ours.
        dropOwnRecords();
      });
      observer.observe(watchRoot, {
        childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['contenteditable', 'role'],
      });
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
