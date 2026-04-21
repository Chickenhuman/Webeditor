const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

function requirePlaywrightTest() {
    try {
        return require("@playwright/test");
    } catch (error) {
        const npxCache = path.join(os.homedir(), ".npm", "_npx");
        if (!fs.existsSync(npxCache)) throw error;

        const candidates = fs.readdirSync(npxCache)
            .map((entry) => path.join(npxCache, entry, "node_modules", "@playwright", "test"))
            .filter((candidate) => fs.existsSync(candidate))
            .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

        if (!candidates.length) throw error;
        return require(candidates[0]);
    }
}

const { test, expect } = requirePlaywrightTest();

const repoRoot = path.resolve(__dirname, "..");

const mimeTypes = {
    ".html": "text/html;charset=utf-8",
    ".js": "text/javascript;charset=utf-8",
    ".css": "text/css;charset=utf-8",
    ".json": "application/json;charset=utf-8",
};

let server;
let baseURL;

function serveStatic(request, response) {
    const url = new URL(request.url, "http://127.0.0.1");
    const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    const requestedPath = safePath === "/" ? "/launcher.html" : safePath;
    const filePath = path.join(repoRoot, requestedPath);

    if (!filePath.startsWith(repoRoot)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
    }

    fs.readFile(filePath, (error, data) => {
        if (error) {
            response.writeHead(404);
            response.end("Not found");
            return;
        }

        response.writeHead(200, {
            "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
        });
        response.end(data);
    });
}

test.beforeAll(async () => {
    server = http.createServer(serveStatic);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    baseURL = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
});

test("launcher opens isolated test mode without touching production storage", async ({ page }) => {
    const browserErrors = [];
    page.on("console", (message) => {
        if (message.type() === "error") browserErrors.push(message.text());
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));

    await page.goto(`${baseURL}/launcher.html`);
    await expect(page.getByTestId("open-production")).toBeVisible();
    await expect(page.getByTestId("open-test")).toBeVisible();

    await page.evaluate(() => {
        localStorage.setItem("novelLibrary", "__production_library__");
        localStorage.setItem("editorSettings", "__production_settings__");
        localStorage.setItem("characterList", "__production_characters__");
    });

    await page.getByTestId("open-test").click();
    await expect(page).toHaveURL(/\/test\/index\.html$/);
    await expect(page.locator("#modeBadge")).toHaveText("TEST MODE");
    await expect(page.locator("#userInfoDisplay")).toContainText("Mock Cloud");
    await expect(page.locator("#sidebarTitle")).toContainText("샘플 판타지 원고");

    await page.locator("#btnSettings").click();
    const popupBox = await page.locator("#settingsPopup").boundingBox();
    const toolbarBox = await page.locator(".top-bar").boundingBox();
    const editorBox = await page.locator("#editorWrapper").boundingBox();
    expect(popupBox).not.toBeNull();
    expect(toolbarBox).not.toBeNull();
    expect(editorBox).not.toBeNull();
    expect(popupBox.y).toBeGreaterThan(toolbarBox.y);
    expect(popupBox.y).toBeLessThan(editorBox.y + 80);
    await page.locator("#btnRunLineBreak").click();

    await page.locator("#mainEditor").fill("회귀 테스트 원고입니다.");
    await page.locator("#titleInput").fill("회귀 테스트 챕터");
    await page.getByTestId("save-button").click();
    await expect(page.locator("#lastSavedDisplay")).toContainText(/Mock Cloud|Test Local/);

    await page.reload();
    await expect(page.locator("#titleInput")).toHaveValue("회귀 테스트 챕터");
    await expect(page.locator("#mainEditor")).toContainText("회귀 테스트 원고입니다.");

    await page.locator("#libraryHomeBtn").click();
    page.once("dialog", (dialog) => dialog.accept("회귀 테스트 소설"));
    await page.getByTestId("sidebar-action").click();
    await expect(page.locator("#sidebarTitle")).toContainText("회귀 테스트 소설");

    await page.locator("#btnCharacters").click();
    await page.locator("#btnAddCharacter").click();
    await page.locator("#charName").fill("테스트 캐릭터");
    await page.locator("#charRole").fill("회귀 검증자");
    await page.locator("#btnSaveCharacter").click();
    await expect(page.locator("#characterList")).toContainText("테스트 캐릭터");
    await page.locator("#btnCloseCharacters").click();

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#btnSnapshotSave").click();
    await page.locator("#btnSnapshots").click();
    await expect(page.locator("#snapshotList")).toContainText("소설");

    const storageState = await page.evaluate(() => ({
        productionLibrary: localStorage.getItem("novelLibrary"),
        productionSettings: localStorage.getItem("editorSettings"),
        productionCharacters: localStorage.getItem("characterList"),
        testLibrary: localStorage.getItem("webeditor:test:library"),
        testSettings: localStorage.getItem("webeditor:test:settings"),
        testCharacters: localStorage.getItem("webeditor:test:characters"),
    }));

    expect(storageState.productionLibrary).toBe("__production_library__");
    expect(storageState.productionSettings).toBe("__production_settings__");
    expect(storageState.productionCharacters).toBe("__production_characters__");
    expect(storageState.testLibrary).toContain("회귀 테스트 소설");
    expect(storageState.testSettings).toContain("targetCount");
    expect(storageState.testCharacters).toContain("테스트 캐릭터");
    expect(browserErrors).toEqual([]);
});
