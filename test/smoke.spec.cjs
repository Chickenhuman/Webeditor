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
test.setTimeout(60000);

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

    await page.locator("#btnHtmlMode").click();
    await page.locator("#htmlSourceEditor").fill([
        '<img src="x" onerror="window.__xss = 1">',
        '<b onclick="window.__xss = 1">굵은 안전 문장</b>',
        '<script>window.__xss = 1</script>',
        '<div data-risk="1">일반 문장</div>',
    ].join(""));
    await page.locator("#btnHtmlMode").click();
    await page.getByTestId("save-button").click();
    const sanitizedHtml = await page.locator("#mainEditor").evaluate((node) => node.innerHTML);
    expect(sanitizedHtml).toContain("<b>굵은 안전 문장</b>");
    expect(sanitizedHtml).toContain("<div>일반 문장</div>");
    expect(sanitizedHtml).not.toContain("script");
    expect(sanitizedHtml).not.toContain("onerror");
    expect(sanitizedHtml).not.toContain("onclick");
    expect(sanitizedHtml).not.toContain("data-risk");
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();

    await page.reload();
    await expect(page.locator("#mainEditor")).toContainText("굵은 안전 문장");
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();

    await page.locator("#mainEditor").fill("");
    await page.locator("#mainEditor").click();
    await page.locator("#symbolGroup .btn-symbol").first().click();
    await expect(page.locator("#mainEditor")).toContainText("「」");

    await page.locator("#mainEditor").fill("alpha beta alpha");
    await page.locator("#btnSearch").click();
    await page.locator("#findInput").fill("alpha");
    await page.locator("#replaceInput").fill("gamma");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#btnReplaceAll").click();
    await expect(page.locator("#mainEditor")).toContainText("gamma beta gamma");

    await page.locator("#mainEditor").fill("문장. 다음 문장.");
    if (!(await page.locator("#settingsPopup").isVisible())) {
        await page.locator("#btnSettings").click();
    }
    await page.locator("#lineBreakOption").selectOption("2");
    await page.locator("#btnRunLineBreak").click();
    const lineBreakHtml = await page.locator("#mainEditor").evaluate((node) => node.innerHTML);
    expect(lineBreakHtml).toContain("<br><br>");

    await page.locator("#titleInput").fill("스냅샷 이전 제목");
    await page.locator("#mainEditor").fill("스냅샷 이전 본문");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#btnSnapshotSave").click();
    await page.locator("#titleInput").fill("스냅샷 이후 제목");
    await page.locator("#mainEditor").fill("스냅샷 이후 본문");
    await page.locator("#btnSnapshots").click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#snapshotList [data-action='load-snapshot']").first().click();
    await expect(page.locator("#titleInput")).toHaveValue("스냅샷 이전 제목");
    await expect(page.locator("#mainEditor")).toContainText("스냅샷 이전 본문");

    const txtDownloadPromise = page.waitForEvent("download");
    await page.locator("#btnExportTxt").click();
    const txtDownload = await txtDownloadPromise;
    expect(txtDownload.suggestedFilename()).toMatch(/\.txt$/);
    const docxDownloadPromise = page.waitForEvent("download");
    await page.locator("#btnExportDocx").click();
    const docxDownload = await docxDownloadPromise;
    expect(docxDownload.suggestedFilename()).toMatch(/\.docx$/);

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
    await page.locator("#btnCloseHistory").click();

    const backupPayload = {
        library: [
            {
                id: "backup-novel",
                title: "백업 복원 소설",
                memo: "",
                chapters: [
                    {
                        id: "backup-chapter",
                        title: "백업 1화",
                        content: '복원 본문<script>window.__xss = 1</script><img src="x" onerror="window.__xss = 1">',
                    },
                ],
            },
        ],
        settings: { targetCount: 1200 },
        characters: [],
    };
    page.once("dialog", (dialog) => dialog.accept());
    await page.setInputFiles("#backupInput", {
        name: "test-backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(backupPayload)),
    });
    await expect(page.locator("#sidebarList")).toContainText("백업 복원 소설");
    await page.locator("#sidebarList .novel-item").filter({ hasText: "백업 복원 소설" }).click();
    await expect(page.locator("#mainEditor")).toContainText("복원 본문");
    const restoredHtml = await page.locator("#mainEditor").evaluate((node) => node.innerHTML);
    expect(restoredHtml).not.toContain("script");
    expect(restoredHtml).not.toContain("onerror");
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();

    await page.setViewportSize({ width: 390, height: 800 });
    await page.locator("#btnMobileMenu").click();
    await expect(page.locator("#sidebar")).toHaveClass(/open/);
    await page.locator("#mobileOverlay").click();
    await expect(page.locator("#sidebar")).not.toHaveClass(/open/);

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
    expect(storageState.testLibrary).toContain("백업 복원 소설");
    expect(storageState.testLibrary).not.toContain("script");
    expect(storageState.testLibrary).not.toContain("onerror");
    expect(storageState.testSettings).toContain("1200");
    expect(storageState.testCharacters).toBe("[]");
    expect(browserErrors).toEqual([]);
});
