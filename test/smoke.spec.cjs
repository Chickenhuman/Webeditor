const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

function requirePlaywrightTest() {
    const runnerCandidate = getPlaywrightRunnerTestPath();
    if (runnerCandidate) return require(runnerCandidate);

    for (const request of ["playwright/test", "@playwright/test"]) {
        try {
            return require(request);
        } catch (error) {
            // Fall back to npx caches below when Playwright is not installed locally.
        }
    }

    const npxCache = path.join(os.homedir(), ".npm", "_npx");
    if (!fs.existsSync(npxCache)) throw new Error("Playwright Test is not installed.");

    const candidates = fs.readdirSync(npxCache)
        .flatMap((entry) => [
            path.join(npxCache, entry, "node_modules", "playwright", "test.js"),
            path.join(npxCache, entry, "node_modules", "@playwright", "test"),
        ])
        .filter((candidate) => fs.existsSync(candidate))
        .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

    if (!candidates.length) throw new Error("Playwright Test is not installed.");
    return require(candidates[0]);
}

function getPlaywrightRunnerTestPath() {
    try {
        const runnerPath = fs.realpathSync(process.argv[1]);
        const runnerDir = path.dirname(runnerPath);

        if (path.basename(runnerDir) === "playwright") {
            const testPath = path.join(runnerDir, "test.js");
            return fs.existsSync(testPath) ? testPath : "";
        }

        if (path.basename(runnerDir) === "test" && path.basename(path.dirname(runnerDir)) === "@playwright") {
            const testPath = path.join(runnerDir, "index.js");
            return fs.existsSync(testPath) ? testPath : "";
        }
    } catch (error) {
        return "";
    }

    return "";
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

async function withDialogResponses(page, responses, action) {
    const queue = [...responses];
    const handler = (dialog) => dialog.accept(queue.shift() ?? "");
    page.on("dialog", handler);
    try {
        await action();
    } finally {
        page.off("dialog", handler);
    }
}

test("launcher opens isolated test mode without touching production storage", async ({ page }) => {
    test.setTimeout(60000);

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

    await page.locator("#libraryHomeBtn").click();
    page.once("dialog", (dialog) => dialog.accept("wrong-password"));
    await page.locator("#sidebarList .novel-item").filter({ hasText: "샘플 잠금 원고" }).click();
    await expect(page.locator("#sidebarTitle")).toHaveText("테스트 서재");

    page.once("dialog", (dialog) => dialog.accept("1234"));
    await page.locator("#sidebarList .novel-item").filter({ hasText: "샘플 잠금 원고" }).click();
    await expect(page.locator("#sidebarTitle")).toContainText("샘플 잠금 원고");
    const lockState = await page.evaluate(() => {
        const library = JSON.parse(localStorage.getItem("webeditor:test:library"));
        return library.find((novel) => novel.id === "sample-novel-2");
    });
    expect(lockState.password).toBeUndefined();
    expect(lockState.passwordLock.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(lockState.passwordLock.hash).not.toBe("1234");

    await page.locator("#libraryHomeBtn").click();
    await page.locator("#sidebarList .novel-item").filter({ hasText: "샘플 판타지 원고" }).click();

    await page.locator("#btnSettings").click();
    const popupBox = await page.locator("#settingsPopup").boundingBox();
    const toolbarBox = await page.locator(".top-bar").boundingBox();
    const editorBox = await page.locator("#editorWrapper").boundingBox();
    expect(popupBox).not.toBeNull();
    expect(toolbarBox).not.toBeNull();
    expect(editorBox).not.toBeNull();
    expect(popupBox.y).toBeGreaterThan(toolbarBox.y);
    expect(popupBox.y).toBeLessThan(editorBox.y + 80);
    await page.locator("#autoSaveIntervalInput").fill("3");
    await page.locator("#autoSaveIntervalInput").dispatchEvent("change");
    await page.locator("#btnTheme").click();
    await expect(page.locator("body")).toHaveClass(/dark-mode/);
    const storedSettingsAfterTheme = await page.evaluate(() => JSON.parse(localStorage.getItem("webeditor:test:settings")));
    expect(storedSettingsAfterTheme.autoSaveMin).toBe(3);
    expect(storedSettingsAfterTheme.darkMode).toBe(true);
    await page.locator("#btnSettings").click();
    await page.locator("#btnRunLineBreak").click();

    await page.locator("#mainEditor").fill("회귀 테스트 원고입니다.");
    await page.locator("#titleInput").fill("회귀 테스트 챕터");
    await page.getByTestId("save-button").click();
    await expect(page.locator("#lastSavedDisplay")).toContainText("저장됨(Mock Cloud)");

    await page.evaluate(() => {
        localStorage.setItem("webeditor:test:cloud-fail-next-sync", "1");
    });
    await page.locator("#mainEditor").fill("클라우드 실패 후 로컬 보존");
    await page.getByTestId("save-button").click();
    await expect(page.locator("#lastSavedDisplay")).toContainText("Mock Cloud 저장 실패");
    const failedSaveState = await page.evaluate(() => {
        const library = JSON.parse(localStorage.getItem("webeditor:test:library"));
        const cloudState = JSON.parse(localStorage.getItem("webeditor:test:cloud-state"));
        return {
            localContent: library[0].chapters[0].content,
            cloudContent: cloudState.library[0].chapters[0].content,
        };
    });
    expect(failedSaveState.localContent).toContain("클라우드 실패 후 로컬 보존");
    expect(failedSaveState.cloudContent).not.toContain("클라우드 실패 후 로컬 보존");

    await page.locator("#mainEditor").fill("회귀 테스트 원고입니다.");
    await page.getByTestId("save-button").click();
    await expect(page.locator("#lastSavedDisplay")).toContainText("저장됨(Mock Cloud)");

    await page.reload();
    await expect(page.locator("#titleInput")).toHaveValue("회귀 테스트 챕터");
    await expect(page.locator("#mainEditor")).toContainText("회귀 테스트 원고입니다.");

    await page.locator("#mainEditor").fill("");
    await page.locator("#mainEditor").focus();
    await page.locator("#mainEditor").evaluate((node) => {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(node);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);

        const clipboardData = new DataTransfer();
        clipboardData.setData("text/html", [
            "<style>.MsoTitle, p.MsoTitle { color: #9333ea; font-size: 24pt; text-align: center; background-color: #fef08a; background-image: url(javascript:alert(1)); }</style>",
            "<p><strong>굵은 원문</strong> <em>기울임</em> <u>밑줄</u></p>",
            '<p class="MsoTitle">클래스 제목</p>',
            '<p align="right">정렬 문장</p>',
            '<ol start="3"><li value="4"><span style="color: rgb(220, 38, 38); font-size: 20px; background-color: yellow; background-image: url(javascript:alert(1));" onclick="window.__xss = 1">색상 문장</span></li></ol>',
            '<p><a href="https://example.com" onclick="window.__xss = 1" title="안전 링크">링크</a><a href="javascript:window.__xss = 1">위험 링크</a></p>',
            '<table style="border-collapse: collapse"><tbody><tr><td colspan="2" style="border: 1px solid #111; padding-left: 4px">표 셀</td></tr></tbody></table>',
            '<table border="1" cellpadding="3" cellspacing="2" width="80%"><tbody><tr><td bgcolor="#fef3c7" align="center" valign="top" width="120" height="40">속성 셀</td></tr></tbody></table>',
            '<font color="#2563eb" face="serif" size="5">폰트 문장</font>',
            "<script>window.__xss = 1</script>",
        ].join(""));
        clipboardData.setData("text/plain", "굵은 원문 기울임 밑줄 클래스 제목 정렬 문장 색상 문장 링크 표 셀 속성 셀 폰트 문장");
        node.dispatchEvent(new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData,
        }));
    });
    const readPastedFormatting = () => page.locator("#mainEditor").evaluate((node) => {
        const paragraphs = [...node.querySelectorAll("p")];
        const cells = [...node.querySelectorAll("td")];
        const classTitle = paragraphs.find((paragraph) => paragraph.textContent.includes("클래스 제목"));
        const alignedParagraph = paragraphs.find((paragraph) => paragraph.textContent.includes("정렬 문장"));
        const richCell = cells.find((cell) => cell.textContent.includes("표 셀"));
        const attributeCell = cells.find((cell) => cell.textContent.includes("속성 셀"));
        const attributeTable = attributeCell?.closest("table");

        return {
            strong: node.querySelector("strong")?.textContent,
            emphasis: node.querySelector("em")?.textContent,
            underline: node.querySelector("u")?.textContent,
            classTitleStyle: classTitle?.getAttribute("style") || "",
            alignedParagraphStyle: alignedParagraph?.getAttribute("style") || "",
            hasList: Boolean(node.querySelector("ol li")),
            listStart: node.querySelector("ol")?.getAttribute("start"),
            listValue: node.querySelector("li")?.getAttribute("value"),
            spanStyle: node.querySelector("span")?.getAttribute("style") || "",
            safeLinkHref: node.querySelector("a")?.getAttribute("href"),
            safeLinkTitle: node.querySelector("a")?.getAttribute("title"),
            unsafeLinkHref: node.querySelectorAll("a")[1]?.getAttribute("href") || "",
            hasTable: Boolean(node.querySelector("table tbody tr td")),
            cellColspan: richCell?.getAttribute("colspan"),
            cellStyle: richCell?.getAttribute("style") || "",
            attributeTableBorder: attributeTable?.getAttribute("border"),
            attributeTableCellpadding: attributeTable?.getAttribute("cellpadding"),
            attributeTableCellspacing: attributeTable?.getAttribute("cellspacing"),
            attributeTableStyle: attributeTable?.getAttribute("style") || "",
            attributeCellStyle: attributeCell?.getAttribute("style") || "",
            fontStyle: node.querySelector("font")?.getAttribute("style") || "",
            html: node.innerHTML,
        };
    });
    const pastedHtml = await readPastedFormatting();
    expect(pastedHtml.strong).toBe("굵은 원문");
    expect(pastedHtml.emphasis).toBe("기울임");
    expect(pastedHtml.underline).toBe("밑줄");
    expect(pastedHtml.classTitleStyle).toContain("color: rgb(147, 51, 234)");
    expect(pastedHtml.classTitleStyle).toContain("font-size: 24pt");
    expect(pastedHtml.classTitleStyle).toContain("text-align: center");
    expect(pastedHtml.classTitleStyle).not.toContain("background");
    expect(pastedHtml.alignedParagraphStyle).toContain("text-align: right");
    expect(pastedHtml.hasList).toBe(true);
    expect(pastedHtml.listStart).toBe("3");
    expect(pastedHtml.listValue).toBe("4");
    expect(pastedHtml.spanStyle).toContain("color: rgb(220, 38, 38)");
    expect(pastedHtml.spanStyle).toContain("font-size: 20px");
    expect(pastedHtml.safeLinkHref).toBe("https://example.com");
    expect(pastedHtml.safeLinkTitle).toBe("안전 링크");
    expect(pastedHtml.unsafeLinkHref).toBe("");
    expect(pastedHtml.hasTable).toBe(true);
    expect(pastedHtml.cellColspan).toBe("2");
    expect(pastedHtml.cellStyle).toContain("border:");
    expect(pastedHtml.cellStyle).not.toContain("padding");
    expect(pastedHtml.attributeTableBorder).toBe("1");
    expect(pastedHtml.attributeTableCellpadding).toBeNull();
    expect(pastedHtml.attributeTableCellspacing).toBeNull();
    expect(pastedHtml.attributeTableStyle).not.toContain("80%");
    expect(pastedHtml.attributeCellStyle).not.toContain("background");
    expect(pastedHtml.attributeCellStyle).toContain("text-align: center");
    expect(pastedHtml.attributeCellStyle).toContain("vertical-align: top");
    expect(pastedHtml.attributeCellStyle).not.toContain("120px");
    expect(pastedHtml.attributeCellStyle).not.toContain("height");
    expect(pastedHtml.fontStyle).toContain("color: rgb(37, 99, 235)");
    expect(pastedHtml.fontStyle).not.toContain("font-family");
    expect(pastedHtml.fontStyle).toContain("font-size: 24px");
    expect(pastedHtml.html).not.toContain("background-color");
    expect(pastedHtml.html).not.toContain("background-image");
    expect(pastedHtml.html).not.toContain("padding-left");
    expect(pastedHtml.html).not.toContain("MsoTitle");
    expect(pastedHtml.html).not.toContain("onclick");
    expect(pastedHtml.html).not.toContain("javascript:");
    expect(pastedHtml.html).not.toContain("script");
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();

    await page.getByTestId("save-button").click();
    await page.reload();
    const reloadedPastedHtml = await readPastedFormatting();
    expect(reloadedPastedHtml.strong).toBe("굵은 원문");
    expect(reloadedPastedHtml.emphasis).toBe("기울임");
    expect(reloadedPastedHtml.underline).toBe("밑줄");
    expect(reloadedPastedHtml.classTitleStyle).toContain("font-size: 24pt");
    expect(reloadedPastedHtml.alignedParagraphStyle).toContain("text-align: right");
    expect(reloadedPastedHtml.hasList).toBe(true);
    expect(reloadedPastedHtml.listStart).toBe("3");
    expect(reloadedPastedHtml.safeLinkHref).toBe("https://example.com");
    expect(reloadedPastedHtml.hasTable).toBe(true);
    expect(reloadedPastedHtml.attributeTableCellpadding).toBeNull();
    expect(reloadedPastedHtml.attributeCellStyle).not.toContain("background");
    expect(reloadedPastedHtml.spanStyle).toContain("color: rgb(220, 38, 38)");
    expect(reloadedPastedHtml.spanStyle).toContain("font-size: 20px");
    expect(reloadedPastedHtml.fontStyle).toContain("font-size: 24px");

    await page.evaluate(() => {
        const library = JSON.parse(localStorage.getItem("webeditor:test:library"));
        library[0].chapters[0].content = '<span style="color: rgb(220, 38, 38); font-size: 20px; background-color: yellow">저장소 서식</span><script>window.__xss = 1</script>';
        localStorage.setItem("webeditor:test:library", JSON.stringify(library));
    });
    await page.reload();
    const restoredStorageHtml = await page.locator("#mainEditor").evaluate((node) => node.innerHTML);
    expect(restoredStorageHtml).toContain("font-size: 20px");
    expect(restoredStorageHtml).toContain("color: rgb(220, 38, 38)");
    expect(restoredStorageHtml).not.toContain("background");
    expect(restoredStorageHtml).not.toContain("script");
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();

    await page.locator("#mainEditor").fill("");
    await page.locator("#mainEditor").focus();
    await page.keyboard.down("Control");
    await page.keyboard.down("Shift");
    await page.keyboard.press("V");
    await page.keyboard.up("Shift");
    await page.keyboard.up("Control");
    await page.locator("#mainEditor").evaluate((node) => {
        node.focus();
        const clipboardData = new DataTransfer();
        clipboardData.setData("text/html", '<strong style="font-size: 22px">단축키 서식</strong>');
        clipboardData.setData("text/plain", "단축키 서식");
        node.dispatchEvent(new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData,
        }));
    });
    const plainShortcutHtml = await page.locator("#mainEditor").evaluate((node) => node.innerHTML);
    expect(await page.locator("#mainEditor").evaluate((node) => node.textContent)).toBe("단축키 서식");
    expect(plainShortcutHtml).not.toContain("strong");
    expect(plainShortcutHtml).not.toContain("font-size");

    await page.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
                async read() {
                    return [{
                        types: ["text/html", "text/plain"],
                        async getType(type) {
                            return {
                                async text() {
                                    return type === "text/html"
                                        ? '<em style="font-size: 18px; background-color: yellow; font-family: serif">버튼 서식</em>'
                                        : "버튼 서식";
                                },
                            };
                        },
                    }];
                },
                async readText() {
                    return "버튼 서식";
                },
            },
        });
    });
    await page.locator("#mainEditor").fill("");
    await page.locator("#btnPasteFormatted").click();
    const formattedButtonHtml = await page.locator("#mainEditor").evaluate((node) => node.innerHTML);
    expect(formattedButtonHtml).toContain("<em");
    expect(formattedButtonHtml).toContain("font-size: 18px");
    expect(formattedButtonHtml).not.toContain("background");
    expect(formattedButtonHtml).not.toContain("font-family");

    await page.locator("#mainEditor").fill("");
    await page.locator("#btnPastePlain").click();
    const plainButtonHtml = await page.locator("#mainEditor").evaluate((node) => node.innerHTML);
    expect(await page.locator("#mainEditor").evaluate((node) => node.textContent)).toBe("버튼 서식");
    expect(plainButtonHtml).not.toContain("font-size");
    expect(plainButtonHtml).not.toContain("<em");
    expect(plainButtonHtml).not.toContain("<i");

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
    await page.locator("#mainEditor").focus();
    await page.keyboard.type("undo check");
    await expect(page.locator("#mainEditor")).toContainText("undo check");
    await page.keyboard.press("Control+Z");
    await expect(page.locator("#mainEditor")).toContainText("굵은 안전 문장");
    await page.keyboard.press("Control+Y");
    await expect(page.locator("#mainEditor")).toContainText("undo check");

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
    const snapshotSafetyBackup = await page.evaluate(() => {
        const backups = JSON.parse(localStorage.getItem("webeditor:test:safety-backups"));
        return backups[0];
    });
    expect(snapshotSafetyBackup.reason).toBe("snapshot-restore");
    expect(JSON.stringify(snapshotSafetyBackup.data.library)).toContain("스냅샷 이후 제목");

    const txtDownloadPromise = page.waitForEvent("download");
    await page.locator("#btnExportTxt").click();
    const txtDownload = await txtDownloadPromise;
    expect(txtDownload.suggestedFilename()).toMatch(/\.txt$/);
    const txtDownloadPath = await txtDownload.path();
    expect(fs.readFileSync(txtDownloadPath, "utf8")).toContain("[스냅샷 이전 제목]");
    expect(fs.readFileSync(txtDownloadPath, "utf8")).toContain("스냅샷 이전 본문");

    const docxDownloadPromise = page.waitForEvent("download");
    await page.locator("#btnExportDocx").click();
    const docxDownload = await docxDownloadPromise;
    expect(docxDownload.suggestedFilename()).toMatch(/\.docx$/);
    const docxDownloadPath = await docxDownload.path();
    const docxContent = fs.readFileSync(docxDownloadPath, "utf8");
    expect(docxContent).toContain("<!DOCTYPE html>");
    expect(docxContent).toContain("<h1>스냅샷 이전 제목</h1>");
    expect(docxContent).toContain("스냅샷 이전 본문");

    await page.locator("#libraryHomeBtn").click();
    page.once("dialog", (dialog) => dialog.accept("회귀 테스트 소설"));
    await page.getByTestId("sidebar-action").click();
    await expect(page.locator("#sidebarTitle")).toContainText("회귀 테스트 소설");

    await page.locator("#libraryHomeBtn").click();
    const regressionNovel = page.locator("#sidebarList .novel-item").filter({ hasText: "회귀 테스트 소설" });
    await regressionNovel.hover();
    await withDialogResponses(page, ["2468", "2468"], async () => {
        await regressionNovel.locator("[data-action='toggle-lock']").click({ force: true });
    });
    const newLockState = await page.evaluate(() => {
        const library = JSON.parse(localStorage.getItem("webeditor:test:library"));
        return library.find((novel) => novel.title === "회귀 테스트 소설");
    });
    expect(newLockState.password).toBeUndefined();
    expect(newLockState.passwordLock.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(newLockState.passwordLock.hash).not.toBe("2468");

    await withDialogResponses(page, ["2468"], async () => {
        await regressionNovel.click();
    });
    await expect(page.locator("#sidebarTitle")).toContainText("회귀 테스트 소설");

    await page.getByTestId("sidebar-action").click();
    await expect(page.locator("#sidebarList .chapter-item")).toHaveCount(2);
    await page.locator("#sidebarList .chapter-item.active [data-action='move-chapter-up']").click({ force: true });
    const movedChapterOrder = await page.evaluate(() => {
        const library = JSON.parse(localStorage.getItem("webeditor:test:library"));
        return library.find((novel) => novel.title === "회귀 테스트 소설").chapters.map((chapter) => chapter.title);
    });
    expect(movedChapterOrder[0]).toBe("2화");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#sidebarList .chapter-item.active [data-action='delete-chapter']").click({ force: true });
    await expect(page.locator("#sidebarList .chapter-item")).toHaveCount(1);
    const deleteSafetyBackup = await page.evaluate(() => {
        const backups = JSON.parse(localStorage.getItem("webeditor:test:safety-backups"));
        return backups[0];
    });
    expect(deleteSafetyBackup.reason).toBe("delete-chapter");
    expect(JSON.stringify(deleteSafetyBackup.data.library)).toContain("2화");

    await page.locator("#btnSafetyBackups").click();
    await expect(page.locator("#safetyBackupList")).toContainText("delete-chapter");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#safetyBackupList [data-action='restore-safety-backup']").first().click();
    await expect(page.locator("#sidebarTitle")).toContainText("회귀 테스트 소설");
    await expect(page.locator("#sidebarList .chapter-item")).toHaveCount(2);

    await page.setInputFiles("#fileInput", {
        name: "imported-chapter.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("가져온 챕터 본문"),
    });
    await expect(page.locator("#titleInput")).toHaveValue("imported-chapter");
    await expect(page.locator("#mainEditor")).toContainText("가져온 챕터 본문");

    await page.locator("#btnCharacters").click();
    await page.locator("#btnAddCharacter").click();
    await page.locator("#charName").fill("테스트 캐릭터");
    await page.locator("#charRole").fill("회귀 검증자");
    await page.locator("#btnSaveCharacter").click();
    await expect(page.locator("#characterList")).toContainText("테스트 캐릭터");
    await page.locator("#btnCloseCharacters").click();

    const backupDownloadPromise = page.waitForEvent("download");
    await page.locator("#btnBackup").click();
    const backupDownload = await backupDownloadPromise;
    const backupDownloadPath = await backupDownload.path();
    const backupFile = JSON.parse(fs.readFileSync(backupDownloadPath, "utf8"));
    expect(backupFile.characters.some((character) => character.name === "테스트 캐릭터")).toBe(true);
    expect(backupFile.lastActive?.novelId).toBeTruthy();
    expect(backupFile.lastActive?.chapterId).toBeTruthy();

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
    const safetyBackupCountBeforeInvalidRestore = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem("webeditor:test:safety-backups")).length;
    });
    page.once("dialog", (dialog) => dialog.accept());
    await page.setInputFiles("#backupInput", {
        name: "invalid-backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ library: "not-an-array" })),
    });
    await expect(page.locator("#sidebarList")).not.toContainText("백업 복원 소설");
    const safetyBackupCountAfterInvalidRestore = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem("webeditor:test:safety-backups")).length;
    });
    expect(safetyBackupCountAfterInvalidRestore).toBe(safetyBackupCountBeforeInvalidRestore);

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
    const restoreSafetyBackup = await page.evaluate(() => {
        const backups = JSON.parse(localStorage.getItem("webeditor:test:safety-backups"));
        return backups[0];
    });
    expect(restoreSafetyBackup.reason).toBe("backup-restore");
    expect(JSON.stringify(restoreSafetyBackup.data.library)).toContain("회귀 테스트 소설");

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
