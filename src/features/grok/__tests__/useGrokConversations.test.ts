import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  findGrokNav,
  getGrokTitleFromAnchor,
  GROK_CONVERSATION_LINK_SELECTOR,
} from '../hooks/useGrokConversations';

describe('useGrokConversations Helpers & DOM Scanner', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = '';
  });

  describe('findGrokNav', () => {
    it('detects nav element containing conversation links', () => {
      const nav = document.createElement('nav');
      nav.setAttribute('aria-label', 'Chat history');
      const link = document.createElement('a');
      link.setAttribute('href', '/chat/test-conv-1');
      nav.appendChild(link);
      container.appendChild(nav);

      const found = findGrokNav();
      expect(found).toBe(nav);
    });

    it('detects aside element when nav is absent', () => {
      const aside = document.createElement('aside');
      container.appendChild(aside);

      const found = findGrokNav();
      expect(found).toBe(aside);
    });

    it('falls back to element containing conversation anchor', () => {
      const sidebar = document.createElement('div');
      sidebar.setAttribute('data-testid', 'sidebar');
      const link = document.createElement('a');
      link.setAttribute('href', '/chat/test-conv-2');
      sidebar.appendChild(link);
      container.appendChild(sidebar);

      const found = findGrokNav();
      expect(found).toBeTruthy();
    });
  });

  describe('getGrokTitleFromAnchor', () => {
    it('extracts title from child truncate element', () => {
      const anchor = document.createElement('a');
      anchor.href = '/chat/conv-123';
      const textSpan = document.createElement('span');
      textSpan.className = 'truncate';
      textSpan.textContent = 'Colossus GPU Cluster Architecture';
      anchor.appendChild(textSpan);

      expect(getGrokTitleFromAnchor(anchor)).toBe('Colossus GPU Cluster Architecture');
    });

    it('extracts title from anchor direct text content', () => {
      const anchor = document.createElement('a');
      anchor.href = '/c/conv-456';
      anchor.textContent = 'Optimus Robot Updates';

      expect(getGrokTitleFromAnchor(anchor)).toBe('Optimus Robot Updates');
    });

    it('falls back to default title if empty', () => {
      const anchor = document.createElement('a');
      anchor.href = '/chat/conv-789';

      expect(getGrokTitleFromAnchor(anchor)).toBe('Grok 對話');
    });
  });

  describe('GROK_CONVERSATION_LINK_SELECTOR', () => {
    it('matches /chat/ and /c/ conversation links', () => {
      const link1 = document.createElement('a');
      link1.href = '/chat/abc';
      container.appendChild(link1);

      const link2 = document.createElement('a');
      link2.href = '/c/xyz';
      container.appendChild(link2);

      const link3 = document.createElement('a');
      link3.href = '/settings';
      container.appendChild(link3);

      const matched = container.querySelectorAll(GROK_CONVERSATION_LINK_SELECTOR);
      expect(matched.length).toBe(2);
    });
  });
});
