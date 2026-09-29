import { test, expect } from "bun:test";
import { chromium } from "playwright";
import path from "node:path";
import { fixture } from "./helpers.mjs";
import { startExecutor } from "../backend/executor/http.mjs";
import { startGateway } from "../backend/gateway/http.mjs";
import { modelServer } from "./model-server.mjs";

test("浏览器从需求池创建需求并可刷新详情", async () => {
  const f = await fixture(),
    model = modelServer();
  const ex = await startExecutor({
    port: 0,
    previewPort: 0,
    workspaceRoot: path.join(f.root, "workspaces"),
    modelBaseUrl: model.url,
    dataRoot: path.join(f.root, "runtime"),
  });
  const gw = await startGateway({
    port: 0,
    databaseUrl: process.env.TEST_DATABASE_URL,
    executorUrl: ex.url,
    serveUI: true,
  });
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on('console', m => { if (['error','warning'].includes(m.type())) errors.push(m.text()); });
    await page.goto(gw.url);
    await page
      .getByRole("button", { name: "提出需求" })
      .click({ timeout: 3000 });
    expect(await page.getByLabel("需求标题", { exact: true }).count()).toBe(0);
    await page.getByLabel("原始需求").fill("增加弱网提示");
    await page.getByLabel("本地 Git 仓库路径").fill(f.repo);
    await page.getByRole("button", { name: "创建并开发" }).click();
    await page
      .getByRole("heading", { name: "增加弱网提示", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "新会话", exact: true })
      .click({ timeout: 3000 });
    await page.getByLabel("编码需求").fill("检查页面");
    await page.locator('.skill-picker summary').click();
    await page.getByRole('checkbox', { name: /skill-maintenance/ }).check();
    expect(await page.locator('.skill-picker summary').innerText()).toContain('已选择 1 个');
    await page.locator('.skill-picker summary').click();
    await page.getByRole("button", { name: "发送需求" }).click();
    await page.getByText("用户消息： 检查页面", { exact: false }).waitFor();
    await page
      .frameLocator('iframe[title="运行预览"]')
      .getByRole("heading", { name: "Original" })
      .waitFor({ timeout: 3000 });
    const panelBox = await page.locator('#panel-content').boundingBox();
    const frameBox = await page.locator('iframe[title="运行预览"]').boundingBox();
    expect(frameBox.height).toBeGreaterThanOrEqual(panelBox.height - 2);
    await page.reload();
    await page
      .getByRole("heading", { name: "增加弱网提示", exact: true })
      .waitFor();
    await page
      .frameLocator('iframe[title="运行预览"]')
      .getByRole("heading", { name: "Original" })
      .waitFor();
    await page.getByRole('button',{name:'收起工作区'}).click();
    await page.getByRole('button',{name:'展开工作区 →'}).click();
    await page.frameLocator('iframe[title="运行预览"]').getByRole('heading',{name:'Original'}).waitFor();
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({width:1440,height:1000});
    expect(errors).toEqual([]);
    await page.screenshot({ path: "/tmp/ai-dev-ui.png", fullPage: true });
  } finally {
    await browser.close();
    await gw.close();
    await ex.close();
    model.close();
  }
}, 30000);
