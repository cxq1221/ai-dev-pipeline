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
    defaultRepositoryPath: "/tmp/default-repo",
    repositoryPaths: ["/tmp/default-repo", f.repo],
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
    page.setDefaultTimeout(5000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on('console', m => { if (['error','warning'].includes(m.type())) errors.push(m.text()); });
    await page.goto(gw.url);
    await page
      .getByRole("button", { name: "提出需求" })
      .click({ timeout: 3000 });
    expect(await page.getByLabel("需求标题", { exact: true }).count()).toBe(0);
    await page.getByLabel("原始需求").fill("增加弱网提示");
    await page.getByLabel("预置仓库").selectOption(f.repo);
    expect(await page.getByLabel("本地 Git 仓库路径").inputValue()).toBe(f.repo);
    await page.getByRole("button", { name: "创建并开发" }).click();
    await page
      .getByRole("heading", { name: "增加弱网提示", exact: true })
      .waitFor();
    const requirementId = new URL(page.url()).hash.split('/')[2];
    const conversations = async () => (await fetch(`${gw.url}/api/requirements/${requirementId}/conversations`)).json();
    expect(await conversations()).toEqual([]);
    const newConversation = page.getByRole("button", { name: "新会话", exact: true });
    expect(await newConversation.isDisabled()).toBe(true);
    expect(await page.getByText("请先完成需求澄清", { exact: true }).count()).toBe(1);
    await page.screenshot({ path: "/tmp/ai-dev-clarification-gate.png", fullPage: true });
    await page.getByRole('button', { name: '需求澄清', exact: true }).first().click();
    expect(await page.getByLabel('编码需求').inputValue()).toContain('【需求背景】');
    expect(await page.getByLabel('编码需求').inputValue()).toBe('【需求背景】（客户是谁，为什么要做，有什么收益？）\n1.\n2.\n\n【交付时间】（预期交付时间）\n1.\n\n【功能列表】（列出用户可理解的功能点，并列出平台）\n1. iOS：通过 SDK 可以截图并保存到相册\n2. Android：\n3. 后台API：\n4. 控制台：');
    expect(await page.getByLabel('编码需求').inputValue()).toContain('4. 控制台：');
    const draftBox = await page.getByLabel('编码需求').boundingBox();
    expect(draftBox.height).toBeGreaterThanOrEqual(240);
    const dockBefore = await page.locator('.compose-wrap').boundingBox();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(100);
    const dockAfter = await page.locator('.compose-wrap').boundingBox();
    expect(Math.abs(dockAfter.y - dockBefore.y)).toBeLessThan(2);
    expect(dockAfter.y + dockAfter.height).toBeLessThanOrEqual(1000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByLabel('编码需求').fill('先确认使用场景');
    await page.reload();
    await page.getByLabel('编码需求').waitFor();
    expect(await page.getByLabel('编码需求').inputValue()).toBe('先确认使用场景');
    expect(await conversations()).toEqual([]);
    await page.getByRole('button', { name: '发送需求' }).click();
    await page.locator('.conversations button.active').filter({ hasText: '需求澄清' }).waitFor();
    await page.getByText('用户消息： 先确认使用场景', { exact: false }).waitFor();
    expect((await page.getByLabel('编码需求').boundingBox()).height).toBeLessThanOrEqual(160);
    expect((await conversations()).length).toBe(1);
    expect(await newConversation.isDisabled()).toBe(true);
    expect(await page.evaluate(id => localStorage.getItem(`forge:clarification-draft:${id}`), requirementId)).toBe(null);
    expect(await page.getByRole('button', { name: '继续需求澄清', exact: true }).count()).toBe(0);
    await page.locator('.conversations button.active').filter({ hasText: '需求澄清' }).click();
    expect((await conversations()).length).toBe(1);
    expect((await page.getByLabel('编码需求').boundingBox()).height).toBeLessThanOrEqual(160);
    await page.reload();
    await page.getByText('用户消息： 先确认使用场景', { exact: false }).waitFor();
    expect(await page.getByLabel('编码需求').inputValue()).toBe('');
    await page.getByLabel('编码需求').fill('尚未发送的补充说明');
    await page.reload();
    await page.getByText('用户消息： 先确认使用场景', { exact: false }).waitFor();
    expect(await page.getByLabel('编码需求').inputValue()).toBe('尚未发送的补充说明');
    await page.getByLabel('编码需求').fill('');
    expect((await page.getByLabel('编码需求').boundingBox()).height).toBeLessThanOrEqual(160);
    expect(await page.locator('.chat-area > .clarification-guide').count()).toBe(0);
    expect(await page.locator('.compose-wrap .composer-phase').innerText()).toContain('澄清中 · 不修改代码');
    await page.locator('.compose-wrap').getByRole('button', { name: '开始开发 →', exact: true }).click();
    await page.getByText('已收到：开始开发', { exact: false }).waitFor();
    expect(await newConversation.isDisabled()).toBe(true);
    expect(await page.locator('.compose-wrap .composer-phase').innerText()).toContain('澄清中');
    await page.getByLabel('编码需求').fill('你决定');
    await page.getByRole('button', { name: '发送需求' }).click();
    await page.getByText('已收到：你决定', { exact: false }).waitFor();
    await page.locator('.compose-wrap').getByRole('button', { name: '开始开发 →', exact: true }).click();
    await page.locator('.conversations button.active').filter({ hasText: '需求开发' }).waitFor();
    expect(await page.locator('.compose-wrap .composer-phase').innerText()).toBe('开发中');
    expect(await page.locator('.conversations button.active').innerText()).toBe('需求开发');
    expect(await newConversation.isEnabled()).toBe(true);
    await page.locator(".turn").filter({ has: page.getByText("自动开始开发", { exact: true }) }).locator(".markdown").filter({ hasText: "无需再次询问是否开始" }).waitFor();
    await page
      .getByRole("button", { name: "新会话", exact: true })
      .click({ timeout: 3000 });
    await page.locator('.conversations button.active').filter({ hasText: '需求讨论 2' }).waitFor();
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
