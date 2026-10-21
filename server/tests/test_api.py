"""API tests use a purpose-built test double; PostgreSQL has a separate integration test."""
from copy import deepcopy
from hashlib import sha256
import json
import os

from fastapi.testclient import TestClient
import pytest

from server.main import MAX_BODY, create_app
from server.store import PostgresStore

EMPTY = {'version': 1, 'profile': None, 'attempts': [], 'mastery': {}}


class MemoryStore:
    def __init__(self):
        self.accounts = {}

    def open(self):
        pass

    def close(self):
        pass

    def ready(self):
        pass

    def create(self, token_hash):
        self.accounts[token_hash] = None

    def read(self, token_hash):
        return token_hash in self.accounts, deepcopy(self.accounts.get(token_hash))

    def write(self, token_hash, progress):
        if token_hash not in self.accounts:
            return False
        self.accounts[token_hash] = deepcopy(progress)
        return True

    def delete(self, token_hash):
        existed = token_hash in self.accounts
        self.accounts.pop(token_hash, None)
        return existed


@pytest.fixture
def client():
    with TestClient(create_app(MemoryStore())) as client:
        yield client


def session(client):
    response = client.post('/v1/sessions')
    assert response.status_code == 201
    return {'Authorization': f"Bearer {response.json()['token']}"}


def test_auth_isolation_and_deletion(client):
    first, second = session(client), session(client)
    token = first['Authorization'].split()[1]
    assert len(token) == 43
    assert token not in client.app.state.store.accounts
    assert sha256(token.encode()).hexdigest() in client.app.state.store.accounts
    assert client.get('/v1/progress').status_code == 401
    assert client.get('/v1/progress', headers={'Authorization': 'Bearer ' + 'x' * 43}).status_code == 401
    assert client.put('/v1/progress', headers=first, json={'progress': EMPTY}).status_code == 200
    assert client.get('/v1/progress', headers=first).json() == {'progress': EMPTY}
    assert client.get('/v1/progress', headers=second).json() == {'progress': None}
    assert client.delete('/v1/account', headers=first).status_code == 204
    assert client.get('/v1/progress', headers=first).status_code == 401
    assert client.get('/v1/progress', headers=second).status_code == 200


@pytest.mark.parametrize('diagnostic', ['input', 'overlap'])
def test_diagnostic_summary_roundtrip_rejects_video(client, diagnostic):
    headers = session(client)
    progress = {**EMPTY, 'attempts': [{
        'id': 'diagnostic', 'exerciseId': 'first-light-bass', 'skill': 'strings',
        'at': '2026-10-19T15:42:00Z', 'bpm': 55, 'seconds': 17,
        'evidence': {'confidence': 'low', 'score': None, 'pitchAccuracy': None,
                     'timingMs': None, 'missed': 0, 'extra': 8, 'consistency': None,
                     'diagnostic': diagnostic, 'matched': 7, 'expected': 8, 'observed': 16,
                     'message': 'Check detection before repeating.'}}]}
    assert client.put('/v1/progress', headers=headers, json={'progress': progress}).status_code == 200
    assert client.get('/v1/progress', headers=headers).json()['progress'] == progress
    progress['attempts'][0]['evidence']['video'] = 'blob:private'
    assert client.put('/v1/progress', headers=headers, json={'progress': progress}).status_code == 422
    del progress['attempts'][0]['evidence']['video']
    progress['attempts'][0]['evidence']['diagnostic'] = None
    assert client.put('/v1/progress', headers=headers, json={'progress': progress}).status_code == 422


@pytest.mark.parametrize('change', [
    {'version': 2}, {'untrusted': True}, {'mastery': {'other': {}}},
    {'profile': {'instrument': 'electric', 'experience': 'new', 'styles': [], 'goal': 'Metal', 'minutes': 0}},
    {'attempts': [{}] * 501},
])
def test_rejects_invalid_progress_without_overwriting(client, change):
    headers = session(client)
    client.put('/v1/progress', headers=headers, json={'progress': EMPTY})
    response = client.put('/v1/progress', headers=headers, json={'progress': {**EMPTY, **change}})
    assert response.status_code == 422
    assert client.get('/v1/progress', headers=headers).json() == {'progress': EMPTY}


def test_bounded_body_and_sessions(client):
    response = client.put('/v1/progress', content=b' ' * (MAX_BODY + 1))
    assert response.status_code == 413
    for _ in range(20):
        assert client.post('/v1/sessions').status_code == 201
    response = client.post('/v1/sessions')
    assert response.status_code == 429
    assert response.headers['retry-after'] == '60'


def test_full_attempt_contract_and_rejects_nonfinite_scores(client):
    headers = session(client)
    attempt = {
        'id': 'quiz-1', 'exerciseId': 'theory-note', 'skill': 'theory',
        'at': '2026-10-18T10:00:00Z', 'bpm': 0, 'seconds': 12,
        'evidence': {'confidence': 'high', 'score': 100, 'pitchAccuracy': None,
                     'timingMs': None, 'missed': 0, 'extra': 0,
                     'consistency': None, 'message': 'Correct note.'},
    }
    progress = {**EMPTY, 'attempts': [attempt]}
    response = client.put('/v1/progress', headers=headers, json={'progress': progress})
    assert response.status_code == 200
    assert 'weakestTransition' not in response.json()['progress']['attempts'][0]['evidence']
    duplicate = {**progress, 'attempts': [attempt, attempt]}
    assert client.put('/v1/progress', headers=headers, json={'progress': duplicate}).status_code == 422
    invalid = deepcopy(progress)
    invalid['attempts'][0]['evidence']['score'] = 101
    assert client.put('/v1/progress', headers=headers, json={'progress': invalid}).status_code == 422
    invalid['attempts'][0]['at'] = 'yesterday'
    assert client.put('/v1/progress', headers=headers, json={'progress': invalid}).status_code == 422
    invalid = deepcopy(progress)
    invalid['attempts'][0]['evidence']['score'] = float('nan')
    assert client.put('/v1/progress', headers={**headers, 'Content-Type': 'application/json'}, content=json.dumps({'progress': invalid})).status_code == 422
    assert client.get('/v1/progress', headers=headers).json() == {'progress': progress}


def test_health_and_noncacheable_responses(client):
    assert client.get('/healthz').json() == {'status': 'ok'}
    response = client.get('/readyz')
    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store'
    client.app.state.store.ready = lambda: (_ for _ in ()).throw(RuntimeError('private connection string'))
    response = client.get('/readyz')
    assert response.status_code == 503
    assert 'private connection' not in response.text


def test_cors(monkeypatch):
    monkeypatch.setenv('CORS_ORIGINS', 'https://riff.example')
    with TestClient(create_app(MemoryStore())) as client:
        good = client.options('/v1/progress', headers={'Origin': 'https://riff.example', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'Authorization,Content-Type'})
        assert good.headers['access-control-allow-origin'] == 'https://riff.example'
        bad = client.options('/v1/progress', headers={'Origin': 'https://evil.example', 'Access-Control-Request-Method': 'PUT'})
        assert 'access-control-allow-origin' not in bad.headers


@pytest.mark.skipif(not os.getenv('TEST_DATABASE_URL'), reason='Set TEST_DATABASE_URL to a disposable PostgreSQL database')
def test_postgres_round_trip_and_restart():
    database_url = os.environ['TEST_DATABASE_URL']
    first_store = PostgresStore(database_url)
    with TestClient(create_app(first_store)) as client:
        headers = session(client)
        assert client.put('/v1/progress', headers=headers, json={'progress': EMPTY}).status_code == 200
    try:
        with TestClient(create_app(PostgresStore(database_url))) as client:
            assert client.get('/v1/progress', headers=headers).json() == {'progress': EMPTY}
            assert client.delete('/v1/account', headers=headers).status_code == 204
            assert client.get('/v1/progress', headers=headers).status_code == 401
    finally:
        cleanup = PostgresStore(database_url)
        cleanup.open()
        cleanup.delete(sha256(headers['Authorization'].split()[1].encode()).hexdigest())
        cleanup.close()
