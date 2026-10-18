import assert from "node:assert/strict";
const origin = new URL(process.argv[2]).origin;
assert.ok(
  origin.startsWith("https://") || origin.startsWith("http://localhost"),
  "Use HTTPS or localhost",
);
const tokens = [];
async function request(path, method = "GET", token, body) {
  return fetch(origin + "/api/cloud/" + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
}
try {
  assert.equal((await fetch(origin)).status, 200, "App serves HTTPS");
  assert.equal(
    (await request("progress")).status,
    401,
    "Progress requires a private token",
  );
  for (let i = 0; i < 2; i++) {
    const response = await request("sessions", "POST");
    assert.equal(response.status, 201, "Session created");
    tokens.push((await response.json()).token);
  }
  const progress = {
    version: 1,
    profile: {
      instrument: "electric",
      experience: "returning",
      styles: ["Rock"],
      goal: "Deployment smoke test",
      minutes: 10,
    },
    attempts: [],
    mastery: {},
  };
  assert.equal(
    (await request("progress", "PUT", tokens[0], { progress })).status,
    200,
    "Backup saved",
  );
  assert.deepEqual(
    (await (await request("progress", "GET", tokens[0])).json()).progress,
    progress,
    "Backup restored exactly",
  );
  assert.equal(
    (await (await request("progress", "GET", tokens[1])).json()).progress,
    null,
    "Second account cannot see first account progress",
  );
  assert.equal(
    (
      await request("progress", "PUT", tokens[0], {
        progress: { ...progress, version: 99 },
      })
    ).status,
    422,
    "Invalid data rejected",
  );
  assert.deepEqual(
    (await (await request("progress", "GET", tokens[0])).json()).progress,
    progress,
    "Rejected write preserves prior data",
  );
  console.log(
    "PASS: HTTPS, authentication, PostgreSQL backup/restore, account isolation, validation and data preservation.",
  );
} finally {
  for (const token of tokens) {
    assert.equal(
      (await request("account", "DELETE", token)).status,
      204,
      "Disposable test account deleted",
    );
    assert.equal(
      (await request("progress", "GET", token)).status,
      401,
      "Deleted token rejected",
    );
  }
  if (tokens.length)
    console.log(
      "PASS: disposable test accounts removed; no credentials logged.",
    );
}
