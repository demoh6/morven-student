import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import Client from "socket.io-client";
import { startBackend } from "./helpers/server.mjs";
import { register } from "./helpers/auth.mjs";

/**
 * Regression coverage for cross-user synchronization: when one member edits a
 * group (e.g. changes its avatar), every other authorized member must be told
 * via the existing socket layer — whether they are currently viewing the group
 * (group room) or anywhere else in the app (personal room).
 */

async function createGroup(baseUrl, token, name) {
  const res = await fetch(`${baseUrl}/api/groups`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return (await res.json()).group;
}

async function joinGroup(baseUrl, token, joinCode) {
  const res = await fetch(`${baseUrl}/api/groups/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ joinCode }),
  });
  return res.status;
}

function patchName(baseUrl, token, groupId, name) {
  return fetch(`${baseUrl}/api/groups/${groupId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

function connectClient(baseUrl, token) {
  return Client(`${baseUrl}/connect`, {
    auth: { token },
    transports: ["websocket"],
    forceNew: true,
  });
}

function waitForConnect(client, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket connect timeout")), timeoutMs);
    client.on("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    client.on("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitForGroupUpdate(client, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("group-update timeout")), timeoutMs);
    client.on("group-update", (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe("Group update propagation over Socket.IO", () => {
  let server;
  let baseUrl;

  before(async () => {
    server = await startBackend();
    baseUrl = server.baseUrl;
  });

  after(async () => {
    await server?.stop();
  });

  it("delivers a group update to a member connected elsewhere (personal room)", async () => {
    const owner = await register(baseUrl, "sockowner");
    const member = await register(baseUrl, "sockmember");
    const group = await createGroup(baseUrl, owner.accessToken, "Socket Group A");
    assert.equal(await joinGroup(baseUrl, member.accessToken, group.joinCode), 200);

    // Member connects but does NOT join the group room — models the groups list
    // / any other screen. Delivery must still happen via the personal room.
    const client = connectClient(baseUrl, member.accessToken);
    try {
      await waitForConnect(client);
      const updatePromise = waitForGroupUpdate(client);

      const res = await patchName(baseUrl, owner.accessToken, group.id, "Socket Group A Renamed");
      assert.equal(res.status, 200);

      const update = await updatePromise;
      assert.equal(update.groupId, group.id);
      assert.equal(update.group.name, "Socket Group A Renamed");
    } finally {
      client.close();
    }
  });

  it("delivers a group update to a member viewing the group room", async () => {
    const owner = await register(baseUrl, "sockowner2");
    const member = await register(baseUrl, "sockmember2");
    const group = await createGroup(baseUrl, owner.accessToken, "Socket Group B");
    assert.equal(await joinGroup(baseUrl, member.accessToken, group.joinCode), 200);

    const client = connectClient(baseUrl, member.accessToken);
    try {
      await waitForConnect(client);

      // Join the group room and wait until the server has processed it (the
      // presence snapshot is emitted after the room join completes).
      const joined = new Promise((resolve) => {
        client.on("group-presence-update", () => resolve());
      });
      client.emit("join-group", { groupId: group.id });
      await joined;

      const updatePromise = waitForGroupUpdate(client);
      const res = await patchName(baseUrl, owner.accessToken, group.id, "Socket Group B Renamed");
      assert.equal(res.status, 200);

      const update = await updatePromise;
      assert.equal(update.groupId, group.id);
      assert.equal(update.group.name, "Socket Group B Renamed");
    } finally {
      client.close();
    }
  });
});
