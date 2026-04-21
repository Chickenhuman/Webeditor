const LOCK_VERSION = 1;
const HASH_ALGORITHM = "SHA-256";

export function isNovelLocked(novel) {
    return Boolean(novel?.passwordLock?.hash || novel?.password);
}

export async function createPasswordLock(password, salt = createSalt()) {
    return {
        version: LOCK_VERSION,
        algorithm: HASH_ALGORITHM,
        salt,
        hash: await digestPassword(password, salt),
    };
}

export async function verifyNovelPassword(novel, password) {
    if (!novel) return false;
    if (typeof password !== "string") return false;

    if (novel.passwordLock?.hash && novel.passwordLock?.salt) {
        const hash = await digestPassword(password, novel.passwordLock.salt);
        return timingSafeEqual(hash, novel.passwordLock.hash);
    }

    // Legacy test data may still contain a plain password. It is migrated after a valid unlock.
    return Boolean(novel.password) && password === novel.password;
}

export async function migrateLegacyPasswordLock(novel) {
    if (!novel) return false;

    if (novel.password && !novel.passwordLock) {
        novel.passwordLock = await createPasswordLock(novel.password);
        delete novel.password;
        return true;
    }

    if (novel.password && novel.passwordLock) {
        delete novel.password;
        return true;
    }

    return false;
}

export async function migrateLibraryPasswordLocks(library) {
    if (!Array.isArray(library)) return false;

    let changed = false;
    for (const novel of library) {
        if (await migrateLegacyPasswordLock(novel)) changed = true;
    }
    return changed;
}

async function digestPassword(password, salt) {
    const data = new TextEncoder().encode(`${salt}:${password}`);
    const digest = await crypto.subtle.digest(HASH_ALGORITHM, data);
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

function createSalt() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

function timingSafeEqual(left, right) {
    if (typeof left !== "string" || typeof right !== "string") return false;
    if (left.length !== right.length) return false;

    let result = 0;
    for (let index = 0; index < left.length; index += 1) {
        result |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return result === 0;
}
