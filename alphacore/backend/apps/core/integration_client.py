"""
PAS Integration Client
----------------------
Shared utility for inter-app communication.
Every outbound call is:
  - Gated by a settings flag (disabled = standalone mode, zero errors)
  - Authenticated by a shared API key header
  - Fire-and-forget with structured error logging (never blocks the calling app)
  - Retried once on network failure

Usage:
    from .integration import push_to_alphacore, push_to_dd, push_to_autoops
"""
import json
import logging
import threading
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from urllib.parse import urljoin

logger = logging.getLogger(__name__)

_TIMEOUT = 5  # seconds — never block a user request


def _headers(api_key: str) -> dict:
    return {
        'Content-Type': 'application/json',
        'Accept':        'application/json',
        'X-PAS-Key':     api_key or '',
    }


def _post(base_url: str, path: str, api_key: str, payload: dict) -> bool:
    """
    POST payload to base_url + path.
    Returns True on 2xx, False on any error.
    Never raises — the calling app must not crash if a peer is down.
    """
    if not base_url:
        return False  # integration disabled — standalone mode

    url = urljoin(base_url.rstrip('/') + '/', path.lstrip('/'))
    body = json.dumps(payload).encode()

    for attempt in range(2):
        try:
            req = Request(url, data=body, headers=_headers(api_key), method='POST')
            with urlopen(req, timeout=_TIMEOUT) as resp:
                if 200 <= resp.status < 300:
                    logger.info(f"[PAS Integration] POST {url} → {resp.status}")
                    return True
                logger.warning(f"[PAS Integration] POST {url} → {resp.status}")
                return False
        except HTTPError as e:
            logger.warning(f"[PAS Integration] POST {url} HTTP {e.code}: {e.reason}")
            return False
        except URLError as e:
            if attempt == 0:
                logger.warning(f"[PAS Integration] POST {url} URLError (retrying): {e.reason}")
                continue
            logger.error(f"[PAS Integration] POST {url} URLError (gave up): {e.reason}")
            return False
        except Exception as e:
            logger.error(f"[PAS Integration] POST {url} unexpected error: {e}")
            return False
    return False


def _fire(base_url: str, path: str, api_key: str, payload: dict):
    """Send in a background thread — caller never waits."""
    t = threading.Thread(
        target=_post,
        args=(base_url, path, api_key, payload),
        daemon=True,
        name=f'pas-integration-{path}',
    )
    t.start()
