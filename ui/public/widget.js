/**
 * Support247 Widget SDK
 * Self-bootstrapping IIFE — paste one <script> tag, nothing else needed.
 *
 * Embed:
 *   <script src="https://your-domain/widget.js?api_key=YOUR_API_KEY" async></script>
 *
 * Optional identity (Shopify / WooCommerce):
 *   <script
 *     src="https://your-domain/widget.js?api_key=YOUR_API_KEY"
 *     data-customer-email="john@example.com"
 *     data-customer-name="John Smith"
 *     data-customer-id="cust_12345"
 *     async>
 *   </script>
 *
 * Public JS API (optional merchant calls):
 *   Support247Widget('show')
 *   Support247Widget('hide')
 *   Support247Widget('track', 'add_to_cart', { product_id: '123' })
 */

;(function () {
  'use strict';

  // ── 1. Find own <script> tag ──────────────────────────────────────────────

  var scriptTag = document.currentScript;
  if (!scriptTag) {
    // Fallback: find the last script with our src pattern
    var scripts = document.querySelectorAll('script[src*="widget.js"]');
    scriptTag = scripts[scripts.length - 1] || null;
  }
  if (!scriptTag) { console.warn('[Support247] Could not locate <script> tag.'); return; }

  // ── 2. Parse api_key from script src ─────────────────────────────────────

  var srcUrl = new URL(scriptTag.src, location.href);
  var apiKey = srcUrl.searchParams.get('api_key');
  if (!apiKey) { console.warn('[Support247] Missing api_key in script src.'); return; }

  // Read optional customer identity from data-* attributes
  var customerEmail = scriptTag.dataset.customerEmail || '';
  var customerName  = scriptTag.dataset.customerName  || '';
  var customerId    = scriptTag.dataset.customerId    || '';

  // Derive backend origin from script src (same domain as widget.js)
  var backendOrigin = srcUrl.origin;

  // ── 3. Fetch widget config ─────────────────────────────────────────────────

  var cfg = null;   // set after fetch resolves

  fetch(backendOrigin + '/api/v1/widget/config?api_key=' + encodeURIComponent(apiKey))
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (data) {
      cfg = data;
      _init(data);
    })
    .catch(function (err) {
      console.warn('[Support247] Failed to load widget config:', err);
    });

  // ── 4. Build the widget once config is loaded ─────────────────────────────

  var launcher   = null;   // floating button
  var panel      = null;   // iframe container
  var iframe     = null;   // the actual iframe
  var badge      = null;   // unread dot
  var isOpen     = false;
  var unreadCount = 0;
  var sessionId  = null;
  var toastEl    = null;

  function _init(data) {
    var color = data.theme_color || '#6366f1';
    var slug  = data.slug;

    // Build session id once per page load
    sessionId = _getOrCreateSessionId();

    _buildLauncher(color, data.logo_url);
    _buildPanel(slug, color, data.display_name);
    _listenToIframe();
    _patchHistory();
    _exposePublicApi();

    // Let the host page know the widget is ready
    window.dispatchEvent(new CustomEvent('support247:ready', { detail: { slug: slug } }));
  }

  // ── 5. Launcher button ────────────────────────────────────────────────────

  function _buildLauncher(color, logoUrl) {
    launcher = document.createElement('div');
    launcher.id = 's247-launcher';
    launcher.setAttribute('role', 'button');
    launcher.setAttribute('aria-label', 'Open chat');
    launcher.setAttribute('tabindex', '0');

    var css = [
      'position:fixed',
      'bottom:24px',
      'right:24px',
      'z-index:2147483001',
      'width:56px',
      'height:56px',
      'border-radius:50%',
      'background:' + color,
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'cursor:pointer',
      'box-shadow:0 4px 20px rgba(0,0,0,0.25)',
      'transition:transform 0.2s ease,box-shadow 0.2s ease',
      'user-select:none',
    ].join(';');
    launcher.style.cssText = css;

    // Icon — use logo if provided, otherwise default chat SVG
    if (logoUrl) {
      var img = document.createElement('img');
      img.src = logoUrl;
      img.style.cssText = 'width:32px;height:32px;border-radius:50%;object-fit:cover;';
      img.onerror = function () { launcher.innerHTML = _chatIcon(); };
      launcher.appendChild(img);
    } else {
      launcher.innerHTML = _chatIcon();
    }

    // Unread badge
    badge = document.createElement('span');
    badge.style.cssText = [
      'position:absolute',
      'top:-4px',
      'right:-4px',
      'background:#ef4444',
      'color:#fff',
      'font-size:11px',
      'font-weight:700',
      'min-width:18px',
      'height:18px',
      'border-radius:9px',
      'padding:0 4px',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'box-shadow:0 0 0 2px #fff',
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
    ].join(';');
    launcher.appendChild(badge);

    launcher.addEventListener('click', _togglePanel);
    launcher.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _togglePanel(); }
    });
    launcher.addEventListener('mouseenter', function () {
      launcher.style.transform = 'scale(1.08)';
      launcher.style.boxShadow = '0 6px 28px rgba(0,0,0,0.3)';
    });
    launcher.addEventListener('mouseleave', function () {
      launcher.style.transform = 'scale(1)';
      launcher.style.boxShadow = '0 4px 20px rgba(0,0,0,0.25)';
    });

    document.body.appendChild(launcher);
  }

  function _chatIcon() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>';
  }

  // ── 6. Panel + iframe ──────────────────────────────────────────────────────

  function _buildPanel(slug, color, name) {
    panel = document.createElement('div');
    panel.id = 's247-panel';

    var isMobile = window.innerWidth < 500;
    var css = [
      'position:fixed',
      'z-index:2147483000',
      'bottom:92px',
      'right:16px',
      isMobile ? 'left:0;right:0;bottom:0;top:0;border-radius:0' : 'width:420px;height:640px;border-radius:16px',
      'overflow:hidden',
      'box-shadow:0 8px 40px rgba(0,0,0,0.22)',
      'display:none',
      'flex-direction:column',
      'transform:translateY(16px)',
      'opacity:0',
      'transition:transform 0.25s ease,opacity 0.25s ease',
      'background:#fff',
    ].join(';');
    panel.style.cssText = css;

    // Build iframe src — pass session_id so history can be restored.
    // Customer chat now lives at the root namespace: /<slug>
    var iframeSrc = backendOrigin + '/' + encodeURIComponent(slug) +
      '?session_id=' + encodeURIComponent(sessionId);
    if (customerEmail) iframeSrc += '&customer_email=' + encodeURIComponent(customerEmail);
    if (customerName)  iframeSrc += '&customer_name='  + encodeURIComponent(customerName);
    if (customerId)    iframeSrc += '&customer_id='    + encodeURIComponent(customerId);

    iframe = document.createElement('iframe');
    iframe.src = iframeSrc;
    iframe.title = name || 'Support Chat';
    iframe.setAttribute('allow', 'clipboard-write');
    // flex:1 so the optional "Powered by" footer can occupy the bottom strip
    iframe.style.cssText = 'width:100%;flex:1 1 auto;min-height:0;border:none;display:block;';

    panel.appendChild(iframe);

    // "Powered by" attribution — a real backlink in the HOST page DOM (free plan only).
    if (cfg && cfg.show_branding) {
      panel.appendChild(_buildBranding());
    }

    document.body.appendChild(panel);
  }

  // Attribution footer — dofollow link to the marketing site for SEO authority.
  function _buildBranding() {
    var footer = document.createElement('div');
    footer.style.cssText = [
      'flex:0 0 auto',
      'height:28px',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'background:#fff',
      'border-top:1px solid #eee',
      'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
      'font-size:11px',
      'color:#9ca3af',
    ].join(';');

    var link = document.createElement('a');
    link.href = 'https://support247.chat/?utm_source=widget&utm_medium=referral&utm_campaign=powered_by';
    link.target = '_blank';
    link.rel = 'noopener';   // dofollow (no "nofollow") — this is the backlink
    link.textContent = 'Powered by SUPPORT247.chat';
    link.style.cssText = 'color:#6b7280;text-decoration:none;font-weight:600;';
    link.addEventListener('mouseenter', function () { link.style.textDecoration = 'underline'; });
    link.addEventListener('mouseleave', function () { link.style.textDecoration = 'none'; });

    footer.appendChild(link);
    return footer;
  }

  // ── 7. Show / hide ────────────────────────────────────────────────────────

  function _showPanel() {
    if (isOpen) return;
    isOpen = true;
    _clearUnread();
    _removeToast();

    panel.style.display = 'flex';
    // Force reflow before animation
    void panel.offsetWidth;
    panel.style.transform = 'translateY(0)';
    panel.style.opacity   = '1';

    // Switch launcher to X (close) icon
    launcher.innerHTML = _closeIcon();
    launcher.setAttribute('aria-label', 'Close chat');

    // Re-append badge
    launcher.appendChild(badge);

    // Notify iframe that it's now visible
    _postToIframe({ type: 'support247:show' });
    window.dispatchEvent(new CustomEvent('support247:show'));
  }

  function _hidePanel() {
    if (!isOpen) return;
    isOpen = false;

    panel.style.transform = 'translateY(16px)';
    panel.style.opacity   = '0';
    setTimeout(function () {
      if (!isOpen) panel.style.display = 'none';
    }, 260);

    // Restore chat icon
    if (cfg) {
      launcher.innerHTML = '';
      if (cfg.logo_url) {
        var img = document.createElement('img');
        img.src = cfg.logo_url;
        img.style.cssText = 'width:32px;height:32px;border-radius:50%;object-fit:cover;';
        img.onerror = function () { launcher.innerHTML = _chatIcon(); };
        launcher.appendChild(img);
      } else {
        launcher.innerHTML = _chatIcon();
      }
      launcher.appendChild(badge);
    }
    launcher.setAttribute('aria-label', 'Open chat');

    _postToIframe({ type: 'support247:hide' });
    window.dispatchEvent(new CustomEvent('support247:hide'));
  }

  function _togglePanel() { isOpen ? _hidePanel() : _showPanel(); }

  function _closeIcon() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>';
  }

  // ── 8. postMessage bridge ─────────────────────────────────────────────────

  function _listenToIframe() {
    window.addEventListener('message', function (e) {
      // Only accept messages from our iframe's origin
      if (e.origin !== backendOrigin) return;
      var msg = e.data;
      if (!msg || typeof msg !== 'object') return;

      switch (msg.type) {
        case 'support247:ready':
          // iframe loaded — push customer identity if available
          _postToIframe({
            type:           'support247:config',
            theme_color:    cfg ? cfg.theme_color : '',
            customer_email: customerEmail,
            customer_name:  customerName,
            customer_id:    customerId,
          });
          break;

        case 'support247:unread':
          _incrementUnread(msg.count || 1, msg.preview);
          break;

        case 'support247:close':
          _hidePanel();
          break;
      }
    });
  }

  function _postToIframe(msg) {
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(msg, backendOrigin);
    }
  }

  // ── 9. Unread badge ───────────────────────────────────────────────────────

  function _incrementUnread(n, preview) {
    unreadCount += n;
    if (badge) {
      badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
      badge.style.display = 'flex';
    }
    if (!isOpen && preview) _showToast(preview);
  }

  function _clearUnread() {
    unreadCount = 0;
    if (badge) badge.style.display = 'none';
  }

  // ── 10. Toast notification ────────────────────────────────────────────────

  function _showToast(preview) {
    _removeToast();
    toastEl = document.createElement('div');
    toastEl.style.cssText = [
      'position:fixed',
      'bottom:92px',
      'right:24px',
      'z-index:2147483002',
      'background:#1f2937',
      'color:#f9fafb',
      'border-radius:12px',
      'padding:12px 16px',
      'max-width:280px',
      'cursor:pointer',
      'box-shadow:0 4px 20px rgba(0,0,0,0.25)',
      'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
      'font-size:13px',
      'line-height:1.5',
      'animation:s247FadeIn 0.25s ease',
    ].join(';');

    var label = document.createElement('p');
    label.style.cssText = 'margin:0 0 2px;font-weight:600;font-size:12px;opacity:0.7;';
    label.textContent = '👤 Support Agent';

    var text = document.createElement('p');
    text.style.cssText = 'margin:0;';
    text.textContent = preview.length > 80 ? preview.slice(0, 80) + '…' : preview;

    toastEl.appendChild(label);
    toastEl.appendChild(text);
    toastEl.addEventListener('click', function () { _showPanel(); });

    // Inject animation keyframe once
    if (!document.getElementById('s247-anim')) {
      var style = document.createElement('style');
      style.id = 's247-anim';
      style.textContent = '@keyframes s247FadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}';
      document.head.appendChild(style);
    }

    document.body.appendChild(toastEl);
    setTimeout(_removeToast, 6000);
  }

  function _removeToast() {
    if (toastEl && toastEl.parentNode) { toastEl.parentNode.removeChild(toastEl); }
    toastEl = null;
  }

  // ── 11. Host-page URL tracking ────────────────────────────────────────────

  function _patchHistory() {
    var _push = history.pushState.bind(history);
    var _replace = history.replaceState.bind(history);

    function _sendUrl() {
      _postToIframe({
        type:     'support247:page',
        url:      location.href,
        title:    document.title,
        referrer: document.referrer,
      });
    }

    history.pushState = function () { _push.apply(history, arguments); _sendUrl(); };
    history.replaceState = function () { _replace.apply(history, arguments); _sendUrl(); };
    window.addEventListener('popstate',   _sendUrl);
    window.addEventListener('hashchange', _sendUrl);
  }

  // ── 12. Session ID persistence ────────────────────────────────────────────

  function _getOrCreateSessionId() {
    var key = 's247_sid_' + apiKey.slice(0, 8);
    try {
      var existing = sessionStorage.getItem(key);
      if (existing) return existing;
      var id = 's247-' + _uuid();
      sessionStorage.setItem(key, id);
      return id;
    } catch (_) {
      return 's247-' + _uuid();
    }
  }

  function _uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // ── 13. Public JS API ─────────────────────────────────────────────────────

  function _exposePublicApi() {
    var queue = window._s247q || [];

    function handler(cmd) {
      var args = Array.prototype.slice.call(arguments, 1);
      switch (cmd) {
        case 'show':  _showPanel();  break;
        case 'hide':  _hidePanel();  break;
        case 'track':
          _postToIframe({ type: 'support247:track', event: args[0], context: args[1] || {} });
          break;
      }
    }

    // Replay queued calls before the SDK loaded
    for (var i = 0; i < queue.length; i++) {
      handler.apply(null, queue[i]);
    }

    window.Support247Widget = handler;
  }

})();
