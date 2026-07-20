import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMarkdownTables } from "../lib/markdown.ts";

test("images between markdown table rows move after the complete table", () => {
  const source = `| 日期 | 行程 |
| --- | --- |
| Day 1 | 滕王阁 |

![滕王阁](https://example.com/tengwang.jpg)

| Day 2 | 博物馆 |
| Day 3 | 返程 |`;
  const normalized = normalizeMarkdownTables(source);
  assert.match(
    normalized,
    /\| Day 1 \| 滕王阁 \|\n\| Day 2 \| 博物馆 \|\n\| Day 3 \| 返程 \|/,
  );
  assert.ok(
    normalized.indexOf("![滕王阁]") > normalized.indexOf("| Day 3 | 返程 |"),
  );
});

test("ordinary images outside tables remain in place", () => {
  const source = `景点介绍\n\n![图片](https://example.com/photo.jpg)\n\n后续内容`;
  assert.equal(normalizeMarkdownTables(source), source);
});
