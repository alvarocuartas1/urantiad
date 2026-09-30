"""Where the current request comes from (client IP and browser), for the audit log.

A pure ASGI middleware stores it in a `ContextVar`, so services record it without receiving
it as a parameter. Outside a request (the CLI) it is empty.
"""

from contextvars import ContextVar
from dataclasses import dataclass
from ipaddress import IPv4Address, IPv6Address, ip_address

from starlette.types import ASGIApp, Receive, Scope, Send

USER_AGENT_MAX_LENGTH = 255


@dataclass(frozen=True)
class RequestOrigin:
    ip_address: IPv4Address | IPv6Address | None = None
    user_agent: str | None = None


NO_ORIGIN = RequestOrigin()
_origin: ContextVar[RequestOrigin | None] = ContextVar("request_origin", default=None)


def current_origin() -> RequestOrigin:
    return _origin.get() or NO_ORIGIN


def _valid_ip(host: str | None) -> IPv4Address | IPv6Address | None:
    """`host` if it is an IP address (test clients report names such as "testclient")."""
    if not host:
        return None
    try:
        return ip_address(host)
    except ValueError:
        return None


class RequestOriginMiddleware:
    """Store the client IP and User-Agent of each HTTP request.

    The IP is the connection's peer. Behind a reverse proxy, uvicorn's `--proxy-headers`
    (trusting only the proxy) replaces it with the real client: the app never reads
    `X-Forwarded-For` itself, which any client could forge."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        client = scope.get("client")
        user_agent = next(
            (value for name, value in scope["headers"] if name == b"user-agent"), b""
        ).decode("latin-1")
        token = _origin.set(
            RequestOrigin(
                ip_address=_valid_ip(client[0] if client else None),
                user_agent=user_agent[:USER_AGENT_MAX_LENGTH] or None,
            )
        )
        try:
            await self.app(scope, receive, send)
        finally:
            _origin.reset(token)
