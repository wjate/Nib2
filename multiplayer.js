const ROOM_TTL_SECONDS = 60 * 60 * 6;
const MAX_INPUT_QUEUE = 60;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {'content-type': 'application/json; charset=utf-8'}
    });
}

function fail(message, status = 400) {
    return json({ok: false, error: message}, status);
}

function normalizeCode(raw) {
    return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function randomId(length = 24) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function sanitizeName(raw, fallback = 'Player') {
    const name = String(raw || '').trim().slice(0, 24);
    return name || fallback;
}

function sanitizeDirection(direction) {
    const dx = Number(direction?.dx);
    const dy = Number(direction?.dy);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
    if (!((Math.abs(dx) > 0 && dy === 0) || (Math.abs(dy) > 0 && dx === 0))) return null;
    return {dx, dy};
}

function sanitizePlayer(player) {
    return {
        id: player.id,
        name: player.name,
        isHost: player.isHost === true
    };
}

function findPlayerByToken(room, token) {
    return (room.players || []).find((p) => p.token === token) || null;
}

function isHost(room, token) {
    const player = findPlayerByToken(room, token);
    return Boolean(player && player.isHost);
}

function normalizeRoom(room) {
    return {
        roomCode: room.roomCode,
        maxPlayers: Math.max(2, Math.min(5, Number(room.maxPlayers || 5))),
        deathResetsAll: room.deathResetsAll !== false,
        started: room.started === true,
        state: room.state || null,
        players: Array.isArray(room.players) ? room.players : [],
        inputQueues: room.inputQueues && typeof room.inputQueues === 'object' ? room.inputQueues : {},
        createdAt: Number(room.createdAt || Date.now()),
        updatedAt: Number(room.updatedAt || Date.now())
    };
}

async function loadRoom(kv, roomCode) {
    const raw = await kv.get(`room:${roomCode}`);
    if (!raw) return null;
    try {
        return normalizeRoom(JSON.parse(raw));
    } catch {
        return null;
    }
}

async function saveRoom(kv, room) {
    const normalized = normalizeRoom(room);
    normalized.updatedAt = Date.now();
    await kv.put(`room:${normalized.roomCode}`, JSON.stringify(normalized), {
        expirationTtl: ROOM_TTL_SECONDS
    });
}

async function createUniqueRoomCode(kv, tries = 7) {
    for (let i = 0; i < tries; i++) {
        const code = randomId(6);
        const existing = await loadRoom(kv, code);
        if (!existing) return code;
    }
    return '';
}

function validateBinding(env) {
    if (!env || !env.NIBBLES_ROOMS) {
        return 'Missing KV binding `NIBBLES_ROOMS`. Add it in your Cloudflare Pages project.';
    }
    return '';
}

function publicRoomResponse(room, token) {
    const you = findPlayerByToken(room, token);
    return {
        ok: true,
        roomCode: room.roomCode,
        started: room.started === true,
        maxPlayers: room.maxPlayers,
        deathResetsAll: room.deathResetsAll !== false,
        players: (room.players || []).map(sanitizePlayer),
        playerId: you?.id || ''
    };
}

export async function onRequest(context) {
    const {request, env} = context;
    const bindingError = validateBinding(env);
    if (bindingError) return fail(bindingError, 500);

    if (request.method === 'GET') {
        const params = new URL(request.url).searchParams;
        const action = params.get('action');
        if (action !== 'fetch') return fail('Unsupported GET action.');

        const roomCode = normalizeCode(params.get('roomCode'));
        const token = String(params.get('token') || '');
        if (!roomCode || !token) return fail('Missing roomCode or token.');

        const room = await loadRoom(env.NIBBLES_ROOMS, roomCode);
        if (!room) return fail('Room not found.', 404);
        const player = findPlayerByToken(room, token);
        if (!player) return fail('Unauthorized.', 403);

        return json({
            ...publicRoomResponse(room, token),
            state: room.state || null
        });
    }

    if (request.method !== 'POST') {
        return fail('Method not allowed.', 405);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return fail('Invalid JSON body.');
    }
    const action = String(body.action || '');
    if (!action) return fail('Missing action.');

    if (action === 'create') {
        const roomCode = await createUniqueRoomCode(env.NIBBLES_ROOMS);
        if (!roomCode) return fail('Unable to create room. Please retry.', 500);

        const token = randomId(24);
        const playerId = randomId(10);
        const playerName = sanitizeName(body.playerName, 'Host');
        const maxPlayers = Math.max(2, Math.min(5, Number(body.maxPlayers || 5)));
        const deathResetsAll = body.deathResetAll !== false;
        const room = {
            roomCode,
            maxPlayers,
            deathResetsAll,
            started: false,
            state: null,
            players: [{
                id: playerId,
                token,
                name: playerName,
                isHost: true
            }],
            inputQueues: {},
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        await saveRoom(env.NIBBLES_ROOMS, room);
        return json({
            ok: true,
            roomCode,
            token,
            playerId,
            players: room.players.map(sanitizePlayer),
            maxPlayers,
            deathResetsAll
        });
    }

    const roomCode = normalizeCode(body.roomCode);
    if (!roomCode) return fail('Missing roomCode.');
    const room = await loadRoom(env.NIBBLES_ROOMS, roomCode);
    if (!room) return fail('Room not found.', 404);

    if (action === 'join') {
        if ((room.players || []).length >= room.maxPlayers) {
            return fail('Room is full.', 409);
        }
        const token = randomId(24);
        const playerId = randomId(10);
        const playerName = sanitizeName(body.playerName, 'Player');
        room.players.push({
            id: playerId,
            token,
            name: playerName,
            isHost: false
        });
        await saveRoom(env.NIBBLES_ROOMS, room);
        return json({
            ok: true,
            token,
            playerId,
            players: room.players.map(sanitizePlayer),
            started: room.started === true,
            maxPlayers: room.maxPlayers,
            deathResetsAll: room.deathResetsAll !== false
        });
    }

    const token = String(body.token || '');
    if (!token) return fail('Missing token.');
    const you = findPlayerByToken(room, token);
    if (!you) return fail('Unauthorized.', 403);

    if (action === 'status') {
        return json(publicRoomResponse(room, token));
    }

    if (action === 'leave') {
        const leavingHost = you.isHost === true;
        room.players = (room.players || []).filter((p) => p.token !== token);
        if (!room.players.length || leavingHost) {
            await env.NIBBLES_ROOMS.delete(`room:${roomCode}`);
            return json({ok: true, removed: true});
        }
        if (!room.players.some((p) => p.isHost)) {
            room.players[0].isHost = true;
        }
        room.started = false;
        room.state = null;
        room.inputQueues = {};
        await saveRoom(env.NIBBLES_ROOMS, room);
        return json({ok: true, removed: false});
    }

    if (action === 'state') {
        if (!isHost(room, token)) return fail('Only host can update state.', 403);
        room.state = body.state || null;
        room.started = body.started === true;
        await saveRoom(env.NIBBLES_ROOMS, room);
        return json({ok: true});
    }

    if (action === 'input') {
        const direction = sanitizeDirection(body.direction);
        if (!direction) return fail('Invalid direction.');
        const queue = Array.isArray(room.inputQueues[you.id]) ? room.inputQueues[you.id] : [];
        queue.push(direction);
        if (queue.length > MAX_INPUT_QUEUE) {
            queue.splice(0, queue.length - MAX_INPUT_QUEUE);
        }
        room.inputQueues[you.id] = queue;
        await saveRoom(env.NIBBLES_ROOMS, room);
        return json({ok: true});
    }

    if (action === 'consumeInputs') {
        if (!isHost(room, token)) return fail('Only host can consume inputs.', 403);
        const inputsByPlayer = room.inputQueues || {};
        room.inputQueues = {};
        await saveRoom(env.NIBBLES_ROOMS, room);
        return json({ok: true, inputsByPlayer});
    }

    return fail('Unknown action.');
}
