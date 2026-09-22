import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLogger } from "./logger.mjs";
import {
  blobUrl,
  fetchSource,
  getSourceById,
  githubTreeUrl,
  listSources,
  rawFileUrl,
  selectRepoPaths
} from "./sources.mjs";

const fakeLogger = () => createLogger({ runId: "test-run", console: false, logFile: null });

describe("源注册表", () => {
  it("每个源都有出处可追溯所需的字段", () => {
    for (const s of listSources()) {
      assert.ok(s.id, "缺少 id");
      assert.ok(s.name, `${s.id} 缺少 name`);
      assert.ok(s.license, `${s.id} 缺少 license`);
      assert.ok(s.homepage, `${s.id} 缺少 homepage`);
      assert.ok(s.authority, `${s.id} 缺少 authority 说明`);
    }
  });

  it("未知源给出可用清单，便于排错", () => {
    assert.throws(() => getSourceById("nope"), /未知的源.*openai-cookbook/);
  });
});

describe("URL 约定", () => {
  it("树/raw/blob 三种地址各司其职（引用一律用 blob）", () => {
    assert.equal(githubTreeUrl("o/r", "main"), "https://api.github.com/repos/o/r/git/trees/main?recursive=1");
    assert.equal(rawFileUrl("o/r", "main", "a/b.md"), "https://raw.githubusercontent.com/o/r/main/a/b.md");
    assert.equal(blobUrl("o/r", "main", "a/b.md"), "https://github.com/o/r/blob/main/a/b.md");
  });
});

describe("selectRepoPaths", () => {
  const source = { include: /^docs\/[^/]+\.md$/, minBytes: 3000 };
  const tree = [
    { type: "blob", path: "docs/a.md", size: 5000 },
    { type: "blob", path: "docs/b.md", size: 100 },
    { type: "blob", path: "docs/nested/c.md", size: 5000 },
    { type: "blob", path: "docs/d.txt", size: 5000 },
    { type: "tree", path: "docs" }
  ];

  it("只留符合规则的文件，并说明每一条被跳过的原因", () => {
    const { selected, skipped } = selectRepoPaths(tree, source, { limit: 10 });
    assert.deepEqual(selected, ["docs/a.md"]);
    assert.deepEqual(skipped, [{ path: "docs/b.md", reason: "文件过小（100 < 3000 字节）" }]);
  });

  it("exclude 优先级高于 include", () => {
    const withExclude = { ...source, exclude: /a\.md$/ };
    assert.deepEqual(selectRepoPaths(tree, withExclude, { limit: 10 }).selected, []);
  });

  it("结果按路径排序，超上限的部分记进 skipped", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ type: "blob", path: `docs/${i}.md`, size: 5000 }));
    const { selected, skipped } = selectRepoPaths(many, source, { limit: 2 });
    assert.deepEqual(selected, ["docs/0.md", "docs/1.md"]);
    assert.equal(skipped.length, 3);
    assert.ok(skipped.every((s) => /超出本次上限/.test(s.reason)));
  });
});

describe("fetchSource (github)", () => {
  const source = {
    id: "fake-gh",
    name: "Fake GH",
    kind: "github",
    repo: "owner/repo",
    ref: "main",
    license: "MIT",
    include: /^docs\/[^/]+\.md$/,
    minBytes: 10,
    delayMs: 0
  };
  const tree = {
    tree: [
      { type: "blob", path: "docs/a.md", size: 5000 },
      { type: "blob", path: "docs/b.md", size: 5000 },
      { type: "blob", path: "docs/small.md", size: 1 }
    ]
  };

  it("抓取成功、单文件失败只记 warn 不中断，并统计计数", async () => {
    const logger = fakeLogger();
    const bodies = { [rawFileUrl("owner/repo", "main", "docs/a.md")]: "# A\n\n正文" };
    const result = await fetchSource(source, {
      logger,
      limit: 10,
      httpGetJson: async () => tree,
      httpGetText: async (url) => {
        if (!bodies[url]) throw new Error("HTTP 404 Not Found");
        return bodies[url];
      }
    });

    assert.deepEqual(result.docs.map((d) => d.path), ["docs/a.md"]);
    assert.equal(result.docs[0].url, blobUrl("owner/repo", "main", "docs/a.md"));
    assert.equal(result.docs[0].text, "# A\n\n正文");
    // 一条尺寸过小，一条抓取失败
    assert.equal(result.skipped.length, 2);
    assert.equal(logger.counts()["docs.fetched"], 1);
    assert.equal(logger.counts()["docs.skipped"], 2);
    assert.ok(logger.warnings().some((w) => w.msg === "source.file_fail"));
    assert.equal(logger.errors().length, 0);
  });

  it("文件树被截断时发出告警，避免静默漏抓", async () => {
    const logger = fakeLogger();
    await fetchSource(source, {
      logger,
      limit: 1,
      httpGetJson: async () => ({ ...tree, truncated: true }),
      httpGetText: async () => "x"
    });
    assert.ok(logger.warnings().some((w) => w.msg === "source.tree_truncated"));
  });

  it("整源失败会抛出，由上层决定继续下一个源", async () => {
    await assert.rejects(
      fetchSource(source, {
        logger: fakeLogger(),
        limit: 1,
        httpGetJson: async () => {
          throw new Error("HTTP 403 Forbidden");
        },
        httpGetText: async () => "x"
      }),
      /403/
    );
  });
});

describe("fetchSource (arxiv)", () => {
  const source = {
    id: "fake-arxiv",
    name: "Fake arXiv",
    kind: "arxiv",
    license: "arXiv",
    delayMs: 0,
    queries: [
      { label: "rag", query: 'all:"rag"' },
      { label: "agent", query: 'all:"agent"' }
    ]
  };

  const entry = (id) => `
  <entry>
    <id>http://arxiv.org/abs/${id}v1</id>
    <published>2024-01-01T00:00:00Z</published>
    <title>Title ${id}</title>
    <summary>Summary ${id}</summary>
    <author><name>A</name></author>
  </entry>`;

  it("多个查询式的结果按 arxivId 去重，正文用标题+摘要", async () => {
    const logger = fakeLogger();
    const result = await fetchSource(source, {
      logger,
      limit: 10,
      httpGetText: async () => `<feed>${entry("2401.1")}${entry("2401.2")}</feed>`
    });
    // 两个查询式各回两条，但 id 相同 → 只留两条
    assert.deepEqual(result.docs.map((d) => d.meta.arxivId), ["2401.1", "2401.2"]);
    assert.equal(result.docs[0].text, "Title 2401.1\n\nSummary 2401.1");
    assert.equal(result.docs[0].url, "https://arxiv.org/abs/2401.1");
    assert.equal(result.docs[0].meta.textKind, "abstract");
    assert.equal(result.skipped.filter((s) => /与前面查询重复/.test(s.reason)).length, 2);
  });

  it("接口没返回条目时记 skip，不影响其它查询式", async () => {
    const logger = fakeLogger();
    let call = 0;
    const result = await fetchSource(source, {
      logger,
      limit: 10,
      httpGetText: async () => (++call === 1 ? "<feed></feed>" : `<feed>${entry("2401.9")}</feed>`)
    });
    assert.equal(result.docs.length, 1);
    assert.ok(result.skipped.some((s) => /接口没有返回条目/.test(s.reason)));
  });
});
