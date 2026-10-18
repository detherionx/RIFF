"""Optional private progress sync. Local learning needs no running backend."""
from collections import deque
from contextlib import asynccontextmanager
from hashlib import sha256
import os
import re
import secrets
from threading import Lock
from time import monotonic

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.responses import JSONResponse

from server.models import ProgressRead, ProgressWrite, Session
from server.store import PostgresStore

MAX_BODY = 1_048_576
bearer = HTTPBearer(auto_error=False)


class BodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        chunks, size = [], 0
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            size += len(message.get('body', b''))
            if size > MAX_BODY:
                return await JSONResponse({'detail': 'Request exceeds 1 MiB'}, status_code=413)(scope, receive, send)
            chunks.append(message.get('body', b''))
            if not message.get('more_body', False):
                break
        body = b''.join(chunks)
        delivered = False

        async def bounded_receive():
            nonlocal delivered
            if delivered:
                return await receive()
            delivered = True
            return {'type': 'http.request', 'body': body, 'more_body': False}

        await self.app(scope, bounded_receive, send)


def create_app(store=None):
    @asynccontextmanager
    async def lifespan(app):
        if store is None:
            database_url = os.getenv('DATABASE_URL')
            if not database_url:
                raise RuntimeError('DATABASE_URL is required for the optional sync API')
            app.state.store = PostgresStore(database_url)
        else:
            app.state.store = store
        app.state.store.open()
        try:
            yield
        finally:
            app.state.store.close()

    app = FastAPI(title='RIFF optional progress API', version='1.0.0', lifespan=lifespan)
    app.add_middleware(BodyLimit)
    origins = [origin.strip() for origin in os.getenv('CORS_ORIGINS', '').split(',') if origin.strip()]
    if '*' in origins:
        raise ValueError('CORS_ORIGINS must list explicit origins')
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['GET', 'PUT', 'POST', 'DELETE'], allow_headers=['Authorization', 'Content-Type'])
    creation_times = deque()
    creation_lock = Lock()

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, error):
        # Never echo whole progress objects, or non-JSON numbers, into errors.
        return JSONResponse({'detail': [
            {'loc': item['loc'], 'msg': item['msg'], 'type': item['type']}
            for item in error.errors()
        ]}, status_code=422)

    @app.middleware('http')
    async def private_responses(request, call_next):
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    def identity(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
        if not credentials or credentials.scheme.lower() != 'bearer' or not re.fullmatch(r'[A-Za-z0-9_-]{43}', credentials.credentials):
            raise HTTPException(401, 'A valid device token is required', headers={'WWW-Authenticate': 'Bearer'})
        token_hash = sha256(credentials.credentials.encode()).hexdigest()
        exists, _ = app.state.store.read(token_hash)
        if not exists:
            raise HTTPException(401, 'Device token is invalid or deleted', headers={'WWW-Authenticate': 'Bearer'})
        return token_hash

    @app.get('/healthz')
    def health():
        return {'status': 'ok'}

    @app.get('/readyz')
    def ready():
        try:
            app.state.store.ready()
        except Exception:
            raise HTTPException(503, 'Database unavailable') from None
        return {'status': 'ready'}

    @app.post('/v1/sessions', response_model=Session, status_code=201)
    def create_session():
        # honey: per-process global limit; use a shared gateway limit before scaling replicas.
        with creation_lock:
            now = monotonic()
            while creation_times and creation_times[0] < now - 60:
                creation_times.popleft()
            if len(creation_times) >= 20:
                raise HTTPException(429, 'Try again in one minute', headers={'Retry-After': '60'})
            creation_times.append(now)
        token = secrets.token_urlsafe(32)
        app.state.store.create(sha256(token.encode()).hexdigest())
        return Session(token=token)

    @app.get('/v1/progress', response_model=ProgressRead, response_model_exclude_unset=True)
    def read_progress(token_hash: str = Depends(identity)):
        exists, progress = app.state.store.read(token_hash)
        if not exists:
            raise HTTPException(401, 'Device token is invalid or deleted')
        return {'progress': progress}

    @app.put('/v1/progress', response_model=ProgressRead, response_model_exclude_unset=True)
    def write_progress(body: ProgressWrite, token_hash: str = Depends(identity)):
        progress = body.progress.model_dump(mode='json', exclude_unset=True)
        if not app.state.store.write(token_hash, progress):
            raise HTTPException(401, 'Device token is invalid or deleted')
        return {'progress': progress}

    @app.delete('/v1/account', status_code=204)
    def delete_account(token_hash: str = Depends(identity)):
        app.state.store.delete(token_hash)
        return Response(status_code=204)

    return app


app = create_app()
